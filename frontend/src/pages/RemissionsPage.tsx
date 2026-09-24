import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileText, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import { listLots } from '../services/lots';
import {
  createRemission,
  listRemissions,
  previewRemission,
  type RemissionFilters,
} from '../services/harvestRemissions';
import { getApiErrorMessage } from '../lib/api';
import { formatWeight } from '../lib/weight';
import { PERMS } from '../lib/permissions';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { OperatorStatusBanner } from '../components/OperatorStatusBanner';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import type { Remission, RemissionPreview, RemissionStatus } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ status }: { status: RemissionStatus }) {
  if (status === 'RECIBIDA') return <Badge color="green">Recibida</Badge>;
  if (status === 'ANULADA') return <Badge color="red">Anulada</Badge>;
  return <Badge color="amber">Pendiente recepción</Badge>;
}

export default function RemissionsPage() {
  const { hasPermission, weightUnit } = useAuth();
  const navigate = useNavigate();
  const canCreate = hasPermission(PERMS.HARVEST_REMISSIONS_CREATE);
  const [opBlocked, setOpBlocked] = useState(false);
  const fmtW = (g: number) => formatWeight(g, weightUnit);

  const farms = useAsyncData(() => listFarms('ACTIVE'), []);
  const lots = useAsyncData(() => listLots({ status: 'ACTIVE' }), []);

  // --- Generar remisión ---
  const [date, setDate] = useState(today());
  const [farmId, setFarmId] = useState('');
  const [lotId, setLotId] = useState('');
  const [preview, setPreview] = useState<RemissionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const farmLots = useMemo(
    () => (lots.data ?? []).filter((l) => l.farmId === farmId),
    [lots.data, farmId],
  );

  const doPreview = async () => {
    setPreviewError(null);
    setPreview(null);
    if (!lotId) {
      setPreviewError('Selecciona un lote');
      return;
    }
    setPreviewLoading(true);
    try {
      setPreview(await previewRemission({ date, lotId }));
    } catch (e) {
      setPreviewError(getApiErrorMessage(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const doCreate = async () => {
    setCreating(true);
    setPreviewError(null);
    try {
      const rem = await createRemission({ date, lotId });
      setConfirmOpen(false);
      setPreview(null);
      navigate(`/harvest-remissions/${rem.id}`);
    } catch (e) {
      setPreviewError(getApiErrorMessage(e));
      setConfirmOpen(false);
    } finally {
      setCreating(false);
    }
  };

  // --- Historial ---
  const [filters, setFilters] = useState<RemissionFilters>({ page: 1, pageSize: 20 });
  const { data, loading, error } = useAsyncData(() => listRemissions(filters), [JSON.stringify(filters)]);
  const setFilter = (patch: Partial<RemissionFilters>) => setFilters((p) => ({ ...p, ...patch, page: 1 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-content">Remisiones de cosecha</h1>
        <p className="text-sm text-muted">Entrega de fruta por lote desde Cosecha hacia Postcosecha.</p>
      </div>

      {/* Generar */}
      {canCreate && (
      <div className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="font-semibold text-content">Generar remisión</h2>
        <OperatorStatusBanner onBlockedChange={setOpBlocked} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Fecha de cosecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <SearchableSelect
            label="Finca"
            value={farmId}
            onChange={(v) => {
              setFarmId(v);
              setLotId('');
              setPreview(null);
            }}
            options={(farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }))}
          />
          <SearchableSelect
            label="Lote"
            value={lotId}
            onChange={(v) => setLotId(v)}
            disabled={!farmId}
            placeholder={farmId ? '— Selecciona —' : 'Elige una finca primero'}
            options={farmLots.map((l) => ({
              value: l.id,
              label: l.nombreLote,
              keywords: `${l.nombreLote} ${l.variedad}`,
            }))}
          />
          <div className="flex items-end">
            <Button leftIcon={<Search size={16} />} onClick={doPreview} disabled={previewLoading || !lotId} className="w-full">
              {previewLoading ? 'Consultando…' : 'Vista previa'}
            </Button>
          </div>
        </div>

        {previewError && <Alert>{previewError}</Alert>}

        {preview && (
          <div className="space-y-3">
            {preview.yaExiste && (
              <Alert variant="warning">
                Ya existe una remisión ({preview.yaExiste.documentNumber}) para esta fecha y lote.
              </Alert>
            )}
            <div className="grid gap-3 rounded-lg bg-primary-light p-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted">Total kilogramos</div>
                <div className="text-lg font-bold text-primary">{fmtW(preview.totalPesoGramos)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Total canastillas</div>
                <div className="text-lg font-bold text-content">{preview.totalCanastillas}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Registros incluidos</div>
                <div className="text-lg font-bold text-content">{preview.registrosIncluidos}</div>
              </div>
            </div>
            <Table
              keyField={(q) => q.qualityId}
              rows={preview.byQuality}
              columns={[
                { header: 'Calidad', render: (q) => q.qualityNombre ?? q.qualityId },
                { header: 'Peso', render: (q) => fmtW(q.pesoGramos), className: 'text-right' },
                { header: 'Canastillas', render: (q) => q.canastillas, className: 'text-right' },
              ]}
            />
            {canCreate && preview.registrosIncluidos > 0 && !preview.yaExiste && (
              <div className="flex justify-end">
                <Button
                  leftIcon={<FileText size={16} />}
                  onClick={() => setConfirmOpen(true)}
                  disabled={opBlocked}
                >
                  Crear remisión
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Historial */}
      <div className="space-y-3">
        <h2 className="font-semibold text-content">Historial</h2>
        <div className="grid gap-3 rounded-xl border border-border bg-surface p-3 shadow-card sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Desde" type="date" onChange={(e) => setFilter({ fechaDesde: e.target.value || undefined })} />
          <Input label="Hasta" type="date" onChange={(e) => setFilter({ fechaHasta: e.target.value || undefined })} />
          <SearchableSelect
            label="Finca"
            value={filters.farmId ?? ''}
            onChange={(v) => setFilter({ farmId: v || undefined })}
            clearLabel="Todas"
            options={(farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }))}
          />
          <Select label="Estado" onChange={(e) => setFilter({ status: (e.target.value || undefined) as RemissionStatus })}>
            <option value="">Todos</option>
            <option value="PENDIENTE_RECEPCION">Pendiente recepción</option>
            <option value="RECIBIDA">Recibida</option>
            <option value="ANULADA">Anulada</option>
          </Select>
        </div>

        {error && <Alert>{error}</Alert>}
        {loading ? (
          <Spinner />
        ) : (
          <Table<Remission>
            keyField={(r) => r.id}
            rows={data?.data ?? []}
            columns={[
              { header: 'Consecutivo', render: (r) => r.documentNumber },
              { header: 'Fecha', render: (r) => r.fecha?.slice(0, 10) },
              { header: 'Finca', render: (r) => r.farmNombre ?? '—' },
              { header: 'Lote', render: (r) => r.lotNombre ?? '—' },
              { header: 'Peso', render: (r) => fmtW(r.totalPesoGramos), className: 'text-right' },
              { header: 'Canast.', render: (r) => r.totalCanastillas, className: 'text-right' },
              { header: 'Estado', render: (r) => <StatusBadge status={r.status} /> },
              { header: 'Creó', render: (r) => r.createdByNombre ?? '—' },
              { header: 'Recibió', render: (r) => r.receivedByNombre ?? '—' },
              {
                header: 'Acciones',
                render: (r) => (
                  <Button variant="ghost" size="sm" leftIcon={<Eye size={16} />} onClick={() => navigate(`/harvest-remissions/${r.id}`)}>
                    Ver
                  </Button>
                ),
              },
            ]}
          />
        )}
      </div>

      {/* Confirmación de creación */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar creación de remisión"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={doCreate} disabled={creating}>
              {creating ? 'Creando…' : 'Confirmar y crear'}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-2 text-sm text-content">
            <p>Se creará una remisión con estos totales (calculados por el sistema):</p>
            <ul className="list-inside list-disc text-muted">
              <li>Lote: <span className="font-medium text-content">{preview.lot.nombreLote}</span></li>
              <li>Total: <span className="font-medium text-content">{fmtW(preview.totalPesoGramos)} · {preview.totalCanastillas} canastillas</span></li>
              <li>Registros: <span className="font-medium text-content">{preview.registrosIncluidos}</span></li>
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
