import { BadRequestException, ConflictException } from '@nestjs/common';
import { HarvestRemissionsService } from './harvest-remissions.service';

const TID = 'tenant-1';
const LOT = 'lot-1';
const actor = { userId: 'u1' } as never;
const FECHA = new Date('2026-11-11');

type Det = { id: string; qualityId: string; pesoGramos: number; canastillas: number; status: string; receivedBy?: string | null };
type Src = { id: string; harvestRecordId: string; qualityIdSnapshot: string; active?: boolean };
type Rec = { id: string; qualityId: string; pesoGramos: number; canastillas: number };

const det = (id: string, q: string, peso: number, status: string): Det => ({
  id,
  qualityId: q,
  pesoGramos: peso,
  canastillas: 1,
  status,
  receivedBy: status === 'RECIBIDA' ? 'u2' : null,
});
const src = (rid: string, q: string): Src => ({ id: `s-${rid}`, harvestRecordId: rid, qualityIdSnapshot: q, active: true });
const rec = (id: string, q = 'q1', peso = 1000): Rec => ({ id, qualityId: q, pesoGramos: peso, canastillas: 2 });

function make(o: {
  status?: string;
  details: Det[];
  sources: Src[];
  taken?: Record<string, string>;
  loaded?: Rec[];
  inactive?: Src[];
}) {
  const remission = {
    id: 'r1',
    tenantId: TID,
    lotId: LOT,
    fecha: FECHA,
    status: o.status ?? 'RECIBIDA',
    totalPesoGramos: 0,
    totalCanastillas: 0,
    registrosIncluidos: o.sources.length,
    receivedBy: 'u2',
    receivedAt: new Date(),
    details: o.details,
    sources: o.sources,
  };
  const tx = {
    harvestRemissionSource: {
      findMany: jest.fn().mockResolvedValue([...o.sources, ...(o.inactive ?? [])]),
      updateMany: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    harvestRemissionDetail: {
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
    harvestRemission: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    harvestRemission: { findFirst: jest.fn().mockResolvedValue(remission) },
    harvestRemissionSource: {
      findMany: jest.fn().mockResolvedValue(
        Object.entries(o.taken ?? {}).map(([id, doc]) => ({ harvestRecordId: id, remission: { documentNumber: doc } })),
      ),
    },
    harvestRecord: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id, i) => ({ id, recordNumber: 100 + i }))),
      ),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const aggregation = { loadValidRecords: jest.fn().mockResolvedValue(o.loaded ?? []) };
  const events = { record: jest.fn().mockResolvedValue(undefined) };
  const identity = { resolveEffectiveActor: jest.fn().mockResolvedValue({ userId: 'u1', workerId: null, displayName: 'U' }) };
  const svc = new HarvestRemissionsService(prisma as never, aggregation as never, {} as never, events as never, identity as never);
  jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'r1' } as never);
  return { svc, tx, prisma, aggregation, events };
}

