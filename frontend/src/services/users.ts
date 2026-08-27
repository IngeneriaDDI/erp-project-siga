import { api } from '../lib/api';
import type { OperationalContext, Role, Status, UserPermissions, UserRow } from '../types';

export const listUsers = (params?: { status?: Status; role?: Role }) =>
  api.get<UserRow[]>('/users', { params }).then((r) => r.data);

export const createUser = (body: {
  nombre: string;
  email: string;
  password: string;
  role: Role;
  operationalContext?: OperationalContext | null;
}) => api.post<UserRow>('/users', body).then((r) => r.data);

export const updateUser = (
  id: string,
  body: {
    nombre?: string;
    password?: string;
    role?: Role;
    operationalContext?: OperationalContext | null;
  },
) => api.patch<UserRow>(`/users/${id}`, body).then((r) => r.data);

export const setUserStatus = (id: string, status: Status) =>
  api.patch<UserRow>(`/users/${id}/status`, { status }).then((r) => r.data);

// ---- Permisos granulares por usuario ----
export const getUserPermissions = (id: string) =>
  api.get<UserPermissions>(`/users/${id}/permissions`).then((r) => r.data);

/** Reemplaza el override. Lista vacía => vuelve a la plantilla del rol. */
export const setUserPermissions = (id: string, permissions: string[]) =>
  api.put<UserPermissions>(`/users/${id}/permissions`, { permissions }).then((r) => r.data);
