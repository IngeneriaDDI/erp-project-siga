import { ReactNode, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { cancelHarvest, getHarvest } from '../services/harvest';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import { getApiErrorMessage } from '../lib/api';
import { formatWeight, weightUnitLabel } from '../lib/weight';
import { PERMS } from '../lib/permissions';
import type { HarvestContainer } from '../types';

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-medium text-content">{value ?? '—'}</div>
    </div>
  );
}

export default function HarvestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, weightUnit } = useAuth();
  const canCreate = hasPermission(PERMS.HARVEST_RECORDS_CREATE);
  const canEdit = hasPermission(PERMS.HARVEST_RECORDS_UPDATE);

  const { data: rec, loading, error, reload } = useAsyncData(() => getHarvest(id as string), [id]);
  const [actionError, setActionError] = useState<string | null>(null);

  const cancel = async () => {
    if (!rec || !window.confirm('¿Anular este registro de cosecha?')) return;
    setActionError(null);
    try {
      await cancelHarvest(rec.id);
      reload();
    } catch (e) {
      setActionError(getApiErrorMessage(e));
    }
  };

  if (loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;
  if (!rec) return <Alert>Registro no encontrado</Alert>;

  const rojaText = rec.estadoRoja === true ? 'Sí' : rec.estadoRoja === false ? 'No' : '—';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-content">Registro de cosecha</h1>
          {rec.status === 'ACTIVE' ? <Badge color="green">Activo</Badge> : <Badge color="red">Anulado</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/harvest')}>
            Volver
          </Button>
          {/* Permite seguir capturando registros sin volver al listado. */}
          {canCreate && (
            <Button leftIcon={<Plus size={16} />} onClick={() => navigate('/harvest/new')}>
              Nuevo registro
            </Button>
          )}
          {canEdit && rec.status === 'ACTIVE' && (
            <>
              <Button variant="secondary" leftIcon={<Pencil size={16} />} onClick={() => navigate(`/harvest/${rec.id}/edit`)}>
                Editar
              </Button>
              <Button variant="danger" leftIcon={<Ban size={16} />} onClick={cancel}>
                Anular
              </Button>
            </>
          )}
        </div>
      </div>

      {actionError && <Alert>{actionError}</Alert>}

      <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 shadow-card sm:grid-cols-3">
        <Field label="Fecha" value={rec.fecha?.slice(0, 10)} />
        <Field label="Finca" value={rec.farm?.nombre} />
        <Field label="Trabajador" value={`${rec.worker?.codigoInterno ?? ''} · ${rec.worker?.nombre ?? ''}`} />
        <Field label="Lote" value={rec.lot?.nombreLote} />
        <Field label="Variedad" value={rec.variedad} />
        <Field label="Calidad" value={rec.quality?.nombre} />
        <Field label="Primera fila" value={rec.primeraFila} />
        <Field label="Última fila" value={rec.ultimaFila} />
        <Field label="¿Fruta roja?" value={rojaText} />
        <div className="sm:col-span-3">
          <Field label="Observaciones" value={rec.observaciones} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-content">Recipientes</h2>
        <Table<HarvestContainer>
          keyField={(r) => r.id}
          rows={rec.containers ?? []}
          columns={[
            { header: 'Recipiente', render: (r) => r.container?.nombre ?? r.containerId },
            { header: 'Unidades', render: (r) => r.unidades, className: 'text-right' },
            { header: `P. unitario (${weightUnitLabel(weightUnit)})`, render: (r) => formatWeight(r.pesoUnitarioGramos, weightUnit), className: 'text-right' },
            { header: `Total (${weightUnitLabel(weightUnit)})`, render: (r) => formatWeight(r.pesoTotalGramos, weightUnit), className: 'text-right' },
          ]}
        />
      </div>

      <div className="grid gap-3 rounded-xl bg-primary-light p-4 sm:grid-cols-3">
        <Field label="Peso bruto" value={formatWeight(rec.pesoBrutoGramos, weightUnit)} />
        <Field label="Peso recipientes" value={formatWeight(rec.pesoTotalRecipientesGramos, weightUnit)} />
        <Field
          label="Peso cosechado"
          value={<span className="font-bold text-primary">{formatWeight(rec.gramosCosechados, weightUnit)}</span>}
        />
      </div>

      {(rec.creator || rec.updater) && (
        <p className="text-xs text-muted">
          {rec.creator && `Creado por ${rec.creator.nombre}.`}
          {rec.updater && ` Última edición por ${rec.updater.nombre}.`}
        </p>
      )}
    </div>
  );
}
