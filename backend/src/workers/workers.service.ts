import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { CreateWorkerDto, QueryWorkerDto, UpdateWorkerDto } from './dto/worker.dto';

@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string | null, query: QueryWorkerDto) {
    const tid = requireTenant(tenantId);
    const where: Prisma.WorkerWhereInput = {
      tenantId: tid,
      status: query.status,
      farmId: query.farmId,
    };
    return this.prisma.worker.findMany({ where, orderBy: { codigoInterno: 'asc' } });
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const worker = await this.prisma.worker.findFirst({ where: { id, tenantId: tid } });
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    return worker;
  }

  async create(tenantId: string | null, dto: CreateWorkerDto) {
    const tid = requireTenant(tenantId);
    await this.assertFarm(tid, dto.farmId);
    return this.prisma.worker.create({
      data: {
        tenantId: tid,
        farmId: dto.farmId,
        codigoInterno: dto.codigoInterno,
        nombre: dto.nombre,
        documento: dto.documento,
        areaTrabajo: dto.areaTrabajo,
      },
    });
  }

  async update(tenantId: string | null, id: string, dto: UpdateWorkerDto) {
    await this.findOne(tenantId, id);
    return this.prisma.worker.update({ where: { id }, data: dto });
  }

  async setStatus(tenantId: string | null, id: string, status: 'ACTIVE' | 'INACTIVE') {
    await this.findOne(tenantId, id);
    return this.prisma.worker.update({ where: { id }, data: { status } });
  }

  private async assertFarm(tenantId: string, farmId: string) {
    const farm = await this.prisma.farm.findFirst({ where: { id: farmId, tenantId } });
    if (!farm) {
      throw new BadRequestException('La finca no existe o no pertenece a tu tenant');
    }
  }
}
