import { CrudPage } from '../components/CrudPage';
import { STATUS_CREATE_FIELD } from './WorkersPage';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  createProductiveGroup,
  listProductiveGroups,
  setProductiveGroupStatus,
  updateProductiveGroup,
} from '../services/productiveGroups';
import type { ProductiveGroup, Status } from '../types';

export default function ProductiveGroupsPage() {
  const { data, loading, error, reload } = useAsyncData(() => listProductiveGroups(), []);

  return (
    <CrudPage<ProductiveGroup>
      title="Grupos productivos"
      singular="Grupo productivo"
      description="Catálogo de grupos productivos. Se selecciona al crear o editar un lote."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      searchBy={(r) => r.nombre}
      searchPlaceholder="Buscar grupo…"
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[{ header: 'Nombre', render: (r) => r.nombre }]}
      fields={[{ name: 'nombre', label: 'Nombre', required: true }, STATUS_CREATE_FIELD]}
      toForm={(r) => ({ nombre: r.nombre })}
      onCreate={async (v) => {
        await createProductiveGroup({
          nombre: String(v.nombre),
          status: v.status ? (v.status as Status) : undefined,
        });
      }}
      onUpdate={async (id, v) => {
        await updateProductiveGroup(id, { nombre: v.nombre ? String(v.nombre) : undefined });
      }}
      onToggleStatus={async (r) => {
        await setProductiveGroupStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
