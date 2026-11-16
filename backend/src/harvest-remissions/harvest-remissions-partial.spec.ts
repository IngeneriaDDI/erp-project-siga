import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HarvestRemissionsService } from './harvest-remissions.service';

const TID = 'tenant-1';
const LOT = '11111111-1111-4111-8111-111111111111';
const actor = { userId: 'u1' } as never;
const DATE = '2026-11-11';

type Rec = { id: string; lotId: string; qualityId: string; pesoGramos: number; canastillas: number };
const rec = (id: string, peso = 1000, can = 2, q = 'q1'): Rec => ({
  id,
  lotId: LOT,
  qualityId: q,
  pesoGramos: peso,
  canastillas: can,
});

function make(over: { taken?: Record<string, string>; loaded?: Rec[]; createError?: unknown } = {}) {
  const taken = over.taken ?? {};
  const prisma = {
    harvestRemissionSource: {
      findMany: jest.fn().mockResolvedValue(
        Object.entries(taken).map(([id, doc]) => ({ harvestRecordId: id, remission: { documentNumber: doc } })),
      ),
    },
    harvestRemission: {
      create: over.createError
        ? jest.fn().mockRejectedValue(over.createError)
        : jest.fn().mockResolvedValue({ id: 'r1', documentNumber: 'R-0001' }),
    },
    harvestRecord: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        harvestRemission: prisma.harvestRemission,
      };
      return fn(tx);
    }),
  };
  const loadValidRecords = jest.fn().mockResolvedValue(over.loaded ?? []);
  const aggregation = {
    assertLot: jest.fn().mockResolvedValue({ id: LOT, farmId: 'f1', nombreLote: '6' }),
    assertFarm: jest.fn().mockResolvedValue({ id: 'f1', nombre: 'Finca' }),
    loadValidRecords,
    resolveNames: jest.fn().mockResolvedValue({ qualityName: new Map(), lotName: new Map() }),
  };
  const sequences = {
    allocate: jest.fn().mockResolvedValue({ sequenceNumber: 5, documentNumber: 'R-0005' }),
  };
  const events = { record: jest.fn().mockResolvedValue(undefined) };
  const identity = {
    resolveEffectiveActor: jest.fn().mockResolvedValue({ userId: 'u1', workerId: null, displayName: 'U' }),
  };
  const svc = new HarvestRemissionsService(
    prisma as never,
    aggregation as never,
    sequences as never,
    events as never,
    identity as never,
  );
  // findOne final: no relevante para estas pruebas.
  jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'r1' } as never);
  return { svc, prisma, aggregation, loadValidRecords, sequences };
}

