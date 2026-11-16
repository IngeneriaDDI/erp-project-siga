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
  UpdateOrderDateDto,
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
    const sinRemitir = await this.unremitted(tid, records);

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
      // Aviso informativo: cosechado ese día que aún no está en ninguna remisión.
      sinRemitir,
    };
  }

  /** Registros (válidos) que no pertenecen a ninguna remisión activa. */
  private async unremitted(
    tid: string,
    records: { id: string; pesoGramos: number; canastillas: number }[],
  ) {
    if (records.length === 0) return { registros: 0, pesoGramos: 0, canastillas: 0 };
    const taken = await this.prisma.harvestRemissionSource.findMany({
      where: {
        active: true,
        harvestRecordId: { in: records.map((r) => r.id) },
        remission: { tenantId: tid, status: { not: 'ANULADA' } },
      },
      select: { harvestRecordId: true },
    });
    const takenIds = new Set(taken.map((t) => t.harvestRecordId));
    const rest = records.filter((r) => !takenIds.has(r.id));
    return {
      registros: rest.length,
      pesoGramos: rest.reduce((a, r) => a + r.pesoGramos, 0),
      canastillas: rest.reduce((a, r) => a + r.canastillas, 0),
    };
  }

  /**
   * Abre la orden del día (sin totales). Las remisiones de esa finca y fecha que ya
   * existían sin orden se enlazan a ella; las nuevas se enlazan al crearse.
   */
  async open(actor: AuthUser, tenantId: string | null, dto: CreateOrderDto) {
    const tid = requireTenant(tenantId);
    await this.aggregation.assertFarm(tid, dto.farmId);
    const fecha = new Date(dto.date);

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
      throw new ConflictException(
        `Ya existe una orden de producción (${existing.documentNumber}) para esta fecha y finca`,
      );
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const seq = await this.sequences.allocate(tx, tid, 'PRODUCTION_ORDER', null);
        const order = await tx.productionOrder.create({
          data: {
            tenantId: tid,
            farmId: dto.farmId,
            fecha,
            sequenceNumber: seq.sequenceNumber,
            documentNumber: seq.documentNumber,
            status: 'ABIERTA',
            totalPesoGramos: 0,
            totalCanastillas: 0,
            lotesIncluidos: 0,
            registrosIncluidos: 0,
            createdBy: actor.userId,
            createdByWorkerId: eff.workerId,
            createdByActorName: eff.displayName,
          },
        });
        // Remisiones del día y finca creadas antes de abrir la orden.
        const adopted = await tx.harvestRemission.updateMany({
          where: {
            tenantId: tid,
            farmId: dto.farmId,
            fecha,
            status: { not: 'ANULADA' },
            productionOrderId: null,
          },
          data: { productionOrderId: order.id },
        });
        await this.events.record(tx, {
          tenantId: tid,
          documentType: 'PRODUCTION_ORDER',
          documentId: order.id,
          event: 'CREATED',
          userId: actor.userId,
          newStatus: 'ABIERTA',
          metadata: { documentNumber: order.documentNumber, remisionesEnlazadas: adopted.count },
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

  /** Calcula totales y desglose con TODOS los registros de la finca y fecha de la orden. */
  private async calculate(tid: string, order: { farmId: string; fecha: Date }) {
    const records = await this.aggregation.loadValidRecords(tid, {
      fecha: order.fecha,
      farmId: order.farmId,
    });
    if (records.length === 0) {
      throw new BadRequestException(
        'No existen registros de cosecha para la fecha y finca de la orden',
      );
    }
    const agg = aggregateHarvestRecords(records);
    const sumLot = agg.byLot.reduce((a, l) => a + l.pesoGramos, 0);
    if (sumLot !== agg.totalPesoGramos) {
      throw new InternalServerErrorException('Los totales calculados no coinciden');
    }
    const sinRemitir = await this.unremitted(tid, records);
    return { records, agg, sinRemitir };
  }

  /** Borra el cálculo de la orden (detalles y fuentes). */
  private async clearCalculation(tx: Prisma.TransactionClient, id: string) {
    await tx.productionOrderQualityDetail.deleteMany({ where: { productionOrderId: id } });
    await tx.productionOrderLotDetail.deleteMany({ where: { productionOrderId: id } });
    await tx.productionOrderLotQualityDetail.deleteMany({ where: { productionOrderId: id } });
    await tx.productionOrderSource.deleteMany({ where: { productionOrderId: id } });
  }

  /** Escribe el cálculo y deja la orden pendiente de aceptación (si estaba en `from`). */
  private async writeCalculation(
    tx: Prisma.TransactionClient,
    tid: string,
    id: string,
    from: 'ABIERTA' | 'PENDIENTE_ACEPTACION',
    calc: Awaited<ReturnType<ProductionOrdersService['calculate']>>,
  ) {
    const { agg, records } = calc;
    // Cambio atómico: solo si sigue en el estado esperado (evita cierres simultáneos).
    const updated = await tx.productionOrder.updateMany({
      where: { id, tenantId: tid, status: from },
      data: {
        status: 'PENDIENTE_ACEPTACION',
        totalPesoGramos: agg.totalPesoGramos,
        totalCanastillas: agg.totalCanastillas,
        lotesIncluidos: agg.byLot.length,
        registrosIncluidos: agg.registrosIncluidos,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) throw new ConflictException('La orden cambió de estado; vuelve a consultar');

    await tx.productionOrderQualityDetail.createMany({
      data: agg.byQuality.map((q) => ({
        productionOrderId: id,
        qualityId: q.qualityId,
        pesoGramos: q.pesoGramos,
        canastillas: q.canastillas,
      })),
    });
    await tx.productionOrderLotDetail.createMany({
      data: agg.byLot.map((l) => ({
        productionOrderId: id,
        lotId: l.lotId,
        pesoGramos: l.pesoGramos,
        canastillas: l.canastillas,
      })),
    });
    // Base granular: una fila por (lote, calidad).
    await tx.productionOrderLotQualityDetail.createMany({
      data: agg.byLotQuality.map((x) => ({
        productionOrderId: id,
        lotId: x.lotId,
        qualityId: x.qualityId,
        pesoGramos: x.pesoGramos,
        canastillas: x.canastillas,
      })),
    });
    await tx.productionOrderSource.createMany({
      data: records.map((r) => ({
        productionOrderId: id,
        harvestRecordId: r.id,
        pesoGramosSnapshot: r.pesoGramos,
        canastillasSnapshot: r.canastillas,
        lotIdSnapshot: r.lotId,
        qualityIdSnapshot: r.qualityId,
      })),
    });
  }

  /** Estado resumido para guardar en el historial antes de modificar la orden. */
  private snapshot(order: ProductionOrder) {
    return {
      status: order.status,
      fecha: order.fecha.toISOString().slice(0, 10),
      totalPesoGramos: order.totalPesoGramos,
      totalCanastillas: order.totalCanastillas,
      lotesIncluidos: order.lotesIncluidos,
      registrosIncluidos: order.registrosIncluidos,
    };
  }

  private async getOrderOrFail(tid: string, id: string) {
    const order = await this.prisma.productionOrder.findFirst({ where: { id, tenantId: tid } });
    if (!order) throw new NotFoundException('Orden de producción no encontrada');
    return order;
  }

  /**
   * "Cerrar y calcular": toma TODOS los registros de cosecha de la finca en la fecha
   * (estén remitidos o no) y calcula los totales. La orden pasa a pendiente de aceptación
   * y deja de recibir remisiones.
   */
  async close(actor: AuthUser, tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const order = await this.getOrderOrFail(tid, id);
    if (order.status !== 'ABIERTA') {
      throw new ConflictException('Solo se puede cerrar y calcular una orden abierta');
    }
    const calc = await this.calculate(tid, order);
    await this.identity.resolveEffectiveActor(actor);

    await this.prisma.$transaction(async (tx) => {
      await this.writeCalculation(tx, tid, id, 'ABIERTA', calc);
      // Remisiones del día que aún no estaban enlazadas.
      await tx.harvestRemission.updateMany({
        where: {
          tenantId: tid,
          farmId: order.farmId,
          fecha: order.fecha,
          status: { not: 'ANULADA' },
          productionOrderId: null,
        },
        data: { productionOrderId: id },
      });
      await this.events.record(tx, {
        tenantId: tid,
        documentType: 'PRODUCTION_ORDER',
        documentId: id,
        event: 'STATUS_CHANGE',
        userId: actor.userId,
        previousStatus: 'ABIERTA',
        newStatus: 'PENDIENTE_ACEPTACION',
        metadata: {
          action: 'close_calculate',
          totalPesoGramos: calc.agg.totalPesoGramos,
          totalCanastillas: calc.agg.totalCanastillas,
          registros: calc.agg.registrosIncluidos,
          sinRemitir: calc.sinRemitir,
        },
      });
    });
    return this.findOne(tenantId, id);
  }

  /**
   * Recalcula una orden PENDIENTE de aceptación con los registros actuales
   * (p. ej. después de corregir una remisión o un registro). Mismo consecutivo.
   */
  async recalculate(actor: AuthUser, tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const order = await this.getOrderOrFail(tid, id);
    if (order.status !== 'PENDIENTE_ACEPTACION') {
      throw new ConflictException(
        order.status === 'ACEPTADA'
          ? 'La orden ya fue aceptada y no se puede modificar'
          : 'Solo se puede recalcular una orden cerrada pendiente de aceptación',
      );
    }
    const calc = await this.calculate(tid, order);
    await this.identity.resolveEffectiveActor(actor);
    const previous = this.snapshot(order);

    await this.prisma.$transaction(async (tx) => {
      await this.clearCalculation(tx, id);
      await this.writeCalculation(tx, tid, id, 'PENDIENTE_ACEPTACION', calc);
      await this.events.record(tx, {
        tenantId: tid,
        documentType: 'PRODUCTION_ORDER',
        documentId: id,
        event: 'STATUS_CHANGE',
        userId: actor.userId,
        previousStatus: 'PENDIENTE_ACEPTACION',
        newStatus: 'PENDIENTE_ACEPTACION',
        metadata: {
          action: 'recalculate',
          previous,
          next: {
            totalPesoGramos: calc.agg.totalPesoGramos,
            totalCanastillas: calc.agg.totalCanastillas,
            registros: calc.agg.registrosIncluidos,
          },
          sinRemitir: calc.sinRemitir,
        },
      });
    });
    return this.findOne(tenantId, id);
  }

  /**
   * Reabre una orden PENDIENTE de aceptación: vuelve a ABIERTA (recibe remisiones) y se
   * descarta el cálculo; se vuelve a calcular al cerrar. Mismo consecutivo. Una orden
   * aceptada no se puede reabrir.
   */
  async reopen(actor: AuthUser, tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const order = await this.getOrderOrFail(tid, id);
    if (order.status !== 'PENDIENTE_ACEPTACION') {
      throw new ConflictException(
        order.status === 'ACEPTADA'
          ? 'La orden ya fue aceptada y no se puede reabrir'
          : order.status === 'ABIERTA'
            ? 'La orden ya está abierta'
            : 'La orden está anulada',
      );
    }
    await this.identity.resolveEffectiveActor(actor);
    const previous = this.snapshot(order);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.productionOrder.updateMany({
        where: { id, tenantId: tid, status: 'PENDIENTE_ACEPTACION' },
        data: {
          status: 'ABIERTA',
          totalPesoGramos: 0,
          totalCanastillas: 0,
          lotesIncluidos: 0,
          registrosIncluidos: 0,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new ConflictException('La orden cambió de estado; vuelve a consultar');
      await this.clearCalculation(tx, id);
      await this.events.record(tx, {
        tenantId: tid,
        documentType: 'PRODUCTION_ORDER',
        documentId: id,
        event: 'STATUS_CHANGE',
        userId: actor.userId,
        previousStatus: 'PENDIENTE_ACEPTACION',
        newStatus: 'ABIERTA',
        metadata: { action: 'reopen', previous },
      });
    });
    return this.findOne(tenantId, id);
  }

  /**
   * Corrige la fecha de la orden (abierta o pendiente de aceptación). Las remisiones
   * enlazadas conservan su fecha real y se desenlazan; se enlazan las remisiones de la
   * nueva fecha. La orden queda ABIERTA y se recalcula al cerrar.
   */
  async updateDate(actor: AuthUser, tenantId: string | null, id: string, dto: UpdateOrderDateDto) {
    const tid = requireTenant(tenantId);
    const order = await this.getOrderOrFail(tid, id);
    if (order.status !== 'ABIERTA' && order.status !== 'PENDIENTE_ACEPTACION') {
      throw new ConflictException(
        order.status === 'ACEPTADA'
          ? 'La orden ya fue aceptada y no se puede modificar'
          : 'La orden está anulada',
      );
    }
    const fecha = new Date(dto.date);
    if (fecha.getTime() === order.fecha.getTime()) {
      throw new BadRequestException('La fecha indicada es la misma que ya tiene la orden');
    }
    const clash = await this.prisma.productionOrder.findFirst({
      where: { tenantId: tid, farmId: order.farmId, fecha, status: { not: 'ANULADA' }, id: { not: id } },
      select: { documentNumber: true },
    });
    if (clash) {
      throw new ConflictException(
        `Ya existe la orden ${clash.documentNumber} para esa finca y fecha`,
      );
    }
    await this.identity.resolveEffectiveActor(actor);
    const previous = this.snapshot(order);

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.productionOrder.updateMany({
          where: { id, tenantId: tid, status: { in: ['ABIERTA', 'PENDIENTE_ACEPTACION'] } },
          data: {
            fecha,
            status: 'ABIERTA',
            totalPesoGramos: 0,
            totalCanastillas: 0,
            lotesIncluidos: 0,
            registrosIncluidos: 0,
            version: { increment: 1 },
          },
        });
        if (updated.count === 0) throw new ConflictException('La orden cambió de estado; vuelve a consultar');
        await this.clearCalculation(tx, id);
        // Las remisiones conservan su fecha de cosecha: se desenlazan de esta orden...
        const unlinked = await tx.harvestRemission.updateMany({
          where: { tenantId: tid, productionOrderId: id },
          data: { productionOrderId: null },
        });
        // ...y se enlazan las de la nueva fecha que aún no tenían orden.
        const adopted = await tx.harvestRemission.updateMany({
          where: {
            tenantId: tid,
            farmId: order.farmId,
            fecha,
            status: { not: 'ANULADA' },
            productionOrderId: null,
          },
          data: { productionOrderId: id },
        });
        await this.events.record(tx, {
          tenantId: tid,
          documentType: 'PRODUCTION_ORDER',
          documentId: id,
          event: 'STATUS_CHANGE',
          userId: actor.userId,
          previousStatus: order.status,
          newStatus: 'ABIERTA',
          metadata: {
            action: 'update_date',
            previous,
            nuevaFecha: dto.date,
            remisionesDesenlazadas: unlinked.count,
            remisionesEnlazadas: adopted.count,
          },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una orden de producción para esa finca y fecha');
      }
      throw e;
    }
    return this.findOne(tenantId, id);
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
    if (order.status === 'ABIERTA') {
      throw new ConflictException('La orden sigue abierta: ciérrala y calcúlala antes de aceptarla');
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
    const userIds = [order.createdBy, order.acceptedBy].filter(Boolean) as string[];

    const [farm, users, qualities, lots, remissions] = await Promise.all([
      this.prisma.farm.findUnique({ where: { id: order.farmId }, select: { id: true, nombre: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } }),
      this.prisma.quality.findMany({ where: { id: { in: qualityIds } }, select: { id: true, nombre: true } }),
      this.prisma.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, nombreLote: true } }),
      this.prisma.harvestRemission.findMany({
        where: { tenantId: order.tenantId, productionOrderId: order.id },
        orderBy: { sequenceNumber: 'asc' },
        select: {
          id: true,
          documentNumber: true,
          status: true,
          lotId: true,
          totalPesoGramos: true,
          totalCanastillas: true,
        },
      }),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u.nombre]));
    const qMap = new Map(qualities.map((q) => [q.id, q.nombre]));
    const lMap = new Map(lots.map((l) => [l.id, l.nombreLote]));
    const remLotIds = [...new Set(remissions.map((r) => r.lotId).filter((x) => !lMap.has(x)))];
    if (remLotIds.length > 0) {
      const extra = await this.prisma.lot.findMany({
        where: { id: { in: remLotIds } },
        select: { id: true, nombreLote: true },
      });
      extra.forEach((l) => lMap.set(l.id, l.nombreLote));
    }

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
      remisiones: remissions.map((r) => ({ ...r, lotNombre: lMap.get(r.lotId) ?? null })),
    };
  }
}
