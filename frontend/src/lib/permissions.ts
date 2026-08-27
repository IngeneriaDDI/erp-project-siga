// ==========================================================================
// Catálogo de permisos (espejo del backend common/permissions).
// El backend es la autoridad; esto solo controla navegación/visibilidad.
// ==========================================================================
export const PERMS = {
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

  ADMIN_USERS_MANAGE: 'admin.users.manage',
  CONFIG_HARVEST_MANAGE: 'config.harvest.manage',
  CONFIG_SEQUENCES_MANAGE: 'config.sequences.manage',
  CONFIG_IDENTITY_MANAGE: 'config.identity.manage',
  PLATFORM_TENANTS_MANAGE: 'platform.tenants.manage',
} as const;

export type PermissionKey = (typeof PERMS)[keyof typeof PERMS];

// Cada permiso es de tipo "view" (acceso visual al módulo/pantalla) o "action"
// (operación concreta). Los permisos "view" son los "permisos visuales" propios
// de cada usuario que deciden qué pantallas ve en el menú.
export type PermissionKind = 'view' | 'action';

export interface PermissionItem {
  key: string;
  label: string;
  kind: PermissionKind;
}

export interface PermissionModule {
  /** Módulo/área. Para agregar un módulo futuro (p. ej. Facturación) basta con
   *  añadir una entrada aquí y sus permisos en el backend. */
  module: string;
  items: PermissionItem[];
}

/**
 * Permisos agrupados por MÓDULO/PANTALLA. El primer ítem de cada grupo es el
 * permiso "visual" (ver la pantalla); el resto son acciones dentro de ella.
 */
export const PERMISSION_MODULES: PermissionModule[] = [
  {
    module: 'Cosecha · Registros',
    items: [
      { key: PERMS.HARVEST_RECORDS_VIEW, label: 'Ver registros', kind: 'view' },
      { key: PERMS.HARVEST_RECORDS_CREATE, label: 'Crear registros', kind: 'action' },
      { key: PERMS.HARVEST_RECORDS_UPDATE, label: 'Editar / anular registros', kind: 'action' },
    ],
  },
  {
    module: 'Cosecha · Remisiones',
    items: [
      { key: PERMS.HARVEST_REMISSIONS_VIEW, label: 'Ver remisiones', kind: 'view' },
      { key: PERMS.HARVEST_REMISSIONS_CREATE, label: 'Crear remisiones', kind: 'action' },
    ],
  },
  {
    module: 'Cosecha · Órdenes de producción',
    items: [
      { key: PERMS.HARVEST_PRODUCTION_ORDERS_VIEW, label: 'Ver órdenes', kind: 'view' },
      { key: PERMS.HARVEST_PRODUCTION_ORDERS_CREATE, label: 'Crear órdenes', kind: 'action' },
    ],
  },
  {
    module: 'Postcosecha · Remisiones',
    items: [
      { key: PERMS.POSTHARVEST_REMISSIONS_VIEW, label: 'Ver remisiones (recepción)', kind: 'view' },
      { key: PERMS.POSTHARVEST_REMISSIONS_APPROVE, label: 'Recibir / autorizar', kind: 'action' },
      { key: PERMS.POSTHARVEST_REMISSIONS_REJECT, label: 'Rechazar', kind: 'action' },
    ],
  },
  {
    module: 'Postcosecha · Órdenes de producción',
    items: [
      {
        key: PERMS.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
        label: 'Ver órdenes (autorización)',
        kind: 'view',
      },
      { key: PERMS.POSTHARVEST_PRODUCTION_ORDERS_APPROVE, label: 'Aceptar / autorizar', kind: 'action' },
      { key: PERMS.POSTHARVEST_PRODUCTION_ORDERS_REJECT, label: 'Rechazar', kind: 'action' },
    ],
  },
  {
    module: 'Administración',
    items: [
      { key: PERMS.ADMIN_WORKERS_MANAGE, label: 'Gestionar trabajadores', kind: 'action' },
      { key: PERMS.OPERATIONAL_ASSIGNMENTS_MANAGE, label: 'Asignar operadores activos', kind: 'action' },
      { key: PERMS.ADMIN_LOTS_MANAGE, label: 'Gestionar lotes', kind: 'action' },
      { key: PERMS.ADMIN_CONTAINERS_MANAGE, label: 'Gestionar recipientes', kind: 'action' },
      { key: PERMS.ADMIN_QUALITIES_MANAGE, label: 'Gestionar calidades', kind: 'action' },
      { key: PERMS.ADMIN_FARMS_MANAGE, label: 'Gestionar fincas', kind: 'action' },
    ],
  },
];

/**
 * Presets rápidos para perfiles de operador. Rellenan la selección; el admin
 * puede ajustarla y luego guardar. Cubren "crear" y "aceptar" según el perfil.
 */
export const PERMISSION_PRESETS: { label: string; description: string; permissions: string[] }[] = [
  {
    label: 'Operador de cosecha',
    description: 'Registros + crear remisiones y órdenes',
    permissions: [
      PERMS.HARVEST_RECORDS_VIEW,
      PERMS.HARVEST_RECORDS_CREATE,
      PERMS.HARVEST_RECORDS_UPDATE,
      PERMS.HARVEST_REMISSIONS_VIEW,
      PERMS.HARVEST_REMISSIONS_CREATE,
      PERMS.HARVEST_PRODUCTION_ORDERS_VIEW,
      PERMS.HARVEST_PRODUCTION_ORDERS_CREATE,
    ],
  },
  {
    label: 'Operador de postcosecha',
    description: 'Recibir/autorizar remisiones y aceptar órdenes',
    permissions: [
      PERMS.POSTHARVEST_REMISSIONS_VIEW,
      PERMS.POSTHARVEST_REMISSIONS_APPROVE,
      PERMS.POSTHARVEST_REMISSIONS_REJECT,
      PERMS.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
      PERMS.POSTHARVEST_PRODUCTION_ORDERS_APPROVE,
      PERMS.POSTHARVEST_PRODUCTION_ORDERS_REJECT,
    ],
  },
  {
    label: 'Cosecha + postcosecha',
    description: 'Crea en cosecha y autoriza en postcosecha',
    permissions: [
      PERMS.HARVEST_RECORDS_VIEW,
      PERMS.HARVEST_RECORDS_CREATE,
      PERMS.HARVEST_RECORDS_UPDATE,
      PERMS.HARVEST_REMISSIONS_VIEW,
      PERMS.HARVEST_REMISSIONS_CREATE,
      PERMS.HARVEST_PRODUCTION_ORDERS_VIEW,
      PERMS.HARVEST_PRODUCTION_ORDERS_CREATE,
      PERMS.POSTHARVEST_REMISSIONS_VIEW,
      PERMS.POSTHARVEST_REMISSIONS_APPROVE,
      PERMS.POSTHARVEST_REMISSIONS_REJECT,
      PERMS.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
      PERMS.POSTHARVEST_PRODUCTION_ORDERS_APPROVE,
      PERMS.POSTHARVEST_PRODUCTION_ORDERS_REJECT,
    ],
  },
  {
    label: 'Solo lectura',
    description: 'Ve todas las pantallas, sin acciones',
    permissions: [
      PERMS.HARVEST_RECORDS_VIEW,
      PERMS.HARVEST_REMISSIONS_VIEW,
      PERMS.HARVEST_PRODUCTION_ORDERS_VIEW,
      PERMS.POSTHARVEST_REMISSIONS_VIEW,
      PERMS.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
    ],
  },
];
