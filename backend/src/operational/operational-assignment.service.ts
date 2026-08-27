import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OperationalContext, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth.types';
import { requireTenant } from '../common/tenant/tenant.util';
import { AssignWorkerDto, SetPositionConfigDto } from './dto/operational.dto';

@Injectable()
export class OperationalAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Trabajador activo (o null) de un contexto, con nombre. */
  private async activeFor(tenantId: string, context: OperationalContext) {
    const a = await this.prisma.operationalAssignment.findFirst({
      where: { tenantId, context, active: true },
    });
    if (!a) return { context, assignmentId: null, worker: null };
    const worker = await this.prisma.worker.findFirst({
      where: { id: a.workerId },
      select: { id: true, nombre: true, codigoInterno: true },
    });
    return { context, assignmentId: a.id, worker };
  }

  /** Lista los trabajadores activos por contexto (para el panel admin). */
  async listActive(tenantId: string | null) {
    const tid = requireTenant(tenantId);
    const contexts = Object.values(OperationalContext);
    return Promise.all(contexts.map((c) => this.activeFor(tid, c)));
  }

  /**
   * Asigna un trabajador a un contexto. Reasignación transaccional:
   * desactiva la anterior (cardinalidad 1 activo por tenant+contexto).
   */
  async assign(actor: AuthUser, tenantId: string | null, dto: AssignWorkerDto) {
    const tid = requireTenant(tenantId);
    const worker = await this.prisma.worker.findFirst({ where: { id: dto.workerId, tenantId: tid } });
    if (!worker) throw new NotFoundException('Trabajador no encontrado o de otra empresa');
    if (worker.status !== 'ACTIVE') throw new BadRequestException('El trabajador está inactivo');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.operationalAssignment.updateMany({
          where: { tenantId: tid, context: dto.context, active: true },
          data: { active: false, validTo: new Date() },
        });
        await tx.operationalAssignment.create({
          data: {
            tenantId: tid,
            context: dto.context,
            workerId: dto.workerId,
            active: true,
            validFrom: new Date(),
            assignedByUserId: actor.userId,
          },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Otra asignación ocurrió al mismo tiempo. Reintenta.');
      }
      throw e;
    }
    return this.activeFor(tid, dto.context);
  }

  /** Desactiva la asignación activa de un contexto (queda sin operador). */
  async clear(tenantId: string | null, context: OperationalContext) {
    const tid = requireTenant(tenantId);
    await this.prisma.operationalAssignment.updateMany({
      where: { tenantId: tid, context, active: true },
      data: { active: false, validTo: new Date() },
    });
    return this.activeFor(tid, context);
  }

  /** Historial de asignaciones de un contexto (auditoría). */
  async history(tenantId: string | null, context: OperationalContext) {
    const tid = requireTenant(tenantId);
    return this.prisma.operationalAssignment.findMany({
      where: { tenantId: tid, context },
      orderBy: { validFrom: 'desc' },
    });
  }

  // ---- Configuración de posiciones (super admin) ----
  async getPositions(tenantId: string | null) {
    const tid = requireTenant(tenantId);
    return this.prisma.operationalPositionConfig.findMany({ where: { tenantId: tid } });
  }

  async setPosition(tenantId: string | null, dto: SetPositionConfigDto) {
    const tid = requireTenant(tenantId);
    return this.prisma.operationalPositionConfig.upsert({
      where: { tenantId_context: { tenantId: tid, context: dto.context } },
      update: { enabled: dto.enabled, requiresAssignedWorker: dto.requiresAssignedWorker },
      create: {
        tenantId: tid,
        context: dto.context,
        enabled: dto.enabled,
        requiresAssignedWorker: dto.requiresAssignedWorker,
      },
    });
  }

  /** Estado para el usuario actual: quién firma / si está bloqueado. */
  async myStatus(user: AuthUser) {
    const ctx = user.operationalContext;
    if (!ctx || !user.tenantId) {
      return { operationalContext: null, requiresWorker: false, activeWorker: null };
    }
    const config = await this.prisma.operationalPositionConfig.findFirst({
      where: { tenantId: user.tenantId, context: ctx },
    });
    const active = await this.activeFor(user.tenantId, ctx);
    return {
      operationalContext: ctx,
      requiresWorker: config ? config.requiresAssignedWorker : true,
      activeWorker: active.worker,
    };
  }
}
