/**
 * Contrato CSV para carga masiva de maestros (trabajadores y lotes).
 * Nombres de columna estables (contrato). Reutiliza el estilo del importador de cosecha.
 */

export const WORKER_COLUMNS = {
  finca: 'finca',
  codigo: 'codigo',
  nombre: 'nombre',
  documento: 'documento',
  areaTrabajo: 'area_trabajo',
  estado: 'estado',
} as const;

export const WORKER_REQUIRED = [WORKER_COLUMNS.finca, WORKER_COLUMNS.codigo, WORKER_COLUMNS.nombre];
export const WORKER_TEMPLATE = [
  WORKER_COLUMNS.finca,
  WORKER_COLUMNS.codigo,
  WORKER_COLUMNS.nombre,
  WORKER_COLUMNS.documento,
  WORKER_COLUMNS.areaTrabajo,
  WORKER_COLUMNS.estado,
];

export const LOT_COLUMNS = {
  finca: 'finca',
  codigo: 'codigo',
  variedad: 'variedad',
  numeroPlantas: 'numero_plantas',
  estado: 'estado',
} as const;

export const LOT_REQUIRED = [LOT_COLUMNS.finca, LOT_COLUMNS.codigo, LOT_COLUMNS.variedad];
export const LOT_TEMPLATE = [
  LOT_COLUMNS.finca,
  LOT_COLUMNS.codigo,
  LOT_COLUMNS.variedad,
  LOT_COLUMNS.numeroPlantas,
  LOT_COLUMNS.estado,
];

export const MASTER_ERROR = {
  MISSING_HEADER: 'MISSING_HEADER',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  REF_NOT_FOUND: 'REF_NOT_FOUND',
  REF_AMBIGUOUS: 'REF_AMBIGUOUS',
  INVALID_NUMBER: 'INVALID_NUMBER',
  NEGATIVE_VALUE: 'NEGATIVE_VALUE',
  INVALID_STATUS: 'INVALID_STATUS',
  DUPLICATE_IN_FILE: 'DUPLICATE_IN_FILE',
  DUPLICATE_EXISTING: 'DUPLICATE_EXISTING',
  ROW_LIMIT_EXCEEDED: 'ROW_LIMIT_EXCEEDED',
} as const;

export type MasterErrorCode = (typeof MASTER_ERROR)[keyof typeof MASTER_ERROR];

/** Límite de filas por archivo para maestros (configurable). */
export const MASTERS_MAX_ROWS = Number(process.env.MASTERS_IMPORT_MAX_ROWS ?? 20000);
