import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { parseCsv, normalizeRef } from '../harvest-import/csv.util';
import {
  LOT_COLUMNS,
  LOT_REQUIRED,
  MASTER_ERROR,
  MASTERS_MAX_ROWS,
  MasterErrorCode,
  WORKER_COLUMNS,
  WORKER_REQUIRED,
} from './masters-import.constants';

interface RowError {
  row: number;
  column?: string;
  code: MasterErrorCode;
  message: string;
  value?: string;
}
interface ErrorSummaryItem {
  code: MasterErrorCode;
  count: number;
  sampleValues: string[];
}
export interface MasterReport {
  totalRows: number;
  valid: number;
  skipped: number;
  created: number;
  errorRows: number;
  errors: RowError[];
  errorSummary: ErrorSummaryItem[];
}

interface ParsedRow {
  line: number;
  data: Record<string, string>;
}

const W = WORKER_COLUMNS;
const L = LOT_COLUMNS;

@Injectable()
export class MastersImportService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Utilidades ----
  private parse(csv: string, required: string[]): { rows: ParsedRow[]; missing: string[] } {
    const table = parseCsv(csv);
    if (table.length === 0) return { rows: [], missing: required };
    const headers = table[0].map((h) => h.trim());
    const missing = required.filter((c) => !headers.includes(c));
    const rows: ParsedRow[] = [];
    for (let i = 1; i < table.length; i++) {
      const data: Record<string, string> = {};
      headers.forEach((h, idx) => (data[h] = table[i][idx] ?? ''));
      rows.push({ line: i, data });
    }
    return { rows, missing };
  }

  private parseEstado(raw: string): Status | 'INVALID' {
    const s = normalizeRef(raw);
    if (s === '') return Status.ACTIVE;
    if (['activo', 'active', 'a'].includes(s)) return Status.ACTIVE;
    if (['inactivo', 'inactive', 'i', 'historico'].includes(s)) return Status.INACTIVE;
    return 'INVALID';
  }

  private async farmMap(tenantId: string): Promise<Map<string, { id: string; status: Status }[]>> {
    const farms = await this.prisma.farm.findMany({
      where: { tenantId },
      select: { id: true, nombre: true, status: true },
    });
    const map = new Map<string, { id: string; status: Status }[]>();
    for (const f of farms) {
      const key = normalizeRef(f.nombre);
      const arr = map.get(key);
      if (arr) arr.push({ id: f.id, status: f.status });
      else map.set(key, [{ id: f.id, status: f.status }]);
    }
    return map;
  }

  private summarize(errors: RowError[]): ErrorSummaryItem[] {
    const byCode = new Map<string, { count: number; values: Set<string> }>();
    for (const e of errors) {
      const cur = byCode.get(e.code) ?? { count: 0, values: new Set<string>() };
      cur.count++;
      if (e.value) cur.values.add(e.value);
      byCode.set(e.code, cur);
    }
    return [...byCode.entries()].map(([code, v]) => ({
      code: code as MasterErrorCode,
      count: v.count,
      sampleValues: [...v.values].slice(0, 25),
    }));
  }

  private resolveFarm(
    map: Map<string, { id: string; status: Status }[]>,
    raw: string,
  ): { id?: string; ambiguous?: boolean } {
    const matches = map.get(normalizeRef(raw));
    if (!matches || matches.length === 0) return {};
    if (matches.length > 1) return { ambiguous: true };
    return { id: matches[0].id };
  }

  // ---- Trabajadores ----
  async validateWorkers(tenantId: string | null, csv: string): Promise<MasterReport> {
    const { report } = await this.runWorkers(tenantId, csv);
    return report;
  }

  async importWorkers(tenantId: string | null, csv: string): Promise<MasterReport> {
    const tid = requireTenant(tenantId);
    const { report, toCreate } = await this.runWorkers(tid, csv);
    if (report.errorRows > 0) return report; // todo-o-nada
    if (toCreate.length > 0) {
      const res = await this.prisma.worker.createMany({ data: toCreate, skipDuplicates: true });
      report.created = res.count;
    }
    return report;
  }

  private async runWorkers(
    tenantId: string | null,
    csv: string,
  ): Promise<{ report: MasterReport; toCreate: Prisma.WorkerCreateManyInput[] }> {
    const tid = requireTenant(tenantId);
    const { rows, missing } = this.parse(csv, WORKER_REQUIRED);
    if (missing.length > 0) {
      return {
        report: this.emptyReport(rows.length, [
          { row: 0, code: MASTER_ERROR.MISSING_HEADER, message: `Faltan encabezados: ${missing.join(', ')}` },
        ]),
        toCreate: [],
      };
    }
    if (rows.length > MASTERS_MAX_ROWS) {
      throw new BadRequestException(`El archivo supera el límite de ${MASTERS_MAX_ROWS} filas.`);
    }

    const farms = await this.farmMap(tid);
    const existing = new Set(
      (await this.prisma.worker.findMany({ where: { tenantId: tid }, select: { codigoInterno: true } })).map(
        (w) => normalizeRef(w.codigoInterno),
      ),
    );

    const errors: RowError[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    const toCreate: Prisma.WorkerCreateManyInput[] = [];

    for (const r of rows) {
      const rowErr: RowError[] = [];
      const push = (code: MasterErrorCode, message: string, column?: string, value?: string) =>
        rowErr.push({ row: r.line, code, message, column, value });

      const missingReq = WORKER_REQUIRED.filter((c) => (r.data[c] ?? '').trim() === '');
      if (missingReq.length) {
        push(MASTER_ERROR.MISSING_REQUIRED, `Faltan: ${missingReq.join(', ')}`, missingReq.join(', '));
        errors.push(...rowErr);
        continue;
      }

      const farm = this.resolveFarm(farms, r.data[W.finca]);
      if (farm.ambiguous) push(MASTER_ERROR.REF_AMBIGUOUS, 'Finca ambigua', W.finca, r.data[W.finca]);
      else if (!farm.id) push(MASTER_ERROR.REF_NOT_FOUND, 'Finca no encontrada', W.finca, r.data[W.finca]);

      const estado = this.parseEstado(r.data[W.estado]);
      if (estado === 'INVALID') push(MASTER_ERROR.INVALID_STATUS, 'Estado inválido (usa activo/inactivo)', W.estado, r.data[W.estado]);

      const codigo = (r.data[W.codigo] ?? '').trim();
      const codeKey = normalizeRef(codigo);
      if (seen.has(codeKey)) push(MASTER_ERROR.DUPLICATE_IN_FILE, `Código repetido en el archivo`, W.codigo, codigo);

      if (rowErr.length) {
        errors.push(...rowErr);
        continue;
      }
      seen.add(codeKey);

      if (existing.has(codeKey)) {
        skipped++; // idempotente: ya existe, se omite
        continue;
      }

      toCreate.push({
        tenantId: tid,
        farmId: farm.id as string,
        codigoInterno: codigo,
        nombre: r.data[W.nombre].trim(),
        documento: (r.data[W.documento] ?? '').trim() || undefined,
        areaTrabajo: (r.data[W.areaTrabajo] ?? '').trim() || undefined,
        status: estado as Status,
      });
    }

    return {
      report: {
        totalRows: rows.length,
        valid: toCreate.length,
        skipped,
        created: 0,
        errorRows: errors.length,
        errors,
        errorSummary: this.summarize(errors),
      },
      toCreate,
    };
  }

  // ---- Lotes ----
  async validateLots(tenantId: string | null, csv: string): Promise<MasterReport> {
    const { report } = await this.runLots(tenantId, csv);
    return report;
  }

  async importLots(tenantId: string | null, csv: string): Promise<MasterReport> {
    const tid = requireTenant(tenantId);
    const { report, toCreate } = await this.runLots(tid, csv);
    if (report.errorRows > 0) return report;
    if (toCreate.length > 0) {
      const res = await this.prisma.lot.createMany({ data: toCreate, skipDuplicates: true });
      report.created = res.count;
    }
    return report;
  }

  private async runLots(
    tenantId: string | null,
    csv: string,
  ): Promise<{ report: MasterReport; toCreate: Prisma.LotCreateManyInput[] }> {
    const tid = requireTenant(tenantId);
    const { rows, missing } = this.parse(csv, LOT_REQUIRED);
    if (missing.length > 0) {
      return {
        report: this.emptyReport(rows.length, [
          { row: 0, code: MASTER_ERROR.MISSING_HEADER, message: `Faltan encabezados: ${missing.join(', ')}` },
        ]),
        toCreate: [],
      };
    }
    if (rows.length > MASTERS_MAX_ROWS) {
      throw new BadRequestException(`El archivo supera el límite de ${MASTERS_MAX_ROWS} filas.`);
    }

    const farms = await this.farmMap(tid);
    const existing = new Set(
      (await this.prisma.lot.findMany({ where: { tenantId: tid }, select: { farmId: true, nombreLote: true } })).map(
        (l) => `${l.farmId} ${normalizeRef(l.nombreLote)}`,
      ),
    );

    const errors: RowError[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    const toCreate: Prisma.LotCreateManyInput[] = [];

    for (const r of rows) {
      const rowErr: RowError[] = [];
      const push = (code: MasterErrorCode, message: string, column?: string, value?: string) =>
        rowErr.push({ row: r.line, code, message, column, value });

      const missingReq = LOT_REQUIRED.filter((c) => (r.data[c] ?? '').trim() === '');
      if (missingReq.length) {
        push(MASTER_ERROR.MISSING_REQUIRED, `Faltan: ${missingReq.join(', ')}`, missingReq.join(', '));
        errors.push(...rowErr);
        continue;
      }

      const farm = this.resolveFarm(farms, r.data[L.finca]);
      if (farm.ambiguous) push(MASTER_ERROR.REF_AMBIGUOUS, 'Finca ambigua', L.finca, r.data[L.finca]);
      else if (!farm.id) push(MASTER_ERROR.REF_NOT_FOUND, 'Finca no encontrada', L.finca, r.data[L.finca]);

      const estado = this.parseEstado(r.data[L.estado]);
      if (estado === 'INVALID') push(MASTER_ERROR.INVALID_STATUS, 'Estado inválido (usa activo/inactivo)', L.estado, r.data[L.estado]);

      let numeroPlantas: number | undefined;
      const npRaw = (r.data[L.numeroPlantas] ?? '').trim();
      if (npRaw !== '') {
        if (!/^\d+$/.test(npRaw)) push(MASTER_ERROR.INVALID_NUMBER, 'Número de plantas inválido', L.numeroPlantas, npRaw);
        else numeroPlantas = Number(npRaw);
      }

      const codigo = (r.data[L.codigo] ?? '').trim();
      const dupKey = `${farm.id ?? '?'} ${normalizeRef(codigo)}`;
      if (farm.id && seen.has(dupKey)) push(MASTER_ERROR.DUPLICATE_IN_FILE, `Lote repetido en el archivo (misma finca)`, L.codigo, codigo);

      if (rowErr.length) {
        errors.push(...rowErr);
        continue;
      }
      seen.add(dupKey);

      if (existing.has(dupKey)) {
        skipped++;
        continue;
      }

      toCreate.push({
        tenantId: tid,
        farmId: farm.id as string,
        nombreLote: codigo,
        variedad: r.data[L.variedad].trim(),
        numeroPlantas,
        status: estado as Status,
      });
    }

    return {
      report: {
        totalRows: rows.length,
        valid: toCreate.length,
        skipped,
        created: 0,
        errorRows: errors.length,
        errors,
        errorSummary: this.summarize(errors),
      },
      toCreate,
    };
  }

  private emptyReport(totalRows: number, errors: RowError[]): MasterReport {
    return {
      totalRows,
      valid: 0,
      skipped: 0,
      created: 0,
      errorRows: errors.length,
      errors,
      errorSummary: this.summarize(errors),
    };
  }

  // ---- Referencias / plantillas ----
  async farmsReferenceCsv(tenantId: string | null): Promise<string> {
    const tid = requireTenant(tenantId);
    const farms = await this.prisma.farm.findMany({
      where: { tenantId: tid },
      orderBy: { nombre: 'asc' },
      select: { nombre: true, status: true },
    });
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    return ['nombre,estado', ...farms.map((f) => `${esc(f.nombre)},${f.status}`)].join('\r\n');
  }
}
