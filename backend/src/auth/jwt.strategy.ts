import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from '../common/types/auth.types';
import { effectivePermissions } from '../common/permissions/permission.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** Revalida contra la BD: revoca tokens de usuarios inexistentes o inactivos. */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { permissions: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Usuario no válido o inactivo');
    }
    const overrides = user.permissions.map((p) => p.permission);
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      operationalContext: user.operationalContext ?? null,
      permissions: effectivePermissions(user.role, overrides),
    };
  }
}
