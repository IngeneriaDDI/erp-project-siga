import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { normalizeRef, parseCsv } from '../harvest-import/csv.util';
import { MASTER_ERROR, MASTERS_MAX_ROWS, MasterErrorCode } from '../masters-import/masters-import.constants';
import { parseKgToGrams, totalGrams } from './goal-units.util';

export const GOALS_TEMPLATE = ['finca', 'lote', 'año', 'mes', 'meta_kg_planta'];

interface RowError {
  row: number;
  column?: string;
  code: MasterErrorCode;
  message: string;
  value?: string;
}

export interface GoalsImportReport {
  totalRows: number;
  /** Combinaciones lote+año nuevas que se crearán. */
  valid: number;
  /** Combinaciones lote+año que ya existen (se omiten, no se sobrescriben). */
  skipped: number;
  created: number;
  updated: number;
  errorRows: number;
  errors: RowError[];
  errorSummary: { code: MasterErrorCode; count: number; sampleValues: string[] }[];
  /** Valores con más de 3 decimales en gramos que fueron redondeados. */
  roundedValues: number;
}

interface Pending {
  lotId: string;
  plants: number;
  year: number;
  label: string;
  months: Map<number, { grams: Prisma.Decimal; line: number }>;
}

// Encabezados aceptados (tras normalizar tildes/mayúsculas); extras como estado_productivo se ignoran.
const HEADER_ALIASES: Record<string, string> = {
  finca: 'finca',
  lote: 'lote',
  ano: 'year',
  year: 'year',
  mes: 'month',
  month: 'month',
  meta_kg_planta: 'kg',
  'meta kg planta': 'kg',
};

@Injectable()
export class GoalsImportService {
  constructor(private readonly prisma: PrismaService) {}

  validate(tenantId: string | null, csv: string) {
    return this.run(tenantId, csv).then((r) => r.report);
  }

  /** Todo-o-nada: si hay un solo error no se escribe nada. */
  async commit(tenantId: string | null, userId: string | null, csv: string) {
    const tid = requireTenant(tenantId);
    const { report, toCreate } = await this.run(tid, csv, userId);
    if (report.errorRows > 0 || toCreate.length === 0) return report;
    // Un único INSERT: atómico por sí mismo.
    await this.prisma.lotProductionGoal.createMany({ data: toCreate, skipDuplicates: true });
    report.created = report.valid;
    return report;
  }

  templateCsv(): string {
    return GOALS_TEMPLATE.join(',');
  }

