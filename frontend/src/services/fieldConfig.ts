import { api } from '../lib/api';
import type { FieldConfigEntry } from '../types';

export const getHarvestFieldConfig = () =>
  api.get<FieldConfigEntry[]>('/module-field-config/harvest').then((r) => r.data);

export const updateHarvestFieldConfig = (items: FieldConfigEntry[]) =>
  api
    .patch<FieldConfigEntry[]>('/module-field-config/harvest', { items })
    .then((r) => r.data);

// Ajustes de cosecha a nivel empresa (resuelto por el tenant actual).
export const getHarvestTenantSettings = () =>
  api
    .get<{ workersFilteredByFarm: boolean }>('/module-field-config/harvest-settings')
    .then((r) => r.data);
