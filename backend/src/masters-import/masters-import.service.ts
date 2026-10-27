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
  /** Lotes existentes a los que se completan variedad/grupo/fecha de siembra. */
  updated: number;
  errorRows: number;
  errors: RowError[];
  errorSummary: ErrorSummaryItem[];
}

interface ParsedRow {
  line: number;
  data: Record<string, string>;
}

interface CatalogItem {
  id: string;
  nombre: string;
}

const W = WORKER_COLUMNS;
const L = LOT_COLUMNS;

/** Fecha `AAAA-MM-DD` o `DD/MM/AAAA` (short date de Excel-ES). */
function parseSiembraDate(raw: string): Date | null {
  const s = raw.trim();
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = s;
  } else {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return d;
}

function catalogMap(items: CatalogItem[]): Map<string, CatalogItem[]> {
  const map = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const key = normalizeRef(it.nombre);
    const arr = map.get(key);
    if (arr) arr.push(it);
    else map.set(key, [it]);
  }
  return map;
}

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
        updated: 0,
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
    const { report, toCreate, toUpdate } = await this.runLots(tid, csv);
    if (report.errorRows > 0) return report; // todo-o-nada
    if (toCreate.length > 0) {
      const res = await this.prisma.lot.createMany({ data: toCreate, skipDuplicates: true });
      report.created = res.count;
    }
    if (toUpdate.length > 0) {
      // Solo completa campos (variedad/grupo/fecha) de lotes que ya existen.
      await this.prisma.$transaction(
        toUpdate.map((u) =>
          this.prisma.lot.updateMany({ where: { id: u.id, tenantId: tid }, data: u.data }),
        ),
      );
    }
    return report;
  }

  private async runLots(
    tenantId: string | null,
    csv: string,
  ): Promise<{
    report: MasterReport;
    toCreate: Prisma.LotCreateManyInput[];
    toUpdate: { id: string; data: Prisma.LotUncheckedUpdateManyInput }[];
  }> {
    const tid = requireTenant(tenantId);
    const { rows, missing } = this.parse(csv, LOT_REQUIRED);
    if (missing.length > 0) {
      return {
        report: this.emptyReport(rows.length, [
          { row: 0, code: MASTER_ERROR.MISSING_HEADER, message: `Faltan encabezados: ${missing.join(', ')}` },
        ]),
        toCreate: [],
        toUpdate: [],
      };
    }
    if (rows.length > MASTERS_MAX_ROWS) {
      throw new BadRequestException(`El archivo supera el límite de ${MASTERS_MAX_ROWS} filas.`);
    }

    const farms = await this.farmMap(tid);
    const varieties = catalogMap(
      await this.prisma.variety.findMany({
        where: { tenantId: tid },
        select: { id: true, nombre: true },
      }),
    );
    const groups = catalogMap(
      await this.prisma.productiveGroup.findMany({
        where: { tenantId: tid },
        select: { id: true, nombre: true },
      }),
    );
    const existing = new Map(
      (
        await this.prisma.lot.findMany({
          where: { tenantId: tid },
          select: {
            id: true,
            farmId: true,
            nombreLote: true,
            varietyId: true,
            productiveGroupId: true,
            fechaSiembra: true,
          },
        })
      ).map((l) => [`${l.farmId} ${normalizeRef(l.nombreLote)}` as string, l] as const),
    );

    const errors: RowError[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    const toCreate: Prisma.LotCreateManyInput[] = [];
    const toUpdate: { id: string; data: Prisma.LotUncheckedUpdateManyInput }[] = [];

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

      // Variedad: debe existir en el catálogo (no se aceptan textos libres).
      const varRaw = r.data[L.variedad];
      const varMatches = varieties.get(normalizeRef(varRaw));
      if (!varMatches) push(MASTER_ERROR.REF_NOT_FOUND, 'La variedad no existe en el catálogo (créala primero)', L.variedad, varRaw);
      else if (varMatches.length > 1) push(MASTER_ERROR.REF_AMBIGUOUS, 'Variedad ambigua en el catálogo', L.variedad, varRaw);
      const variety = varMatches?.length === 1 ? varMatches[0] : undefined;

      // Grupo productivo (opcional): si viene, debe existir en el catálogo.
      let group: CatalogItem | undefined;
      const grpRaw = (r.data[L.grupoProductivo] ?? '').trim();
      if (grpRaw !== '') {
        const gm = groups.get(normalizeRef(grpRaw));
        if (!gm) push(MASTER_ERROR.REF_NOT_FOUND, 'El grupo productivo no existe en el catálogo (créalo primero)', L.grupoProductivo, grpRaw);
        else if (gm.length > 1) push(MASTER_ERROR.REF_AMBIGUOUS, 'Grupo productivo ambiguo', L.grupoProductivo, grpRaw);
        else group = gm[0];
      }

      // Fecha de siembra (opcional).
      let fechaSiembra: Date | undefined;
      const fechaRaw = (r.data[L.fechaSiembra] ?? '').trim();
      if (fechaRaw !== '') {
        const d = parseSiembraDate(fechaRaw);
        if (!d) push(MASTER_ERROR.INVALID_DATE, 'Fecha de siembra inválida (AAAA-MM-DD o DD/MM/AAAA)', L.fechaSiembra, fechaRaw);
        else fechaSiembra = d;
      }

      const codigo = (r.data[L.codigo] ?? '').trim();
      const dupKey = `${farm.id ?? '?'} ${normalizeRef(codigo)}`;
      if (farm.id && seen.has(dupKey)) push(MASTER_ERROR.DUPLICATE_IN_FILE, `Lote repetido en el archivo (misma finca)`, L.codigo, codigo);

      if (rowErr.length) {
        errors.push(...rowErr);
        continue;
      }
      seen.add(dupKey);

      const cur = existing.get(dupKey);
      if (cur) {
        // Lote existente: solo se COMPLETAN variedad/grupo/fecha cuando cambian.
        const patch: Prisma.LotUncheckedUpdateManyInput = {};
        if (variety && cur.varietyId !== variety.id) {
          patch.varietyId = variety.id;
          patch.variedad = variety.nombre;
        }
        if (group && cur.productiveGroupId !== group.id) patch.productiveGroupId = group.id;
        if (
          fechaSiembra &&
          (!cur.fechaSiembra ||
            cur.fechaSiembra.toISOString().slice(0, 10) !== fechaSiembra.toISOString().slice(0, 10))
        ) {
          patch.fechaSiembra = fechaSiembra;
        }
        if (Object.keys(patch).length > 0) toUpdate.push({ id: cur.id, data: patch });
        else skipped++; // idempotente: ya está igual
        continue;
      }

      toCreate.push({
        tenantId: tid,
        farmId: farm.id as string,
        nombreLote: codigo,
        variedad: (variety as CatalogItem).nombre,
        varietyId: (variety as CatalogItem).id,
        productiveGroupId: group?.id,
        fechaSiembra,
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
        updated: toUpdate.length,
        errorRows: errors.length,
        errors,
        errorSummary: this.summarize(errors),
      },
      toCreate,
      toUpdate,
    };
  }

  private emptyReport(totalRows: number, errors: RowError[]): MasterReport {
    return {
      totalRows,
      valid: 0,
      skipped: 0,
      created: 0,
      updated: 0,
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
