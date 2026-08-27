import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Award,
  Building2,
  ChevronDown,
  ClipboardCheck,
  Fingerprint,
  Layers,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Package,
  Settings,
  Sprout,
  Truck,
  UserCheck,
  UserCog,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listTenants } from '../services/tenants';
import { PERMS } from '../lib/permissions';
import type { Role, Tenant } from '../types';
import { Button } from './ui/Button';

// Ver el módulo de remisiones/órdenes: basta CUALQUIER permiso del módulo
// (ver, crear, aprobar o rechazar), para que un operador con solo "crear" o
// solo "recibir/aceptar" también vea la pantalla en el menú.
const VIEW_REMISSIONS = [
  PERMS.HARVEST_REMISSIONS_VIEW,
  PERMS.HARVEST_REMISSIONS_CREATE,
  PERMS.POSTHARVEST_REMISSIONS_VIEW,
  PERMS.POSTHARVEST_REMISSIONS_APPROVE,
  PERMS.POSTHARVEST_REMISSIONS_REJECT,
];
const VIEW_ORDERS = [
  PERMS.HARVEST_PRODUCTION_ORDERS_VIEW,
  PERMS.HARVEST_PRODUCTION_ORDERS_CREATE,
  PERMS.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
  PERMS.POSTHARVEST_PRODUCTION_ORDERS_APPROVE,
  PERMS.POSTHARVEST_PRODUCTION_ORDERS_REJECT,
];

type Icon = typeof LayoutDashboard;
interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  // Visible si el usuario tiene AL MENOS UNO de estos permisos (undefined = siempre).
  perms?: string[];
}
interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

// Ítems siempre visibles.
const TOP_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

// Grupos desplegables (la visibilidad se calcula por permisos de cada ítem).
const GROUPS: NavGroup[] = [
  {
    key: 'cosecha',
    label: 'Cosecha',
    items: [
      { to: '/harvest', label: 'Registros', icon: Sprout, perms: [PERMS.HARVEST_RECORDS_VIEW] },
      { to: '/harvest-remissions', label: 'Remisiones', icon: Truck, perms: VIEW_REMISSIONS },
      {
        to: '/production-orders',
        label: 'Órdenes de producción',
        icon: ClipboardCheck,
        perms: VIEW_ORDERS,
      },
    ],
  },
  {
    key: 'admin',
    label: 'Administración',
    items: [
      { to: '/workers', label: 'Trabajadores', icon: Users, perms: [PERMS.ADMIN_WORKERS_MANAGE] },
      {
        to: '/operational',
        label: 'Operadores activos',
        icon: UserCheck,
        perms: [PERMS.OPERATIONAL_ASSIGNMENTS_MANAGE],
      },
      { to: '/lots', label: 'Lotes', icon: Layers, perms: [PERMS.ADMIN_LOTS_MANAGE] },
      { to: '/containers', label: 'Recipientes', icon: Package, perms: [PERMS.ADMIN_CONTAINERS_MANAGE] },
      { to: '/qualities', label: 'Calidades', icon: Award, perms: [PERMS.ADMIN_QUALITIES_MANAGE] },
      { to: '/farms', label: 'Fincas', icon: Warehouse, perms: [PERMS.ADMIN_FARMS_MANAGE] },
    ],
  },
  {
    key: 'super',
    label: 'Super Admin',
    items: [
      { to: '/tenants', label: 'Empresas', icon: Building2, perms: [PERMS.PLATFORM_TENANTS_MANAGE] },
      { to: '/users', label: 'Usuarios', icon: UserCog, perms: [PERMS.ADMIN_USERS_MANAGE] },
      {
        to: '/identity-config',
        label: 'Identidad y posiciones',
        icon: Fingerprint,
        perms: [PERMS.CONFIG_IDENTITY_MANAGE],
      },
      { to: '/field-config', label: 'Config. Cosecha', icon: Settings, perms: [PERMS.CONFIG_HARVEST_MANAGE] },
      {
        to: '/document-sequences',
        label: 'Consecutivos',
        icon: ListOrdered,
        perms: [PERMS.CONFIG_SEQUENCES_MANAGE],
      },
    ],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_TENANT: 'Admin',
  OPERADOR_COSECHA: 'Operador',
  LECTOR: 'Lector',
};

function TenantSwitcher() {
  const { activeTenantId, setActiveTenant } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  useEffect(() => {
    listTenants().then(setTenants).catch(() => setTenants([]));
  }, []);
  return (
    <select
      value={activeTenantId ?? ''}
      onChange={(e) => {
        const id = e.target.value || null;
        const t = tenants.find((x) => x.id === id);
        setActiveTenant(id, t?.weightUnit ?? 'GRAMS');
      }}
      className="max-w-[9rem] rounded-lg border border-border bg-surface px-2 py-1 text-sm text-content sm:max-w-none"
      title="Empresa sobre la que operas"
    >
      <option value="">— Empresa —</option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.nombre}
        </option>
      ))}
    </select>
  );
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-primary-light text-primary' : 'text-muted hover:bg-background hover:text-content'
        }`
      }
    >
      <Icon size={18} />
      {item.label}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { hasAnyPermission } = useAuth();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    cosecha: true,
    admin: true,
    super: true,
  });
  const toggle = (k: string) => setOpenGroups((p) => ({ ...p, [k]: !p[k] }));

  // Un ítem es visible si no exige permisos o si el usuario tiene al menos uno.
  const canSee = (item: NavItem) => !item.perms || hasAnyPermission(...item.perms);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <nav className="flex flex-col gap-1 p-3">
      {TOP_ITEMS.map((item) => (
        <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}

      {groups.map((group) => (
        <div key={group.key} className="mt-3">
          <button
            onClick={() => toggle(group.key)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-background"
          >
            {group.label}
            <ChevronDown
              size={16}
              className={`transition-transform ${openGroups[group.key] ? '' : '-rotate-90'}`}
            />
          </button>
          {openGroups[group.key] && (
            <div className="mt-1 flex flex-col gap-1">
              {group.items.map((item) => (
                <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg p-1 text-content hover:bg-background md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <span className="flex items-center gap-2 font-bold text-primary">
            <Sprout size={20} /> SIGA-DDI
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {user.role === 'SUPER_ADMIN' && <TenantSwitcher />}
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium text-content">{user.nombre ?? user.email}</div>
            <div className="text-xs text-muted">
              {ROLE_LABEL[user.role]}
              {user.tenant ? ` · ${user.tenant.nombre}` : ''}
            </div>
          </div>
          <Button variant="secondary" size="sm" leftIcon={<LogOut size={16} />} onClick={() => logout()}>
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar fijo en escritorio */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:block">
          <SidebarContent onNavigate={() => {}} />
        </aside>

        {/* Drawer en móvil */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="flex items-center gap-2 font-bold text-primary">
                  <Sprout size={20} /> SIGA-DDI
                </span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1 text-muted hover:bg-background"
                  aria-label="Cerrar menú"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="overflow-y-auto">
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </div>
            </aside>
          </div>
        )}

        {/* min-w-0 es clave: permite que las tablas anchas hagan scroll DENTRO
            del área de contenido en vez de romper el layout en móvil. */}
        <main className="min-w-0 flex-1 bg-background p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
