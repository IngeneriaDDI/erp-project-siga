import { api } from '../lib/api';
import type { HarvestRecord, HarvestStatus, Paginated } from '../types';

export interface HarvestContainerInput {
  containerId: string;
  unidades: number;
}

export interface HarvestSaveInput {
  farmId: string;
  fecha: string;
  workerId: string;
  qualityId: string;
  lotId: string;
  pesoBrutoGramos: number;
  containers: HarvestContainerInput[];
  primeraFila?: string;
  ultimaFila?: string;
  estadoRoja?: boolean;
  observaciones?: string;
}

export interface HarvestFilters {
  fechaDesde?: string;
  fechaHasta?: string;
  farmId?: string;
  workerId?: string;
  lotId?: string;
  qualityId?: string;
  status?: HarvestStatus;
  page?: number;
  pageSize?: number;
}

export const listHarvest = (params?: HarvestFilters) =>
  api.get<Paginated<HarvestRecord>>('/harvest-records', { params }).then((r) => r.data);

export const getHarvest = (id: string) =>
  api.get<HarvestRecord>(`/harvest-records/${id}`).then((r) => r.data);

export const createHarvest = (body: HarvestSaveInput) =>
  api.post<HarvestRecord>('/harvest-records', body).then((r) => r.data);

export const updateHarvest = (id: string, body: HarvestSaveInput) =>
  api.patch<HarvestRecord>(`/harvest-records/${id}`, body).then((r) => r.data);

export const cancelHarvest = (id: string) =>
  api.patch<HarvestRecord>(`/harvest-records/${id}/cancel`).then((r) => r.data);
