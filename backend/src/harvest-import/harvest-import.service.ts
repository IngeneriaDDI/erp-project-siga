import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ImportSource, ImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { ReferenceDictionaryService } from './reference-dictionary.service';
import { parseCsv } from './csv.util';
import { REQUIRED_COLUMNS, TEMPLATE_COLUMNS, IMPORT_ERROR, UI_MAX_ROWS } from './harvest-import.constants';
import { validateRecords, RawRow } from './harvest-import.validator';
import {
  ErrorSummaryItem,
  RowError,
  ValidatedRecord,
  ValidateOptions,
} from './harvest-import.types';

export interface EngineResult {
  totalRows: number;
  totalRecords: number;
  toInsert: ValidatedRecord[];
  skippedHashes: string[];
  errors: RowError[];
  errorSummary: ErrorSummaryItem[];
}

export interface ValidationReport {
  totalRows: number;
  totalRecords: number;
  valid: number;
  skipped: number;
  errorRows: number;
  errors: RowError[];
  errorSummary: ErrorSummaryItem[];
}

const INSERT_CHUNK = 1000;

@Injectable()
export class HarvestImportService {
  private readonly logger = new Logger(HarvestImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionaries: ReferenceDictionaryService,
  ) {}

  // ---- Parseo + validación (motor compartido) ----

  /** Convierte el CSV crudo en filas mapeadas por encabezado. */
  private parseToRows(csvText: string): { rows: RawRow[]; missingHeaders: string[] } {
    const table = parseCsv(csvText);
    if (table.length === 0) return { rows: [], missingHeaders: REQUIRED_COLUMNS };
    const headers = table[0].map((h) => h.trim());
    const missingHeaders = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    const rows: RawRow[] = [];
    for (let i = 1; i < table.length; i++) {
      const cells = table[i];
      const data: Record<string, string> = {};
      headers.forEach((h, idx) => (data[h] = cells[idx] ?? ''));
      rows.push({ line: i, data }); // line 1 = primera fila de datos
    }
    return { rows, missingHeaders };
  }

