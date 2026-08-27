import { api } from '../lib/api';
import type { Paginated, Remission, RemissionPreview, RemissionStatus } from '../types';

export interface RemissionFilters {
  fechaDesde?: string;
  fechaHasta?: string;
  farmId?: string;
  lotId?: string;
  status?: RemissionStatus;
  documentNumber?: string;
  page?: number;
  pageSize?: number;
}

export const previewRemission = (params: { date: string; lotId: string }) =>
  api.get<RemissionPreview>('/harvest-remissions/preview', { params }).then((r) => r.data);

export const createRemission = (body: { date: string; lotId: string }) =>
  api.post<Remission>('/harvest-remissions', body).then((r) => r.data);

export const listRemissions = (params?: RemissionFilters) =>
  api.get<Paginated<Remission>>('/harvest-remissions', { params }).then((r) => r.data);

export const getRemission = (id: string) =>
  api.get<Remission>(`/harvest-remissions/${id}`).then((r) => r.data);

export const receiveRemission = (id: string) =>
  api.post<Remission>(`/harvest-remissions/${id}/receive`).then((r) => r.data);

// Recepción/validación independiente por calidad (Lote + Calidad).
export const receiveRemissionDetail = (id: string, detailId: string) =>
  api.post<Remission>(`/harvest-remissions/${id}/details/${detailId}/receive`).then((r) => r.data);

export const rejectRemissionDetail = (id: string, detailId: string) =>
  api.post<Remission>(`/harvest-remissions/${id}/details/${detailId}/reject`).then((r) => r.data);
