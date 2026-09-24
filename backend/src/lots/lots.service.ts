import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
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
    return this.prisma.lot.create({
      data: {
        tenantId: tid,
        farmId: dto.farmId,
        nombreLote: dto.nombreLote,
        variedad: dto.variedad,
        numeroPlantas: dto.numeroPlantas,
        status: dto.status,
      },
    });
  }

  async update(tenantId: string | null, id: string, dto: UpdateLotDto) {
    await this.findOne(tenantId, id);
    return this.prisma.lot.update({ where: { id }, data: dto });
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
}
