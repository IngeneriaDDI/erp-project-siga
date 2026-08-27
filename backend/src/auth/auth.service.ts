import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from '../common/types/auth.types';
import { effectivePermissions } from '../common/permissions/permission.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Valida credenciales y devuelve el usuario autenticado. */
  async validateUser(email: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      operationalContext: user.operationalContext ?? null,
      permissions: [], // los permisos efectivos se resuelven por request (JwtStrategy)
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    return this.issueTokens(user);
  }

  /** Rota los tokens a partir de un refresh token válido. */
  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('No hay refresh token');
    }
    let decoded: { sub: string };
    try {
      decoded = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Usuario no válido');
    }
    return this.issueTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      operationalContext: user.operationalContext ?? null,
      permissions: [],
    });
  }

  /** Perfil del usuario autenticado + permisos efectivos + estrategia de identidad. */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        permissions: true,
        tenant: {
          select: {
            id: true,
            nombre: true,
            status: true,
            weightUnit: true,
            identityStrategy: true,
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    const overrides = user.permissions.map((p) => p.permission);
    const { passwordHash: _omit, permissions: _perms, ...safe } = user;
    return {
      ...safe,
      permissions: effectivePermissions(user.role, overrides),
    };
  }

  private async issueTokens(user: AuthUser) {
    const payload: JwtPayload = {
      sub: user.userId,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m'),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.userId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
      },
    );
    return { accessToken, refreshToken, user };
  }
}
