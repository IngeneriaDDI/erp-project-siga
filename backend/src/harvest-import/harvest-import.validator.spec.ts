import { Status } from '@prisma/client';
import { normalizeRef } from './csv.util';
import { lotKey } from './reference-dictionary.service';
import { validateRecords, RawRow } from './harvest-import.validator';
import { IMPORT_ERROR } from './harvest-import.constants';
import { ReferenceDictionaries } from './harvest-import.types';

// --- Diccionario de prueba (empresa KILOGRAMS, filtra por finca) ---
function buildDict(over: Partial<ReferenceDictionaries> = {}): ReferenceDictionaries {
  const A = Status.ACTIVE;
  const I = Status.INACTIVE;
  const farmByName = new Map([
    [normalizeRef('Finca A'), [{ id: 'f1', status: A, nombre: 'Finca A' }]],
    [normalizeRef('Finca B'), [{ id: 'f2', status: I, nombre: 'Finca B' }]],
  ]);
  const lotByFarmName = new Map([
    [lotKey('f1', '12L'), [{ id: 'l1', status: A, nombreLote: '12L', farmId: 'f1', variedad: 'Biloxi' }]],
    [lotKey('f2', '9B'), [{ id: 'l2', status: A, nombreLote: '9B', farmId: 'f2', variedad: 'Ventura' }]],
  ]);
  const workerByCode = new Map([
    [normalizeRef('W1'), [{ id: 'w1', status: A, codigo: 'W1', nombre: 'Juan', farmId: 'f1' }]],
    [normalizeRef('W2'), [{ id: 'w2', status: A, codigo: 'W2', nombre: 'Ana', farmId: 'f2' }]],
  ]);
  const qualityByName = new Map([
    [normalizeRef('Primera'), [{ id: 'q1', status: A, nombre: 'Primera' }]],
    [normalizeRef('Segunda'), [{ id: 'q2', status: I, nombre: 'Segunda' }]],
  ]);
  const canA = { id: 'c1', status: A, nombre: 'Canastilla', pesoGramos: 500 };
  const canB = { id: 'c2', status: A, nombre: 'Grande', pesoGramos: 800 };
  const containerByName = new Map([
    [normalizeRef('Canastilla'), [canA]],
    [normalizeRef('Grande'), [canB]],
  ]);
  return {
    farmByName,
    lotByFarmName,
    workerByCode,
    qualityByName,
    containerByName,
    defaultContainer: canA,
    weightUnit: 'KILOGRAMS',
    workersFilteredByFarm: true,
    ...over,
  };
}

const NOW = new Date('2025-06-01T00:00:00.000Z');

function row(line: number, data: Partial<Record<string, string>>): RawRow {
  const base: Record<string, string> = {
    fecha: '2025-03-14',
    finca: 'Finca A',
    lote: '12L',
    trabajador_codigo: 'W1',
    calidad: 'Primera',
    peso_bruto: '20',
    peso_neto: '18.5', // 20kg − 3×0.5kg = 18.5kg
    cantidad_canastillas: '3',
  };
  return { line, data: { ...base, ...data } as Record<string, string> };
}

const errOpts = { allowInactive: false, duplicateMode: 'error' as const };

