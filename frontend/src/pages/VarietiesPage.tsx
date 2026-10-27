import { CrudPage } from '../components/CrudPage';
import { STATUS_CREATE_FIELD } from './WorkersPage';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  createVariety,
  listVarieties,
  setVarietyStatus,
  updateVariety,
} from '../services/varieties';
import type { Status, Variety } from '../types';

export default function VarietiesPage() {
  const { data, loading, error, reload } = useAsyncData(() => listVarieties(), []);

  return (
    <CrudPage<Variety>
      title="Variedades"
      singular="Variedad"
      description="Catálogo de variedades. Se selecciona al crear o editar un lote."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      searchBy={(r) => r.nombre}
      searchPlaceholder="Buscar variedad…"
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[{ header: 'Nombre', render: (r) => r.nombre }]}
      fields={[{ name: 'nombre', label: 'Nombre', required: true }, STATUS_CREATE_FIELD]}
      toForm={(r) => ({ nombre: r.nombre })}
      onCreate={async (v) => {
        await createVariety({
          nombre: String(v.nombre),
          status: v.status ? (v.status as Status) : undefined,
        });
      }}
      onUpdate={async (id, v) => {
        await updateVariety(id, { nombre: v.nombre ? String(v.nombre) : undefined });
      }}
      onToggleStatus={async (r) => {
        await setVarietyStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
