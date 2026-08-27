import { CrudPage } from '../components/CrudPage';
import { UserPermissionsButton } from '../components/UserPermissionsButton';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { createUser, listUsers, setUserStatus, updateUser } from '../services/users';
import type { OperationalContext, Role, UserRow } from '../types';

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_TENANT: 'Admin',
  OPERADOR_COSECHA: 'Operador',
  LECTOR: 'Lector',
};

const CONTEXT_LABEL: Record<OperationalContext, string> = {
  HARVEST_WEIGHING: 'Pesaje en cosecha',
  POSTHARVEST_AUTHORIZATION: 'Autorización postcosecha',
};

// 'NONE' representa "sin contexto" (usuario nominativo). Es un valor no vacío
// para que sobreviva a la limpieza de campos del formulario y permita desasignar.
const CONTEXT_OPTIONS = [
  { value: 'NONE', label: 'Ninguno (usuario nominativo)' },
  { value: 'HARVEST_WEIGHING', label: CONTEXT_LABEL.HARVEST_WEIGHING },
  { value: 'POSTHARVEST_AUTHORIZATION', label: CONTEXT_LABEL.POSTHARVEST_AUTHORIZATION },
];

function toContext(v: unknown): OperationalContext | null {
  return v === 'HARVEST_WEIGHING' || v === 'POSTHARVEST_AUTHORIZATION' ? v : null;
}

export default function UsersPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsyncData(() => listUsers(), []);

  const roleOptions = [
    { value: 'ADMIN_TENANT', label: 'Admin del cliente' },
    { value: 'OPERADOR_COSECHA', label: 'Operador de cosecha' },
    { value: 'LECTOR', label: 'Lector' },
    ...(user?.role === 'SUPER_ADMIN'
      ? [{ value: 'SUPER_ADMIN', label: 'Super Admin (plataforma)' }]
      : []),
  ];

  return (
    <CrudPage<UserRow>
      title="Usuarios"
      singular="Usuario"
      description="Usuarios, roles, cuentas operativas y permisos de la plataforma."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[
        { header: 'Nombre', render: (r) => r.nombre },
        { header: 'Email', render: (r) => r.email },
        { header: 'Rol', render: (r) => ROLE_LABEL[r.role] },
        {
          header: 'Cuenta operativa',
          render: (r) =>
            r.operationalContext ? CONTEXT_LABEL[r.operationalContext] : '—',
        },
        { header: 'Permisos', render: (r) => <UserPermissionsButton user={r} /> },
      ]}
      fields={[
        { name: 'nombre', label: 'Nombre', required: true },
        { name: 'email', label: 'Email', required: true, hideOnEdit: true },
        { name: 'password', label: 'Contraseña', type: 'password' },
        { name: 'role', label: 'Rol', type: 'select', required: true, options: roleOptions },
        {
          name: 'operationalContext',
          label: 'Cuenta operativa (contexto)',
          type: 'select',
          options: CONTEXT_OPTIONS,
        },
      ]}
      toForm={(r) => ({
        nombre: r.nombre,
        email: r.email,
        role: r.role,
        password: '',
        operationalContext: r.operationalContext ?? 'NONE',
      })}
      onCreate={async (v) => {
        await createUser({
          nombre: String(v.nombre),
          email: String(v.email),
          password: String(v.password ?? ''),
          role: v.role as Role,
          operationalContext: toContext(v.operationalContext),
        });
      }}
      onUpdate={async (id, v) => {
        await updateUser(id, {
          nombre: v.nombre ? String(v.nombre) : undefined,
          role: v.role as Role | undefined,
          password: v.password ? String(v.password) : undefined,
          operationalContext: toContext(v.operationalContext),
        });
      }}
      onToggleStatus={async (r) => {
        await setUserStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
