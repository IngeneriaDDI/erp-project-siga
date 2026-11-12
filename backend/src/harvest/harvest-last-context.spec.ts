import { HarvestService } from './harvest.service';

const TID = 'tenant-1';
const actor = { userId: 'u1' } as never;

function make(over: {
  mine?: { farmId: string; lotId: string } | null;
  tenantLast?: { farmId: string; lotId: string } | null;
  farmActive?: boolean;
  lotActive?: boolean;
}) {
  const findFirstRecord = jest
    .fn()
    .mockResolvedValueOnce(over.mine ?? null)
    .mockResolvedValueOnce(over.tenantLast ?? null);
  const prisma = {
    harvestRecord: { findFirst: findFirstRecord },
    farm: { findFirst: jest.fn().mockResolvedValue(over.farmActive === false ? null : { id: 'f1' }) },
    lot: { findFirst: jest.fn().mockResolvedValue(over.lotActive === false ? null : { id: 'l1' }) },
  };
  return { prisma, svc: new HarvestService(prisma as never, {} as never, {} as never) };
}

describe('HarvestService.lastContext', () => {
  it('usa el último registro del usuario (filtrado por tenant y usuario)', async () => {
    const { prisma, svc } = make({ mine: { farmId: 'f1', lotId: 'l1' } });
    const r = await svc.lastContext(actor, TID);
    expect(r).toEqual({ farmId: 'f1', lotId: 'l1' });
    expect(prisma.harvestRecord.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.harvestRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TID, createdBy: 'u1' } }),
    );
  });

  it('si el usuario no tiene registros, usa el último de la empresa', async () => {
    const { prisma, svc } = make({ mine: null, tenantLast: { farmId: 'f1', lotId: 'l1' } });
    const r = await svc.lastContext(actor, TID);
    expect(r).toEqual({ farmId: 'f1', lotId: 'l1' });
    expect(prisma.harvestRecord.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { tenantId: TID } }),
    );
  });

  it('sin registros previos devuelve vacío', async () => {
    const { svc } = make({});
    expect(await svc.lastContext(actor, TID)).toEqual({ farmId: null, lotId: null });
  });

  it('lote inactivo: conserva la finca pero no el lote', async () => {
    const { svc } = make({ mine: { farmId: 'f1', lotId: 'l1' }, lotActive: false });
    expect(await svc.lastContext(actor, TID)).toEqual({ farmId: 'f1', lotId: null });
  });

  it('finca inactiva: devuelve vacío', async () => {
    const { svc } = make({ mine: { farmId: 'f1', lotId: 'l1' }, farmActive: false });
    expect(await svc.lastContext(actor, TID)).toEqual({ farmId: null, lotId: null });
  });

  it('exige tenant', async () => {
    const { svc } = make({});
    await expect(svc.lastContext(actor, null)).rejects.toBeDefined();
  });
});
