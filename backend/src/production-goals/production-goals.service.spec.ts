import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProductionGoalsService } from './production-goals.service';
import { GoalsImportService } from './goals-import.service';
import { MASTER_ERROR } from '../masters-import/masters-import.constants';

const TID = 'tenant-1';
const LOT = '11111111-1111-4111-8111-111111111111';
const twelve = (v = '0.5') => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, kgPerPlant: v }));

function makeSvc(over: { lot?: unknown; existing?: number } = {}) {
  const lot =
    over.lot === undefined
      ? { id: LOT, status: 'ACTIVE', numeroPlantas: 100, nombreLote: '1A' }
      : over.lot;
  const prisma = {
    lot: { findFirst: jest.fn().mockResolvedValue(lot) },
    lotProductionGoal: {
      count: jest.fn().mockResolvedValue(over.existing ?? 0),
      create: jest.fn().mockImplementation((a) => a),
      upsert: jest.fn().mockImplementation((a) => a),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 12 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  // findOne tras guardar: devuelve filas simuladas.
  prisma.lotProductionGoal.findMany.mockResolvedValue(
    Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      metaGramosPlanta: { toFixed: () => '500.000', plus: () => 0 },
      plantasSnapshot: 100,
      metaGramosTotal: { toFixed: () => '50000.000' },
    })),
  );
  return { prisma, svc: new ProductionGoalsService(prisma as never) };
}

