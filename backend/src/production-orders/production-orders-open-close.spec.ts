import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';

const TID = 'tenant-1';
const FARM = 'farm-1';
const actor = { userId: 'u1' } as never;
const FECHA = new Date('2026-11-11');

type Rec = { id: string; lotId: string; qualityId: string; pesoGramos: number; canastillas: number };
const rec = (id: string, lot = 'l1', q = 'q1', peso = 1000, can = 2): Rec => ({
  id,
  lotId: lot,
  qualityId: q,
  pesoGramos: peso,
  canastillas: can,
});

function make(o: { existing?: unknown; order?: unknown; loaded?: Rec[]; takenIds?: string[]; closeCount?: number } = {}) {
  const tx = {
    productionOrder: {
      create: jest.fn().mockResolvedValue({ id: 'o1', documentNumber: 'OP-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: o.closeCount ?? 1 }),
    },
    harvestRemission: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    productionOrderQualityDetail: { createMany: jest.fn().mockResolvedValue({}) },
    productionOrderLotDetail: { createMany: jest.fn().mockResolvedValue({}) },
    productionOrderLotQualityDetail: { createMany: jest.fn().mockResolvedValue({}) },
    productionOrderSource: { createMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    productionOrder: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id?: string | { not: string } } }) =>
        Promise.resolve(typeof where.id === 'string' ? (o.order ?? null) : (o.existing ?? null)),
      ),
    },
    harvestRemissionSource: {
      findMany: jest.fn().mockResolvedValue((o.takenIds ?? []).map((id) => ({ harvestRecordId: id }))),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const aggregation = {
    assertFarm: jest.fn().mockResolvedValue({ id: FARM, nombre: 'F' }),
    loadValidRecords: jest.fn().mockResolvedValue(o.loaded ?? []),
    resolveNames: jest.fn().mockResolvedValue({ qualityName: new Map(), lotName: new Map() }),
  };
  const sequences = { allocate: jest.fn().mockResolvedValue({ sequenceNumber: 1, documentNumber: 'OP-1' }) };
  const events = { record: jest.fn().mockResolvedValue(undefined) };
  const identity = { resolveEffectiveActor: jest.fn().mockResolvedValue({ userId: 'u1', workerId: null, displayName: 'U' }) };
  const svc = new ProductionOrdersService(prisma as never, aggregation as never, sequences as never, events as never, identity as never);
  jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'o1' } as never);
  return { svc, tx, prisma, aggregation, events };
}

describe('ProductionOrdersService.open', () => {
  it('abre la orden sin totales y enlaza las remisiones del día sin orden', async () => {
    const { svc, tx } = make();
    await svc.open(actor, TID, { date: '2026-11-11', farmId: FARM });
    const data = tx.productionOrder.create.mock.calls[0][0].data;
    expect(data.status).toBe('ABIERTA');
    expect(data.totalPesoGramos).toBe(0);
    expect(data.registrosIncluidos).toBe(0);
    expect(tx.harvestRemission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TID, farmId: FARM, productionOrderId: null }),
        data: { productionOrderId: 'o1' },
      }),
    );
  });

  it('rechaza si ya existe una orden activa para la finca y fecha', async () => {
    const { svc } = make({ existing: { id: 'x', documentNumber: 'OP-0009' } });
    const p = svc.open(actor, TID, { date: '2026-11-11', farmId: FARM });
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(p).rejects.toThrow(/OP-0009/);
  });
});

