// Lógica pura de agregación (sin dependencias de base de datos → testeable).

export interface ValidHarvestRecord {
  id: string;
  lotId: string;
  qualityId: string;
  pesoGramos: number; // gramos_cosechados (neto)
  canastillas: number; // suma de unidades de recipientes del registro
}

export interface QualityGroup {
  qualityId: string;
  pesoGramos: number;
  canastillas: number;
}
export interface LotGroup {
  lotId: string;
  pesoGramos: number;
  canastillas: number;
}
export interface LotQualityGroup {
  lotId: string;
  qualityId: string;
  pesoGramos: number;
  canastillas: number;
}
export interface Aggregation {
  totalPesoGramos: number;
  totalCanastillas: number;
  registrosIncluidos: number;
  byQuality: QualityGroup[];
  byLot: LotGroup[];
  byLotQuality: LotQualityGroup[];
  lotIds: string[];
}

/**
 * Agrega registros de cosecha. canastillas = suma de unidades de recipientes
 * (definición de negocio confirmada).
 */
export function aggregateHarvestRecords(records: ValidHarvestRecord[]): Aggregation {
  const byQuality = new Map<string, QualityGroup>();
  const byLot = new Map<string, LotGroup>();
  const byLotQuality = new Map<string, LotQualityGroup>();
  let totalPesoGramos = 0;
  let totalCanastillas = 0;

  for (const r of records) {
    totalPesoGramos += r.pesoGramos;
    totalCanastillas += r.canastillas;

    const q = byQuality.get(r.qualityId) ?? { qualityId: r.qualityId, pesoGramos: 0, canastillas: 0 };
    q.pesoGramos += r.pesoGramos;
    q.canastillas += r.canastillas;
    byQuality.set(r.qualityId, q);

    const l = byLot.get(r.lotId) ?? { lotId: r.lotId, pesoGramos: 0, canastillas: 0 };
    l.pesoGramos += r.pesoGramos;
    l.canastillas += r.canastillas;
    byLot.set(r.lotId, l);

    // Granularidad base: Lote + Calidad.
    const lqKey = `${r.lotId}|${r.qualityId}`;
    const lq = byLotQuality.get(lqKey) ?? {
      lotId: r.lotId,
      qualityId: r.qualityId,
      pesoGramos: 0,
      canastillas: 0,
    };
    lq.pesoGramos += r.pesoGramos;
    lq.canastillas += r.canastillas;
    byLotQuality.set(lqKey, lq);
  }

  return {
    totalPesoGramos,
    totalCanastillas,
    registrosIncluidos: records.length,
    byQuality: [...byQuality.values()],
    byLot: [...byLot.values()],
    byLotQuality: [...byLotQuality.values()],
    lotIds: [...byLot.keys()],
  };
}
