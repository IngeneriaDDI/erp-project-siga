import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  aggregateHarvestRecords,
  Aggregation,
  LotGroup,
  QualityGroup,
  ValidHarvestRecord,
} from './harvest-aggregation.util';

// Re-export para no cambiar los imports de los servicios que ya lo usan.
export { aggregateHarvestRecords };
export type { Aggregation, LotGroup, QualityGroup, ValidHarvestRecord };

@Injectable()
export class HarvestAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Carga registros ACTIVE del tenant para la fecha (+ lote o finca).
   * Bloquea si hay registros incompletos/inconsistentes.
   */
  async loadValidRecords(
    tenantId: string,
    filters: { fecha: Date; lotId?: string; farmId?: string },
  ): Promise<ValidHarvestRecord[]> {
    const records = await this.prisma.harvestRecord.findMany({
      where: {
        tenantId,
        fecha: filters.fecha,
        lotId: filters.lotId,
        farmId: filters.farmId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        lotId: true,
        qualityId: true,
        gramosCosechados: true,
        containers: { select: { unidades: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const invalid: string[] = [];
    const valid: ValidHarvestRecord[] = records.map((r) => {
      const canastillas = r.containers.reduce((acc, c) => acc + c.unidades, 0);
      if (r.gramosCosechados <= 0 || !r.qualityId || canastillas <= 0) {
        invalid.push(r.id);
      }
      return {
        id: r.id,
        lotId: r.lotId,
        qualityId: r.qualityId,
        pesoGramos: r.gramosCosechados,
        canastillas,
      };
    });

    if (invalid.length) {
      throw new BadRequestException(
        `Existen registros de cosecha incompletos o inconsistentes y no se puede generar el documento: ${invalid.join(', ')}`,
      );
    }
    return valid;
  }

  /** Devuelve mapas id→nombre para calidades y lotes (para las vistas previas). */
  async resolveNames(tenantId: string, qualityIds: string[], lotIds: string[]) {
    const [qualities, lots] = await Promise.all([
      this.prisma.quality.findMany({
        where: { id: { in: qualityIds }, tenantId },
        select: { id: true, nombre: true },
      }),
      this.prisma.lot.findMany({
        where: { id: { in: lotIds }, tenantId },
        select: { id: true, nombreLote: true },
      }),
    ]);
    return {
      qualityName: new Map(qualities.map((q) => [q.id, q.nombre])),
      lotName: new Map(lots.map((l) => [l.id, l.nombreLote])),
    };
  }

  /** Valida que el lote pertenezca al tenant y devuelve su finca. */
  async assertLot(tenantId: string, lotId: string) {
    const lot = await this.prisma.lot.findFirst({ where: { id: lotId, tenantId } });
    if (!lot) throw new NotFoundException('Lote no encontrado o de otra empresa');
    return lot;
  }

  /** Valida que la finca pertenezca al tenant. */
  async assertFarm(tenantId: string, farmId: string) {
    const farm = await this.prisma.farm.findFirst({ where: { id: farmId, tenantId } });
    if (!farm) throw new NotFoundException('Finca no encontrada o de otra empresa');
    return farm;
  }
}
