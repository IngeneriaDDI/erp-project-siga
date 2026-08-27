import { api } from '../lib/api';
import type { FieldConfigEntry } from '../types';

export const getHarvestFieldConfig = () =>
  api.get<FieldConfigEntry[]>('/module-field-config/harvest').then((r) => r.data);

export const updateHarvestFieldConfig = (items: FieldConfigEntry[]) =>
  api
    .patch<FieldConfigEntry[]>('/module-field-config/harvest', { items })
    .then((r) => r.data);
