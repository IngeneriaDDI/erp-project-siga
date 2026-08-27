/**
 * Formatea el número de documento (función pura, testeable).
 *   REM-000123        (sin año)
 *   REM-2026-000123   (con año)
 */
export function formatDocumentNumber(
  prefix: string,
  num: number,
  paddingLength: number,
  year?: number | null,
): string {
  const padded = String(num).padStart(paddingLength, '0');
  return year ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
}

/** Prefijo por defecto según el tipo de documento. */
export function defaultPrefix(documentType: 'REMISSION' | 'PRODUCTION_ORDER'): string {
  return documentType === 'REMISSION' ? 'REM' : 'OP';
}
