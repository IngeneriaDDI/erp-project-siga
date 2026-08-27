import { ReactNode, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, PackageCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  getRemission,
  receiveRemission,
  receiveRemissionDetail,
  rejectRemissionDetail,
} from '../services/harvestRemissions';
import { getApiErrorMessage } from '../lib/api';
import { formatWeight } from '../lib/weight';
import { PERMS } from '../lib/permissions';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import type { RemissionDetailStatus, RemissionQualityDetail, RemissionStatus } from '../types';

function HeaderBadge({ status }: { status: RemissionStatus }) {
  if (status === 'RECIBIDA') return <Badge color="green">Recibida</Badge>;
  if (status === 'ANULADA') return <Badge color="red">Anulada</Badge>;
  return <Badge color="amber">Pendiente recepción</Badge>;
}

function DetailBadge({ status }: { status: RemissionDetailStatus }) {
  if (status === 'RECIBIDA') return <Badge color="green">Recibida</Badge>;
  if (status === 'RECHAZADA') return <Badge color="red">Rechazada</Badge>;
  return <Badge color="amber">Pendiente</Badge>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-medium text-content">{value ?? '—'}</div>
    </div>
  );
}

export default function RemissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, weightUnit } = useAuth();
  const canApprove = hasPermission(PERMS.POSTHARVEST_REMISSIONS_APPROVE);
  const canReject = hasPermission(PERMS.POSTHARVEST_REMISSIONS_REJECT);
  const fmtW = (g: number) => formatWeight(g, weightUnit);

  const { data: rem, loading, error, reload } = useAsyncData(() => getRemission(id as string), [id]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const doReceiveAll = async () => {
    if (!rem) return;
    setReceiving(true);
    setActionError(null);
    try {
      await receiveRemission(rem.id);
      setConfirmOpen(false);
      reload();
    } catch (e) {
      setActionError(getApiErrorMessage(e));
      setConfirmOpen(false);
    } finally {
      setReceiving(false);
    }
  };

  const handleDetail = async (detailId: string, accept: boolean) => {
    if (!rem) return;
    setProcessing(detailId);
    setActionError(null);
    try {
      if (accept) await receiveRemissionDetail(rem.id, detailId);
      else await rejectRemissionDetail(rem.id, detailId);
      reload();
    } catch (e) {
      setActionError(getApiErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;
  if (!rem) return <Alert>Remisión no encontrada</Alert>;

  const hayPendientes = (rem.details ?? []).some((d) => d.status === 'PENDIENTE_RECEPCION');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-content">Remisión {rem.documentNumber}</h1>
          <HeaderBadge status={rem.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/harvest-remissions')}>
            Volver
          </Button>
          {canApprove && hayPendientes && (
            <Button leftIcon={<PackageCheck size={16} />} onClick={() => setConfirmOpen(true)}>
              Recibir todo lo pendiente
            </Button>
          )}
        </div>
      </div>

      {actionError && <Alert>{actionError}</Alert>}

      <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 shadow-card sm:grid-cols-3">
        <Field label="Fecha de cosecha" value={rem.fecha?.slice(0, 10)} />
        <Field label="Finca" value={rem.farmNombre} />
        <Field label="Lote" value={rem.lotNombre} />
        <Field label="Total peso" value={fmtW(rem.totalPesoGramos)} />
        <Field label="Total canastillas" value={rem.totalCanastillas} />
        <Field label="Registros incluidos" value={rem.registrosIncluidos} />
        <Field label="Creada por" value={rem.createdByNombre} />
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-content">Calidades (recepción independiente)</h2>
        <Table<RemissionQualityDetail>
          keyField={(q) => q.id}
          rows={rem.details ?? []}
          columns={[
            { header: 'Calidad', render: (q) => q.qualityNombre ?? q.qualityId },
            { header: 'Peso', render: (q) => fmtW(q.pesoGramos), className: 'text-right' },
            { header: 'Canastillas', render: (q) => q.canastillas, className: 'text-right' },
            { header: 'Estado', render: (q) => <DetailBadge status={q.status} /> },
            { header: 'Recibió', render: (q) => q.receivedByNombre ?? '—' },
            {
              header: 'Acciones',
              render: (q) =>
                (canApprove || canReject) && q.status === 'PENDIENTE_RECEPCION' ? (
                  <div className="flex gap-1">
                    {canApprove && (
                      <Button
                        variant="success"
                        size="sm"
                        leftIcon={<Check size={14} />}
                        disabled={processing === q.id}
                        onClick={() => handleDetail(q.id, true)}
                      >
                        Recibir
                      </Button>
                    )}
                    {canReject && (
                      <Button
                        variant="danger"
                        size="sm"
                        leftIcon={<X size={14} />}
                        disabled={processing === q.id}
                        onClick={() => handleDetail(q.id, false)}
                      >
                        Rechazar
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                ),
            },
          ]}
        />
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Recibir todas las calidades pendientes"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={doReceiveAll} disabled={receiving}>
              {receiving ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-content">
          Se marcarán como recibidas todas las calidades que estén pendientes. Las calidades ya
          recibidas o rechazadas no se modifican.
        </p>
      </Modal>
    </div>
  );
}
