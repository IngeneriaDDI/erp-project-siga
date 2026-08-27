// ==========================================================================
// Conversión de peso — ÚNICA fuente de verdad de la app.
//
// Regla arquitectónica:
//   - Valor interno/canónico (API, estado, cálculos): SIEMPRE gramos (entero).
//   - Valor de presentación/entrada: g o kg según la empresa (tenant).
//   - 1 kg = 1000 g.
//
// Nunca escribas `/ 1000` o `* 1000` sueltos en los componentes: usa esto.
// ==========================================================================

export type WeightUnit = 'GRAMS' | 'KILOGRAMS';

/** Etiqueta corta de la unidad ("g" | "kg"). */
export function weightUnitLabel(unit: WeightUnit): string {
  return unit === 'KILOGRAMS' ? 'kg' : 'g';
}

/** Gramos (interno) → número en la unidad de presentación. */
export function gramsToDisplay(grams: number, unit: WeightUnit): number {
  return unit === 'KILOGRAMS' ? grams / 1000 : grams;
}

/**
 * Valor de presentación → gramos (interno, entero).
 * Redondea de forma segura para evitar errores de coma flotante
 * (p. ej. 1.275 kg → 1275 g, no 1274.9999).
 */
export function displayToGrams(displayValue: number, unit: WeightUnit): number {
  if (!Number.isFinite(displayValue)) return 0;
  return unit === 'KILOGRAMS'
    ? Math.round(displayValue * 1000)
    : Math.round(displayValue);
}

/** Formatea gramos para mostrar, con separador de miles y etiqueta de unidad. */
export function formatWeight(grams: number, unit: WeightUnit): string {
  const value = gramsToDisplay(grams, unit);
  const formatted =
    unit === 'KILOGRAMS'
      ? value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
      : value.toLocaleString('es-CO');
  return `${formatted} ${weightUnitLabel(unit)}`;
}

/** Valor numérico (sin etiqueta) para prellenar inputs en la unidad de presentación. */
export function gramsToInputValue(grams: number, unit: WeightUnit): number {
  return gramsToDisplay(grams, unit);
}

/** step recomendado para <input type="number"> según la unidad. */
export function weightInputStep(unit: WeightUnit): string {
  return unit === 'KILOGRAMS' ? '0.001' : '1';
}
