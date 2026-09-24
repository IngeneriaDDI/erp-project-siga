import { isWorkerAllowedForFarm } from './workers-farm-filter.util';

describe('isWorkerAllowedForFarm', () => {
  const FARM_A = 'farm-a';
  const FARM_B = 'farm-b';

  describe('empresa que filtra por finca (comportamiento por defecto)', () => {
    it('permite un trabajador de la MISMA finca de la operación', () => {
      expect(isWorkerAllowedForFarm(true, FARM_A, FARM_A)).toBe(true);
    });

    it('RECHAZA un trabajador de OTRA finca', () => {
      expect(isWorkerAllowedForFarm(true, FARM_B, FARM_A)).toBe(false);
    });
  });

  describe('empresa que NO filtra por finca (personal compartido)', () => {
    it('permite un trabajador de otra finca', () => {
      expect(isWorkerAllowedForFarm(false, FARM_B, FARM_A)).toBe(true);
    });

    it('también permite un trabajador de la misma finca', () => {
      expect(isWorkerAllowedForFarm(false, FARM_A, FARM_A)).toBe(true);
    });
  });

  it('el default del sistema (true) preserva el comportamiento previo: filtra por finca', () => {
    // Simula el fallback usado en el servicio cuando el flag no está definido.
    const filteredByFarm = undefined ?? true;
    expect(isWorkerAllowedForFarm(filteredByFarm, FARM_B, FARM_A)).toBe(false);
    expect(isWorkerAllowedForFarm(filteredByFarm, FARM_A, FARM_A)).toBe(true);
  });

  it('aislamiento entre empresas: la config de una no cambia la decisión de la otra', () => {
    // Mismos datos (trabajador de FARM_B, operación en FARM_A) con configs distintas.
    const tenantAConfig = true; // Empresa A: filtra por finca
    const tenantBConfig = false; // Empresa B: comparte personal
    expect(isWorkerAllowedForFarm(tenantAConfig, FARM_B, FARM_A)).toBe(false);
    expect(isWorkerAllowedForFarm(tenantBConfig, FARM_B, FARM_A)).toBe(true);
  });
});
