import { api } from '../lib/api';
import type { Farm, Status } from '../types';

export const listFarms = (status?: Status) =>
  api.get<Farm[]>('/farms', { params: { status } }).then((r) => r.data);

export const createFarm = (body: { nombre: string; ubicacion?: string }) =>
  api.post<Farm>('/farms', body).then((r) => r.data);

export const updateFarm = (id: string, body: { nombre?: string; ubicacion?: string }) =>
  api.patch<Farm>(`/farms/${id}`, body).then((r) => r.data);

export const setFarmStatus = (id: string, status: Status) =>
  api.patch<Farm>(`/farms/${id}/status`, { status }).then((r) => r.data);
