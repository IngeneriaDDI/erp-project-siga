import { Prisma } from '@prisma/client';
import { gramsToKgString, parseKgToGrams, totalGrams } from './goal-units.util';
import { buildGoalRows } from './goal-rows.util';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('parseKgToGrams (kg → g sin floats)', () => {
  it('convierte kg a gramos con 3 decimales', () => {
    expect(parseKgToGrams('1.5').grams?.toFixed(3)).toBe('1500.000');
    expect(parseKgToGrams('0.359').grams?.toFixed(3)).toBe('359.000');
    expect(parseKgToGrams('0.000001').grams?.toFixed(3)).toBe('0.001');
  });

  it('acepta coma o punto decimal', () => {
    expect(parseKgToGrams('0,25').grams?.toFixed(3)).toBe('250.000');
    expect(parseKgToGrams('0.25').grams?.toFixed(3)).toBe('250.000');
  });

  it('0 es válido', () => {
    const r = parseKgToGrams('0');
    expect(r.grams?.toFixed(3)).toBe('0.000');
    expect(r.rounded).toBe(false);
  });

  it('redondea half-up a 3 decimales en gramos y lo reporta', () => {
    // 0.3590243902439024 kg = 359.0243902439024 g → 359.024
    const r = parseKgToGrams('0.3590243902439024');
    expect(r.grams?.toFixed(3)).toBe('359.024');
    expect(r.rounded).toBe(true);
    // 0.0000005 kg = 0.0005 g → 0.001 (half-up)
    expect(parseKgToGrams('0.0000005').grams?.toFixed(3)).toBe('0.001');
  });

  it('no marca redondeo cuando el valor es exacto', () => {
    expect(parseKgToGrams('0.359').rounded).toBe(false);
  });

  it('rechaza negativos, texto y vacíos', () => {
    for (const bad of ['-1', 'abc', '', '1,2,3', '1e3', ' ']) {
      expect(parseKgToGrams(bad).grams).toBeNull();
    }
    expect(parseKgToGrams(null).grams).toBeNull();
  });

  it('no sufre errores de punto flotante (0.1 + 0.2)', () => {
    const a = parseKgToGrams('0.1').grams as Prisma.Decimal;
    const b = parseKgToGrams('0.2').grams as Prisma.Decimal;
    expect(a.plus(b).toFixed(3)).toBe('300.000');
  });
});

describe('gramsToKgString / totalGrams', () => {
  it('gramos → kg sin ceros sobrantes', () => {
    expect(gramsToKgString('1500.000')).toBe('1.5');
    expect(gramsToKgString('359.024')).toBe('0.359024');
    expect(gramsToKgString('0.000')).toBe('0');
    expect(gramsToKgString('100000.000')).toBe('100');
  });

  it('total del lote = plantas × g/planta', () => {
    expect(totalGrams(935, D('359.024')).toFixed(3)).toBe('335687.440');
    expect(totalGrams(1000, D('0.001')).toFixed(3)).toBe('1.000');
  });
});

describe('buildGoalRows', () => {
  const twelve = (v: string | number) =>
    Array.from({ length: 12 }, (_, i) => ({ month: i + 1, kgPerPlant: v }));

  it('construye 12 filas con snapshot de plantas y total', () => {
    const { rows, roundedCount } = buildGoalRows(100, twelve('0.5'));
    expect(rows).toHaveLength(12);
    expect(rows[0].plantasSnapshot).toBe(100);
    expect(rows[0].metaGramosPlanta.toFixed(3)).toBe('500.000');
    expect(rows[0].metaGramosTotal.toFixed(3)).toBe('50000.000');
    expect(roundedCount).toBe(0);
  });

  it('totales anuales: suma de 12 meses', () => {
    const { rows } = buildGoalRows(10, twelve('0.25'));
    const perPlant = rows.reduce((a, r) => a.plus(r.metaGramosPlanta), D(0));
    const lot = rows.reduce((a, r) => a.plus(r.metaGramosTotal), D(0));
    expect(perPlant.toFixed(3)).toBe('3000.000'); // 3 kg/planta al año
    expect(lot.toFixed(3)).toBe('30000.000'); // 30 kg el lote
  });

  it('permite 0 en algún mes', () => {
    const m = twelve('0.5');
    m[3].kgPerPlant = '0';
    expect(() => buildGoalRows(10, m)).not.toThrow();
  });

  it('exige los 12 meses', () => {
    expect(() => buildGoalRows(10, twelve('1').slice(0, 11))).toThrow();
  });

  it('rechaza meses repetidos o fuera de rango', () => {
    const dup = twelve('1');
    dup[11].month = 1;
    expect(() => buildGoalRows(10, dup)).toThrow();
    const bad = twelve('1');
    bad[0].month = 13;
    expect(() => buildGoalRows(10, bad)).toThrow();
  });

  it('rechaza valores inválidos y cuenta los redondeados', () => {
    const bad = twelve('1');
    bad[2].kgPerPlant = '-3';
    expect(() => buildGoalRows(10, bad)).toThrow();
    const r = twelve('1');
    r[0].kgPerPlant = '0.3590243902439024';
    expect(buildGoalRows(10, r).roundedCount).toBe(1);
  });
});
