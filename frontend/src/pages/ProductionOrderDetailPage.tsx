import { ReactNode, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { acceptOrder, getOrder } from '../services/productionOrders';
import { getApiErrorMessage } from '../lib/api';
import { formatWeight } from '../lib/weight';
import { PERMS } from '../lib/permissions';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import type { LotLine, LotQualityLine, ProductionOrderStatus, QualityLine } from '../types';

function StatusBadge({ status }: { status: ProductionOrderStatus }) {
  if (status === 'ACEPTADA') return <Badge color="green">Aceptada</Badge>;
  if (status === 'ANULADA') return <Badge color="red">Anulada</Badge>;
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
  const fmtW = (g: number) => formatWeight(g, weightUnit);

  const { data: order, loading, error, reload } = useAsyncData(() => getOrder(id as string), [id]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

      {order.remisiones && order.remisiones.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-content">Remisiones asociadas (trazabilidad)</h2>
          <div className="flex flex-wrap gap-2">
            {order.remisiones.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/harvest-remissions/${r.id}`)}
                className="rounded-lg border border-border bg-surface px-3 py-1 text-sm text-primary hover:bg-primary-light"
              >
                {r.documentNumber}
              </button>
            ))}
          </div>
        </div>
      )}

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
