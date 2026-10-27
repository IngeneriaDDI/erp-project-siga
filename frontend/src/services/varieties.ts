import { api } from '../lib/api';
import type { Status, Variety } from '../types';

export const listVarieties = (params?: { status?: Status }) =>
  api.get<Variety[]>('/varieties', { params }).then((r) => r.data);

export const createVariety = (body: { nombre: string; status?: Status }) =>
  api.post<Variety>('/varieties', body).then((r) => r.data);

export const updateVariety = (id: string, body: { nombre?: string }) =>
  api.patch<Variety>(`/varieties/${id}`, body).then((r) => r.data);

export const setVarietyStatus = (id: string, status: Status) =>
  api.patch<Variety>(`/varieties/${id}/status`, { status }).then((r) => r.data);
