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
} from '../documents/harvest-aggregation.service';
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

    const records = await this.aggregation.loadValidRecords(tid, { fecha, lotId: query.lotId });
    const agg = aggregateHarvestRecords(records);
    const { qualityName } = await this.aggregation.resolveNames(
      tid,
      agg.byQuality.map((q) => q.qualityId),
      [],
    );

    const existing = await this.prisma.harvestRemission.findFirst({
      where: { tenantId: tid, fecha, lotId: query.lotId, status: { not: 'ANULADA' } },
      select: { id: true, documentNumber: true, status: true },
    });

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

  async create(actor: AuthUser, tenantId: string | null, dto: CreateRemissionDto) {
    const tid = requireTenant(tenantId);
    const lot = await this.aggregation.assertLot(tid, dto.lotId);
    const fecha = new Date(dto.date);

    const records = await this.aggregation.loadValidRecords(tid, { fecha, lotId: dto.lotId });
    if (records.length === 0) {
      throw new BadRequestException(
        'No existen registros de cosecha para la fecha y lote seleccionados',
      );
    }
    const agg = aggregateHarvestRecords(records);
    const sumQ = agg.byQuality.reduce((a, q) => a + q.pesoGramos, 0);
    if (sumQ !== agg.totalPesoGramos) {
      throw new InternalServerErrorException('Los totales calculados no coinciden');
    }

    // Identidad efectiva (falla si la cuenta requiere trabajador y no hay ninguno).
    const eff = await this.identity.resolveEffectiveActor(actor);

    // Pre-chequeo de duplicado (mensaje claro + evento de intento).
    const existing = await this.prisma.harvestRemission.findFirst({
      where: { tenantId: tid, fecha, lotId: dto.lotId, status: { not: 'ANULADA' } },
    });
    if (existing) {
      await this.events
        .record(this.prisma, {
          tenantId: tid,
          documentType: 'REMISSION',
          documentId: existing.id,
          event: 'DUPLICATE_ATTEMPT',
          userId: actor.userId,
          metadata: { fecha: dto.date, lotId: dto.lotId },
        })
        .catch(() => undefined);
      throw new ConflictException('Ya existe una remisión para esta fecha y lote');
    }

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
        throw new ConflictException('Ya existe una remisión para esta fecha y lote');
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

    return rows.map((r) => ({
      ...r,
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

    return {
      ...remission,
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