describe('HarvestRemissionsService.reopen', () => {
  it('rechaza reabrir si no hay calidades rechazadas (aceptada/recibida es inmutable)', async () => {
    const { svc } = make({ details: [det('d1', 'q1', 1000, 'RECIBIDA')], sources: [src('a', 'q1')] });
    await expect(svc.reopen(actor, TID, 'r1', { recordIds: ['a'] })).rejects.toBeInstanceOf(ConflictException);
  });

  it('recalcula: regenera la calidad rechazada como pendiente, conserva consecutivo y guarda estado previo', async () => {
    const { svc, tx, events } = make({
      details: [det('d1', 'q1', 1000, 'RECHAZADA')],
      sources: [src('a', 'q1')],
      loaded: [rec('a', 'q1', 1500), rec('b', 'q1', 500)],
    });
    await svc.reopen(actor, TID, 'r1', { recordIds: ['a', 'b'] });

    expect(tx.harvestRemissionDetail.deleteMany).toHaveBeenCalledWith({
      where: { remissionId: 'r1', status: { not: 'RECIBIDA' } },
    });
    expect(tx.harvestRemissionDetail.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ qualityId: 'q1', pesoGramos: 2000, canastillas: 4 }),
    ]);
    // 'a' ya existía → se actualiza con snapshot nuevo; 'b' es nuevo → se crea.
    expect(tx.harvestRemissionSource.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pesoGramosSnapshot: 1500, active: true }) }),
    );
    expect(tx.harvestRemissionSource.create).toHaveBeenCalledTimes(1);
    const header = tx.harvestRemission.update.mock.calls[0][0].data;
    expect(header.status).toBe('PENDIENTE_RECEPCION');
    expect(header.totalPesoGramos).toBe(2000);
    expect(header.registrosIncluidos).toBe(2);
    expect(header.receivedBy).toBeNull();
    const ev = events.record.mock.calls[0][1];
    expect(ev.metadata.action).toBe('reopen_recalculate');
    expect(ev.metadata.previous.details[0].status).toBe('RECHAZADA');
  });

  it('quita registros: se liberan (active=false), no se borran', async () => {
    const { svc, tx } = make({
      details: [det('d1', 'q1', 3000, 'RECHAZADA')],
      sources: [src('a', 'q1'), src('b', 'q1')],
      loaded: [rec('a')],
    });
    await svc.reopen(actor, TID, 'r1', { recordIds: ['a'] });
    expect(tx.harvestRemissionSource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s-b'] } },
      data: { active: false },
    });
  });

  it('no permite quitar registros de una calidad ya recibida', async () => {
    const { svc } = make({
      details: [det('d1', 'q1', 1000, 'RECIBIDA'), det('d2', 'q2', 500, 'RECHAZADA')],
      sources: [src('a', 'q1'), src('b', 'q2')],
      loaded: [rec('b', 'q2')],
    });
    await expect(svc.reopen(actor, TID, 'r1', { recordIds: ['b'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no permite añadir un registro ligado a otra remisión y avisa cómo liberarlo', async () => {
    const { svc } = make({
      details: [det('d1', 'q1', 1000, 'RECHAZADA')],
      sources: [src('a', 'q1')],
      taken: { z: 'R-0009' },
      loaded: [rec('a'), rec('z')],
    });
    const p = svc.reopen(actor, TID, 'r1', { recordIds: ['a', 'z'] });
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(p).rejects.toThrow(/R-0009.*Edita esa remisión para liberarlo/);
  });

  it('no permite añadir un registro cuya calidad ya fue recibida en esta remisión', async () => {
    const { svc } = make({
      details: [det('d1', 'q1', 1000, 'RECIBIDA'), det('d2', 'q2', 500, 'RECHAZADA')],
      sources: [src('a', 'q1'), src('b', 'q2')],
      loaded: [rec('b', 'q2'), rec('c', 'q1')],
    });
    await expect(svc.reopen(actor, TID, 'r1', { recordIds: ['a', 'b', 'c'] })).rejects.toThrow(/calidad ya fue recibida/);
  });

  it('si solo quedan calidades recibidas, la remisión se cierra con ellas', async () => {
    const { svc, tx } = make({
      details: [det('d1', 'q1', 1000, 'RECIBIDA'), det('d2', 'q2', 500, 'RECHAZADA')],
      sources: [src('a', 'q1'), src('b', 'q2')],
      loaded: [],
    });
    await svc.reopen(actor, TID, 'r1', { recordIds: ['a'] });
    expect(tx.harvestRemissionDetail.createMany).not.toHaveBeenCalled();
    const header = tx.harvestRemission.update.mock.calls[0][0].data;
    expect(header.status).toBe('RECIBIDA');
    expect(header.receivedPesoGramos).toBe(1000);
    expect(header.totalPesoGramos).toBe(1000);
  });

  it('error si no queda ningún registro', async () => {
    const { svc } = make({ details: [det('d1', 'q1', 1000, 'RECHAZADA')], sources: [src('a', 'q1')], loaded: [] });
    // El DTO exige mínimo 1 id; aquí el id pedido no es válido/existente.
    await expect(svc.reopen(actor, TID, 'r1', { recordIds: ['x'] })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('candidates con remissionId', () => {
  it('marca los registros propios y bloquea las calidades ya recibidas', async () => {
    const { svc, prisma } = make({
      details: [det('d1', 'q1', 1000, 'RECIBIDA'), det('d2', 'q2', 500, 'RECHAZADA')],
      sources: [src('a', 'q1'), src('b', 'q2')],
    });
    (prisma as unknown as { harvestRecord: { findMany: jest.Mock } }).harvestRecord.findMany = jest.fn().mockResolvedValue([
      { id: 'a', recordNumber: 1, gramosCosechados: 1000, qualityId: 'q1', quality: { nombre: 'P' }, worker: { codigoInterno: 'W', nombre: 'A' }, containers: [{ unidades: 1 }] },
      { id: 'b', recordNumber: 2, gramosCosechados: 500, qualityId: 'q2', quality: { nombre: 'S' }, worker: { codigoInterno: 'W', nombre: 'A' }, containers: [{ unidades: 1 }] },
    ]);
    (svc as unknown as { aggregation: { assertLot: jest.Mock; assertFarm: jest.Mock } }).aggregation.assertLot = jest
      .fn()
      .mockResolvedValue({ id: LOT, farmId: 'f1', nombreLote: '6' });
    (svc as unknown as { aggregation: { assertFarm: jest.Mock } }).aggregation.assertFarm = jest
      .fn()
      .mockResolvedValue({ id: 'f1', nombre: 'F' });
    const r = await svc.candidates(TID, { date: '2026-11-11', lotId: LOT, remissionId: 'r1' });
    expect(r.records.map((x) => [x.id, x.enEstaRemision, x.bloqueado])).toEqual([
      ['a', true, true],
      ['b', true, false],
    ]);
  });
});
