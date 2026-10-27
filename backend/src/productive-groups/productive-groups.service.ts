import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { normalizeRef } from '../harvest-import/csv.util';
import {
  CreateProductiveGroupDto,
  QueryProductiveGroupDto,
  UpdateProductiveGroupDto,
} from './dto/productive-group.dto';

@Injectable()
export class ProductiveGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string | null, query: QueryProductiveGroupDto) {
    const tid = requireTenant(tenantId);
    const where: Prisma.ProductiveGroupWhereInput = { tenantId: tid, status: query.status };
    return this.prisma.productiveGroup.findMany({ where, orderBy: { nombre: 'asc' } });
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const group = await this.prisma.productiveGroup.findFirst({ where: { id, tenantId: tid } });
    if (!group) throw new NotFoundException('Grupo productivo no encontrado');
    return group;
  }

  async create(tenantId: string | null, dto: CreateProductiveGroupDto) {
    const tid = requireTenant(tenantId);
    const nombre = dto.nombre.trim();
    await this.assertUniqueName(tid, nombre);
    return this.prisma.productiveGroup.create({
      data: { tenantId: tid, nombre, status: dto.status },
    });
  }

  async update(tenantId: string | null, id: string, dto: UpdateProductiveGroupDto) {
    const current = await this.findOne(tenantId, id);
    if (dto.nombre === undefined) return current;
    const nombre = dto.nombre.trim();
    await this.assertUniqueName(current.tenantId, nombre, id);
    return this.prisma.productiveGroup.update({ where: { id }, data: { nombre } });
  }

  async setStatus(tenantId: string | null, id: string, status: Status) {
    await this.findOne(tenantId, id);
    return this.prisma.productiveGroup.update({ where: { id }, data: { status } });
  }

  /** Nombre único por empresa sin distinguir mayúsculas, tildes ni espacios. */
  private async assertUniqueName(tenantId: string, nombre: string, exceptId?: string) {
    const all = await this.prisma.productiveGroup.findMany({
      where: { tenantId },
      select: { id: true, nombre: true },
    });
    const wanted = normalizeRef(nombre);
    if (all.some((g) => g.id !== exceptId && normalizeRef(g.nombre) === wanted)) {
      throw new ConflictException('Ya existe un grupo productivo con ese nombre en la empresa');
    }
  }
}