  private async run(
    tenantId: string | null,
    csv: string,
    userId: string | null = null,
  ): Promise<{ report: GoalsImportReport; toCreate: Prisma.LotProductionGoalCreateManyInput[] }> {
    const tid = requireTenant(tenantId);
    const table = parseCsv(csv);
    const errors: RowError[] = [];

    const mk = (rows: number, rounded = 0, valid = 0, skipped = 0): GoalsImportReport => ({
      totalRows: rows,
      valid,
      skipped,
      created: 0,
      updated: 0,
      errorRows: errors.length,
      errors,
      errorSummary: this.summarize(errors),
      roundedValues: rounded,
    });

    if (table.length === 0) {
      errors.push({ row: 0, code: MASTER_ERROR.MISSING_HEADER, message: 'Archivo vacío' });
      return { report: mk(0), toCreate: [] };
    }

    // Mapea encabezados → campos internos.
    const colIdx: Record<string, number> = {};
    table[0].forEach((h, i) => {
      const key = HEADER_ALIASES[normalizeRef(h).replace(/\s+/g, '_')] ?? HEADER_ALIASES[normalizeRef(h)];
      if (key && colIdx[key] === undefined) colIdx[key] = i;
    });
    const missing = ['finca', 'lote', 'year', 'month', 'kg'].filter((k) => colIdx[k] === undefined);
    const rowsCount = table.length - 1;
    if (missing.length > 0) {
      errors.push({
        row: 0,
        code: MASTER_ERROR.MISSING_HEADER,
        message: `Faltan encabezados. Se esperan: ${GOALS_TEMPLATE.join(', ')}`,
      });
      return { report: mk(rowsCount), toCreate: [] };
    }
    if (rowsCount > MASTERS_MAX_ROWS) {
      throw new BadRequestException(`El archivo supera el límite de ${MASTERS_MAX_ROWS} filas.`);
    }

    // Catálogos de la empresa (siempre filtrados por tenant).
    const farms = await this.prisma.farm.findMany({
      where: { tenantId: tid },
      select: { id: true, nombre: true },
    });
    const farmByName = new Map<string, string[]>();
    for (const f of farms) {
      const k = normalizeRef(f.nombre);
      farmByName.set(k, [...(farmByName.get(k) ?? []), f.id]);
    }
    const lots = await this.prisma.lot.findMany({
      where: { tenantId: tid },
      select: { id: true, farmId: true, nombreLote: true, status: true, numeroPlantas: true },
    });
    const lotByKey = new Map(
      lots.map((l) => [`${l.farmId} ${normalizeRef(l.nombreLote)}` as string, l] as const),
    );

    const existingPairs = new Set(
      (
        await this.prisma.lotProductionGoal.groupBy({
          by: ['lotId', 'year'],
          where: { tenantId: tid },
        })
      ).map((p) => `${p.lotId} ${p.year}`),
    );

    const pending = new Map<string, Pending>();
    const get = (r: string[], k: string) => (r[colIdx[k]] ?? '').trim();
    let rounded = 0;

    for (let i = 1; i < table.length; i++) {
      const r = table[i];
      if (r.every((c) => (c ?? '').trim() === '')) continue; // fila vacía
      const before = errors.length;
      const push = (code: MasterErrorCode, message: string, column?: string, value?: string) =>
        errors.push({ row: i, code, message, column, value });

      const fincaRaw = get(r, 'finca');
      const loteRaw = get(r, 'lote');
      const yearRaw = get(r, 'year');
      const monthRaw = get(r, 'month');
      const kgRaw = get(r, 'kg');

      if (!fincaRaw || !loteRaw || !yearRaw || !monthRaw || kgRaw === '') {
        push(MASTER_ERROR.MISSING_REQUIRED, 'Faltan datos obligatorios en la fila');
        continue;
      }

      const farmIds = farmByName.get(normalizeRef(fincaRaw));
      if (!farmIds) push(MASTER_ERROR.REF_NOT_FOUND, 'Finca no encontrada', 'finca', fincaRaw);
      else if (farmIds.length > 1) push(MASTER_ERROR.REF_AMBIGUOUS, 'Finca ambigua', 'finca', fincaRaw);

      const lot = farmIds?.length === 1 ? lotByKey.get(`${farmIds[0]} ${normalizeRef(loteRaw)}`) : undefined;
      if (farmIds?.length === 1 && !lot) push(MASTER_ERROR.REF_NOT_FOUND, 'Lote no encontrado en esa finca', 'lote', loteRaw);
      else if (lot && (lot.status !== 'ACTIVE' || !lot.numeroPlantas || lot.numeroPlantas <= 0)) {
        push(MASTER_ERROR.LOT_NOT_ELIGIBLE, 'El lote debe estar activo y tener número de plantas', 'lote', loteRaw);
      }

      const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : NaN;
      if (Number.isNaN(year) || year < 2000 || year > 2100) {
        push(MASTER_ERROR.INVALID_RANGE, 'Año inválido (AAAA entre 2000 y 2100)', 'año', yearRaw);
      }
      const month = /^\d{1,2}$/.test(monthRaw) ? Number(monthRaw) : NaN;
      if (Number.isNaN(month) || month < 1 || month > 12) {
        push(MASTER_ERROR.INVALID_RANGE, 'Mes inválido (1 a 12)', 'mes', monthRaw);
      }

      const kg = parseKgToGrams(kgRaw);
      if (!kg.grams) push(MASTER_ERROR.INVALID_NUMBER, 'meta_kg_planta inválida (número ≥ 0, máx. 6 decimales)', 'meta_kg_planta', kgRaw);

      if (errors.length > before || !lot || !kg.grams) continue;

      const key = `${lot.id} ${year}`;
      const entry: Pending = pending.get(key) ?? {
        lotId: lot.id,
        plants: lot.numeroPlantas as number,
        year,
        label: `${fincaRaw} / ${loteRaw} / ${year}`,
        months: new Map(),
      };
      if (entry.months.has(month)) {
        push(MASTER_ERROR.DUPLICATE_IN_FILE, 'Lote + año + mes repetido en el archivo', 'mes', monthRaw);
        continue;
      }
      if (kg.rounded) rounded++;
      entry.months.set(month, { grams: kg.grams, line: i });
      pending.set(key, entry);
    }

    // Cada lote+año debe traer los 12 meses; los que ya existen se omiten.
    const toCreate: Prisma.LotProductionGoalCreateManyInput[] = [];
    let skipped = 0;
    let valid = 0;
    for (const [key, p] of pending) {
      if (p.months.size !== 12) {
        // (el valor mostrado es finca / lote / año)
        const firstLine = Math.min(...[...p.months.values()].map((m) => m.line));
        const have = [...p.months.keys()].sort((a, b) => a - b).join(',');
        push2(errors, firstLine, `Lote+año incompleto: tiene los meses ${have}; se requieren los 12`, p.label);
        continue;
      }
      if (existingPairs.has(key)) {
        skipped++;
        continue;
      }
      valid++;
      for (const [month, m] of p.months) {
        toCreate.push({
          tenantId: tid,
          lotId: p.lotId,
          year: p.year,
          month,
          metaGramosPlanta: m.grams,
          plantasSnapshot: p.plants,
          metaGramosTotal: totalGrams(p.plants, m.grams),
          createdBy: userId,
        });
      }
    }

    return { report: mk(rowsCount, rounded, valid, skipped), toCreate };
  }

  private summarize(errors: RowError[]) {
    const by = new Map<string, { count: number; values: Set<string> }>();
    for (const e of errors) {
      const cur = by.get(e.code) ?? { count: 0, values: new Set<string>() };
      cur.count++;
      if (e.value) cur.values.add(e.value);
      by.set(e.code, cur);
    }
    return [...by.entries()].map(([code, v]) => ({
      code: code as MasterErrorCode,
      count: v.count,
      sampleValues: [...v.values].slice(0, 25),
    }));
  }
}

function push2(errors: RowError[], row: number, message: string, value: string) {
  errors.push({ row, code: MASTER_ERROR.INCOMPLETE_YEAR, message, column: 'mes', value });
}
