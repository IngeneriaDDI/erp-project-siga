import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { HarvestRemission, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth.types';
import { requireTenant } from '../common/tenant/tenant.util';
import { DocumentSequenceService } from '../documents/document-sequence.service';
import { DocumentEventService } from '../documents/document-event.service';
import {
  aggregateHarvestRecords,
  HarvestAggregationService,
  ValidHarvestRecord,
} from '../documents/harvest-aggregation.service';
import { compressRecordNumbers } from '../documents/record-ranges.util';
import {
  buildActorView,
  EffectiveActor,
  OperationalIdentityService,
} from '../operational/operational-identity.service';
import {
  CreateRemissionDto,
  ListRemissionsQueryDto,
  RemissionPreviewQueryDto,
} from './dto/harvest-remission.dto';

@Injectable()
export class HarvestRemissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregation: HarvestAggregationService,
    private readonly sequences: DocumentSequenceService,
    private readonly events: DocumentEventService,
    private readonly identity: OperationalIdentityService,
  ) {}

  async preview(tenantId: string | null, query: RemissionPreviewQueryDto) {
    const tid = requireTenant(tenantId);
    const lot = await this.aggregation.assertLot(tid, query.lotId);
    const farm = await this.aggregation.assertFarm(tid, lot.farmId);
    const fecha = new Date(query.date);

    // Solo lo PENDIENTE de remitir (los registros ya incluidos en otra remisión no cuentan).
    const taken = await this.takenRecords(tid, fecha, query.lotId);
    const records = await this.aggregation.loadValidRecords(tid, {
      fecha,
      lotId: query.lotId,
      excludeIds: [...taken.keys()],
    });
    const agg = aggregateHarvestRecords(records);
    const { qualityName } = await this.aggregation.resolveNames(
      tid,
      agg.byQuality.map((q) => q.qualityId),
      [],
    );

    // Ya no hay límite de una remisión por día y lote: se pueden hacer varias parciales.
    const existing = null;

    return {
      fecha: query.date,
      farm: { id: farm.id, nombre: farm.nombre },
      lot: { id: lot.id, nombreLote: lot.nombreLote },
      totalPesoGramos: agg.totalPesoGramos,
      totalPesoKg: agg.totalPesoGramos / 1000,
      totalCanastillas: agg.totalCanastillas,
      registrosIncluidos: agg.registrosIncluidos,
      byQuality: agg.byQuality.map((q) => ({
        qualityId: q.qualityId,
        qualityNombre: qualityName.get(q.qualityId) ?? null,
        pesoGramos: q.pesoGramos,
        pesoKg: q.pesoGramos / 1000,
        canastillas: q.canastillas,
      })),
      yaExiste: existing,
    };
  }

  /** Registros ya incluidos en una remisión ACTIVA (id registro → n.° de remisión). */
  private async takenRecords(tid: string, fecha: Date, lotId: string): Promise<Map<string, string>> {
    const rows = await this.prisma.harvestRemissionSource.findMany({
      where: {
        active: true,
        remission: { tenantId: tid, fecha, lotId, status: { not: 'ANULADA' } },
      },
      select: { harvestRecordId: true, remission: { select: { documentNumber: true } } },
    });
    return new Map(rows.map((r) => [r.harvestRecordId, r.remission.documentNumber]));
  }

  /**
   * Registros de un lote y día para armar una remisión parcial: cada uno indica
   * si ya fue incluido en otra remisión.
   */
  async candidates(tenantId: string | null, query: RemissionPreviewQueryDto) {
    const tid = requireTenant(tenantId);
    const lot = await this.aggregation.assertLot(tid, query.lotId);
    const farm = await this.aggregation.assertFarm(tid, lot.farmId);
    const fecha = new Date(query.date);

    const [records, taken] = await Promise.all([
      this.prisma.harvestRecord.findMany({
        where: { tenantId: tid, fecha, lotId: query.lotId, status: 'ACTIVE' },
        orderBy: [{ recordNumber: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          recordNumber: true,
          gramosCosechados: true,
          qualityId: true,
          quality: { select: { nombre: true } },
          worker: { select: { codigoInterno: true, nombre: true } },
          containers: { select: { unidades: true } },
        },
      }),
      this.takenRecords(tid, fecha, query.lotId),
    ]);

    const items = records.map((r) => {
      const canastillas = r.containers.reduce((a, c) => a + c.unidades, 0);
      return {
        id: r.id,
        recordNumber: r.recordNumber,
        workerCodigo: r.worker.codigoInterno,
        workerNombre: r.worker.nombre,
        qualityId: r.qualityId,
        qualityNombre: r.quality.nombre,
        pesoGramos: r.gramosCosechados,
        canastillas,
        // Un registro sin peso o sin canastillas no se puede remitir.
        valido: r.gramosCosechados > 0 && canastillas > 0,
        remision: taken.get(r.id) ?? null,
      };
    });

    return {
      fecha: query.date,
      farm: { id: farm.id, nombre: farm.nombre },
      lot: { id: lot.id, nombreLote: lot.nombreLote },
      records: items,
      pendientes: items.filter((i) => !i.remision && i.valido).length,
    };
  }

  async create(actor: AuthUser, tenantId: string | null, dto: CreateRemissionDto) {
    const tid = requireTenant(tenantId);
    const lot = await this.aggregation.assertLot(tid, dto.lotId);
    const fecha = new Date(dto.date);

    // Registros ya incluidos en otra remisión activa (exclusividad).
    const taken = await this.takenRecords(tid, fecha, dto.lotId);

    let records: ValidHarvestRecord[];
    if (dto.recordIds) {
      const clash = dto.recordIds.filter((id) => taken.has(id));
      if (clash.length > 0) {
        const nums = [...new Set(clash.map((id) => taken.get(id)))].join(', ');
        throw new ConflictException(
          `Algunos registros ya están incluidos en otra remisión (${nums}). Vuelve a consultar los pendientes.`,
        );
      }
      records = await this.aggregation.loadValidRecords(tid, {
        fecha,
        lotId: dto.lotId,
        ids: dto.recordIds,
      });
      if (records.length !== dto.recordIds.length) {
        throw new BadRequestException(
          'Algunos registros no existen, están anulados o no pertenecen al lote y la fecha indicados',
        );
      }
    } else {
      // Sin selección: todo lo pendiente del lote y día.
      records = await this.aggregation.loadValidRecords(tid, {
        fecha,
        lotId: dto.lotId,
        excludeIds: [...taken.keys()],
      });
    }
    if (records.length === 0) {
      throw new BadRequestException(
        'No hay registros de cosecha pendientes de remitir para la fecha y lote seleccionados',
      );
    }
    const agg = aggregateHarvestRecords(records);
    const sumQ = agg.byQuality.reduce((a, q) => a + q.pesoGramos, 0);
    if (sumQ !== agg.totalPesoGramos) {
      throw new InternalServerErrorException('Los totales calculados no coinciden');
    }

    // Identidad efectiva (falla si la cuenta requiere trabajador y no hay ninguno).
    const eff = await this.identity.resolveEffectiveActor(actor);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const seq = await this.sequences.allocate(tx, tid, 'REMISSION', null);
        const remission = await tx.harvestRemission.create({
          data: {
            tenantId: tid,
            farmId: lot.farmId,
            lotId: dto.lotId,
            fecha,
            sequenceNumber: seq.sequenceNumber,
            documentNumber: seq.documentNumber,
            status: 'PENDIENTE_RECEPCION',
            totalPesoGramos: agg.totalPesoGramos,
            totalCanastillas: agg.totalCanastillas,
            registrosIncluidos: agg.registrosIncluidos,
            createdBy: actor.userId,
            createdByWorkerId: eff.workerId,
            createdByActorName: eff.displayName,
            details: {
              create: agg.byQuality.map((q) => ({
                qualityId: q.qualityId,
                pesoGramos: q.pesoGramos,
                canastillas: q.canastillas,
              })),
            },
            sources: {
              create: records.map((r) => ({
                harvestRecordId: r.id,
                pesoGramosSnapshot: r.pesoGramos,
                canastillasSnapshot: r.canastillas,
                qualityIdSnapshot: r.qualityId,
              })),
            },
          },
        });
        await this.events.record(tx, {
          tenantId: tid,
          documentType: 'REMISSION',
          documentId: remission.id,
          event: 'CREATED',
          userId: actor.userId,
          newStatus: 'PENDIENTE_RECEPCION',
          metadata: { documentNumber: remission.documentNumber },
        });
        return remission;
      });
      return this.findOne(tenantId, created.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Índice único parcial: otro usuario remitió alguno de estos registros al mismo tiempo.
        throw new ConflictException(
          'Alguno de los registros acaba de ser incluido en otra remisión. Vuelve a consultar los pendientes.',
        );
      }
      throw e;
    }
  }

  async list(tenantId: string | null, query: ListRemissionsQueryDto) {
    const tid = requireTenant(tenantId);
    const where: Prisma.HarvestRemissionWhereInput = {
      tenantId: tid,
      farmId: query.farmId,
      lotId: query.lotId,
      status: query.status,
      documentNumber: query.documentNumber,
      createdBy: query.createdBy,
      receivedBy: query.receivedBy,
    };
    if (query.fechaDesde || query.fechaHasta) {
      const fecha: Prisma.DateTimeFilter = {};
      if (query.fechaDesde) fecha.gte = new Date(query.fechaDesde);
      if (query.fechaHasta) fecha.lte = new Date(query.fechaHasta);
      where.fecha = fecha;
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.harvestRemission.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.harvestRemission.count({ where }),
    ]);

    return { data: await this.enrichList(rows), total, page, pageSize };
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const remission = await this.prisma.harvestRemission.findFirst({
      where: { id, tenantId: tid },
      include: { details: true, sources: true },
    });
    if (!remission) throw new NotFoundException('Remisión no encontrada');
    return this.enrichOne(remission);
  }

  /** Recibe TODAS las calidades pendientes de la remisión (atajo). */
  async receive(actor: AuthUser, tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const remission = await this.prisma.harvestRemission.findFirst({ where: { id, tenantId: tid } });
    if (!remission) throw new NotFoundException('Remisión no encontrada');
    if (remission.status === 'ANULADA') throw new ConflictException('La remisión está anulada');
    if (remission.status === 'RECIBIDA') throw new ConflictException('La remisión ya fue recibida');

    const eff = await this.identity.resolveEffectiveActor(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.harvestRemissionDetail.updateMany({
        where: { remissionId: id, status: 'PENDIENTE_RECEPCION' },
        data: { status: 'RECIBIDA', receivedBy: actor.userId, receivedAt: new Date() },
      });
      await this.finalizeHeader(tx, tid, id, eff);
      await this.events.record(tx, {
        tenantId: tid,
        documentType: 'REMISSION',
        documentId: id,
        event: 'RECEIVED',
        userId: actor.userId,
        previousStatus: 'PENDIENTE_RECEPCION',
        newStatus: 'RECIBIDA',
        metadata: { action: 'receive_all' },
      });
    });
    return this.findOne(tenantId, id);
  }

  /**
   * Recibe o rechaza UNA calidad (Lote + Calidad) de forma independiente.
   * El estado de una calidad no afecta a las demás.
   */
  async setDetailStatus(
    actor: AuthUser,
    tenantId: string | null,
    remissionId: string,
    detailId: string,
    accept: boolean,
  ) {
    const tid = requireTenant(tenantId);
    const remission = await this.prisma.harvestRemission.findFirst({
      where: { id: remissionId, tenantId: tid },
    });
    if (!remission) throw new NotFoundException('Remisión no encontrada');
    if (remission.status === 'ANULADA') throw new ConflictException('La remisión está anulada');

    const newStatus = accept ? 'RECIBIDA' : 'RECHAZADA';
    const eff = await this.identity.resolveEffectiveActor(actor);
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.harvestRemissionDetail.updateMany({
          where: { id: detailId, remissionId, status: 'PENDIENTE_RECEPCION' },
          data: { status: newStatus, receivedBy: actor.userId, receivedAt: new Date() },
        });
        if (updated.count === 0) {
          throw new ConflictException('Esta calidad ya fue procesada o no existe');
        }
        await this.finalizeHeader(tx, tid, remissionId, eff);
        await this.events.record(tx, {
          tenantId: tid,
          documentType: 'REMISSION',
          documentId: remissionId,
          event: 'RECEIVED',
          userId: actor.userId,
          newStatus,
          metadata: { detailId, action: accept ? 'receive_quality' : 'reject_quality' },
        });
      });
    } catch (e) {
      if (e instanceof ConflictException) {
        await this.events
          .record(this.prisma, {
            tenantId: tid,
            documentType: 'REMISSION',
            documentId: remissionId,
            event: 'DUPLICATE_ATTEMPT',
            userId: actor.userId,
            metadata: { detailId, action: 'receive_quality' },
          })
          .catch(() => undefined);
      }
      throw e;
    }
    return this.findOne(tenantId, remissionId);
  }

  /** Cierra la cabecera (RECIBIDA) cuando ya no quedan calidades pendientes. */
  private async finalizeHeader(
    tx: Prisma.TransactionClient,
    tid: string,
    remissionId: string,
    actor: EffectiveActor,
  ) {
    const details = await tx.harvestRemissionDetail.findMany({ where: { remissionId } });
    const pending = details.filter((d) => d.status === 'PENDIENTE_RECEPCION').length;
    if (pending > 0) return; // aún hay calidades por procesar

    const recibidas = details.filter((d) => d.status === 'RECIBIDA');
    const receivedPeso = recibidas.reduce((a, d) => a + d.pesoGramos, 0);
    const receivedCan = recibidas.reduce((a, d) => a + d.canastillas, 0);
    await tx.harvestRemission.updateMany({
      where: { id: remissionId, tenantId: tid, status: { not: 'RECIBIDA' } },
      data: {
        status: 'RECIBIDA',
        receivedBy: actor.userId,
        receivedByWorkerId: actor.workerId,
        receivedByActorName: actor.displayName,
        receivedAt: new Date(),
        receivedPesoGramos: receivedPeso,
        receivedCanastillas: receivedCan,
        version: { increment: 1 },
      },
    });
  }

  /** Etiqueta del rango de N.° de registro de cada remisión ("#1580–1620"). */
  private async recordRanges(remissionIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (remissionIds.length === 0) return out;

    const sources = await this.prisma.harvestRemissionSource.findMany({
      where: { remissionId: { in: remissionIds } },
      select: { remissionId: true, harvestRecordId: true },
    });
    if (sources.length === 0) return out;

    const records = await this.prisma.harvestRecord.findMany({
      where: { id: { in: [...new Set(sources.map((s) => s.harvestRecordId))] } },
      select: { id: true, recordNumber: true },
    });
    const numberById = new Map(records.map((r) => [r.id, r.recordNumber]));

    const byRemission = new Map<string, (number | null | undefined)[]>();
    for (const s of sources) {
      const arr = byRemission.get(s.remissionId) ?? [];
      arr.push(numberById.get(s.harvestRecordId));
      byRemission.set(s.remissionId, arr);
    }
    for (const [id, nums] of byRemission) out.set(id, compressRecordNumbers(nums));
    return out;
  }

  // ---- Enriquecimiento con nombres (relaciones a entidades existentes son escalares) ----

  private async enrichList(rows: HarvestRemission[]) {
    const farmIds = [...new Set(rows.map((r) => r.farmId))];
    const lotIds = [...new Set(rows.map((r) => r.lotId))];
    const userIds = [
      ...new Set(rows.flatMap((r) => [r.createdBy, r.receivedBy]).filter(Boolean) as string[]),
    ];
    const [farms, lots, users] = await Promise.all([
      this.prisma.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, nombre: true } }),
      this.prisma.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, nombreLote: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } }),
    ]);
    const fMap = new Map(farms.map((f) => [f.id, f.nombre]));
    const lMap = new Map(lots.map((l) => [l.id, l.nombreLote]));
    const uMap = new Map(users.map((u) => [u.id, u.nombre]));
    const ranges = await this.recordRanges(rows.map((r) => r.id));

    return rows.map((r) => ({
      ...r,
      registrosRango: ranges.get(r.id) ?? '',
      totalPesoKg: r.totalPesoGramos / 1000,
      farmNombre: fMap.get(r.farmId) ?? null,
      lotNombre: lMap.get(r.lotId) ?? null,
      // Nombre mostrado = snapshot del actor efectivo (protege el histórico).
      createdByNombre: r.createdByActorName ?? uMap.get(r.createdBy) ?? null,
      receivedByNombre: r.receivedByActorName ?? (r.receivedBy ? uMap.get(r.receivedBy) ?? null : null),
      createdBy: buildActorView(r.createdBy, r.createdByWorkerId, r.createdByActorName, uMap),
      receivedBy: r.receivedBy
        ? buildActorView(r.receivedBy, r.receivedByWorkerId, r.receivedByActorName, uMap)
        : null,
    }));
  }

  private async enrichOne(
    remission: Prisma.HarvestRemissionGetPayload<{ include: { details: true; sources: true } }>,
  ) {
    const qualityIds = [...new Set(remission.details.map((d) => d.qualityId))];
    const userIds = [
      ...new Set(
        [
          remission.createdBy,
          remission.receivedBy,
          ...remission.details.map((d) => d.receivedBy),
        ].filter(Boolean) as string[],
      ),
    ];
    const [farm, lot, users, qualities] = await Promise.all([
      this.prisma.farm.findUnique({ where: { id: remission.farmId }, select: { id: true, nombre: true } }),
      this.prisma.lot.findUnique({ where: { id: remission.lotId }, select: { id: true, nombreLote: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } }),
      this.prisma.quality.findMany({ where: { id: { in: qualityIds } }, select: { id: true, nombre: true } }),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u.nombre]));
    const qMap = new Map(qualities.map((q) => [q.id, q.nombre]));
    const ranges = await this.recordRanges([remission.id]);

    return {
      ...remission,
      registrosRango: ranges.get(remission.id) ?? '',
      totalPesoKg: remission.totalPesoGramos / 1000,
      farmNombre: farm?.nombre ?? null,
      lotNombre: lot?.nombreLote ?? null,
      createdByNombre: remission.createdByActorName ?? uMap.get(remission.createdBy) ?? null,
      receivedByNombre:
        remission.receivedByActorName ??
        (remission.receivedBy ? uMap.get(remission.receivedBy) ?? null : null),
      createdBy: buildActorView(
        remission.createdBy,
        remission.createdByWorkerId,
        remission.createdByActorName,
        uMap,
      ),
      receivedBy: remission.receivedBy
        ? buildActorView(
            remission.receivedBy,
            remission.receivedByWorkerId,
            remission.receivedByActorName,
            uMap,
          )
        : null,
      details: remission.details.map((d) => ({
        ...d,
        qualityNombre: qMap.get(d.qualityId) ?? null,
        pesoKg: d.pesoGramos / 1000,
        receivedByNombre: d.receivedBy ? uMap.get(d.receivedBy) ?? null : null,
      })),
    };
  }
}
