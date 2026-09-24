import { CrudPage } from '../components/CrudPage';
import { MasterImportButton } from '../components/MasterImportButton';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import {
  createWorker,
  listWorkers,
  setWorkerStatus,
  updateWorker,
} from '../services/workers';
import type { Status, Worker } from '../types';

// Selector de estado (solo al crear): permite cargar maestros históricos como INACTIVE.
export const STATUS_CREATE_FIELD = {
  name: 'status',
  label: 'Estado',
  type: 'select' as const,
  hideOnEdit: true,
  options: [
    { value: 'ACTIVE', label: 'Activo' },
    { value: 'INACTIVE', label: 'Inactivo (histórico)' },
  ],
};

export default function WorkersPage() {
  const farms = useAsyncData(() => listFarms('ACTIVE'), []);
  const { data, loading, error, reload } = useAsyncData(() => listWorkers(), []);

  const farmOptions = (farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }));
  const farmName = (id: string) => farms.data?.find((f) => f.id === id)?.nombre ?? '—';

  return (
    <CrudPage<Worker>
      title="Trabajadores"
      singular="Trabajador"
      description="Trabajadores de la empresa. El código interno es único por empresa."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      extraHeader={<MasterImportButton entity="workers" onDone={reload} />}
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[
        { header: 'Código', render: (r) => r.codigoInterno },
        { header: 'Nombre', render: (r) => r.nombre },
        { header: 'Finca', render: (r) => farmName(r.farmId) },
        { header: 'Área', render: (r) => r.areaTrabajo ?? '—' },
      ]}
      fields={[
        { name: 'farmId', label: 'Finca', type: 'select', required: true, options: farmOptions, hideOnEdit: true },
        { name: 'codigoInterno', label: 'Código interno', required: true },
        { name: 'nombre', label: 'Nombre', required: true },
        { name: 'documento', label: 'Documento (opcional)' },
        { name: 'areaTrabajo', label: 'Área de trabajo (opcional)' },
        STATUS_CREATE_FIELD,
      ]}
      toForm={(r) => ({
        farmId: r.farmId,
        codigoInterno: r.codigoInterno,
        nombre: r.nombre,
        documento: r.documento ?? '',
        areaTrabajo: r.areaTrabajo ?? '',
      })}
      onCreate={async (v) => {
        await createWorker({
          farmId: String(v.farmId),
          codigoInterno: String(v.codigoInterno),
          nombre: String(v.nombre),
          documento: v.documento ? String(v.documento) : undefined,
          areaTrabajo: v.areaTrabajo ? String(v.areaTrabajo) : undefined,
          status: v.status ? (v.status as Status) : undefined,
        });
      }}
      onUpdate={async (id, v) => {
        await updateWorker(id, {
          codigoInterno: v.codigoInterno ? String(v.codigoInterno) : undefined,
          nombre: v.nombre ? String(v.nombre) : undefined,
          documento: v.documento ? String(v.documento) : undefined,
          areaTrabajo: v.areaTrabajo ? String(v.areaTrabajo) : undefined,
        });
      }}
      onToggleStatus={async (r) => {
        await setWorkerStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
