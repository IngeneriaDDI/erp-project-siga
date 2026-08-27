import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, Status } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth.types';
import { requireTenant } from '../common/tenant/tenant.util';
import { CreateUserDto, QueryUserDto, UpdateUserDto } from './dto/user.dto';
import { ALL_PERMISSIONS, effectivePermissions } from '../common/permissions/permission.constants';

// Nunca exponemos el hash de contraseña.
const userSelect = {
  id: true,
  tenantId: true,
  nombre: true,
  email: true,
  role: true,
  status: true,
  operationalContext: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: AuthUser, effectiveTenantId: string | null, query: QueryUserDto) {
    const where: Prisma.UserWhereInput = {
      status: query.status,
      role: query.role,
    };

    if (actor.role === Role.SUPER_ADMIN) {
      // Si envía X-Tenant-Id, filtra por ese tenant; si no, ve todos.
      if (effectiveTenantId) where.tenantId = effectiveTenantId;
    } else {
      where.tenantId = actor.tenantId;
    }

    return this.prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(actor: AuthUser, id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    this.assertCanManage(actor, user.tenantId, user.role);
    return user;
  }

  async create(actor: AuthUser, effectiveTenantId: string | null, dto: CreateUserDto) {
    const targetTenantId = this.resolveTargetTenant(actor, effectiveTenantId, dto.role);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        passwordHash,
        role: dto.role,
        tenantId: targetTenantId,
        operationalContext: dto.operationalContext ?? null,
      },
      select: userSelect,
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    this.assertCanManage(actor, target.tenantId, target.role);

    // Un ADMIN_TENANT no puede elevar a SUPER_ADMIN.
    if (dto.role && actor.role !== Role.SUPER_ADMIN && dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('No puedes asignar el rol SUPER_ADMIN');
    }

    const data: Prisma.UserUpdateInput = {
      nombre: dto.nombre,
      role: dto.role,
    };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.operationalContext !== undefined) {
      data.operationalContext = dto.operationalContext ?? null;
    }

    return this.prisma.user.update({ where: { id }, data, select: userSelect });
  }

  /** Permisos efectivos + override explícito de un usuario. */
  async getPermissions(actor: AuthUser, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { permissions: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    this.assertCanManage(actor, user.tenantId, user.role);
    const override = user.permissions.map((p) => p.permission);
    return {
      role: user.role,
      usesTemplate: override.length === 0 && user.role !== Role.SUPER_ADMIN,
      effective: effectivePermissions(user.role, override),
      override,
    };
  }

  /** Reemplaza el override de permisos. Lista vacía => vuelve a la plantilla del rol. */
  async setPermissions(actor: AuthUser, id: string, permissions: string[]) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    this.assertCanManage(actor, user.tenantId, user.role);
    if (user.role === Role.SUPER_ADMIN) {
      throw new BadRequestException('El SUPER_ADMIN siempre tiene todos los permisos');
    }
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length) {
      throw new BadRequestException(`Permisos inválidos: ${invalid.join(', ')}`);
    }
    const unique = [...new Set(permissions)];
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId: id } });
      if (unique.length) {
        await tx.userPermission.createMany({
          data: unique.map((permission) => ({ userId: id, permission })),
        });
      }
    });
    return this.getPermissions(actor, id);
  }

  async setStatus(actor: AuthUser, id: string, status: Status) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    this.assertCanManage(actor, target.tenantId, target.role);

    if (target.id === actor.userId && status === Status.INACTIVE) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    return this.prisma.user.update({ where: { id }, data: { status }, select: userSelect });
  }

  /** Determina a qué tenant pertenece el usuario que se va a crear. */
  private resolveTargetTenant(
    actor: AuthUser,
    effectiveTenantId: string | null,
    role: Role,
  ): string | null {
    if (actor.role === Role.SUPER_ADMIN) {
      if (role === Role.SUPER_ADMIN) return null; // otro admin global
      return requireTenant(effectiveTenantId); // exige X-Tenant-Id
    }
    // ADMIN_TENANT
    if (role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('No puedes crear un usuario SUPER_ADMIN');
    }
    if (!actor.tenantId) {
      throw new BadRequestException('Tu usuario no tiene un tenant asociado');
    }
    return actor.tenantId;
  }

  /** Autoriza la gestión de un usuario objetivo según el actor. */
  private assertCanManage(actor: AuthUser, targetTenantId: string | null, targetRole: Role) {
    if (actor.role === Role.SUPER_ADMIN) return;
    // ADMIN_TENANT: solo usuarios de su tenant y nunca super admins.
    if (targetRole === Role.SUPER_ADMIN || targetTenantId !== actor.tenantId) {
      throw new ForbiddenException('No puedes gestionar este usuario');
    }
  }
}
