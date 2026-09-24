/**
 * Contrato del CSV de registros de cosecha y catálogo de errores.
 * Los nombres de columna son CONTRATO: no cambiarlos sin migrar el layout.
 */

export const IMPORT_COLUMNS = {
  fecha: 'fecha',
  finca: 'finca',
  lote: 'lote',
  trabajadorCodigo: 'trabajador_codigo',
  trabajadorNombre: 'trabajador_nombre',
  calidad: 'calidad',
  pesoBruto: 'peso_bruto',
  pesoNeto: 'peso_neto',
  cantidadCanastillas: 'cantidad_canastillas',
  canastilla: 'canastilla',
  primeraFila: 'primera_fila',
  ultimaFila: 'ultima_fila',
  estadoRoja: 'estado_roja',
  observaciones: 'observaciones',
  externalId: 'external_id',
} as const;

export const REQUIRED_COLUMNS: string[] = [
  IMPORT_COLUMNS.fecha,
  IMPORT_COLUMNS.finca,
  IMPORT_COLUMNS.lote,
  IMPORT_COLUMNS.trabajadorCodigo,
  IMPORT_COLUMNS.calidad,
  IMPORT_COLUMNS.pesoBruto,
  IMPORT_COLUMNS.pesoNeto,
  IMPORT_COLUMNS.cantidadCanastillas,
];

export const OPTIONAL_COLUMNS: string[] = [
  IMPORT_COLUMNS.canastilla,
  IMPORT_COLUMNS.trabajadorNombre,
  IMPORT_COLUMNS.primeraFila,
  IMPORT_COLUMNS.ultimaFila,
  IMPORT_COLUMNS.estadoRoja,
  IMPORT_COLUMNS.observaciones,
  IMPORT_COLUMNS.externalId,
];

/** Orden estable de columnas para plantilla y exportación (round-trip). */
export const TEMPLATE_COLUMNS: string[] = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

/** Códigos de error por fila (estables, para agrupar y accionar). */
export const IMPORT_ERROR = {
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_DATE: 'INVALID_DATE',
  DATE_OUT_OF_RANGE: 'DATE_OUT_OF_RANGE',
  FUTURE_DATE: 'FUTURE_DATE',
  INVALID_NUMBER: 'INVALID_NUMBER',
  NEGATIVE_VALUE: 'NEGATIVE_VALUE',
  REF_NOT_FOUND: 'REF_NOT_FOUND',
  REF_AMBIGUOUS: 'REF_AMBIGUOUS',
  REF_INACTIVE: 'REF_INACTIVE',
  LOT_FARM_MISMATCH: 'LOT_FARM_MISMATCH',
  WORKER_FARM_MISMATCH: 'WORKER_FARM_MISMATCH',
  RECIPIENTS_EXCEED_GROSS: 'RECIPIENTS_EXCEED_GROSS',
  WEIGHT_INCONSISTENT: 'WEIGHT_INCONSISTENT',
  DUPLICATE_IN_FILE: 'DUPLICATE_IN_FILE',
  DUPLICATE_EXISTING: 'DUPLICATE_EXISTING',
  ROW_LIMIT_EXCEEDED: 'ROW_LIMIT_EXCEEDED',
  MISSING_HEADER: 'MISSING_HEADER',
  NO_DEFAULT_CONTAINER: 'NO_DEFAULT_CONTAINER',
  GROUP_MISMATCH: 'GROUP_MISMATCH',
} as const;

export type ImportErrorCode = (typeof IMPORT_ERROR)[keyof typeof IMPORT_ERROR];

/** Columnas añadidas al CSV de errores descargable. */
export const ERROR_OUTPUT_COLUMNS = ['fila', 'estado', 'errores'];

/** Límite de filas de la UI (configurable por env). El script no lo usa. */
export const UI_MAX_ROWS = Number(process.env.HARVEST_IMPORT_UI_MAX_ROWS ?? 10000);

/** Tolerancia (gramos) al reconciliar bruto − tara×cantidad ≈ neto. */
export const WEIGHT_TOLERANCE_GRAMS = Number(
  process.env.HARVEST_IMPORT_WEIGHT_TOLERANCE_GRAMS ?? 50,
);

/** Fecha mínima aceptada (configurable). Evita fechas absurdas. */
export const MIN_HARVEST_DATE = process.env.HARVEST_IMPORT_MIN_DATE ?? '2000-01-01';
