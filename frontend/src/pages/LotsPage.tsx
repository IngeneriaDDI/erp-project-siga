import { CrudPage } from '../components/CrudPage';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import { createLot, listLots, setLotStatus, updateLot } from '../services/lots';
import type { Lot } from '../types';

export default function LotsPage() {
  const farms = useAsyncData(() => listFarms('ACTIVE'), []);
  const { data, loading, error, reload } = useAsyncData(() => listLots(), []);

  const farmOptions = (farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }));
  const farmName = (id: string) => farms.data?.find((f) => f.id === id)?.nombre ?? '—';

  return (
    <CrudPage<Lot>
      title="Lotes"
      singular="Lote"
      description="Lotes productivos. La variedad vive en el lote."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[
        { header: 'Lote', render: (r) => r.nombreLote },
        { header: 'Variedad', render: (r) => r.variedad },
        { header: 'Finca', render: (r) => farmName(r.farmId) },
        { header: 'Plantas', render: (r) => r.numeroPlantas ?? '—' },
      ]}
      fields={[
        { name: 'farmId', label: 'Finca', type: 'select', required: true, options: farmOptions, hideOnEdit: true },
        { name: 'nombreLote', label: 'Nombre del lote', required: true },
        { name: 'variedad', label: 'Variedad', required: true },
        { name: 'numeroPlantas', label: 'Número de plantas (opcional)', type: 'number' },
      ]}
      toForm={(r) => ({
        farmId: r.farmId,
        nombreLote: r.nombreLote,
        variedad: r.variedad,
        numeroPlantas: r.numeroPlantas ?? '',
      })}
      onCreate={async (v) => {
        await createLot({
          farmId: String(v.farmId),
          nombreLote: String(v.nombreLote),
          variedad: String(v.variedad),
          numeroPlantas:
            v.numeroPlantas !== undefined && !Number.isNaN(Number(v.numeroPlantas))
              ? Number(v.numeroPlantas)
              : undefined,
        });
      }}
      onUpdate={async (id, v) => {
        await updateLot(id, {
          nombreLote: v.nombreLote ? String(v.nombreLote) : undefined,
          variedad: v.variedad ? String(v.variedad) : undefined,
          numeroPlantas:
            v.numeroPlantas !== undefined && !Number.isNaN(Number(v.numeroPlantas))
              ? Number(v.numeroPlantas)
              : undefined,
        });
      }}
      onToggleStatus={async (r) => {
        await setLotStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