  /** Ejecuta el motor completo: valida y resuelve, con dedupe contra la BD. */
  private async runEngine(
    tenantId: string,
    csvText: string,
    options: ValidateOptions,
  ): Promise<EngineResult> {
    const { rows, missingHeaders } = this.parseToRows(csvText);
    if (missingHeaders.length > 0) {
      const err: RowError = {
        row: 0,
        code: IMPORT_ERROR.MISSING_HEADER,
        message: `Faltan encabezados obligatorios: ${missingHeaders.join(', ')}`,
      };
      return {
        totalRows: rows.length,
        totalRecords: 0,
        toInsert: [],
        skippedHashes: [],
        errors: [err],
        errorSummary: [{ code: IMPORT_ERROR.MISSING_HEADER, count: 1, sampleValues: missingHeaders }],
      };
    }

    const dict = await this.dictionaries.build(tenantId, options.allowInactive);
    // Primera pasada: sin dedupe contra BD (se resuelve luego con los hashes).
    const result = validateRecords(rows, dict, options, new Set<string>(), new Date());

    // Dedupe contra la base (una sola consulta por lote de hashes).
    const hashes = result.validRecords.map((r) => r.rowHash);
    const existing = new Set<string>();
    if (hashes.length > 0) {
      const rowsExisting = await this.prisma.harvestRecord.findMany({
        where: { tenantId, rowHash: { in: hashes } },
        select: { rowHash: true },
      });
      for (const r of rowsExisting) if (r.rowHash) existing.add(r.rowHash);
    }

    const toInsert: ValidatedRecord[] = [];
    const skippedHashes = [...result.skippedHashes];
    const errors = [...result.errors];
    for (const rec of result.validRecords) {
      if (existing.has(rec.rowHash)) {
        if (options.duplicateMode === 'skip') skippedHashes.push(rec.rowHash);
        else
          errors.push({
            row: rec.rowNumbers[0],
            code: IMPORT_ERROR.DUPLICATE_EXISTING,
            message: 'El registro ya existe en la base (posible reimportación)',
            value: rec.externalId ?? undefined,
          });
      } else {
        toInsert.push(rec);
      }
    }

    return {
      totalRows: result.totalRows,
      totalRecords: result.totalRecords,
      toInsert,
      skippedHashes,
      errors,
      errorSummary: this.summarize(errors),
    };
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
      code: code as ErrorSummaryItem['code'],
      count: v.count,
      sampleValues: [...v.values].slice(0, 25),
    }));
  }

  // ---- API pública ----

  /** Dry-run: valida sin escribir. */
  async validate(
    tenantId: string | null,
    csvText: string,
    options: ValidateOptions,
    enforceUiLimit = true,
  ): Promise<ValidationReport> {
    const tid = requireTenant(tenantId);
    const { rows } = this.parseToRows(csvText);
    if (enforceUiLimit && rows.length > UI_MAX_ROWS) {
      throw new BadRequestException(
        `El archivo supera el límite de ${UI_MAX_ROWS} filas para la interfaz. Usa el script de carga histórica.`,
      );
    }
    const eng = await this.runEngine(tid, csvText, options);
    return {
      totalRows: eng.totalRows,
      totalRecords: eng.totalRecords,
      valid: eng.toInsert.length,
      skipped: eng.skippedHashes.length,
      errorRows: eng.errors.length,
      errors: eng.errors,
      errorSummary: eng.errorSummary,
    };
  }

  /** Crea un lote de importación abierto (PROCESSING). */
  async createBatch(
    tenantId: string | null,
    userId: string,
    source: ImportSource,
    fileName: string | null,
    allowInactive: boolean,
  ) {
    const tid = requireTenant(tenantId);
    return this.prisma.importBatch.create({
      data: {
        tenantId: tid,
        createdBy: userId,
        source,
        fileName,
        allowInactive,
        status: ImportStatus.PROCESSING,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Ingresa un bloque de filas a un lote existente. Todo-o-nada por bloque:
   * si hay errores (en modo 'error') no inserta nada del bloque.
   */
  async ingestChunk(
    tenantId: string | null,
    userId: string,
    batchId: string,
    csvText: string,
    options: ValidateOptions,
  ): Promise<{ inserted: number; skipped: number; errorRows: number; errors: RowError[]; errorSummary: ErrorSummaryItem[] }> {
    const tid = requireTenant(tenantId);
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, tenantId: tid } });
    if (!batch) throw new NotFoundException('Lote de importación no encontrado');

    const eng = await this.runEngine(tid, csvText, options);
    if (eng.errors.length > 0 && options.duplicateMode === 'error') {
      // No inserta nada del bloque; devuelve errores para corregir.
      return {
        inserted: 0,
        skipped: eng.skippedHashes.length,
        errorRows: eng.errors.length,
        errors: eng.errors,
        errorSummary: eng.errorSummary,
      };
    }

    await this.insertRecords(tid, userId, batchId, eng.toInsert);

    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        insertedRows: { increment: eng.toInsert.length },
        rejectedRows: { increment: eng.errors.length },
        totalRows: { increment: eng.totalRecords },
      },
    });

    return {
      inserted: eng.toInsert.length,
      skipped: eng.skippedHashes.length,
      errorRows: eng.errors.length,
      errors: eng.errors,
      errorSummary: eng.errorSummary,
    };
  }

  /** Inserción por lotes (bulk), sin instanciar el ORM registro por registro. */
  private async insertRecords(
    tenantId: string,
    userId: string,
    batchId: string,
    records: ValidatedRecord[],
  ) {
    for (let i = 0; i < records.length; i += INSERT_CHUNK) {
      const slice = records.slice(i, i + INSERT_CHUNK);
      const headerData: Prisma.HarvestRecordCreateManyInput[] = [];
      const containerData: Prisma.HarvestRecordContainerCreateManyInput[] = [];
      for (const rec of slice) {
        const id = randomUUID();
        headerData.push({
          id,
          tenantId,
          farmId: rec.farmId,
          fecha: rec.fecha,
          workerId: rec.workerId,
          qualityId: rec.qualityId,
          lotId: rec.lotId,
          variedad: rec.variedad,
          pesoBrutoGramos: rec.pesoBrutoGramos,
          pesoTotalRecipientesGramos: rec.pesoTotalRecipientesGramos,
          gramosCosechados: rec.gramosCosechados,
          primeraFila: rec.primeraFila,
          ultimaFila: rec.ultimaFila,
          estadoRoja: rec.estadoRoja,
          observaciones: rec.observaciones,
          createdBy: userId,
          importBatchId: batchId,
          rowHash: rec.rowHash,
        });
        for (const rc of rec.recipients) {
          containerData.push({
            harvestRecordId: id,
            containerId: rc.containerId,
            unidades: rc.unidades,
            pesoUnitarioGramos: rc.pesoUnitarioGramos,
            pesoTotalGramos: rc.pesoTotalGramos,
          });
        }
      }
      // Transacción por bloque: cabeceras + detalle, todo o nada.
      await this.prisma.$transaction([
        this.prisma.harvestRecord.createMany({ data: headerData }),
        this.prisma.harvestRecordContainer.createMany({ data: containerData }),
      ]);
    }
  }

  /** Cierra el lote con el estado final. */
  async closeBatch(tenantId: string | null, batchId: string, status: ImportStatus) {
    const tid = requireTenant(tenantId);
    return this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status, finishedAt: new Date() },
    });
  }

  async getBatch(tenantId: string | null, batchId: string) {
    const tid = requireTenant(tenantId);
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, tenantId: tid } });
    if (!batch) throw new NotFoundException('Lote de importación no encontrado');
    return batch;
  }

  /**
   * Commit de un archivo completo desde la UI: crea el lote y lo procesa en
   * segundo plano; devuelve el lote de inmediato para hacer polling.
   */
  async commitInBackground(
    tenantId: string | null,
    userId: string,
    csvText: string,
    options: ValidateOptions,
    fileName: string | null,
  ) {
    const tid = requireTenant(tenantId);
    const { rows } = this.parseToRows(csvText);
    if (rows.length > UI_MAX_ROWS) {
      throw new BadRequestException(
        `El archivo supera el límite de ${UI_MAX_ROWS} filas para la interfaz.`,
      );
    }
    const batch = await this.createBatch(tid, userId, ImportSource.UI, fileName, options.allowInactive);

    // Procesa sin bloquear la respuesta HTTP.
    void this.processInBackground(tid, userId, batch.id, csvText, options);
    return batch;
  }

  private async processInBackground(
    tenantId: string,
    userId: string,
    batchId: string,
    csvText: string,
    options: ValidateOptions,
  ) {
    try {
      const res = await this.ingestChunk(tenantId, userId, batchId, csvText, options);
      const status = res.errorRows > 0 ? ImportStatus.FAILED : ImportStatus.COMPLETED;
      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status,
          finishedAt: new Date(),
          errorSummary: res.errorSummary as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.logger.error(`Fallo procesando lote ${batchId}: ${(e as Error).message}`);
      await this.prisma.importBatch
        .update({ where: { id: batchId }, data: { status: ImportStatus.FAILED, finishedAt: new Date() } })
        .catch(() => undefined);
    }
  }

  /** Revierte un lote: borra sus registros si no están referenciados por documentos. */
  async revert(tenantId: string | null, batchId: string) {
    const tid = requireTenant(tenantId);
    const batch = await this.getBatch(tid, batchId);
    if (batch.status === ImportStatus.REVERTED) {
      throw new ConflictException('El lote ya fue revertido');
    }

    const recordIds = (
      await this.prisma.harvestRecord.findMany({
        where: { tenantId: tid, importBatchId: batchId },
        select: { id: true },
      })
    ).map((r) => r.id);

    if (recordIds.length > 0) {
      // Bloquea si algún registro ya alimentó una remisión u orden.
      const usedInRemission = await this.prisma.harvestRemissionSource.count({
        where: { harvestRecordId: { in: recordIds } },
      });
      const usedInOrder = await this.prisma.productionOrderSource.count({
        where: { harvestRecordId: { in: recordIds } },
      });
      if (usedInRemission > 0 || usedInOrder > 0) {
        throw new ConflictException(
          'No se puede revertir: algunos registros del lote ya forman parte de remisiones u órdenes.',
        );
      }
      // Borra detalle + cabecera en bloques.
      await this.prisma.$transaction([
        this.prisma.harvestRecordContainer.deleteMany({
          where: { harvestRecordId: { in: recordIds } },
        }),
        this.prisma.harvestRecord.deleteMany({ where: { id: { in: recordIds } } }),
      ]);
    }

    return this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status: ImportStatus.REVERTED, finishedAt: new Date() },
    });
  }

  // ---- Exportación ----

  templateCsv(): string {
    return TEMPLATE_COLUMNS.join(',');
  }
}
