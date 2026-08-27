import { defaultPrefix, formatDocumentNumber } from './document-number.util';

describe('formatDocumentNumber', () => {
  it('formatea con relleno de ceros y sin año', () => {
    expect(formatDocumentNumber('REM', 123, 6)).toBe('REM-000123');
    expect(formatDocumentNumber('OP', 45, 6)).toBe('OP-000045');
  });

  it('formatea con año', () => {
    expect(formatDocumentNumber('REM', 123, 6, 2026)).toBe('REM-2026-000123');
  });

  it('no recorta números más largos que el relleno', () => {
    expect(formatDocumentNumber('REM', 1234567, 6)).toBe('REM-1234567');
  });

  it('devuelve el prefijo por defecto por tipo', () => {
    expect(defaultPrefix('REMISSION')).toBe('REM');
    expect(defaultPrefix('PRODUCTION_ORDER')).toBe('OP');
  });
});
