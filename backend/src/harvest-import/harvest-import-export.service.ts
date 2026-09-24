import { Injectable } from '@nestjs/common';
import { WeightUnit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { toCsv } from './csv.util';
import { IMPORT_COLUMNS, TEMPLATE_COLUMNS } from './harvest-import.constants';

const C = IMPORT_COLUMNS;

function gramsToUnit(grams: number, unit: WeightUnit): number {
  return unit === 'KILOGRAMS' ? grams / 1000 : grams;
}

@Injectable()
export class HarvestImportExportService {
  constructor(private readonly prisma: PrismaService) {}

  private async weightUnit(tenantId: string): Promise<WeightUnit> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { weightUnit: true },
    });
    return t?.weightUnit ?? 'GRAMS';
  }

  /** Exporta los registros del tenant en el MISMO formato del importador. */
  async exportRecords(tenantId: string | null, limit = 100000): Promise<string> {
    const tid = requireTenant(tenantId);
    const unit = await this.weightUnit(tid);
    const records = await this.prisma.harvestRecord.findMany({
      where: { tenantId: tid, status: 'ACTIVE' },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        farm: { select: { nombre: true } },
        worker: { select: { codigoInterno: true, nombre: true } },
        lot: { select: { nombreLote: true } },
        quality: { select: { nombre: true } },
        containers: { include: { container: { select: { nombre: true } } } },
      },
    });

    const rows: Record<string, unknown>[] = [];
    for (const r of records) {
      const base: Record<string, unknown> = {
        [C.fecha]: r.fecha.toISOString().slice(0, 10),
        [C.finca]: r.farm.nombre,
        [C.lote]: r.lot.nombreLote,
        [C.trabajadorCodigo]: r.worker.codigoInterno,
        [C.trabajadorNombre]: r.worker.nombre,
        [C.calidad]: r.quality.nombre,
        [C.pesoBruto]: gramsToUnit(r.pesoBrutoGramos, unit),
        [C.pesoNeto]: gramsToUnit(r.gramosCosechados, unit),
        [C.primeraFila]: r.primeraFila ?? '',
        [C.ultimaFila]: r.ultimaFila ?? '',
        [C.estadoRoja]: r.estadoRoja === null ? '' : r.estadoRoja ? 'si' : 'no',
        [C.observaciones]: r.observaciones ?? '',
        // external_id = id del registro → round-trip estable y agrupa multi-canastilla.
        [C.externalId]: r.id,
      };
      const lines = r.containers.length > 0 ? r.containers : [null];
      for (const line of lines) {
        rows.push({
          ...base,
          [C.canastilla]: line?.container.nombre ?? '',
          [C.cantidadCanastillas]: line?.unidades ?? '',
        });
      }
    }
    return toCsv(TEMPLATE_COLUMNS, rows);
  }

  async referencesWorkers(tenantId: string | null): Promise<string> {
    const tid = requireTenant(tenantId);
    const workers = await this.prisma.worker.findMany({
      where: { tenantId: tid },
      orderBy: { codigoInterno: 'asc' },
      include: { farm: { select: { nombre: true } } },
    });
    const rows = workers.map((w) => ({
      codigo: w.codigoInterno,
      nombre: w.nombre,
      finca: w.farm.nombre,
      estado: w.status,
    }));
    return toCsv(['codigo', 'nombre', 'finca', 'estado'], rows);
  }

  async referencesLots(tenantId: string | null): Promise<string> {
    const tid = requireTenant(tenantId);
    const lots = await this.prisma.lot.findMany({
      where: { tenantId: tid },
      orderBy: { nombreLote: 'asc' },
      include: { farm: { select: { nombre: true } } },
    });
    const rows = lots.map((l) => ({
      codigo: l.nombreLote,
      finca: l.farm.nombre,
      variedad: l.variedad,
      estado: l.status,
    }));
    return toCsv(['codigo', 'finca', 'variedad', 'estado'], rows);
  }

  async referencesQualities(tenantId: string | null): Promise<string> {
    const tid = requireTenant(tenantId);
    const qualities = await this.prisma.quality.findMany({
      where: { tenantId: tid },
      orderBy: { nombre: 'asc' },
    });
    return toCsv(
      ['nombre', 'estado'],
      qualities.map((q) => ({ nombre: q.nombre, estado: q.status })),
    );
  }

  async referencesContainers(tenantId: string | null): Promise<string> {
    const tid = requireTenant(tenantId);
    const unit = await this.weightUnit(tid);
    const containers = await this.prisma.container.findMany({
      where: { tenantId: tid },
      orderBy: { nombre: 'asc' },
    });
    const rows = containers.map((c) => ({
      nombre: c.nombre,
      peso: gramsToUnit(c.pesoGramos, unit),
      por_defecto: c.isDefault ? 'si' : 'no',
      estado: c.status,
    }));
    return toCsv(['nombre', 'peso', 'por_defecto', 'estado'], rows);
  }
}
