import { api } from '../lib/api';
import type { ProductiveGroup, Status } from '../types';

export const listProductiveGroups = (params?: { status?: Status }) =>
  api.get<ProductiveGroup[]>('/productive-groups', { params }).then((r) => r.data);

export const createProductiveGroup = (body: { nombre: string; status?: Status }) =>
  api.post<ProductiveGroup>('/productive-groups', body).then((r) => r.data);

export const updateProductiveGroup = (id: string, body: { nombre?: string }) =>
  api.patch<ProductiveGroup>(`/productive-groups/${id}`, body).then((r) => r.data);

export const setProductiveGroupStatus = (id: string, status: Status) =>
  api.patch<ProductiveGroup>(`/productive-groups/${id}/status`, { status }).then((r) => r.data);
