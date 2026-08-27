import { CrudPage } from '../components/CrudPage';
import { useAsyncData } from '../hooks/useAsyncData';
import { createFarm, listFarms, setFarmStatus, updateFarm } from '../services/farms';
import type { Farm } from '../types';

export default function FarmsPage() {
  const { data, loading, error, reload } = useAsyncData(() => listFarms(), []);

  return (
    <CrudPage<Farm>
      title="Fincas"
      singular="Finca"
      description="Fincas de la empresa."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[
        { header: 'Nombre', render: (r) => r.nombre },
        { header: 'Ubicación', render: (r) => r.ubicacion ?? '—' },
      ]}
      fields={[
        { name: 'nombre', label: 'Nombre', required: true },
        { name: 'ubicacion', label: 'Ubicación (opcional)' },
      ]}
      toForm={(r) => ({ nombre: r.nombre, ubicacion: r.ubicacion ?? '' })}
      onCreate={async (v) => {
        await createFarm({
          nombre: String(v.nombre),
          ubicacion: v.ubicacion ? String(v.ubicacion) : undefined,
        });
      }}
      onUpdate={async (id, v) => {
        await updateFarm(id, {
          nombre: v.nombre ? String(v.nombre) : undefined,
          ubicacion: v.ubicacion ? String(v.ubicacion) : undefined,
        });
      }}
      onToggleStatus={async (r) => {
        await setFarmStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
