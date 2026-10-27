import { Prisma } from '@prisma/client';

/**
 * Conversión kg ↔ g sin floats. El usuario captura kg/planta (máx. 6 decimales);
 * se guarda en gramos con 3 decimales (Decimal(12,3)), redondeo half-up.
 */

export interface KgParseResult {
  /** Gramos con 3 decimales (o null si el valor es inválido). */
  grams: Prisma.Decimal | null;
  /** true si el valor tenía más precisión que 3 decimales en gramos y se redondeó. */
  rounded: boolean;
}

// Se aceptan más de 6 decimales (p. ej. promedios del Excel): se redondean a 3 decimales en gramos.
const KG_RE = /^\d+([.,]\d{1,20})?$/;
const MAX_GRAMS = new Prisma.Decimal('999999999.999'); // Decimal(12,3)

export function parseKgToGrams(raw: string | number | null | undefined): KgParseResult {
  if (raw === null || raw === undefined) return { grams: null, rounded: false };
  const text = String(raw).trim();
  if (!KG_RE.test(text)) return { grams: null, rounded: false };
  const kg = new Prisma.Decimal(text.replace(',', '.'));
  const exact = kg.mul(1000);
  const grams = exact.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
  if (grams.gt(MAX_GRAMS)) return { grams: null, rounded: false };
  return { grams, rounded: !grams.eq(exact) };
}

/** Gramos → kg como string (para mostrar). */
export function gramsToKgString(grams: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(grams).div(1000).toFixed(6).replace(/\.?0+$/, '') || '0';
}

/** Total del lote en gramos = plantas × gramos por planta (3 decimales, half-up). */
export function totalGrams(plants: number, gramsPerPlant: Prisma.Decimal): Prisma.Decimal {
  return gramsPerPlant.mul(plants).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}
