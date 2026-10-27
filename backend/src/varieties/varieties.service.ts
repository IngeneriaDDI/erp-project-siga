import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { normalizeRef } from '../harvest-import/csv.util';
import { CreateVarietyDto, QueryVarietyDto, UpdateVarietyDto } from './dto/variety.dto';

@Injectable()
export class VarietiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string | null, query: QueryVarietyDto) {
    const tid = requireTenant(tenantId);
    const where: Prisma.VarietyWhereInput = { tenantId: tid, status: query.status };
    return this.prisma.variety.findMany({ where, orderBy: { nombre: 'asc' } });
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const variety = await this.prisma.variety.findFirst({ where: { id, tenantId: tid } });
    if (!variety) throw new NotFoundException('Variedad no encontrada');
    return variety;
  }

  async create(tenantId: string | null, dto: CreateVarietyDto) {
    const tid = requireTenant(tenantId);
    const nombre = dto.nombre.trim();
    await this.assertUniqueName(tid, nombre);
    return this.prisma.variety.create({
      data: { tenantId: tid, nombre, status: dto.status },
    });
  }

  async update(tenantId: string | null, id: string, dto: UpdateVarietyDto) {
    const current = await this.findOne(tenantId, id);
    if (dto.nombre === undefined) return current;
    const nombre = dto.nombre.trim();
    await this.assertUniqueName(current.tenantId, nombre, id);
    // Mantiene sincronizado el texto de la variedad en los lotes vinculados.
    // Los registros de cosecha ya creados conservan su snapshot histórico.
    const [updated] = await this.prisma.$transaction([
      this.prisma.variety.update({ where: { id }, data: { nombre } }),
      this.prisma.lot.updateMany({ where: { varietyId: id }, data: { variedad: nombre } }),
    ]);
    return updated;
  }

  async setStatus(tenantId: string | null, id: string, status: Status) {
    await this.findOne(tenantId, id);
    return this.prisma.variety.update({ where: { id }, data: { status } });
  }

  /** Nombre único por empresa sin distinguir mayúsculas, tildes ni espacios. */
  private async assertUniqueName(tenantId: string, nombre: string, exceptId?: string) {
    const all = await this.prisma.variety.findMany({
      where: { tenantId },
      select: { id: true, nombre: true },
    });
    const wanted = normalizeRef(nombre);
    if (all.some((v) => v.id !== exceptId && normalizeRef(v.nombre) === wanted)) {
      throw new ConflictException('Ya existe una variedad con ese nombre en la empresa');
    }
  }
}
