import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth.types';

export type ActorSource = 'USER' | 'ASSIGNED_WORKER';

export interface EffectiveActor {
  userId: string;
  workerId: string | null;
  displayName: string;
  source: ActorSource;
}

export interface ActorView {
  userId: string;
  workerId: string | null;
  displayName: string | null;
  source: ActorSource;
}

/**
 * Construye la identidad mostrada a partir de los campos persistidos.
 * Usa el snapshot del nombre (protege el histórico); si no hay, cae al nombre del usuario.
 */
export function buildActorView(
  userId: string,
  workerId: string | null | undefined,
  actorName: string | null | undefined,
  userNameById: Map<string, string>,
): ActorView {
  return {
    userId,
    workerId: workerId ?? null,
    displayName: actorName ?? userNameById.get(userId) ?? null,
    source: workerId ? 'ASSIGNED_WORKER' : 'USER',
  };
}

/**
 * Resuelve la IDENTIDAD EFECTIVA de quien firma una operación.
 * Nunca reemplaza al usuario autenticado: ambos quedan registrados.
 * El worker se resuelve SIEMPRE en backend (anti-spoofing).
 */
@Injectable()
export class OperationalIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveEffectiveActor(
    user: AuthUser,
    tx?: Prisma.TransactionClient,
  ): Promise<EffectiveActor> {
    const db = tx ?? this.prisma;
    const authUser = await db.user.findUnique({
      where: { id: user.userId },
      select: { nombre: true },
    });
    const userName = authUser?.nombre ?? user.email;

    const ctx = user.operationalContext;
    // Usuario nominativo → la identidad es el propio usuario.
    if (!ctx) {
      return { userId: user.userId, workerId: null, displayName: userName, source: 'USER' };
    }

    // Cuenta operativa compartida → trabajador activo del contexto.
    const assignment = await db.operationalAssignment.findFirst({
      where: { tenantId: user.tenantId ?? undefined, context: ctx, active: true },
    });
    if (assignment) {
      const worker = await db.worker.findFirst({
        where: { id: assignment.workerId, tenantId: user.tenantId ?? undefined },
        select: { id: true, nombre: true },
      });
      if (worker) {
        return {
          userId: user.userId,
          workerId: worker.id,
          displayName: worker.nombre,
          source: 'ASSIGNED_WORKER',
        };
      }
    }

    // No hay trabajador activo: ¿la posición lo exige?
    const config = await db.operationalPositionConfig.findFirst({
      where: { tenantId: user.tenantId ?? undefined, context: ctx },
    });
    const requires = config ? config.requiresAssignedWorker : true;
    if (requires) {
      throw new BadRequestException(
        'No hay un trabajador asignado actualmente a esta operación. Solicita a un administrador que configure el operador activo.',
      );
    }
    return { userId: user.userId, workerId: null, displayName: userName, source: 'USER' };
  }
}
