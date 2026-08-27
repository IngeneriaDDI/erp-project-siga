import { CrudPage } from '../components/CrudPage';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  displayToGrams,
  formatWeight,
  gramsToInputValue,
  weightInputStep,
  weightUnitLabel,
} from '../lib/weight';
import {
  createContainer,
  listContainers,
  setContainerStatus,
  updateContainer,
} from '../services/containers';
import type { Container } from '../types';

export default function ContainersPage() {
  const { weightUnit } = useAuth();
  const { data, loading, error, reload } = useAsyncData(() => listContainers(), []);

  return (
    <CrudPage<Container>
      title="Recipientes"
      singular="Recipiente"
      description="Tipos de recipiente y su peso de tara."
      rows={data ?? []}
      loading={loading}
      error={error}
      onReload={reload}
      canWrite
      getId={(r) => r.id}
      getStatus={(r) => r.status}
      columns={[
        { header: 'Nombre', render: (r) => r.nombre },
        { header: 'Peso', render: (r) => formatWeight(r.pesoGramos, weightUnit) },
      ]}
      // El campo "peso" está en la unidad de presentación; se convierte a gramos al guardar.
      fields={[
        { name: 'nombre', label: 'Nombre', required: true },
        {
          name: 'peso',
          label: `Peso (${weightUnitLabel(weightUnit)})`,
          type: 'number',
          required: true,
          step: weightInputStep(weightUnit),
        },
      ]}
      toForm={(r) => ({ nombre: r.nombre, peso: gramsToInputValue(r.pesoGramos, weightUnit) })}
      onCreate={async (v) => {
        await createContainer({
          nombre: String(v.nombre),
          pesoGramos: displayToGrams(Number(v.peso), weightUnit),
        });
      }}
      onUpdate={async (id, v) => {
        await updateContainer(id, {
          nombre: v.nombre ? String(v.nombre) : undefined,
          pesoGramos: v.peso !== undefined ? displayToGrams(Number(v.peso), weightUnit) : undefined,
        });
      }}
      onToggleStatus={async (r) => {
        await setContainerStatus(r.id, r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      }}
    />
  );
}
