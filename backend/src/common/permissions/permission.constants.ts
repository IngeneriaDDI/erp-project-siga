import { Role } from '@prisma/client';

// ==========================================================================
// Catálogo de permisos granulares (evolución del RBAC por rol).
// Los roles siguen existiendo como PLANTILLAS de permisos.
// ==========================================================================
export const PERMISSIONS = {
  HARVEST_RECORDS_VIEW: 'harvest.records.view',
  HARVEST_RECORDS_CREATE: 'harvest.records.create',
  HARVEST_RECORDS_UPDATE: 'harvest.records.update',

  HARVEST_REMISSIONS_VIEW: 'harvest.remissions.view',
  HARVEST_REMISSIONS_CREATE: 'harvest.remissions.create',

  HARVEST_PRODUCTION_ORDERS_VIEW: 'harvest.production_orders.view',
  HARVEST_PRODUCTION_ORDERS_CREATE: 'harvest.production_orders.create',

  POSTHARVEST_REMISSIONS_VIEW: 'postharvest.remissions.view',
  POSTHARVEST_REMISSIONS_APPROVE: 'postharvest.remissions.approve',
  POSTHARVEST_REMISSIONS_REJECT: 'postharvest.remissions.reject',

  POSTHARVEST_PRODUCTION_ORDERS_VIEW: 'postharvest.production_orders.view',
  POSTHARVEST_PRODUCTION_ORDERS_APPROVE: 'postharvest.production_orders.approve',
  POSTHARVEST_PRODUCTION_ORDERS_REJECT: 'postharvest.production_orders.reject',

  ADMIN_WORKERS_VIEW: 'admin.workers.view',
  ADMIN_WORKERS_MANAGE: 'admin.workers.manage',
  ADMIN_LOTS_VIEW: 'admin.lots.view',
  ADMIN_LOTS_MANAGE: 'admin.lots.manage',
  ADMIN_FARMS_VIEW: 'admin.farms.view',
  ADMIN_FARMS_MANAGE: 'admin.farms.manage',
  ADMIN_CONTAINERS_VIEW: 'admin.containers.view',
  ADMIN_CONTAINERS_MANAGE: 'admin.containers.manage',
  ADMIN_QUALITIES_VIEW: 'admin.qualities.view',
  ADMIN_QUALITIES_MANAGE: 'admin.qualities.manage',

  OPERATIONAL_ASSIGNMENTS_MANAGE: 'operational.assignments.manage',

  // Ámbito plataforma / super admin
  ADMIN_USERS_MANAGE: 'admin.users.manage',
  CONFIG_HARVEST_MANAGE: 'config.harvest.manage',
  CONFIG_SEQUENCES_MANAGE: 'config.sequences.manage',
  CONFIG_IDENTITY_MANAGE: 'config.identity.manage',
  PLATFORM_TENANTS_MANAGE: 'platform.tenants.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS);

const P = PERMISSIONS;

// Plantillas por rol (set por defecto cuando el usuario no tiene override).
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN_TENANT: [
    P.HARVEST_RECORDS_VIEW,
    P.HARVEST_RECORDS_CREATE,
    P.HARVEST_RECORDS_UPDATE,
    P.HARVEST_REMISSIONS_VIEW,
    P.HARVEST_REMISSIONS_CREATE,
    P.HARVEST_PRODUCTION_ORDERS_VIEW,
    P.HARVEST_PRODUCTION_ORDERS_CREATE,
    P.POSTHARVEST_REMISSIONS_VIEW,
    P.POSTHARVEST_REMISSIONS_APPROVE,
    P.POSTHARVEST_REMISSIONS_REJECT,
    P.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
    P.POSTHARVEST_PRODUCTION_ORDERS_APPROVE,
    P.POSTHARVEST_PRODUCTION_ORDERS_REJECT,
    P.ADMIN_WORKERS_VIEW,
    P.ADMIN_WORKERS_MANAGE,
    P.ADMIN_LOTS_VIEW,
    P.ADMIN_LOTS_MANAGE,
    P.ADMIN_FARMS_VIEW,
    P.ADMIN_FARMS_MANAGE,
    P.ADMIN_CONTAINERS_VIEW,
    P.ADMIN_CONTAINERS_MANAGE,
    P.ADMIN_QUALITIES_VIEW,
    P.ADMIN_QUALITIES_MANAGE,
    P.OPERATIONAL_ASSIGNMENTS_MANAGE,
  ],
  // Operador: por defecto solo registros de cosecha. Remisiones/órdenes se
  // habilitan por CUENTA mediante override de permisos (cuenta operativa).
  OPERADOR_COSECHA: [
    P.HARVEST_RECORDS_VIEW,
    P.HARVEST_RECORDS_CREATE,
    P.HARVEST_RECORDS_UPDATE,
  ],
  // Lector: solo lectura.
  LECTOR: [
    P.HARVEST_RECORDS_VIEW,
    P.HARVEST_REMISSIONS_VIEW,
    P.HARVEST_PRODUCTION_ORDERS_VIEW,
    P.POSTHARVEST_REMISSIONS_VIEW,
    P.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
    P.ADMIN_WORKERS_VIEW,
    P.ADMIN_LOTS_VIEW,
    P.ADMIN_FARMS_VIEW,
    P.ADMIN_CONTAINERS_VIEW,
    P.ADMIN_QUALITIES_VIEW,
  ],
};

/**
 * Permisos EFECTIVOS de un usuario:
 * - SUPER_ADMIN → todos.
 * - Si tiene override explícito (filas en user_permissions) → ese set.
 * - Si no → plantilla de su rol (retrocompatible con usuarios existentes).
 */
export function effectivePermissions(role: Role, overrides?: string[] | null): string[] {
  if (role === 'SUPER_ADMIN') return ALL_PERMISSIONS;
  if (overrides && overrides.length > 0) return overrides;
  return ROLE_PERMISSIONS[role] ?? [];
}
