import { BadRequestException } from '@nestjs/common';
import {
  OperationalIdentityService,
  buildActorView,
} from './operational-identity.service';
import type { AuthUser } from '../common/types/auth.types';

function makeUser(partial: Partial<AuthUser>): AuthUser {
  return {
    userId: 'u1',
    email: 'cuenta@empresa.com',
    role: 'OPERADOR_COSECHA' as AuthUser['role'],
    tenantId: 't1',
    operationalContext: null,
    permissions: [],
    ...partial,
  };
}

describe('buildActorView (snapshot para histórico)', () => {
  const userMap = new Map<string, string>([['u1', 'Cuenta Cosecha (actual)']]);

  it('usa el nombre del trabajador (snapshot) cuando hay workerId', () => {
    const view = buildActorView('u1', 'w1', 'Carlos', userMap);
    expect(view).toEqual({
      userId: 'u1',
      workerId: 'w1',
      displayName: 'Carlos',
      source: 'ASSIGNED_WORKER',
    });
  });

  it('el snapshot NO se recalcula con la asignación actual (Escenario D)', () => {
    // Aunque hoy la cuenta muestre otro nombre, el documento conserva "Carlos".
    const view = buildActorView('u1', 'w1', 'Carlos', userMap);
    expect(view.displayName).toBe('Carlos');
    expect(view.displayName).not.toBe('Cuenta Cosecha (actual)');
  });

  it('sin workerId, la fuente es USER y usa el nombre del usuario', () => {
    const view = buildActorView('u1', null, null, userMap);
    expect(view.source).toBe('USER');
    expect(view.displayName).toBe('Cuenta Cosecha (actual)');
  });
});

describe('OperationalIdentityService.resolveEffectiveActor', () => {
  function makeService(overrides: {
    userName?: string;
    assignment?: { id: string; workerId: string } | null;
    worker?: { id: string; nombre: string } | null;
    config?: { requiresAssignedWorker: boolean } | null;
  }) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ nombre: overrides.userName ?? 'Ana' }) },
      operationalAssignment: {
        findFirst: jest.fn().mockResolvedValue(overrides.assignment ?? null),
      },
      worker: { findFirst: jest.fn().mockResolvedValue(overrides.worker ?? null) },
      operationalPositionConfig: {
        findFirst: jest.fn().mockResolvedValue(overrides.config ?? null),
      },
    };
    return { service: new OperationalIdentityService(prisma as never), prisma };
  }

  it('usuario nominativo (sin contexto) → identidad = usuario', async () => {
    const { service } = makeService({ userName: 'Ana' });
    const eff = await service.resolveEffectiveActor(makeUser({ operationalContext: null }));
    expect(eff).toEqual({ userId: 'u1', workerId: null, displayName: 'Ana', source: 'USER' });
  });

  it('cuenta operativa con trabajador activo → identidad = trabajador (cambio de turno)', async () => {
    const { service, prisma } = makeService({
      assignment: { id: 'a1', workerId: 'w1' },
      worker: { id: 'w1', nombre: 'Carlos' },
    });
    const eff = await service.resolveEffectiveActor(
      makeUser({ operationalContext: 'HARVEST_WEIGHING' as AuthUser['operationalContext'] }),
    );
    expect(eff.source).toBe('ASSIGNED_WORKER');
    expect(eff.workerId).toBe('w1');
    expect(eff.displayName).toBe('Carlos');
    // Anti-spoofing: el worker se resuelve por la asignación en BD, no por el cliente.
    expect(prisma.operationalAssignment.findFirst).toHaveBeenCalled();
    expect(prisma.worker.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'w1' }) }),
    );
  });

  it('sin trabajador y la posición lo exige → bloquea (Escenario E)', async () => {
    const { service } = makeService({ assignment: null, config: null }); // default requiere = true
    await expect(
      service.resolveEffectiveActor(
        makeUser({ operationalContext: 'HARVEST_WEIGHING' as AuthUser['operationalContext'] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin trabajador pero la posición NO lo exige → cae a USER', async () => {
    const { service } = makeService({
      assignment: null,
      config: { requiresAssignedWorker: false },
      userName: 'Cuenta Cosecha',
    });
    const eff = await service.resolveEffectiveActor(
      makeUser({ operationalContext: 'HARVEST_WEIGHING' as AuthUser['operationalContext'] }),
    );
    expect(eff.source).toBe('USER');
    expect(eff.displayName).toBe('Cuenta Cosecha');
  });

  it('trabajador de OTRO tenant no se atribuye (worker.findFirst filtra por tenant)', async () => {
    // Hay asignación pero el worker no existe en el tenant → worker null → exige y bloquea.
    const { service } = makeService({
      assignment: { id: 'a1', workerId: 'w-otro-tenant' },
      worker: null,
      config: null,
    });
    await expect(
      service.resolveEffectiveActor(
        makeUser({ operationalContext: 'HARVEST_WEIGHING' as AuthUser['operationalContext'] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
