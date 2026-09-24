import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(status?: Status) {
    return this.prisma.tenant.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({ data: dto });
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findOne(id);
    // Si se define una canastilla por defecto, debe existir y ser de esta empresa.
    if (dto.defaultContainerId) {
      const container = await this.prisma.container.findFirst({
        where: { id: dto.defaultContainerId, tenantId: id },
      });
      if (!container) {
        throw new BadRequestException('La canastilla por defecto no pertenece a esta empresa');
      }
    }
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async setStatus(id: string, status: Status) {
    await this.findOne(id);
    return this.prisma.tenant.update({ where: { id }, data: { status } });
  }
}
