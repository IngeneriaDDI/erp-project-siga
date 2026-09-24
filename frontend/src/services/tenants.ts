import { api } from '../lib/api';
import type { IdentityStrategy, Status, Tenant, WeightUnit } from '../types';

export const listTenants = (status?: Status) =>
  api.get<Tenant[]>('/tenants', { params: { status } }).then((r) => r.data);

export const getTenant = (id: string) =>
  api.get<Tenant>(`/tenants/${id}`).then((r) => r.data);

export const createTenant = (body: { nombre: string; nit?: string }) =>
  api.post<Tenant>('/tenants', body).then((r) => r.data);

export const updateTenant = (
  id: string,
  body: {
    nombre?: string;
    nit?: string;
    weightUnit?: WeightUnit;
    identityStrategy?: IdentityStrategy;
    defaultContainerId?: string | null;
    workersFilteredByFarm?: boolean;
  },
) => api.patch<Tenant>(`/tenants/${id}`, body).then((r) => r.data);

export const setTenantStatus = (id: string, status: Status) =>
  api.patch<Tenant>(`/tenants/${id}/status`, { status }).then((r) => r.data);