describe('validateRecords', () => {
  it('valida y resuelve una fila correcta (canastilla por defecto, KG→gramos)', () => {
    const r = validateRecords([row(1, {})], buildDict(), errOpts, new Set(), NOW);
    expect(r.errors).toHaveLength(0);
    expect(r.validRecords).toHaveLength(1);
    const rec = r.validRecords[0];
    expect(rec.farmId).toBe('f1');
    expect(rec.lotId).toBe('l1');
    expect(rec.workerId).toBe('w1');
    expect(rec.pesoBrutoGramos).toBe(20000);
    expect(rec.gramosCosechados).toBe(18500);
    expect(rec.pesoTotalRecipientesGramos).toBe(1500);
    expect(rec.recipients).toHaveLength(1);
  });

  it('acepta fecha DD/MM/AAAA y decimales con coma (export Excel-ES)', () => {
    const r = validateRecords(
      [row(1, { fecha: '14/03/2025', peso_bruto: '20', peso_neto: '18,5' })],
      buildDict(),
      errOpts,
      new Set(),
      NOW,
    );
    expect(r.errors).toHaveLength(0);
    expect(r.validRecords).toHaveLength(1);
    expect(r.validRecords[0].fecha.toISOString().slice(0, 10)).toBe('2025-03-14');
    expect(r.validRecords[0].gramosCosechados).toBe(18500);
  });

  it('reporta MISSING_REQUIRED', () => {
    const r = validateRecords([row(1, { calidad: '' })], buildDict(), errOpts, new Set(), NOW);
    expect(r.validRecords).toHaveLength(0);
    expect(r.errors[0].code).toBe(IMPORT_ERROR.MISSING_REQUIRED);
  });

  it('reporta REF_NOT_FOUND indicando la columna y el valor', () => {
    const r = validateRecords([row(1, { lote: '99Z' })], buildDict(), errOpts, new Set(), NOW);
    const e = r.errors.find((x) => x.code === IMPORT_ERROR.REF_NOT_FOUND);
    expect(e).toBeDefined();
    expect(e?.column).toBe('lote');
    expect(e?.value).toBe('99Z');
  });

  it('normaliza mayúsculas/tildes/espacios al resolver', () => {
    const r = validateRecords([row(1, { finca: '  fínca a ', calidad: 'PRIMERA' })], buildDict(), errOpts, new Set(), NOW);
    expect(r.errors).toHaveLength(0);
    expect(r.validRecords).toHaveLength(1);
  });

  it('rechaza referencia INACTIVA salvo en modo histórico', () => {
    const strict = validateRecords([row(1, { calidad: 'Segunda' })], buildDict(), errOpts, new Set(), NOW);
    expect(strict.errors.some((e) => e.code === IMPORT_ERROR.REF_INACTIVE)).toBe(true);

    const hist = validateRecords(
      [row(1, { calidad: 'Segunda' })],
      buildDict(),
      { allowInactive: true, duplicateMode: 'skip' },
      new Set(),
      NOW,
    );
    expect(hist.errors).toHaveLength(0);
    expect(hist.validRecords[0].qualityId).toBe('q2');
  });

  it('marca REF_AMBIGUOUS cuando dos valores normalizan igual', () => {
    const dict = buildDict();
    dict.qualityByName.set(normalizeRef('Primera'), [
      { id: 'q1', status: Status.ACTIVE, nombre: 'Primera' },
      { id: 'q1b', status: Status.ACTIVE, nombre: 'PRIMERA' },
    ]);
    const r = validateRecords([row(1, {})], dict, errOpts, new Set(), NOW);
    expect(r.errors.some((e) => e.code === IMPORT_ERROR.REF_AMBIGUOUS)).toBe(true);
  });

  it('valida coherencia finca–trabajador según el flag (y la relaja en histórico)', () => {
    // W2 pertenece a f2; la operación es en f1.
    const strict = validateRecords([row(1, { trabajador_codigo: 'W2' })], buildDict(), errOpts, new Set(), NOW);
    expect(strict.errors.some((e) => e.code === IMPORT_ERROR.WORKER_FARM_MISMATCH)).toBe(true);

    const hist = validateRecords(
      [row(1, { trabajador_codigo: 'W2' })],
      buildDict(),
      { allowInactive: true, duplicateMode: 'skip' },
      new Set(),
      NOW,
    );
    expect(hist.errors).toHaveLength(0);
    expect(hist.validRecords[0].workerId).toBe('w2');
  });

  it('detecta incoherencia de pesos', () => {
    const r = validateRecords([row(1, { peso_neto: '15' })], buildDict(), errOpts, new Set(), NOW);
    expect(r.errors.some((e) => e.code === IMPORT_ERROR.WEIGHT_INCONSISTENT)).toBe(true);
  });

  it('rechaza fecha futura y fecha inválida', () => {
    const fut = validateRecords([row(1, { fecha: '2999-01-01' })], buildDict(), errOpts, new Set(), NOW);
    expect(fut.errors.some((e) => e.code === IMPORT_ERROR.FUTURE_DATE)).toBe(true);
    const bad = validateRecords([row(1, { fecha: '2025-13-40' })], buildDict(), errOpts, new Set(), NOW);
    expect(bad.errors.some((e) => e.code === IMPORT_ERROR.INVALID_DATE)).toBe(true);
  });

  it('detecta duplicados dentro del archivo', () => {
    const r = validateRecords([row(1, {}), row(2, {})], buildDict(), errOpts, new Set(), NOW);
    expect(r.validRecords).toHaveLength(1);
    expect(r.errors.some((e) => e.code === IMPORT_ERROR.DUPLICATE_IN_FILE)).toBe(true);
  });

  it('duplicado existente: error en UI, skip (idempotente) en histórico', () => {
    const base = validateRecords([row(1, {})], buildDict(), errOpts, new Set(), NOW);
    const existing = new Set([base.validRecords[0].rowHash]);

    const strict = validateRecords([row(1, {})], buildDict(), errOpts, existing, NOW);
    expect(strict.errors.some((e) => e.code === IMPORT_ERROR.DUPLICATE_EXISTING)).toBe(true);

    const skip = validateRecords(
      [row(1, {})],
      buildDict(),
      { allowInactive: false, duplicateMode: 'skip' },
      existing,
      NOW,
    );
    expect(skip.errors).toHaveLength(0);
    expect(skip.validRecords).toHaveLength(0);
    expect(skip.skippedHashes).toHaveLength(1);
  });

  it('agrupa multi-recipiente por external_id en un solo registro', () => {
    const rows = [
      row(1, { external_id: 'E1', canastilla: 'Canastilla', cantidad_canastillas: '2', peso_neto: '18.2' }),
      row(2, { external_id: 'E1', canastilla: 'Grande', cantidad_canastillas: '1', peso_neto: '18.2' }),
    ];
    // tara = 2×0.5 + 1×0.8 = 1.8kg → neto 18.2 coherente.
    const r = validateRecords(rows, buildDict(), errOpts, new Set(), NOW);
    expect(r.errors).toHaveLength(0);
    expect(r.validRecords).toHaveLength(1);
    expect(r.validRecords[0].recipients).toHaveLength(2);
    expect(r.validRecords[0].pesoTotalRecipientesGramos).toBe(1800);
  });

  it('aislamiento entre empresas: un valor de otra empresa no resuelve', () => {
    // El diccionario del tenant A no contiene "Finca Z" (de otro tenant).
    const r = validateRecords([row(1, { finca: 'Finca Z' })], buildDict(), errOpts, new Set(), NOW);
    expect(r.errors.some((e) => e.code === IMPORT_ERROR.REF_NOT_FOUND && e.column === 'finca')).toBe(true);
    expect(r.validRecords).toHaveLength(0);
  });

  it('volumen: valida 5.000 filas distintas sin errores en tiempo razonable', () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 5000; i++) {
      // external_id distinto por fila → registros únicos.
      rows.push(row(i + 1, { external_id: `H-${i}` }));
    }
    const t0 = Date.now();
    const r = validateRecords(rows, buildDict(), errOpts, new Set(), NOW);
    expect(r.errors).toHaveLength(0);
    expect(r.validRecords).toHaveLength(5000);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
