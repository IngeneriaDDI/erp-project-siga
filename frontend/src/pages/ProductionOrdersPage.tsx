import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Eye, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import {
  createOrder,
  listOrders,
  previewOrder,
  type OrderFilters,
} from '../services/productionOrders';
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
import type { OrderPreview, ProductionOrder, ProductionOrderStatus } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ status }: { status: ProductionOrderStatus }) {
  if (status === 'ACEPTADA') return <Badge color="green">Aceptada</Badge>;
  if (status === 'ANULADA') return <Badge color="red">Anulada</Badge>;
  return <Badge color="amber">Pendiente aceptación</Badge>;
}

export default function ProductionOrdersPage() {
  const { hasPermission, weightUnit } = useAuth();
  const navigate = useNavigate();
  const canCreate = hasPermission(PERMS.HARVEST_PRODUCTION_ORDERS_CREATE);
  const [opBlocked, setOpBlocked] = useState(false);
  const fmtW = (g: number) => formatWeight(g, weightUnit);

  const farms = useAsyncData(() => listFarms('ACTIVE'), []);

  const [date, setDate] = useState(today());
  const [farmId, setFarmId] = useState('');
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const doPreview = async () => {
    setPreviewError(null);
    setPreview(null);
    if (!farmId) {
      setPreviewError('Selecciona una finca');
      return;
    }
    setPreviewLoading(true);
    try {
      setPreview(await previewOrder({ date, farmId }));
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
      const order = await createOrder({ date, farmId });
      setConfirmOpen(false);
      setPreview(null);
      navigate(`/production-orders/${order.id}`);
    } catch (e) {
      setPreviewError(getApiErrorMessage(e));
      setConfirmOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const [filters, setFilters] = useState<OrderFilters>({ page: 1, pageSize: 20 });
  const { data, loading, error } = useAsyncData(() => listOrders(filters), [JSON.stringify(filters)]);
  const setFilter = (patch: Partial<OrderFilters>) => setFilters((p) => ({ ...p, ...patch, page: 1 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-content">Órdenes de producción</h1>
        <p className="text-sm text-muted">Consolidado diario por finca entregado desde Cosecha.</p>
      </div>

      {/* Generar */}
      {canCreate && (
      <div className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="font-semibold text-content">Generar orden de producción</h2>
        <OperatorStatusBanner onBlockedChange={setOpBlocked} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <SearchableSelect
            label="Finca"
            value={farmId}
            onChange={(v) => {
              setFarmId(v);
              setPreview(null);
            }}
            options={(farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }))}
          />
          <div className="flex items-end">
            <Button leftIcon={<Search size={16} />} onClick={doPreview} disabled={previewLoading || !farmId} className="w-full">
              {previewLoading ? 'Consultando…' : 'Vista previa'}
            </Button>
          </div>
        </div>

        {previewError && <Alert>{previewError}</Alert>}

        {preview && (
          <div className="space-y-3">
            {preview.yaExiste && (
              <Alert variant="warning">
                Ya existe una orden ({preview.yaExiste.documentNumber}) para esta fecha y finca.
              </Alert>
            )}
            <div className="grid gap-3 rounded-lg bg-primary-light p-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted">Total kilogramos</div>
                <div className="text-lg font-bold text-primary">{fmtW(preview.totalPesoGramos)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Total canastillas</div>
                <div className="text-lg font-bold text-content">{preview.totalCanastillas}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Lotes</div>
                <div className="text-lg font-bold text-content">{preview.lotesIncluidos}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Registros</div>
                <div className="text-lg font-bold text-content">{preview.registrosIncluidos}</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm font-semibold text-content">Por calidad</h3>
                <Table
                  keyField={(q) => q.qualityId}
                  rows={preview.byQuality}
                  columns={[
                    { header: 'Calidad', render: (q) => q.qualityNombre ?? q.qualityId },
                    { header: 'Peso', render: (q) => fmtW(q.pesoGramos), className: 'text-right' },
                    { header: 'Canast.', render: (q) => q.canastillas, className: 'text-right' },
                  ]}
                />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-content">Por lote</h3>
                <Table
                  keyField={(l) => l.lotId}
                  rows={preview.byLot}
                  columns={[
                    { header: 'Lote', render: (l) => l.lotNombre ?? l.lotId },
                    { header: 'Peso', render: (l) => fmtW(l.pesoGramos), className: 'text-right' },
                    { header: 'Canast.', render: (l) => l.canastillas, className: 'text-right' },
                  ]}
                />
              </div>
            </div>

            {canCreate && preview.registrosIncluidos > 0 && !preview.yaExiste && (
              <div className="flex justify-end">
                <Button
                  leftIcon={<ClipboardCheck size={16} />}
                  onClick={() => setConfirmOpen(true)}
                  disabled={opBlocked}
                >
                  Crear orden de producción
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
          <Select label="Estado" onChange={(e) => setFilter({ status: (e.target.value || undefined) as ProductionOrderStatus })}>
            <option value="">Todos</option>
            <option value="PENDIENTE_ACEPTACION">Pendiente aceptación</option>
            <option value="ACEPTADA">Aceptada</option>
            <option value="ANULADA">Anulada</option>
          </Select>
        </div>

        {error && <Alert>{error}</Alert>}
        {loading ? (
          <Spinner />
        ) : (
          <Table<ProductionOrder>
            keyField={(r) => r.id}
            rows={data?.data ?? []}
            columns={[
              { header: 'Consecutivo', render: (r) => r.documentNumber },
              { header: 'Fecha', render: (r) => r.fecha?.slice(0, 10) },
              { header: 'Finca', render: (r) => r.farmNombre ?? '—' },
              { header: 'Peso', render: (r) => fmtW(r.totalPesoGramos), className: 'text-right' },
              { header: 'Canast.', render: (r) => r.totalCanastillas, className: 'text-right' },
              { header: 'Lotes', render: (r) => r.lotesIncluidos, className: 'text-right' },
              { header: 'Estado', render: (r) => <StatusBadge status={r.status} /> },
              { header: 'Creó', render: (r) => r.createdByNombre ?? '—' },
              { header: 'Aceptó', render: (r) => r.acceptedByNombre ?? '—' },
              {
                header: 'Acciones',
                render: (r) => (
                  <Button variant="ghost" size="sm" leftIcon={<Eye size={16} />} onClick={() => navigate(`/production-orders/${r.id}`)}>
                    Ver
                  </Button>
                ),
              },
            ]}
          />
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar creación de orden"
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
            <p>Se creará una orden de producción con estos totales (calculados por el sistema):</p>
            <ul className="list-inside list-disc text-muted">
              <li>Finca: <span className="font-medium text-content">{preview.farm.nombre}</span></li>
              <li>Total: <span className="font-medium text-content">{fmtW(preview.totalPesoGramos)} · {preview.totalCanastillas} canastillas</span></li>
              <li>Lotes: <span className="font-medium text-content">{preview.lotesIncluidos}</span> · Registros: <span className="font-medium text-content">{preview.registrosIncluidos}</span></li>
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
