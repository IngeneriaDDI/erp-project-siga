import { ReactNode, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, Calculator, RefreshCw, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  acceptOrder,
  closeOrder,
  getOrder,
  previewOrder,
  recalculateOrder,
  reopenOrder,
  updateOrderDate,
} from '../services/productionOrders';
import { Input } from '../components/ui/Input';
import { getApiErrorMessage } from '../lib/api';
import { formatWeight } from '../lib/weight';
import { PERMS } from '../lib/permissions';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import type { LotLine, LotQualityLine, OrderPreview, ProductionOrderStatus, QualityLine } from '../types';

function StatusBadge({ status }: { status: ProductionOrderStatus }) {
  if (status === 'ACEPTADA') return <Badge color="green">Aceptada</Badge>;
  if (status === 'ANULADA') return <Badge color="red">Anulada</Badge>;
  if (status === 'ABIERTA') return <Badge color="blue">Abierta</Badge>;
  return <Badge color="amber">Pendiente aceptación</Badge>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-medium text-content">{value ?? '—'}</div>
    </div>
  );
}

export default function ProductionOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, weightUnit } = useAuth();
  const canAccept = hasPermission(PERMS.POSTHARVEST_PRODUCTION_ORDERS_APPROVE);
  const canClose = hasPermission(PERMS.HARVEST_PRODUCTION_ORDERS_CREATE);
  const canReopen = hasPermission(PERMS.HARVEST_PRODUCTION_ORDERS_REOPEN);
  const [dateOpen, setDateOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [busy, setBusy] = useState(false);

  // Reabrir / recalcular / corregir fecha: mismo consecutivo, nunca sobre órdenes aceptadas.
  const runAction = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      after?.();
      reload();
    } catch (e) {
      setActionError(getApiErrorMessage(e));
      after?.();
    } finally {
      setBusy(false);
    }
  };
  const fmtW = (g: number) => formatWeight(g, weightUnit);

  const { data: order, loading, error, reload } = useAsyncData(() => getOrder(id as string), [id]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closePreview, setClosePreview] = useState<OrderPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Vista previa del cierre: totales del día y aviso de lo cosechado sin remitir.
  const openClose = async () => {
    if (!order) return;
    setActionError(null);
    setClosePreview(null);
    setCloseOpen(true);
    setPreviewLoading(true);
    try {
      setClosePreview(await previewOrder({ date: order.fecha.slice(0, 10), farmId: order.farmId }));
    } catch (e) {
      setActionError(getApiErrorMessage(e));
      setCloseOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const doClose = async () => {
    if (!order) return;
    setClosing(true);
    setActionError(null);
    try {
      await closeOrder(order.id);
      setCloseOpen(false);
      reload();
    } catch (e) {
      setActionError(getApiErrorMessage(e));
      setCloseOpen(false);
    } finally {
      setClosing(false);
    }
  };

  const doAccept = async () => {
    if (!order) return;
    setAccepting(true);
    setActionError(null);
    try {
      await acceptOrder(order.id);
      setConfirmOpen(false);
      reload();
    } catch (e) {
      setActionError(getApiErrorMessage(e));
      setConfirmOpen(false);
    } finally {
      setAccepting(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;
  if (!order) return <Alert>Orden no encontrada</Alert>;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-content">Orden {order.documentNumber}</h1>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/production-orders')}>
            Volver
          </Button>
          {canReopen && (order.status === 'ABIERTA' || order.status === 'PENDIENTE_ACEPTACION') && (
            <Button
              variant="secondary"
              leftIcon={<CalendarDays size={16} />}
              disabled={busy}
              onClick={() => {
                setNewDate(order.fecha.slice(0, 10));
                setDateOpen(true);
              }}
            >
              Corregir fecha
            </Button>
          )}
          {canReopen && order.status === 'PENDIENTE_ACEPTACION' && (
            <>
              <Button
                variant="secondary"
                leftIcon={<RefreshCw size={16} />}
                disabled={busy}
                onClick={() => runAction(() => recalculateOrder(order.id))}
              >
                Recalcular
              </Button>
              <Button
                variant="secondary"
                leftIcon={<RotateCcw size={16} />}
                disabled={busy}
                onClick={() => runAction(() => reopenOrder(order.id))}
              >
                Reabrir
              </Button>
            </>
          )}
          {canClose && order.status === 'ABIERTA' && (
            <Button leftIcon={<Calculator size={16} />} onClick={openClose}>
              Cerrar y calcular
            </Button>
          )}
          {canAccept && order.status === 'PENDIENTE_ACEPTACION' && (
            <Button leftIcon={<CheckCircle2 size={16} />} onClick={() => setConfirmOpen(true)}>
              Aceptar orden
            </Button>
          )}
        </div>
      </div>

      {actionError && <Alert>{actionError}</Alert>}

      <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 shadow-card sm:grid-cols-3">
        <Field label="Fecha" value={order.fecha?.slice(0, 10)} />
        <Field label="Finca" value={order.farmNombre} />
        <Field label="Total peso" value={fmtW(order.totalPesoGramos)} />
        <Field label="Total canastillas" value={order.totalCanastillas} />
        <Field label="Lotes / Registros" value={`${order.lotesIncluidos} / ${order.registrosIncluidos}`} />
        <Field label="Creada por" value={order.createdByNombre} />
        <Field label="Aceptada por" value={order.acceptedByNombre} />
        <Field label="Fecha aceptación" value={order.acceptedAt ? order.acceptedAt.slice(0, 10) : '—'} />
      </div>

      {order.status === 'ABIERTA' && (
        <Alert variant="warning">
          Orden abierta: recibe las remisiones de la finca en esta fecha. Los totales se calculan al
          cerrar y calcular, con todos los registros de cosecha del día.
        </Alert>
      )}

      {order.status !== 'ABIERTA' && (
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold text-content">Detalle por calidad</h2>
          <Table<QualityLine>
            keyField={(q) => q.qualityId}
            rows={order.qualityDetails ?? []}
            columns={[
              { header: 'Calidad', render: (q) => q.qualityNombre ?? q.qualityId },
              { header: 'Peso', render: (q) => fmtW(q.pesoGramos), className: 'text-right' },
              { header: 'Canastillas', render: (q) => q.canastillas, className: 'text-right' },
            ]}
          />
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-content">Resumen por lote</h2>
          <Table<LotLine>
            keyField={(l) => l.lotId}
            rows={order.lotDetails ?? []}
            columns={[
              { header: 'Lote', render: (l) => l.lotNombre ?? l.lotId },
              { header: 'Peso', render: (l) => fmtW(l.pesoGramos), className: 'text-right' },
              { header: 'Canastillas', render: (l) => l.canastillas, className: 'text-right' },
            ]}
          />
        </div>
      </div>
      )}

      {order.status !== 'ABIERTA' && (
      <div>
        <h2 className="mb-2 font-semibold text-content">Detalle por lote y calidad</h2>
        <Table<LotQualityLine>
          keyField={(d) => `${d.lotId}|${d.qualityId}`}
          rows={order.lotQualityDetails ?? []}
          columns={[
            { header: 'Lote', render: (d) => d.lotNombre ?? d.lotId },
            { header: 'Calidad', render: (d) => d.qualityNombre ?? d.qualityId },
            { header: 'Peso', render: (d) => fmtW(d.pesoGramos), className: 'text-right' },
            { header: 'Canastillas', render: (d) => d.canastillas, className: 'text-right' },
          ]}
        />
      </div>
      )}

      <div>
        <h2 className="mb-2 font-semibold text-content">
          Remisiones de la orden ({order.remisiones?.length ?? 0})
        </h2>
        <Table
          keyField={(r) => r.id}
          rows={order.remisiones ?? []}
          columns={[
            {
              header: 'Remisión',
              render: (r) => (
                <button
                  onClick={() => navigate(`/harvest-remissions/${r.id}`)}
                  className="text-primary hover:underline"
                >
                  {r.documentNumber}
                </button>
              ),
            },
            { header: 'Lote', render: (r) => r.lotNombre ?? '—' },
            { header: 'Peso', render: (r) => fmtW(r.totalPesoGramos ?? 0), className: 'text-right' },
            { header: 'Canast.', render: (r) => r.totalCanastillas ?? 0, className: 'text-right' },
            {
              header: 'Estado',
              render: (r) =>
                r.status === 'RECIBIDA' ? (
                  <Badge color="green">Recibida</Badge>
                ) : r.status === 'ANULADA' ? (
                  <Badge color="red">Anulada</Badge>
                ) : (
                  <Badge color="amber">Pendiente recepción</Badge>
                ),
            },
          ]}
        />
      </div>

      <Modal
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        title="Corregir fecha de la orden"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDateOpen(false)}>Cancelar</Button>
            <Button
              disabled={busy || !newDate || newDate === order.fecha.slice(0, 10)}
              onClick={() => runAction(() => updateOrderDate(order.id, newDate), () => setDateOpen(false))}
            >
              {busy ? 'Guardando…' : 'Guardar fecha'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-content">
          <Input label="Nueva fecha" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <p className="text-muted">
            Se conserva el consecutivo. Las remisiones enlazadas conservan su fecha real y se desenlazan; se
            enlazan las de la nueva fecha. La orden queda <span className="font-medium text-content">abierta</span>{' '}
            y se vuelve a calcular al cerrarla.
          </p>
        </div>
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Cerrar y calcular orden"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseOpen(false)}>Cancelar</Button>
            <Button onClick={doClose} disabled={closing || previewLoading || !closePreview || closePreview.registrosIncluidos === 0}>
              {closing ? 'Calculando…' : 'Cerrar y calcular'}
            </Button>
          </>
        }
      >
        {previewLoading || !closePreview ? (
          <Spinner />
        ) : (
          <div className="space-y-3 text-sm text-content">
            <p>
              Se calculará la orden con <span className="font-medium">todos</span> los registros de cosecha de la
              finca en esta fecha. Después no admitirá nuevas remisiones.
            </p>
            <ul className="list-inside list-disc text-muted">
              <li>
                Total: <span className="font-medium text-content">{fmtW(closePreview.totalPesoGramos)} · {closePreview.totalCanastillas} canastillas</span>
              </li>
              <li>
                Lotes: <span className="font-medium text-content">{closePreview.lotesIncluidos}</span> · Registros:{' '}
                <span className="font-medium text-content">{closePreview.registrosIncluidos}</span>
              </li>
            </ul>
            {closePreview.registrosIncluidos === 0 && (
              <Alert>No hay registros de cosecha para esta finca y fecha.</Alert>
            )}
            {closePreview.sinRemitir && closePreview.sinRemitir.registros > 0 && (
              <Alert variant="warning">
                Aviso: {closePreview.sinRemitir.registros} registros ({fmtW(closePreview.sinRemitir.pesoGramos)} ·{' '}
                {closePreview.sinRemitir.canastillas} canastillas) aún no están en ninguna remisión. Se incluyen en la
                orden igualmente.
              </Alert>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Aceptar orden de producción"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={doAccept} disabled={accepting}>
              {accepting ? 'Aceptando…' : 'Aceptar orden'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-content">
          Vas a aceptar la totalidad de la orden: <span className="font-medium">{fmtW(order.totalPesoGramos)}</span> y{' '}
          <span className="font-medium">{order.totalCanastillas} canastillas</span>. La aceptación es total; una vez
          aceptada, la orden queda bloqueada.
        </p>
      </Modal>
    </div>
  );
}
