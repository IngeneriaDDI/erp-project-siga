import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductionOrder } from '@prisma/client';
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
  OperationalIdentityService,
} from '../operational/operational-identity.service';
import {
  CreateOrderDto,
  ListOrdersQueryDto,
  OrderPreviewQueryDto,
} from './dto/production-order.dto';

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregation: HarvestAggregationService,
    private readonly sequences: DocumentSequenceService,
    private readonly events: DocumentEventService,
    private readonly identity: OperationalIdentityService,
  ) {}

  async preview(tenantId: string | null, query: OrderPreviewQueryDto) {
    const tid = requireTenant(tenantId);
    const farm = await this.aggregation.assertFarm(tid, query.farmId);
    const fecha = new Date(query.date);

    const records = await this.aggregation.loadValidRecords(tid, { fecha, farmId: query.farmId });
    const agg = aggregateHarvestRecords(records);
    const { qualityName, lotName } = await this.aggregation.resolveNames(
      tid,
      agg.byQuality.map((q) => q.qualityId),
      agg.byLot.map((l) => l.lotId),
    );

    const existing = await this.prisma.productionOrder.findFirst({
      where: { tenantId: tid, fecha, farmId: query.farmId, status: { not: 'ANULADA' } },
      select: { id: true, documentNumber: true, status: true },
    });

    return {
      fecha: query.date,
      farm: { id: farm.id, nombre: farm.nombre },
      totalPesoGramos: agg.totalPesoGramos,
      totalPesoKg: agg.totalPesoGramos / 1000,
      totalCanastillas: agg.totalCanastillas,
      lotesIncluidos: agg.byLot.length,
      registrosIncluidos: agg.registrosIncluidos,
      byQuality: agg.byQuality.map((q) => ({
        qualityId: q.qualityId,
        qualityNombre: qualityName.get(q.qualityId) ?? null,
        pesoGramos: q.pesoGramos,
        pesoKg: q.pesoGramos / 1000,
        canastillas: q.canastillas,
      })),
      byLot: agg.byLot.map((l) => ({
        lotId: l.lotId,
        lotNombre: lotName.get(l.lotId) ?? null,
        pesoGramos: l.pesoGramos,
        pesoKg: l.pesoGramos / 1000,
        canastillas: l.canastillas,
      })),
      yaExiste: existing,
    };
  }

  async create(actor: AuthUser, tenantId: string | null, dto: CreateOrderDto) {
    const tid = requireTenant(tenantId);
    await this.aggregation.assertFarm(tid, dto.farmId);
    const fecha = new Date(dto.date);

    const records = await this.aggregation.loadValidRecords(tid, { fecha, farmId: dto.farmId });
    if (records.length === 0) {
      throw new BadRequestException(
        'No existen registros de cosecha para la fecha y finca seleccionadas',
      );
    }
    const agg = aggregateHarvestRecords(records);
    const sumLot = agg.byLot.reduce((a, l) => a + l.pesoGramos, 0);
    if (sumLot !== agg.totalPesoGramos) {
      throw new InternalServerErrorException('Los totales calculados no coinciden');
    }

    // Identidad efectiva (falla si la cuenta requiere trabajador y no hay ninguno).
    const eff = await this.identity.resolveEffectiveActor(actor);

    const existing = await this.prisma.productionOrder.findFirst({
      where: { tenantId: tid, fecha, farmId: dto.farmId, status: { not: 'ANULADA' } },
    });
    if (existing) {
      await this.events
        .record(this.prisma, {
          tenantId: tid,
          documentType: 'PRODUCTION_ORDER',
          documentId: existing.id,
          event: 'DUPLICATE_ATTEMPT',
          userId: actor.userId,
          metadata: { fecha: dto.date, farmId: dto.farmId },
        })
        .catch(() => undefined);
      throw new ConflictException('Ya existe una orden de producción para esta fecha y finca');
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const seq = await this.sequences.allocate(tx, tid, 'PRODUCTION_ORDER', null);

        // Remisiones del día/finca para trazabilidad (no suman totales).
        const remissions = await tx.harvestRemission.findMany({
          where: { tenantId: tid, farmId: dto.farmId, fecha, status: { not: 'ANULADA' } },
          select: { id: true },
        });

        const order = await tx.productionOrder.create({
          data: {
            tenantId: tid,
            farmId: dto.farmId,
            fecha,
            sequenceNumber: seq.sequenceNumber,
            documentNumber: seq.documentNumber,
            status: 'PENDIENTE_ACEPTACION',
            totalPesoGramos: agg.totalPesoGramos,
            totalCanastillas: agg.totalCanastillas,
            lotesIncluidos: agg.byLot.length,
            registrosIncluidos: agg.registrosIncluidos,
            createdBy: actor.userId,
            createdByWorkerId: eff.workerId,
            createdByActorName: eff.displayName,
            qualityDetails: {
              create: agg.byQuality.map((q) => ({
                qualityId: q.qualityId,
                pesoGramos: q.pesoGramos,
                canastillas: q.canastillas,
              })),
            },
            lotDetails: {
              create: agg.byLot.map((l) => ({
                lotId: l.lotId,
                pesoGramos: l.pesoGramos,
                canastillas: l.canastillas,
              })),
            },
            // Base granular: una fila por (lote, calidad).
            lotQualityDetails: {
              create: agg.byLotQuality.map((x) => ({
                lotId: x.lotId,
                qualityId: x.qualityId,
                pesoGramos: x.pesoGramos,
                canastillas: x.canastillas,
              })),
            },
            sources: {
              create: records.map((r) => ({
                harvestRecordId: r.id,
                pesoGramosSnapshot: r.pesoGramos,
                canastillasSnapshot: r.canastillas,
                lotIdSnapshot: r.lotId,
                qualityIdSnapshot: r.qualityId,
              })),
            },
            remissionLinks: {
              create: remissions.map((rem) => ({ remissionId: rem.id })),
            },
          },
        });
        await this.events.record(tx, {
          tenantId: tid,
          documentType: 'PRODUCTION_ORDER',
          documentId: order.id,
          event: 'CREATED',
          userId: actor.userId,
          newStatus: 'PENDIENTE_ACEPTACION',
          metadata: { documentNumber: order.documentNumber },
        });
        return order;
      });
      return this.findOne(tenantId, created.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una orden de producción para esta fecha y finca');
      }
      throw e;
    }
  }

  async list(tenantId: string | null, query: ListOrdersQueryDto) {
    const tid = requireTenant(tenantId);
    const where: Prisma.ProductionOrderWhereInput = {
      tenantId: tid,
      farmId: query.farmId,
      status: query.status,
      documentNumber: query.documentNumber,
      createdBy: query.createdBy,
      acceptedBy: query.acceptedBy,
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
      this.prisma.productionOrder.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);

    return { data: await this.enrichList(rows), total, page, pageSize };
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const order = await this.prisma.productionOrder.findFirst({
      where: { id, tenantId: tid },
      include: {
        qualityDetails: true,
        lotDetails: true,
        lotQualityDetails: true,
        sources: true,
        remissionLinks: true,
      },
    });
    if (!order) throw new NotFoundException('Orden de producción no encontrada');
    return this.enrichOne(order);
  }

  async accept(actor: AuthUser, tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const order = await this.prisma.productionOrder.findFirst({ where: { id, tenantId: tid } });
    if (!order) throw new NotFoundException('Orden de producción no encontrada');
    if (order.status === 'ANULADA') {
      throw new ConflictException('La orden está anulada');
    }

    const eff = await this.identity.resolveEffectiveActor(actor);
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.productionOrder.updateMany({
          where: { id, tenantId: tid, status: 'PENDIENTE_ACEPTACION' },
          data: {
            status: 'ACEPTADA',
            acceptedBy: actor.userId,
            acceptedByWorkerId: eff.workerId,
            acceptedByActorName: eff.displayName,
            acceptedAt: new Date(),
            acceptedPesoGramos: order.totalPesoGramos,
            acceptedCanastillas: order.totalCanastillas,
            version: { increment: 1 },
          },
        });
        if (updated.count === 0) {
          throw new ConflictException('La orden ya fue aceptada');
        }
        await this.events.record(tx, {
          tenantId: tid,
          documentType: 'PRODUCTION_ORDER',
          documentId: id,
          event: 'ACCEPTED',
          userId: actor.userId,
          previousStatus: 'PENDIENTE_ACEPTACION',
          newStatus: 'ACEPTADA',
        });
      });
    } catch (e) {
      if (e instanceof ConflictException) {
        await this.events
          .record(this.prisma, {
            tenantId: tid,
            documentType: 'PRODUCTION_ORDER',
            documentId: id,
            event: 'DUPLICATE_ATTEMPT',
            userId: actor.userId,
            metadata: { action: 'accept' },
          })
          .catch(() => undefined);
      }
      throw e;
    }
    return this.findOne(tenantId, id);
  }

  // ---- Enriquecimiento con nombres ----

  private async enrichList(rows: ProductionOrder[]) {
    const farmIds = [...new Set(rows.map((r) => r.farmId))];
    const userIds = [
      ...new Set(rows.flatMap((r) => [r.createdBy, r.acceptedBy]).filter(Boolean) as string[]),
    ];
    const [farms, users] = await Promise.all([
      this.prisma.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, nombre: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } }),
    ]);
    const fMap = new Map(farms.map((f) => [f.id, f.nombre]));
    const uMap = new Map(users.map((u) => [u.id, u.nombre]));

    return rows.map((r) => ({
      ...r,
      totalPesoKg: r.totalPesoGramos / 1000,
      farmNombre: fMap.get(r.farmId) ?? null,
      // Nombre mostrado = snapshot del actor efectivo (protege el histórico).
      createdByNombre: r.createdByActorName ?? uMap.get(r.createdBy) ?? null,
      acceptedByNombre:
        r.acceptedByActorName ?? (r.acceptedBy ? uMap.get(r.acceptedBy) ?? null : null),
      createdBy: buildActorView(r.createdBy, r.createdByWorkerId, r.createdByActorName, uMap),
      acceptedBy: r.acceptedBy
        ? buildActorView(r.acceptedBy, r.acceptedByWorkerId, r.acceptedByActorName, uMap)
        : null,
    }));
  }

  private async enrichOne(
    order: Prisma.ProductionOrderGetPayload<{
      include: {
        qualityDetails: true;
        lotDetails: true;
        lotQualityDetails: true;
        sources: true;
        remissionLinks: true;
      };
    }>,
  ) {
    const qualityIds = [
      ...new Set([
        ...order.qualityDetails.map((d) => d.qualityId),
        ...order.lotQualityDetails.map((d) => d.qualityId),
      ]),
    ];
    const lotIds = [
      ...new Set([
        ...order.lotDetails.map((d) => d.lotId),
        ...order.lotQualityDetails.map((d) => d.lotId),
      ]),
    ];
    const remissionIds = order.remissionLinks.map((l) => l.remissionId);
    const userIds = [order.createdBy, order.acceptedBy].filter(Boolean) as string[];

    const [farm, users, qualities, lots, remissions] = await Promise.all([
      this.prisma.farm.findUnique({ where: { id: order.farmId }, select: { id: true, nombre: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } }),
      this.prisma.quality.findMany({ where: { id: { in: qualityIds } }, select: { id: true, nombre: true } }),
      this.prisma.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, nombreLote: true } }),
      this.prisma.harvestRemission.findMany({
        where: { id: { in: remissionIds } },
        select: { id: true, documentNumber: true, status: true },
      }),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u.nombre]));
    const qMap = new Map(qualities.map((q) => [q.id, q.nombre]));
    const lMap = new Map(lots.map((l) => [l.id, l.nombreLote]));

    return {
      ...order,
      totalPesoKg: order.totalPesoGramos / 1000,
      farmNombre: farm?.nombre ?? null,
      createdByNombre: order.createdByActorName ?? uMap.get(order.createdBy) ?? null,
      acceptedByNombre:
        order.acceptedByActorName ??
        (order.acceptedBy ? uMap.get(order.acceptedBy) ?? null : null),
      createdBy: buildActorView(
        order.createdBy,
        order.createdByWorkerId,
        order.createdByActorName,
        uMap,
      ),
      acceptedBy: order.acceptedBy
        ? buildActorView(
            order.acceptedBy,
            order.acceptedByWorkerId,
            order.acceptedByActorName,
            uMap,
          )
        : null,
      qualityDetails: order.qualityDetails.map((d) => ({
        ...d,
        qualityNombre: qMap.get(d.qualityId) ?? null,
        pesoKg: d.pesoGramos / 1000,
      })),
      lotDetails: order.lotDetails.map((d) => ({
        ...d,
        lotNombre: lMap.get(d.lotId) ?? null,
        pesoKg: d.pesoGramos / 1000,
      })),
      lotQualityDetails: order.lotQualityDetails.map((d) => ({
        ...d,
        lotNombre: lMap.get(d.lotId) ?? null,
        qualityNombre: qMap.get(d.qualityId) ?? null,
        pesoKg: d.pesoGramos / 1000,
      })),
      remisiones: remissions,
    };
  }
}