describe('ProductionOrdersService.close', () => {
  const open = { id: 'o1', tenantId: TID, farmId: FARM, fecha: FECHA, status: 'ABIERTA' };

  it('calcula con TODOS los registros de la finca ese día y pasa a pendiente de aceptación', async () => {
    const { svc, tx, aggregation, events } = make({
      order: open,
      loaded: [rec('a', 'l1', 'q1', 1000, 2), rec('b', 'l2', 'q2', 500, 1), rec('c', 'l1', 'q1', 250, 1)],
      takenIds: ['a'],
    });
    await svc.close(actor, TID, 'o1');

    expect(aggregation.loadValidRecords).toHaveBeenCalledWith(TID, { fecha: FECHA, farmId: FARM });
    const upd = tx.productionOrder.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'o1', tenantId: TID, status: 'ABIERTA' });
    expect(upd.data.status).toBe('PENDIENTE_ACEPTACION');
    expect(upd.data.totalPesoGramos).toBe(1750);
    expect(upd.data.totalCanastillas).toBe(4);
    expect(upd.data.lotesIncluidos).toBe(2);
    expect(upd.data.registrosIncluidos).toBe(3);
    expect(tx.productionOrderSource.createMany.mock.calls[0][0].data).toHaveLength(3);

    // Aviso informativo: 'b' y 'c' no están en ninguna remisión.
    const meta = events.record.mock.calls[0][1].metadata;
    expect(meta.sinRemitir).toEqual({ registros: 2, pesoGramos: 750, canastillas: 2 });
  });

  it('solo cierra órdenes abiertas', async () => {
    const { svc } = make({ order: { ...open, status: 'PENDIENTE_ACEPTACION' }, loaded: [rec('a')] });
    await expect(svc.close(actor, TID, 'o1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('sin registros de cosecha: error claro', async () => {
    const { svc } = make({ order: open, loaded: [] });
    await expect(svc.close(actor, TID, 'o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cierre simultáneo: si otro ya la cerró, conflicto', async () => {
    const { svc } = make({ order: open, loaded: [rec('a')], closeCount: 0 });
    await expect(svc.close(actor, TID, 'o1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ProductionOrdersService.accept', () => {
  it('una orden ABIERTA no se puede aceptar', async () => {
    const { svc } = make({ order: { id: 'o1', tenantId: TID, status: 'ABIERTA' } });
    await expect(svc.accept(actor, TID, 'o1')).rejects.toThrow(/ciérrala y calcúlala/);
  });
});

describe('ProductionOrdersService — reabrir, recalcular y corregir fecha', () => {
  const pending = {
    id: 'o1',
    tenantId: TID,
    farmId: FARM,
    fecha: FECHA,
    status: 'PENDIENTE_ACEPTACION',
    totalPesoGramos: 5000,
    totalCanastillas: 9,
    lotesIncluidos: 2,
    registrosIncluidos: 7,
  };

  function withTx(o: Parameters<typeof make>[0]) {
    const m = make(o);
    const extra = {
      productionOrderQualityDetail: { deleteMany: jest.fn().mockResolvedValue({}), createMany: m.tx.productionOrderQualityDetail.createMany },
      productionOrderLotDetail: { deleteMany: jest.fn().mockResolvedValue({}), createMany: m.tx.productionOrderLotDetail.createMany },
      productionOrderLotQualityDetail: { deleteMany: jest.fn().mockResolvedValue({}), createMany: m.tx.productionOrderLotQualityDetail.createMany },
      productionOrderSource: { deleteMany: jest.fn().mockResolvedValue({}), createMany: m.tx.productionOrderSource.createMany },
    };
    Object.assign(m.tx, extra);
    m.tx.harvestRemission.updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 1 });
    return m;
  }

  it('reabrir: vuelve a ABIERTA, borra el cálculo y guarda el estado previo', async () => {
    const { svc, tx, events } = withTx({ order: pending });
    await svc.reopen(actor, TID, 'o1');
    const upd = tx.productionOrder.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'o1', tenantId: TID, status: 'PENDIENTE_ACEPTACION' });
    expect(upd.data).toEqual(expect.objectContaining({ status: 'ABIERTA', totalPesoGramos: 0, registrosIncluidos: 0 }));
    expect(tx.productionOrderSource.deleteMany).toHaveBeenCalledWith({ where: { productionOrderId: 'o1' } });
    const meta = events.record.mock.calls[0][1].metadata;
    expect(meta.action).toBe('reopen');
    expect(meta.previous.totalPesoGramos).toBe(5000);
  });

  it('una orden ACEPTADA no se puede reabrir, recalcular ni cambiar de fecha', async () => {
    const { svc } = withTx({ order: { ...pending, status: 'ACEPTADA' } });
    await expect(svc.reopen(actor, TID, 'o1')).rejects.toThrow(/aceptada/);
    await expect(svc.recalculate(actor, TID, 'o1')).rejects.toThrow(/aceptada/);
    await expect(svc.updateDate(actor, TID, 'o1', { date: '2026-11-10' })).rejects.toThrow(/aceptada/);
  });

  it('recalcular: reemplaza el cálculo con los registros actuales, mismo estado y consecutivo', async () => {
    const { svc, tx, events } = withTx({ order: pending, loaded: [rec('a', 'l1', 'q1', 3000, 3)] });
    await svc.recalculate(actor, TID, 'o1');
    expect(tx.productionOrderQualityDetail.deleteMany).toHaveBeenCalled();
    const upd = tx.productionOrder.updateMany.mock.calls[0][0];
    expect(upd.where.status).toBe('PENDIENTE_ACEPTACION');
    expect(upd.data.totalPesoGramos).toBe(3000);
    const meta = events.record.mock.calls[0][1].metadata;
    expect(meta.action).toBe('recalculate');
    expect(meta.previous.totalPesoGramos).toBe(5000);
  });

  it('recalcular solo aplica a órdenes pendientes de aceptación', async () => {
    const { svc } = withTx({ order: { ...pending, status: 'ABIERTA' }, loaded: [rec('a')] });
    await expect(svc.recalculate(actor, TID, 'o1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('corregir fecha: queda ABIERTA, desenlaza remisiones y enlaza las de la nueva fecha', async () => {
    const { svc, tx, events } = withTx({ order: pending });
    await svc.updateDate(actor, TID, 'o1', { date: '2026-11-10' });
    const upd = tx.productionOrder.updateMany.mock.calls[0][0];
    expect(upd.data.fecha).toEqual(new Date('2026-11-10'));
    expect(upd.data.status).toBe('ABIERTA');
    const calls = tx.harvestRemission.updateMany.mock.calls;
    expect(calls[0][0]).toEqual({ where: { tenantId: TID, productionOrderId: 'o1' }, data: { productionOrderId: null } });
    expect(calls[1][0].where).toEqual(expect.objectContaining({ fecha: new Date('2026-11-10'), productionOrderId: null }));
    const meta = events.record.mock.calls[0][1].metadata;
    expect(meta).toEqual(expect.objectContaining({ action: 'update_date', remisionesDesenlazadas: 3, remisionesEnlazadas: 1 }));
  });

  it('corregir fecha: conflicto si ya hay otra orden esa finca y fecha, o si la fecha no cambia', async () => {
    const a = withTx({ order: pending, existing: { documentNumber: 'OP-0007' } });
    // findFirst sin id (búsqueda de choque) devuelve `existing`; con id devuelve la orden.
    a.prisma.productionOrder.findFirst.mockImplementation(({ where }: { where: { id?: string | { not: string } } }) =>
      Promise.resolve(typeof where.id === 'string' ? pending : { documentNumber: 'OP-0007' }),
    );
    await expect(a.svc.updateDate(actor, TID, 'o1', { date: '2026-11-10' })).rejects.toThrow(/OP-0007/);
    const b = withTx({ order: pending });
    await expect(b.svc.updateDate(actor, TID, 'o1', { date: '2026-11-11' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
