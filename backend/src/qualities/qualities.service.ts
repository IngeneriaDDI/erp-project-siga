import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import {
  CreateQualityDto,
  QueryQualityDto,
  UpdateQualityDto,
} from './dto/quality.dto';

@Injectable()
export class QualitiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string | null, query: QueryQualityDto) {
    const tid = requireTenant(tenantId);
    const where: Prisma.QualityWhereInput = {
      tenantId: tid,
      status: query.status,
      visibleEnCosecha: query.visibleEnCosecha,
    };
    return this.prisma.quality.findMany({ where, orderBy: { nombre: 'asc' } });
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const quality = await this.prisma.quality.findFirst({ where: { id, tenantId: tid } });
    if (!quality) throw new NotFoundException('Calidad no encontrada');
    return quality;
  }

  create(tenantId: string | null, dto: CreateQualityDto) {
    const tid = requireTenant(tenantId);
    return this.prisma.quality.create({ data: { ...dto, tenantId: tid } });
  }

  async update(tenantId: string | null, id: string, dto: UpdateQualityDto) {
    await this.findOne(tenantId, id);
    return this.prisma.quality.update({ where: { id }, data: dto });
  }

  async setStatus(tenantId: string | null, id: string, status: Status) {
    await this.findOne(tenantId, id);
    return this.prisma.quality.update({ where: { id }, data: { status } });
  }
}
