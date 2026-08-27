import { Injectable, NotFoundException } from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { CreateContainerDto, UpdateContainerDto } from './dto/container.dto';

@Injectable()
export class ContainersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string | null, status?: Status) {
    const tid = requireTenant(tenantId);
    return this.prisma.container.findMany({
      where: { tenantId: tid, status },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const container = await this.prisma.container.findFirst({ where: { id, tenantId: tid } });
    if (!container) throw new NotFoundException('Recipiente no encontrado');
    return container;
  }

  create(tenantId: string | null, dto: CreateContainerDto) {
    const tid = requireTenant(tenantId);
    return this.prisma.container.create({ data: { ...dto, tenantId: tid } });
  }

  async update(tenantId: string | null, id: string, dto: UpdateContainerDto) {
    await this.findOne(tenantId, id);
    return this.prisma.container.update({ where: { id }, data: dto });
  }

  async setStatus(tenantId: string | null, id: string, status: Status) {
    await this.findOne(tenantId, id);
    return this.prisma.container.update({ where: { id }, data: { status } });
  }
}
