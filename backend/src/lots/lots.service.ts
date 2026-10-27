import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { normalizeRef } from '../harvest-import/csv.util';
import { CreateLotDto, QueryLotDto, UpdateLotDto } from './dto/lot.dto';

@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string | null, query: QueryLotDto) {
    const tid = requireTenant(tenantId);
    const where: Prisma.LotWhereInput = {
      tenantId: tid,
      status: query.status,
      farmId: query.farmId,
    };
    return this.prisma.lot.findMany({ where, orderBy: { nombreLote: 'asc' } });
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const lot = await this.prisma.lot.findFirst({ where: { id, tenantId: tid } });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    return lot;
  }

  async create(tenantId: string | null, dto: CreateLotDto) {
    const tid = requireTenant(tenantId);
    await this.assertFarm(tid, dto.farmId);
    const variety = await this.resolveVariety(tid, dto.varietyId, dto.variedad);
    if (!variety) throw new BadRequestException('Debes indicar la variedad del lote');
    const productiveGroupId = await this.resolveGroup(tid, dto.productiveGroupId);
    return this.prisma.lot.create({
      data: {
        tenantId: tid,
        farmId: dto.farmId,
        nombreLote: dto.nombreLote,
        variedad: variety.nombre,
        varietyId: variety.id,
        productiveGroupId,
        fechaSiembra: dto.fechaSiembra ? new Date(dto.fechaSiembra) : undefined,
        numeroPlantas: dto.numeroPlantas,
        status: dto.status,
      },
    });
  }

  async update(tenantId: string | null, id: string, dto: UpdateLotDto) {
    const current = await this.findOne(tenantId, id);
    const data: Prisma.LotUncheckedUpdateInput = {};
    if (dto.nombreLote !== undefined) data.nombreLote = dto.nombreLote;
    if (dto.numeroPlantas !== undefined) data.numeroPlantas = dto.numeroPlantas;
    if (dto.fechaSiembra !== undefined) data.fechaSiembra = new Date(dto.fechaSiembra);

    if (dto.varietyId !== undefined || dto.variedad !== undefined) {
      const variety = await this.resolveVariety(
        current.tenantId,
        dto.varietyId,
        dto.variedad,
        current.varietyId,
      );
      if (variety) {
        data.varietyId = variety.id;
        data.variedad = variety.nombre;
      }
    }
    if (dto.productiveGroupId !== undefined) {
      data.productiveGroupId = await this.resolveGroup(
        current.tenantId,
        dto.productiveGroupId,
        current.productiveGroupId,
      );
    }
    return this.prisma.lot.update({ where: { id }, data });
  }

  async setStatus(tenantId: string | null, id: string, status: 'ACTIVE' | 'INACTIVE') {
    await this.findOne(tenantId, id);
    return this.prisma.lot.update({ where: { id }, data: { status } });
  }

  private async assertFarm(tenantId: string, farmId: string) {
    const farm = await this.prisma.farm.findFirst({ where: { id: farmId, tenantId } });
    if (!farm) {
      throw new BadRequestException('La finca no existe o no pertenece a tu tenant');
    }
  }

  /**
   * Resuelve la variedad del catálogo (siempre dentro del tenant).
   * - Por `varietyId`, o
   * - por texto, solo si coincide (sin tildes/mayúsculas) con una variedad existente.
   * Una variedad inactiva solo se acepta si es la que el lote ya tenía.
   */
  private async resolveVariety(
    tenantId: string,
    varietyId?: string,
    variedad?: string,
    currentVarietyId?: string | null,
  ) {
    if (varietyId) {
      const v = await this.prisma.variety.findFirst({ where: { id: varietyId, tenantId } });
      if (!v) throw new BadRequestException('La variedad no existe o no pertenece a tu tenant');
      if (v.status !== 'ACTIVE' && v.id !== currentVarietyId) {
        throw new BadRequestException('La variedad está inactiva');
      }
      return v;
    }
    if (variedad) {
      const all = await this.prisma.variety.findMany({ where: { tenantId } });
      const wanted = normalizeRef(variedad);
      const found = all.find((x) => normalizeRef(x.nombre) === wanted);
      if (!found) {
        throw new BadRequestException(
          `La variedad "${variedad}" no existe en el catálogo. Créala primero en Administración → Variedades.`,
        );
      }
      if (found.status !== 'ACTIVE' && found.id !== currentVarietyId) {
        throw new BadRequestException('La variedad está inactiva');
      }
      return found;
    }
    return null;
  }

  private async resolveGroup(
    tenantId: string,
    productiveGroupId?: string,
    currentGroupId?: string | null,
  ): Promise<string | undefined> {
    if (!productiveGroupId) return undefined;
    const g = await this.prisma.productiveGroup.findFirst({
      where: { id: productiveGroupId, tenantId },
    });
    if (!g) {
      throw new BadRequestException('El grupo productivo no existe o no pertenece a tu tenant');
    }
    if (g.status !== 'ACTIVE' && g.id !== currentGroupId) {
      throw new BadRequestException('El grupo productivo está inactivo');
    }
    return g.id;
  }
}