describe('ProductionGoalsService', () => {
  it('create: guarda 12 filas en UNA transacción, filtradas por tenant', async () => {
    const { prisma, svc } = makeSvc();
    jest.spyOn(svc, 'findOne').mockResolvedValue({} as never);
    await svc.create(TID, 'u1', { lotId: LOT, year: 2026, months: twelve() });
    expect(prisma.lot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LOT, tenantId: TID } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.lotProductionGoal.create).toHaveBeenCalledTimes(12);
    const first = prisma.lotProductionGoal.create.mock.calls[0][0].data;
    expect(first.tenantId).toBe(TID);
    expect(first.plantasSnapshot).toBe(100);
    expect(first.metaGramosTotal.toFixed(3)).toBe('50000.000');
  });

  it('create: conflicto si ya existen metas para lote+año (unicidad)', async () => {
    const { svc } = makeSvc({ existing: 12 });
    await expect(svc.create(TID, 'u1', { lotId: LOT, year: 2026, months: twelve() })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('create: rechaza lote de otro tenant / inexistente', async () => {
    const { svc } = makeSvc({ lot: null });
    await expect(svc.create(TID, 'u1', { lotId: LOT, year: 2026, months: twelve() })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create: rechaza lote inactivo o sin plantas', async () => {
    const inactive = makeSvc({ lot: { id: LOT, status: 'INACTIVE', numeroPlantas: 10, nombreLote: 'X' } });
    await expect(
      inactive.svc.create(TID, 'u1', { lotId: LOT, year: 2026, months: twelve() }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const noPlants = makeSvc({ lot: { id: LOT, status: 'ACTIVE', numeroPlantas: null, nombreLote: 'X' } });
    await expect(
      noPlants.svc.create(TID, 'u1', { lotId: LOT, year: 2026, months: twelve() }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update: 404 si no existen metas; si existen hace upsert de los 12 meses', async () => {
    const none = makeSvc({ existing: 0 });
    await expect(none.svc.update(TID, 'u1', LOT, 2026, twelve())).rejects.toBeInstanceOf(NotFoundException);
    const ok = makeSvc({ existing: 12 });
    jest.spyOn(ok.svc, 'findOne').mockResolvedValue({} as never);
    await ok.svc.update(TID, 'u1', LOT, 2026, twelve('1'));
    expect(ok.prisma.lotProductionGoal.upsert).toHaveBeenCalledTimes(12);
    expect(ok.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('remove: elimina solo dentro del tenant', async () => {
    const { prisma, svc } = makeSvc();
    await svc.remove(TID, LOT, 2026);
    expect(prisma.lotProductionGoal.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TID, lotId: LOT, year: 2026 },
    });
  });

  it('exige tenant (super admin sin empresa no puede operar)', async () => {
    const { svc } = makeSvc();
    await expect(svc.remove(null, LOT, 2026)).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Importación masiva
// ---------------------------------------------------------------------------
function makeImporter(over: { lots?: unknown[]; pairs?: unknown[] } = {}) {
  const createMany = jest.fn().mockResolvedValue({ count: 12 });
  const prisma = {
    farm: { findMany: jest.fn().mockResolvedValue([{ id: 'f1', nombre: 'Finca A' }]) },
    lot: {
      findMany: jest.fn().mockResolvedValue(
        over.lots ?? [{ id: 'l1', farmId: 'f1', nombreLote: '1A', status: 'ACTIVE', numeroPlantas: 100 }],
      ),
    },
    lotProductionGoal: {
      groupBy: jest.fn().mockResolvedValue(over.pairs ?? []),
      createMany,
    },
  };
  return { prisma, createMany, svc: new GoalsImportService(prisma as never) };
}

const HEAD = 'finca,lote,año,mes,meta_kg_planta,estado_productivo';
const fileOf = (year: number, v = '0.5', skip: number[] = []) =>
  [HEAD, ...Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !skip.includes(m)).map(
    (m) => `Finca A,1A,${year},${m},${v},Productivo`,
  )].join('\n');

describe('GoalsImportService', () => {
  it('valida un lote+año completo e ignora columnas extra', async () => {
    const { svc } = makeImporter();
    const r = await svc.validate(TID, fileOf(2026));
    expect(r.errorRows).toBe(0);
    expect(r.valid).toBe(1);
    expect(r.roundedValues).toBe(0);
  });

  it('commit crea 12 filas en un solo createMany con gramos y totales', async () => {
    const { svc, createMany } = makeImporter();
    // Excel-ES: separador ';' y coma decimal.
    const csv = [
      'finca;lote;año;mes;meta_kg_planta',
      ...Array.from({ length: 12 }, (_, i) => `Finca A;1A;2026;${i + 1};0,5`),
    ].join('\n');
    const r = await svc.commit(TID, 'u1', csv);
    expect(r.created).toBe(1);
    const data = createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(12);
    expect(data[0].tenantId).toBe(TID);
    expect(data[0].metaGramosPlanta.toFixed(3)).toBe('500.000');
    expect(data[0].metaGramosTotal.toFixed(3)).toBe('50000.000');
  });

  it('reporta cuántos valores se redondearon a 3 decimales en gramos', async () => {
    const { svc } = makeImporter();
    const r = await svc.validate(TID, fileOf(2026, '0.3590243902439024'));
    expect(r.errorRows).toBe(0);
    expect(r.roundedValues).toBe(12);
  });

  it('INCOMPLETE_YEAR si faltan meses', async () => {
    const { svc } = makeImporter();
    const r = await svc.validate(TID, fileOf(2026, '1', [5]));
    expect(r.errors.some((e) => e.code === MASTER_ERROR.INCOMPLETE_YEAR)).toBe(true);
  });

  it('DUPLICATE_IN_FILE con lote+año+mes repetido', async () => {
    const { svc } = makeImporter();
    const csv = fileOf(2026) + '\nFinca A,1A,2026,3,0.7,Productivo';
    const r = await svc.validate(TID, csv);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.DUPLICATE_IN_FILE)).toBe(true);
  });

  it('omite lote+año que ya existen (no sobrescribe)', async () => {
    const { svc, createMany } = makeImporter({ pairs: [{ lotId: 'l1', year: 2026 }] });
    const r = await svc.commit(TID, 'u1', fileOf(2026));
    expect(r.skipped).toBe(1);
    expect(r.valid).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('REF_NOT_FOUND con finca o lote inexistente (aislamiento por tenant)', async () => {
    const { svc, prisma } = makeImporter();
    const badFarm = await svc.validate(TID, `${HEAD}\nOtra,1A,2026,1,1,x`);
    expect(badFarm.errors.some((e) => e.code === MASTER_ERROR.REF_NOT_FOUND && e.column === 'finca')).toBe(true);
    const badLot = await svc.validate(TID, `${HEAD}\nFinca A,99,2026,1,1,x`);
    expect(badLot.errors.some((e) => e.code === MASTER_ERROR.REF_NOT_FOUND && e.column === 'lote')).toBe(true);
    expect(prisma.farm.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TID } }));
    expect(prisma.lot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TID } }));
  });

  it('valida año, mes y valor; lote inactivo no es elegible', async () => {
    const { svc } = makeImporter({
      lots: [{ id: 'l1', farmId: 'f1', nombreLote: '1A', status: 'INACTIVE', numeroPlantas: 100 }],
    });
    const r = await svc.validate(
      TID,
      `${HEAD}\nFinca A,1A,26,13,-1,x\nFinca A,1A,2026,1,abc,x`,
    );
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain(MASTER_ERROR.LOT_NOT_ELIGIBLE);
    expect(codes).toContain(MASTER_ERROR.INVALID_RANGE);
    expect(codes).toContain(MASTER_ERROR.INVALID_NUMBER);
  });

  it('todo-o-nada: con errores no inserta nada', async () => {
    const { svc, createMany } = makeImporter();
    await svc.commit(TID, 'u1', fileOf(2026, '1', [5]));
    expect(createMany).not.toHaveBeenCalled();
  });

  it('MISSING_HEADER si faltan columnas', async () => {
    const { svc } = makeImporter();
    const r = await svc.validate(TID, 'finca,lote\nFinca A,1A');
    expect(r.errors[0].code).toBe(MASTER_ERROR.MISSING_HEADER);
  });
});
