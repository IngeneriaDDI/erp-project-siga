import { Injectable, NotFoundException } from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { CreateFarmDto, UpdateFarmDto } from './dto/farm.dto';

@Injectable()
export class FarmsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string | null, status?: Status) {
    const tid = requireTenant(tenantId);
    return this.prisma.farm.findMany({
      where: { tenantId: tid, status },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const farm = await this.prisma.farm.findFirst({ where: { id, tenantId: tid } });
    if (!farm) throw new NotFoundException('Finca no encontrada');
    return farm;
  }

  create(tenantId: string | null, dto: CreateFarmDto) {
    const tid = requireTenant(tenantId);
    return this.prisma.farm.create({ data: { ...dto, tenantId: tid } });
  }

  async update(tenantId: string | null, id: string, dto: UpdateFarmDto) {
    await this.findOne(tenantId, id); // valida pertenencia al tenant
    return this.prisma.farm.update({ where: { id }, data: dto });
  }

  async setStatus(tenantId: string | null, id: string, status: Status) {
    await this.findOne(tenantId, id);
    return this.prisma.farm.update({ where: { id }, data: { status } });
  }
}
