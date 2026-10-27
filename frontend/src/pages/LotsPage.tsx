import { CrudPage } from '../components/CrudPage';
import { MasterImportButton } from '../components/MasterImportButton';
import { STATUS_CREATE_FIELD } from './WorkersPage';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import { createLot, listLots, setLotStatus, updateLot } from '../services/lots';
import { listVarieties } from '../services/varieties';
import { listProductiveGroups } from '../services/productiveGroups';
import type { Lot, Status } from '../types';

const toNumber = (v: unknown) =>
  v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined;

export default function LotsPage() {
  const farms = useAsyncData(() => listFarms('ACTIVE'), []);
  const varieties = useAsyncData(() => listVarieties(), []);
  const groups = useAsyncData(() => listProductiveGroups(), []);
  const { data, loading, error, reload } = useAsyncData(() => listLots(), []);

  const farmOptions = (farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }));
  const farmName = (id: string) => farms.data?.find((f) => f.id === id)?.nombre ?? '—';
  const groupName = (id?: string | null) =>
    (id && groups.data?.find((g) => g.id === id)?.nombre) || '—';

  // En el desplegable solo variedades/grupos activos (el lote que ya usa uno inactivo lo conserva).
  const varietyOptions = (varieties.data ?? [])
    .filter((v) => v.status === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.nombre }));
  const groupOptions = (groups.data ?? [])
    .filter((g) => g.status === 'ACTIVE')
    .map((g) => ({ value: g.id, label: g.nombre }));

  return (
    <CrudPage<Lot>
      title="Lotes"
      singular="Lote"
      description="Lotes productivos. La variedad y el grupo productivo se eligen de sus catálogos."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      searchBy={(r) => r.nombreLote}
      searchPlaceholder="Buscar por número de lote…"
      extraHeader={<MasterImportButton entity="lots" onDone={reload} />}
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[
        { header: 'Lote', render: (r) => r.nombreLote },
        { header: 'Variedad', render: (r) => r.variedad },
        { header: 'Grupo productivo', render: (r) => groupName(r.productiveGroupId) },
        { header: 'Fecha siembra', render: (r) => (r.fechaSiembra ? r.fechaSiembra.slice(0, 10) : '—') },
        { header: 'Finca', render: (r) => farmName(r.farmId) },
        { header: 'Plantas', render: (r) => r.numeroPlantas ?? '—' },
      ]}
      fields={[
        { name: 'farmId', label: 'Finca', type: 'select', required: true, options: farmOptions, hideOnEdit: true },
        { name: 'nombreLote', label: 'Nombre del lote', required: true },
        { name: 'varietyId', label: 'Variedad', type: 'select', required: true, options: varietyOptions },
        { name: 'productiveGroupId', label: 'Grupo productivo (opcional)', type: 'select', options: groupOptions },
        { name: 'fechaSiembra', label: 'Fecha de siembra (opcional)', type: 'date' },
        { name: 'numeroPlantas', label: 'Número de plantas (opcional)', type: 'number' },
        STATUS_CREATE_FIELD,
      ]}
      toForm={(r) => ({
        farmId: r.farmId,
        nombreLote: r.nombreLote,
        varietyId: r.varietyId ?? '',
        productiveGroupId: r.productiveGroupId ?? '',
        fechaSiembra: r.fechaSiembra ? r.fechaSiembra.slice(0, 10) : '',
        numeroPlantas: r.numeroPlantas ?? '',
      })}
      onCreate={async (v) => {
        await createLot({
          farmId: String(v.farmId),
          nombreLote: String(v.nombreLote),
          varietyId: String(v.varietyId),
          productiveGroupId: v.productiveGroupId ? String(v.productiveGroupId) : undefined,
          fechaSiembra: v.fechaSiembra ? String(v.fechaSiembra) : undefined,
          numeroPlantas: toNumber(v.numeroPlantas),
          status: v.status ? (v.status as Status) : undefined,
        });
      }}
      onUpdate={async (id, v) => {
        await updateLot(id, {
          nombreLote: v.nombreLote ? String(v.nombreLote) : undefined,
          varietyId: v.varietyId ? String(v.varietyId) : undefined,
          productiveGroupId: v.productiveGroupId ? String(v.productiveGroupId) : undefined,
          fechaSiembra: v.fechaSiembra ? String(v.fechaSiembra) : undefined,
          numeroPlantas: toNumber(v.numeroPlantas),
        });
      }}
      onToggleStatus={async (r) => {
        await setLotStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
