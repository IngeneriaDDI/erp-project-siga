import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { buildGoalRows, GoalRowData, MonthInput, sumGoalRows } from './goal-rows.util';
import { gramsToKgString } from './goal-units.util';
import { QueryGoalsDto } from './dto/production-goal.dto';

type GoalDb = {
  month: number;
  metaGramosPlanta: Prisma.Decimal;
  plantasSnapshot: number;
  metaGramosTotal: Prisma.Decimal;
};

@Injectable()
export class ProductionGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista paginada en servidor: una fila por lote + año, con totales y detalle mensual. */
  async list(tenantId: string | null, q: QueryGoalsDto) {
    const tid = requireTenant(tenantId);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;

    const where: Prisma.LotProductionGoalWhereInput = { tenantId: tid };
    if (q.year) where.year = q.year;
    if (q.month) where.month = q.month;
    const search = q.search?.trim();
    if (search) {
      where.lot = {
        OR: [
          { nombreLote: { contains: search, mode: 'insensitive' } },
          { farm: { nombre: { contains: search, mode: 'insensitive' } } },
        ],
      };
    }

    // Pares (lote, año) distintos que cumplen el filtro.
    const pairs = await this.prisma.lotProductionGoal.groupBy({
      by: ['lotId', 'year'],
      where,
    });
    const total = pairs.length;

    const lotIds = [...new Set(pairs.map((p) => p.lotId))];
    const lots = lotIds.length
      ? await this.prisma.lot.findMany({
          where: { id: { in: lotIds }, tenantId: tid },
          select: {
            id: true,
            nombreLote: true,
            variedad: true,
            numeroPlantas: true,
            farm: { select: { id: true, nombre: true } },
          },
        })
      : [];
    const lotById = new Map(lots.map((l) => [l.id, l]));

    // Orden: año descendente, luego lote (numérico natural).
    pairs.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      const na = lotById.get(a.lotId)?.nombreLote ?? '';
      const nb = lotById.get(b.lotId)?.nombreLote ?? '';
      return na.localeCompare(nb, 'es', { numeric: true, sensitivity: 'base' });
    });

    const pagePairs = pairs.slice((page - 1) * pageSize, page * pageSize);
    const details = pagePairs.length
      ? await this.prisma.lotProductionGoal.findMany({
          where: {
            tenantId: tid,
            OR: pagePairs.map((p) => ({ lotId: p.lotId, year: p.year })),
          },
          orderBy: { month: 'asc' },
        })
      : [];

    const data = pagePairs.map((p) => {
      const rows = details.filter((d) => d.lotId === p.lotId && d.year === p.year);
      const lot = lotById.get(p.lotId);
      return {
        ...this.serializeSummary(rows),
        lotId: p.lotId,
        year: p.year,
        lotNombre: lot?.nombreLote ?? null,
        variedad: lot?.variedad ?? null,
        farmId: lot?.farm.id ?? null,
        farmNombre: lot?.farm.nombre ?? null,
        plantasActuales: lot?.numeroPlantas ?? null,
        // Valor del mes filtrado (si se filtró por mes).
        monthValueKg: q.month
          ? this.kg(rows.find((r) => r.month === q.month)?.metaGramosPlanta)
          : null,
      };
    });

    return { data, total, page, pageSize };
  }

  async findOne(tenantId: string | null, lotId: string, year: number) {
    const tid = requireTenant(tenantId);
    const rows = await this.prisma.lotProductionGoal.findMany({
      where: { tenantId: tid, lotId, year },
      orderBy: { month: 'asc' },
    });
    if (rows.length === 0) throw new NotFoundException('No hay metas para ese lote y año');
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, tenantId: tid },
      select: { nombreLote: true, farm: { select: { nombre: true } } },
    });
    return {
      ...this.serializeSummary(rows),
      lotId,
      year,
      lotNombre: lot?.nombreLote ?? null,
      farmNombre: lot?.farm.nombre ?? null,
    };
  }

  /** Crea los 12 meses de un lote+año en una sola transacción. */
  async create(
    tenantId: string | null,
    userId: string | null,
    dto: { lotId: string; year: number; months: MonthInput[] },
  ) {
    const tid = requireTenant(tenantId);
    const lot = await this.loadEligibleLot(tid, dto.lotId);
    const { rows, roundedCount } = buildGoalRows(lot.numeroPlantas as number, dto.months);

    const existing = await this.prisma.lotProductionGoal.count({
      where: { tenantId: tid, lotId: dto.lotId, year: dto.year },
    });
    if (existing > 0) {
      throw new ConflictException('Ya existen metas para ese lote y año. Edítalas en lugar de crearlas.');
    }

    try {
      await this.prisma.$transaction(
        rows.map((r) =>
          this.prisma.lotProductionGoal.create({
            data: this.toCreateData(tid, dto.lotId, dto.year, userId, r),
          }),
        ),
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existen metas para ese lote, año y mes');
      }
      throw e;
    }
    return { ...(await this.findOne(tid, dto.lotId, dto.year)), roundedCount };
  }

  /** Reemplaza (atómicamente) los 12 meses de un lote+año ya existente. */
  async update(
    tenantId: string | null,
    userId: string | null,
    lotId: string,
    year: number,
    months: MonthInput[],
  ) {
    const tid = requireTenant(tenantId);
    const lot = await this.loadEligibleLot(tid, lotId);
    const { rows, roundedCount } = buildGoalRows(lot.numeroPlantas as number, months);

    const existing = await this.prisma.lotProductionGoal.count({
      where: { tenantId: tid, lotId, year },
    });
    if (existing === 0) throw new NotFoundException('No hay metas para ese lote y año');

    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.lotProductionGoal.upsert({
          where: { lotId_year_month: { lotId, year, month: r.month } },
          create: this.toCreateData(tid, lotId, year, userId, r),
          update: {
            metaGramosPlanta: r.metaGramosPlanta,
            plantasSnapshot: r.plantasSnapshot,
            metaGramosTotal: r.metaGramosTotal,
          },
        }),
      ),
    );
    return { ...(await this.findOne(tid, lotId, year)), roundedCount };
  }

  async remove(tenantId: string | null, lotId: string, year: number) {
    const tid = requireTenant(tenantId);
    const { count } = await this.prisma.lotProductionGoal.deleteMany({
      where: { tenantId: tid, lotId, year },
    });
    if (count === 0) throw new NotFoundException('No hay metas para ese lote y año');
    return { deleted: count };
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  /** El lote debe ser de la empresa, estar ACTIVO y tener número de plantas. */
  private async loadEligibleLot(tenantId: string, lotId: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, tenantId },
      select: { id: true, status: true, numeroPlantas: true, nombreLote: true },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    if (lot.status !== 'ACTIVE') throw new BadRequestException('El lote debe estar activo');
    if (!lot.numeroPlantas || lot.numeroPlantas <= 0) {
      throw new BadRequestException(
        `El lote ${lot.nombreLote} no tiene número de plantas; complétalo antes de definir metas`,
      );
    }
    return lot;
  }

  private toCreateData(
    tenantId: string,
    lotId: string,
    year: number,
    userId: string | null,
    r: GoalRowData,
  ): Prisma.LotProductionGoalUncheckedCreateInput {
    return {
      tenantId,
      lotId,
      year,
      month: r.month,
      metaGramosPlanta: r.metaGramosPlanta,
      plantasSnapshot: r.plantasSnapshot,
      metaGramosTotal: r.metaGramosTotal,
      createdBy: userId,
    };
  }

  private kg(g?: Prisma.Decimal | null): string | null {
    return g === undefined || g === null ? null : gramsToKgString(g);
  }

  private serializeSummary(rows: GoalDb[]) {
    const sums = sumGoalRows(rows);
    return {
      plantas: rows[0]?.plantasSnapshot ?? null,
      totalKgPlanta: gramsToKgString(sums.gramosPlanta),
      totalKgLote: gramsToKgString(sums.gramosLote),
      totalGramosPlanta: sums.gramosPlanta.toFixed(3),
      totalGramosLote: sums.gramosLote.toFixed(3),
      months: rows.map((r) => ({
        month: r.month,
        gramosPlanta: r.metaGramosPlanta.toFixed(3),
        kgPlanta: gramsToKgString(r.metaGramosPlanta),
        gramosLote: r.metaGramosTotal.toFixed(3),
        kgLote: gramsToKgString(r.metaGramosTotal),
      })),
    };
  }
}
