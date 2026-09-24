import { CrudPage } from '../components/CrudPage';
import { STATUS_CREATE_FIELD } from './WorkersPage';
import { Badge } from '../components/ui/misc';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  createQuality,
  listQualities,
  setQualityStatus,
  updateQuality,
} from '../services/qualities';
import type { Quality, Status } from '../types';

export default function QualitiesPage() {
  const { data, loading, error, reload } = useAsyncData(() => listQualities(), []);

  return (
    <CrudPage<Quality>
      title="Calidades"
      singular="Calidad"
      description="Calidades de fruta. Solo las visibles aparecen en el formulario de cosecha."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[
        { header: 'Nombre', render: (r) => r.nombre },
        { header: 'Descripción', render: (r) => r.descripcion ?? '—' },
        {
          header: 'En cosecha',
          render: (r) =>
            r.visibleEnCosecha ? <Badge color="green">Sí</Badge> : <Badge color="gray">No</Badge>,
        },
      ]}
      fields={[
        { name: 'nombre', label: 'Nombre', required: true },
        { name: 'descripcion', label: 'Descripción (opcional)' },
        { name: 'visibleEnCosecha', label: 'Visible en cosecha', type: 'checkbox' },
        STATUS_CREATE_FIELD,
      ]}
      toForm={(r) => ({
        nombre: r.nombre,
        descripcion: r.descripcion ?? '',
        visibleEnCosecha: r.visibleEnCosecha,
      })}
      onCreate={async (v) => {
        await createQuality({
          nombre: String(v.nombre),
          descripcion: v.descripcion ? String(v.descripcion) : undefined,
          visibleEnCosecha: Boolean(v.visibleEnCosecha),
          status: v.status ? (v.status as Status) : undefined,
        });
      }}
      onUpdate={async (id, v) => {
        await updateQuality(id, {
          nombre: v.nombre ? String(v.nombre) : undefined,
          descripcion: v.descripcion ? String(v.descripcion) : undefined,
          visibleEnCosecha: Boolean(v.visibleEnCosecha),
        });
      }}
      onToggleStatus={async (r) => {
        await setQualityStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
