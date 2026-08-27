import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OperationalAssignmentService } from './operational-assignment.service';
import type { AuthUser } from '../common/types/auth.types';

const actor: AuthUser = {
  userId: 'admin1',
  email: 'admin@empresa.com',
  role: 'ADMIN_TENANT' as AuthUser['role'],
  tenantId: 't1',
  operationalContext: null,
  permissions: [],
};

const dto = { context: 'HARVEST_WEIGHING' as never, workerId: 'w2' };

describe('OperationalAssignmentService.assign', () => {
  it('reasigna de forma transaccional: desactiva la anterior ANTES de crear la nueva', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: 'a2' });
    const tx = { operationalAssignment: { updateMany, create } };

    const prisma = {
      worker: {
        findFirst: jest
          .fn()
          // 1) validación del worker a asignar
          .mockResolvedValueOnce({ id: 'w2', status: 'ACTIVE', tenantId: 't1' })
          // 2) activeFor() tras asignar
          .mockResolvedValueOnce({ id: 'w2', nombre: 'Andrés', codigoInterno: 'W2' }),
      },
      operationalAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a2', workerId: 'w2' }),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };

    const service = new OperationalAssignmentService(prisma as never);
    const result = await service.assign(actor, 't1', dto);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ context: 'HARVEST_WEIGHING', active: true }),
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workerId: 'w2', active: true }),
      }),
    );
    // Cardinalidad 1: la desactivación ocurre antes de la creación.
    const deactivateOrder = updateMany.mock.invocationCallOrder[0];
    const createOrder = create.mock.invocationCallOrder[0];
    expect(deactivateOrder).toBeLessThan(createOrder);

    expect(result.worker).toEqual({ id: 'w2', nombre: 'Andrés', codigoInterno: 'W2' });
  });

  it('rechaza asignar un trabajador de otra empresa', async () => {
    const prisma = {
      worker: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new OperationalAssignmentService(prisma as never);
    await expect(service.assign(actor, 't1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza asignar un trabajador inactivo', async () => {
    const prisma = {
      worker: {
        findFirst: jest.fn().mockResolvedValue({ id: 'w2', status: 'INACTIVE', tenantId: 't1' }),
      },
    };
    const service = new OperationalAssignmentService(prisma as never);
    await expect(service.assign(actor, 't1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });
});
