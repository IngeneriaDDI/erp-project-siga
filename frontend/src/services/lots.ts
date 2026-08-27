import { api } from '../lib/api';
import type { Lot, Status } from '../types';

export const listLots = (params?: { status?: Status; farmId?: string }) =>
  api.get<Lot[]>('/lots', { params }).then((r) => r.data);

export const createLot = (body: {
  farmId: string;
  nombreLote: string;
  variedad: string;
  numeroPlantas?: number;
}) => api.post<Lot>('/lots', body).then((r) => r.data);

export const updateLot = (
  id: string,
  body: { nombreLote?: string; variedad?: string; numeroPlantas?: number },
) => api.patch<Lot>(`/lots/${id}`, body).then((r) => r.data);

export const setLotStatus = (id: string, status: Status) =>
  api.patch<Lot>(`/lots/${id}/status`, { status }).then((r) => r.data);
