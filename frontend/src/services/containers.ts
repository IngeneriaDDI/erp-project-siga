import { api } from '../lib/api';
import type { Container, Status } from '../types';

export const listContainers = (status?: Status) =>
  api.get<Container[]>('/containers', { params: { status } }).then((r) => r.data);

export const createContainer = (body: { nombre: string; pesoGramos: number; status?: Status }) =>
  api.post<Container>('/containers', body).then((r) => r.data);

export const updateContainer = (id: string, body: { nombre?: string; pesoGramos?: number }) =>
  api.patch<Container>(`/containers/${id}`, body).then((r) => r.data);

export const setContainerStatus = (id: string, status: Status) =>
  api.patch<Container>(`/containers/${id}/status`, { status }).then((r) => r.data);

export const setContainerDefault = (id: string, isDefault: boolean) =>
  api.patch<Container>(`/containers/${id}/default`, { isDefault }).then((r) => r.data);
