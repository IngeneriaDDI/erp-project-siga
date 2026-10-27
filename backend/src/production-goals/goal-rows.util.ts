import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseKgToGrams, totalGrams } from './goal-units.util';

export interface MonthInput {
  month: number;
  kgPerPlant: string | number;
}

export interface GoalRowData {
  month: number;
  metaGramosPlanta: Prisma.Decimal;
  plantasSnapshot: number;
  metaGramosTotal: Prisma.Decimal;
}

/**
 * Valida los 12 meses (todos obligatorios, 0 permitido, sin repetidos) y
 * construye las filas a guardar. Pura: no toca la base de datos.
 */
export function buildGoalRows(
  plants: number,
  months: MonthInput[],
): { rows: GoalRowData[]; roundedCount: number } {
  const seen = new Set<number>();
  const rows: GoalRowData[] = [];
  let roundedCount = 0;

  for (const m of months) {
    if (!Number.isInteger(m.month) || m.month < 1 || m.month > 12) {
      throw new BadRequestException(`Mes inválido: ${m.month}`);
    }
    if (seen.has(m.month)) {
      throw new BadRequestException(`El mes ${m.month} está repetido`);
    }
    seen.add(m.month);

    const parsed = parseKgToGrams(m.kgPerPlant);
    if (!parsed.grams) {
      throw new BadRequestException(
        `Mes ${m.month}: valor de kg/planta inválido (número ≥ 0, máx. 6 decimales)`,
      );
    }
    if (parsed.rounded) roundedCount++;
    rows.push({
      month: m.month,
      metaGramosPlanta: parsed.grams,
      plantasSnapshot: plants,
      metaGramosTotal: totalGrams(plants, parsed.grams),
    });
  }

  if (seen.size !== 12) {
    throw new BadRequestException('Deben registrarse los 12 meses del año (0 es un valor permitido)');
  }
  rows.sort((a, b) => a.month - b.month);
  return { rows, roundedCount };
}

/** Totales anuales a partir de las filas. */
export function sumGoalRows(rows: { metaGramosPlanta: Prisma.Decimal; metaGramosTotal: Prisma.Decimal }[]) {
  let perPlant = new Prisma.Decimal(0);
  let lot = new Prisma.Decimal(0);
  for (const r of rows) {
    perPlant = perPlant.plus(r.metaGramosPlanta);
    lot = lot.plus(r.metaGramosTotal);
  }
  return { gramosPlanta: perPlant, gramosLote: lot };
}
