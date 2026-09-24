import { api } from '../lib/api';
import type { Quality, Status } from '../types';

export const listQualities = (params?: { status?: Status; visibleEnCosecha?: boolean }) =>
  api.get<Quality[]>('/qualities', { params }).then((r) => r.data);

export const createQuality = (body: {
  nombre: string;
  descripcion?: string;
  visibleEnCosecha?: boolean;
  status?: Status;
}) => api.post<Quality>('/qualities', body).then((r) => r.data);

export const updateQuality = (
  id: string,
  body: { nombre?: string; descripcion?: string; visibleEnCosecha?: boolean },
) => api.patch<Quality>(`/qualities/${id}`, body).then((r) => r.data);

export const setQualityStatus = (id: string, status: Status) =>
  api.patch<Quality>(`/qualities/${id}/status`, { status }).then((r) => r.data);
