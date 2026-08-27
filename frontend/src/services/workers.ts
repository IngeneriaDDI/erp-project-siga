import { api } from '../lib/api';
import type { Status, Worker } from '../types';

export const listWorkers = (params?: { status?: Status; farmId?: string }) =>
  api.get<Worker[]>('/workers', { params }).then((r) => r.data);

export const createWorker = (body: {
  farmId: string;
  codigoInterno: string;
  nombre: string;
  documento?: string;
  areaTrabajo?: string;
}) => api.post<Worker>('/workers', body).then((r) => r.data);

export const updateWorker = (
  id: string,
  body: { codigoInterno?: string; nombre?: string; documento?: string; areaTrabajo?: string },
) => api.patch<Worker>(`/workers/${id}`, body).then((r) => r.data);

export const setWorkerStatus = (id: string, status: Status) =>
  api.patch<Worker>(`/workers/${id}/status`, { status }).then((r) => r.data);
