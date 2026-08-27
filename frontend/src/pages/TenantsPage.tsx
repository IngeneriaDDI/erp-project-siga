import { CrudPage } from '../components/CrudPage';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  createTenant,
  listTenants,
  setTenantStatus,
  updateTenant,
} from '../services/tenants';
import type { Tenant } from '../types';

// Nota: internamente el modelo se sigue llamando "tenant"; visualmente es "Empresa".
export default function TenantsPage() {
  const { data, loading, error, reload } = useAsyncData(() => listTenants(), []);

  return (
    <CrudPage<Tenant>
      title="Empresas"
      singular="Empresa"
      description="Clientes / cuentas de la plataforma."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[
        { header: 'Nombre', render: (r) => r.nombre },
        { header: 'NIT', render: (r) => r.nit ?? '—' },
      ]}
      fields={[
        { name: 'nombre', label: 'Nombre de la empresa', required: true },
        { name: 'nit', label: 'NIT (opcional)' },
      ]}
      toForm={(r) => ({ nombre: r.nombre, nit: r.nit ?? '' })}
      onCreate={async (v) => {
        await createTenant({ nombre: String(v.nombre), nit: v.nit ? String(v.nit) : undefined });
      }}
      onUpdate={async (id, v) => {
        await updateTenant(id, {
          nombre: v.nombre ? String(v.nombre) : undefined,
          nit: v.nit ? String(v.nit) : undefined,
        });
      }}
      onToggleStatus={async (r) => {
        await setTenantStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
