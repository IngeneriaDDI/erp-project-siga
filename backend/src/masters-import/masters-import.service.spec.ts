import { MastersImportService } from './masters-import.service';
import { MASTER_ERROR } from './masters-import.constants';

// Prisma simulado: fincas del tenant + maestros existentes.
function makePrisma(over: {
  farms?: { id: string; nombre: string; status?: string }[];
  workers?: { codigoInterno: string }[];
  lots?: {
    id?: string;
    farmId: string;
    nombreLote: string;
    varietyId?: string | null;
    productiveGroupId?: string | null;
    fechaSiembra?: Date | null;
  }[];
  varieties?: { id: string; nombre: string }[];
  groups?: { id: string; nombre: string }[];
} = {}) {
  const farms = (over.farms ?? [{ id: 'f1', nombre: 'Finca A', status: 'ACTIVE' }]).map((f) => ({
    status: 'ACTIVE',
    ...f,
  }));
  const varieties = over.varieties ?? [
    { id: 'v1', nombre: 'Biloxi' },
    { id: 'v2', nombre: 'Ventura' },
  ];
  const groups = over.groups ?? [{ id: 'g1', nombre: 'Biloxi 2018' }];
  const createManyWorker = jest.fn().mockResolvedValue({ count: 0 });
  const createManyLot = jest.fn().mockResolvedValue({ count: 0 });
  const updateManyLot = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    farm: { findMany: jest.fn().mockResolvedValue(farms) },
    variety: { findMany: jest.fn().mockResolvedValue(varieties) },
    productiveGroup: { findMany: jest.fn().mockResolvedValue(groups) },
    worker: {
      findMany: jest.fn().mockResolvedValue(over.workers ?? []),
      createMany: createManyWorker,
    },
    lot: {
      findMany: jest.fn().mockResolvedValue(over.lots ?? []),
      createMany: createManyLot,
      updateMany: updateManyLot,
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  };
  return { prisma, createManyWorker, createManyLot, updateManyLot };
}

const TID = 'tenant-1';
const WH = 'finca,codigo,nombre,documento,area_trabajo,estado';
const LH = 'finca,codigo,variedad,numero_plantas,estado';
const LH2 = 'finca,codigo,variedad,numero_plantas,estado,fecha_siembra,grupo_productivo';

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
    const { prisma } = makePrisma({
      lots: [{ id: 'l1', farmId: 'f1', nombreLote: '12L', varietyId: 'v1' }],
    });
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateLots(TID, `${LH}\nFinca A,12L,Biloxi,,`);
    expect(r.skipped).toBe(1);
    expect(r.valid).toBe(0);
    expect(r.updated).toBe(0);
  });

  it('REF_NOT_FOUND si la variedad no existe en el catálogo (sin texto libre)', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateLots(TID, `${LH}\nFinca A,12L,Inventada,,`);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.REF_NOT_FOUND && e.column === 'variedad')).toBe(true);
    expect(r.valid).toBe(0);
  });

  it('REF_NOT_FOUND si el grupo productivo no existe en el catálogo', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateLots(TID, `${LH2}\nFinca A,12L,Biloxi,,,2018-11-01,Grupo X`);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.REF_NOT_FOUND && e.column === 'grupo_productivo')).toBe(true);
  });

  it('INVALID_DATE si la fecha de siembra no es válida; acepta DD/MM/AAAA', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const bad = await svc.validateLots(TID, `${LH2}\nFinca A,12L,Biloxi,,,31/02/2018,`);
    expect(bad.errors.some((e) => e.code === MASTER_ERROR.INVALID_DATE)).toBe(true);
    const ok = await svc.validateLots(TID, `${LH2}\nFinca A,12L,Biloxi,,,01/11/2018,Biloxi 2018`);
    expect(ok.errorRows).toBe(0);
    expect(ok.valid).toBe(1);
  });

  it('crea el lote con variedad del catálogo, grupo y fecha de siembra', async () => {
    const { prisma, createManyLot } = makePrisma();
    createManyLot.mockResolvedValue({ count: 1 });
    const svc = new MastersImportService(prisma as never);
    await svc.importLots(TID, `${LH2}\nFinca A,12L,biloxi,1200,activo,2018-11-01,Biloxi 2018`);
    const data = createManyLot.mock.calls[0][0].data[0];
    expect(data.varietyId).toBe('v1');
    expect(data.variedad).toBe('Biloxi');
    expect(data.productiveGroupId).toBe('g1');
    expect((data.fechaSiembra as Date).toISOString().slice(0, 10)).toBe('2018-11-01');
  });

  it('actualiza (completa) un lote existente sin variedad de catálogo/grupo/fecha', async () => {
    const { prisma, createManyLot, updateManyLot } = makePrisma({
      lots: [{ id: 'l1', farmId: 'f1', nombreLote: '12L', varietyId: null, productiveGroupId: null, fechaSiembra: null }],
    });
    const svc = new MastersImportService(prisma as never);
    const r = await svc.importLots(TID, `${LH2}\nFinca A,12L,Biloxi,,,2018-11-01,Biloxi 2018`);
    expect(createManyLot).not.toHaveBeenCalled();
    expect(r.updated).toBe(1);
    expect(updateManyLot).toHaveBeenCalledWith({
      where: { id: 'l1', tenantId: TID },
      data: expect.objectContaining({ varietyId: 'v1', productiveGroupId: 'g1' }),
    });
  });

  it('aislamiento: el catálogo se consulta siempre filtrado por tenant', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    await svc.validateLots(TID, `${LH}\nFinca A,12L,Biloxi,,`);
    expect(prisma.variety.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TID } }),
    );
    expect(prisma.productiveGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TID } }),
    );
  });

  it('DUPLICATE_IN_FILE con el mismo lote/finca repetido', async () => {
    const { prisma } = makePrisma();
    const svc = new MastersImportService(prisma as never);
    const r = await svc.validateLots(TID, `${LH}\nFinca A,12L,Biloxi,,\nFinca A,12L,Ventura,,`);
    expect(r.valid).toBe(1);
    expect(r.errors.some((e) => e.code === MASTER_ERROR.DUPLICATE_IN_FILE)).toBe(true);
  });
});