describe('HarvestRemissionsService — remisiones parciales', () => {
  it('con recordIds: carga SOLO esos registros y crea la remisión con ellos como fuentes', async () => {
    const { svc, prisma, loadValidRecords } = make({ loaded: [rec('a'), rec('b', 500, 1)] });
    await svc.create(actor, TID, { date: DATE, lotId: LOT, recordIds: ['a', 'b'] });
    expect(loadValidRecords).toHaveBeenCalledWith(TID, expect.objectContaining({ ids: ['a', 'b'], lotId: LOT }));
    const data = prisma.harvestRemission.create.mock.calls[0][0].data;
    expect(data.totalPesoGramos).toBe(1500);
    expect(data.totalCanastillas).toBe(3);
    expect(data.registrosIncluidos).toBe(2);
    expect(data.sources.create.map((s: { harvestRecordId: string }) => s.harvestRecordId)).toEqual(['a', 'b']);
  });

  it('permite varias remisiones del mismo lote y día (ya no hay bloqueo por día+lote)', async () => {
    const { svc, prisma } = make({ loaded: [rec('a')] });
    await svc.create(actor, TID, { date: DATE, lotId: LOT, recordIds: ['a'] });
    // No consulta si existe otra remisión del día: la exclusividad es por registro.
    expect(prisma.harvestRemission.create).toHaveBeenCalledTimes(1);
  });

  it('rechaza registros que ya están en otra remisión activa y nombra la remisión', async () => {
    const { svc, prisma } = make({ taken: { a: 'R-0004' }, loaded: [rec('a'), rec('b')] });
    const p = svc.create(actor, TID, { date: DATE, lotId: LOT, recordIds: ['a', 'b'] });
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(p).rejects.toThrow(/R-0004/);
    expect(prisma.harvestRemission.create).not.toHaveBeenCalled();
  });

  it('rechaza si algún id no existe, está anulado o es de otro lote/fecha', async () => {
    const { svc } = make({ loaded: [rec('a')] }); // se pidieron 2, solo 1 es válido
    await expect(
      svc.create(actor, TID, { date: DATE, lotId: LOT, recordIds: ['a', 'zzz'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin recordIds: toma todo lo pendiente excluyendo lo ya remitido', async () => {
    const { svc, loadValidRecords } = make({ taken: { a: 'R-0001', b: 'R-0001' }, loaded: [rec('c')] });
    await svc.create(actor, TID, { date: DATE, lotId: LOT });
    expect(loadValidRecords).toHaveBeenCalledWith(
      TID,
      expect.objectContaining({ excludeIds: expect.arrayContaining(['a', 'b']) }),
    );
  });

  it('sin pendientes: error claro', async () => {
    const { svc } = make({ loaded: [] });
    await expect(svc.create(actor, TID, { date: DATE, lotId: LOT })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('carrera: el índice único parcial (P2002) se traduce en un conflicto legible', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const { svc } = make({ loaded: [rec('a')], createError: err });
    await expect(
      svc.create(actor, TID, { date: DATE, lotId: LOT, recordIds: ['a'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('las consultas de exclusividad están filtradas por tenant', async () => {
    const { svc, prisma } = make({ loaded: [rec('a')] });
    await svc.create(actor, TID, { date: DATE, lotId: LOT, recordIds: ['a'] });
    expect(prisma.harvestRemissionSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          remission: expect.objectContaining({ tenantId: TID, lotId: LOT }),
        }),
      }),
    );
  });
});

describe('HarvestRemissionsService.candidates', () => {
  it('marca los registros ya remitidos y cuenta los pendientes', async () => {
    const { svc, prisma } = make({ taken: { a: 'R-0003' } });
    prisma.harvestRecord.findMany.mockResolvedValue([
      {
        id: 'a',
        recordNumber: 1580,
        gramosCosechados: 1000,
        qualityId: 'q1',
        quality: { nombre: 'Primera' },
        worker: { codigoInterno: 'W1', nombre: 'Ana' },
        containers: [{ unidades: 2 }],
      },
      {
        id: 'b',
        recordNumber: 1581,
        gramosCosechados: 800,
        qualityId: 'q1',
        quality: { nombre: 'Primera' },
        worker: { codigoInterno: 'W2', nombre: 'Luis' },
        containers: [{ unidades: 1 }, { unidades: 1 }],
      },
      {
        id: 'c',
        recordNumber: 1582,
        gramosCosechados: 0,
        qualityId: 'q1',
        quality: { nombre: 'Primera' },
        worker: { codigoInterno: 'W2', nombre: 'Luis' },
        containers: [],
      },
    ]);
    const r = await svc.candidates(TID, { date: DATE, lotId: LOT });
    expect(r.records.map((x) => [x.id, x.remision, x.valido, x.canastillas])).toEqual([
      ['a', 'R-0003', true, 2],
      ['b', null, true, 2],
      ['c', null, false, 0],
    ]);
    // Solo 'b' está pendiente y es válido ('a' ya está remitido; 'c' no tiene peso ni canastillas).
    expect(r.pendientes).toBe(1);
    expect(prisma.harvestRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TID, lotId: LOT, status: 'ACTIVE' }) }),
    );
  });
});
