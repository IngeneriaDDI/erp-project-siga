import { MastersImportService } from './masters-import.service';
import { MASTER_ERROR } from './masters-import.constants';

// Prisma simulado: fincas del tenant + maestros existentes.
function makePrisma(over: {
  farms?: { id: string; nombre: string; status?: string }[];
  workers?: { codigoInterno: string }[];
  lots?: { farmId: string; nombreLote: string }[];
} = {}) {
  const farms = (over.farms ?? [{ id: 'f1', nombre: 'Finca A', status: 'ACTIVE' }]).map((f) => ({
    status: 'ACTIVE',
    ...f,
  }));
  const createManyWorker = jest.fn().mockResolvedValue({ count: 0 });
  const createManyLot = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    farm: { findMany: jest.fn().mockResolvedValue(farms) },
    worker: {
      findMany: jest.fn().mockResolvedValue(over.workers ?? []),
      createMany: createManyWorker,
    },
    lot: {
      findMany: jest.fn().mockResolvedValue(over.lots ?? []),
      createMany: createManyLot,
    },
  };
  return { prisma, createManyWorker, createManyLot };
}

const TID = 'tenant-1';
const WH = 'finca,codigo,nombre,documento,area_trabajo,estado';
const LH = 'finca,codigo,variedad,numero_plantas,estado';

describe('MastersImportService — trabajadores', () => {
  it('valida una fila correcta y resuelve la finca', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateWorkers(TID, `${WH}\nFinca A,W001,Juan,,Bloque A,activo`);
    expect(r.errorRows).toBe(0);
    expect(r.valid).toBe(1);
  });

  it('REF_NOT_FOUND si la finca no existe (aislamiento por tenant)', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateWorkers(TID, `${WH}\nFinca Z,W001,Juan,,,`);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.REF_NOT_FOUND && e.column === 'finca')).toBe(true);
    expect(r.valid).toBe(0);
  });

  it('MISSING_REQUIRED si falta el nombre', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateWorkers(TID, `${WH}\nFinca A,W001,,,,`);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.MISSING_REQUIRED)).toBe(true);
  });

  it('DUPLICATE_IN_FILE con código repetido', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateWorkers(TID, `${WH}\nFinca A,W001,Juan,,,\nFinca A,W001,Pedro,,,`);
    expect(r.valid).toBe(1);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.DUPLICATE_IN_FILE)).toBe(true);
  });

  it('omite trabajadores que ya existen (idempotente)', async () => {
    const { prisma } = makePrisma({ workers: [{ codigoInterno: 'W001' }] });
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateWorkers(TID, `${WH}\nFinca A,W001,Juan,,,`);
    expect(r.valid).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.errorRows).toBe(0);
  });

  it('INVALID_STATUS con un estado no reconocible', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateWorkers(TID, `${WH}\nFinca A,W001,Juan,,,tal-vez`);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.INVALID_STATUS)).toBe(true);
  });

  it('crea solo los nuevos en commit (todo-o-nada)', async () => {
    const { prisma, createManyWorker } = makePrisma();
    createManyWorker.mockResolvedValue({ count: 2 });
    const svc = new MastersImportService(prisma as never);
    const r = await svc.importWorkers(TID, `${WH}\nFinca A,W001,Juan,,,\nFinca A,W002,Ana,,,inactivo`);
    expect(createManyWorker).toHaveBeenCalled();
    expect(r.created).toBe(2);
  });

  it('no inserta nada si hay errores', async () => {
    const { prisma, createManyWorker } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.importWorkers(TID, `${WH}\nFinca Z,W001,Juan,,,`);
    expect(createManyWorker).not.toHaveBeenCalled();
    expect(r.errorRows).toBeGreaterThan(0);
  });
});

describe('MastersImportService — lotes', () => {
  it('valida un lote correcto', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateLots(TID, `${LH}\nFinca A,12L,Biloxi,1200,activo`);
    expect(r.errorRows).toBe(0);
    expect(r.valid).toBe(1);
  });

  it('INVALID_NUMBER si numero_plantas no es entero', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateLots(TID, `${LH}\nFinca A,12L,Biloxi,mil,activo`);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.INVALID_NUMBER)).toBe(true);
  });

  it('omite lotes existentes en la misma finca (idempotente)', async () => {
    const { prisma } = makePrisma({ lots: [{ farmId: 'f1', nombreLote: '12L' }] });
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateLots(TID, `${LH}\nFinca A,12L,Biloxi,,`);
    expect(r.skipped).toBe(1);
    expect(r.valid).toBe(0);
  });

  it('DUPLICATE_IN_FILE con el mismo lote/finca repetido', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateLots(TID, `${LH}\nFinca A,12L,Biloxi,,\nFinca A,12L,Ventura,,`);
    expect(r.valid).toBe(1);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.DUPLICATE_IN_FILE)).toBe(true);
  });
});
