import { Link } from 'react-router-dom';
import {
  Award,
  Building2,
  Layers,
  Package,
  Settings,
  Sprout,
  UserCog,
  Users,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/ui/misc';
import type { Role } from '../types';

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Administrador (plataforma)',
  ADMIN_TENANT: 'Administrador de la empresa',
  OPERADOR_COSECHA: 'Operador de cosecha',
  LECTOR: 'Lector',
};

type Icon = typeof Sprout;

function Card({ to, title, desc, icon: Icon }: { to: string; title: string; desc: string; icon: Icon }) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition hover:border-primary/40 hover:shadow"
    >
      <div className="rounded-lg bg-primary-light p-2 text-primary">
        <Icon size={20} />
      </div>
      <div>
        <div className="font-semibold text-content">{title}</div>
        <div className="mt-0.5 text-sm text-muted">{desc}</div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, activeTenantId } = useAuth();
  if (!user) return null;

  const isSuper = user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN_TENANT' || isSuper;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">Hola, {user.nombre ?? user.email}</h1>
        <p className="text-muted">
          {ROLE_LABEL[user.role]}
          {user.tenant ? ` · ${user.tenant.nombre}` : ''}
        </p>
      </div>

      {isSuper && !activeTenantId && (
        <Alert variant="info">
          Selecciona una empresa en la barra superior para administrar sus fincas, trabajadores,
          lotes, recipientes y registros de cosecha.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card to="/harvest" icon={Sprout} title="Registros de cosecha" desc="Ver, filtrar y registrar pesajes de cosecha." />

        {isAdmin && (
          <>
            <Card to="/workers" icon={Users} title="Trabajadores" desc="Trabajadores de la finca." />
            <Card to="/lots" icon={Layers} title="Lotes" desc="Lotes y su variedad." />
            <Card to="/containers" icon={Package} title="Recipientes" desc="Tipos de recipiente y su peso." />
            <Card to="/qualities" icon={Award} title="Calidades" desc="Calidades de fruta para cosecha." />
            <Card to="/farms" icon={Warehouse} title="Fincas" desc="Fincas de la empresa." />
          </>
        )}

        {isSuper && (
          <>
            <Card to="/tenants" icon={Building2} title="Empresas" desc="Clientes de la plataforma." />
            <Card to="/users" icon={UserCog} title="Usuarios" desc="Usuarios y permisos." />
            <Card to="/field-config" icon={Settings} title="Config. de cosecha" desc="Campos visibles y obligatorios." />
          </>
        )}
      </div>
    </div>
  );
}
