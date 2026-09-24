import { Injectable } from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRef } from './csv.util';
import {
  ContainerEntry,
  FarmEntry,
  LotEntry,
  QualityEntry,
  ReferenceDictionaries,
  WorkerEntry,
} from './harvest-import.types';

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

export function lotKey(farmId: string, nombreLote: string): string {
  return `${farmId} ${normalizeRef(nombreLote)}`;
}

/**
 * Precarga en memoria todos los diccionarios de referencia del tenant.
 * Se ejecuta UNA sola vez por importación (evita N+1). Filtra SIEMPRE por tenant.
 */
@Injectable()
export class ReferenceDictionaryService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, includeInactive: boolean): Promise<ReferenceDictionaries> {
    // Si includeInactive, no filtramos por status; si no, solo ACTIVE.
    const statusFilter = includeInactive ? undefined : Status.ACTIVE;

    const [tenant, farms, qualities, containers, workers, lots] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { weightUnit: true, workersFilteredByFarm: true },
      }),
      this.prisma.farm.findMany({
        where: { tenantId, status: statusFilter },
        select: { id: true, nombre: true, status: true },
      }),
      this.prisma.quality.findMany({
        where: { tenantId, status: statusFilter },
        select: { id: true, nombre: true, status: true },
      }),
      this.prisma.container.findMany({
        where: { tenantId, status: statusFilter },
        select: { id: true, nombre: true, status: true, pesoGramos: true, isDefault: true },
      }),
      this.prisma.worker.findMany({
        where: { tenantId, status: statusFilter },
        select: { id: true, codigoInterno: true, nombre: true, farmId: true, status: true },
      }),
      this.prisma.lot.findMany({
        where: { tenantId, status: statusFilter },
        select: { id: true, nombreLote: true, farmId: true, variedad: true, status: true },
      }),
    ]);

    const farmByName = new Map<string, FarmEntry[]>();
    for (const f of farms) {
      push(farmByName, normalizeRef(f.nombre), { id: f.id, status: f.status, nombre: f.nombre });
    }
    const qualityByName = new Map<string, QualityEntry[]>();
    for (const q of qualities) {
      push(qualityByName, normalizeRef(q.nombre), {
        id: q.id,
        status: q.status,
        nombre: q.nombre,
      });
    }
    const containerByName = new Map<string, ContainerEntry[]>();
    let defaultContainer: ContainerEntry | null = null;
    for (const c of containers) {
      const entry: ContainerEntry = {
        id: c.id,
        status: c.status,
        nombre: c.nombre,
        pesoGramos: c.pesoGramos,
      };
      push(containerByName, normalizeRef(c.nombre), entry);
      if (c.isDefault) defaultContainer = entry;
    }
    const workerByCode = new Map<string, WorkerEntry[]>();
    for (const w of workers) {
      push(workerByCode, normalizeRef(w.codigoInterno), {
        id: w.id,
        status: w.status,
        codigo: w.codigoInterno,
        nombre: w.nombre,
        farmId: w.farmId,
      });
    }
    const lotByFarmName = new Map<string, LotEntry[]>();
    for (const l of lots) {
      push(lotByFarmName, lotKey(l.farmId, l.nombreLote), {
        id: l.id,
        status: l.status,
        nombreLote: l.nombreLote,
        farmId: l.farmId,
        variedad: l.variedad,
      });
    }

    return {
      farmByName,
      qualityByName,
      containerByName,
      workerByCode,
      lotByFarmName,
      defaultContainer,
      weightUnit: tenant?.weightUnit ?? 'GRAMS',
      workersFilteredByFarm: tenant?.workersFilteredByFarm ?? true,
    };
  }
}
