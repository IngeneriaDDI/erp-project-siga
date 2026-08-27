import { aggregateHarvestRecords, ValidHarvestRecord } from './harvest-aggregation.util';

describe('aggregateHarvestRecords', () => {
  const records: ValidHarvestRecord[] = [
    { id: '1', lotId: 'L1', qualityId: 'Q1', pesoGramos: 10000, canastillas: 3 },
    { id: '2', lotId: 'L1', qualityId: 'Q2', pesoGramos: 5000, canastillas: 2 },
    { id: '3', lotId: 'L2', qualityId: 'Q1', pesoGramos: 8000, canastillas: 1 },
  ];

  it('suma los totales generales de peso y canastillas', () => {
    const agg = aggregateHarvestRecords(records);
    expect(agg.totalPesoGramos).toBe(23000);
    expect(agg.totalCanastillas).toBe(6);
    expect(agg.registrosIncluidos).toBe(3);
  });

  it('agrupa correctamente por calidad', () => {
    const agg = aggregateHarvestRecords(records);
    const q1 = agg.byQuality.find((q) => q.qualityId === 'Q1');
    const q2 = agg.byQuality.find((q) => q.qualityId === 'Q2');
    expect(q1?.pesoGramos).toBe(18000);
    expect(q1?.canastillas).toBe(4);
    expect(q2?.pesoGramos).toBe(5000);
    expect(q2?.canastillas).toBe(2);
  });

  it('agrupa correctamente por lote', () => {
    const agg = aggregateHarvestRecords(records);
    const l1 = agg.byLot.find((l) => l.lotId === 'L1');
    const l2 = agg.byLot.find((l) => l.lotId === 'L2');
    expect(l1?.pesoGramos).toBe(15000);
    expect(l1?.canastillas).toBe(5);
    expect(l2?.pesoGramos).toBe(8000);
    expect(l2?.canastillas).toBe(1);
  });

  it('la suma del detalle por calidad coincide con el total general', () => {
    const agg = aggregateHarvestRecords(records);
    const sumQ = agg.byQuality.reduce((a, q) => a + q.pesoGramos, 0);
    const sumL = agg.byLot.reduce((a, l) => a + l.pesoGramos, 0);
    expect(sumQ).toBe(agg.totalPesoGramos);
    expect(sumL).toBe(agg.totalPesoGramos);
  });

  it('maneja una lista vacía sin errores', () => {
    const agg = aggregateHarvestRecords([]);
    expect(agg.totalPesoGramos).toBe(0);
    expect(agg.registrosIncluidos).toBe(0);
    expect(agg.byQuality).toHaveLength(0);
    expect(agg.byLotQuality).toHaveLength(0);
  });

  it('agrupa por lote + calidad de forma independiente', () => {
    const agg = aggregateHarvestRecords(records);
    // L1/Q1, L1/Q2, L2/Q1 → 3 combinaciones (misma calidad en distinto lote no se mezcla)
    expect(agg.byLotQuality).toHaveLength(3);
    const l1q1 = agg.byLotQuality.find((x) => x.lotId === 'L1' && x.qualityId === 'Q1');
    const l1q2 = agg.byLotQuality.find((x) => x.lotId === 'L1' && x.qualityId === 'Q2');
    expect(l1q1?.pesoGramos).toBe(10000);
    expect(l1q1?.canastillas).toBe(3);
    expect(l1q2?.pesoGramos).toBe(5000);
    // La suma de lote+calidad coincide con el total general.
    const sum = agg.byLotQuality.reduce((a, x) => a + x.pesoGramos, 0);
    expect(sum).toBe(agg.totalPesoGramos);
  });
});
