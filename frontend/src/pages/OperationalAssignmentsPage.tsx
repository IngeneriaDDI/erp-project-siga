import { useCallback, useEffect, useState } from 'react';
import { History, UserCheck, UserX } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  assignWorker,
  clearAssignment,
  getAssignmentHistory,
  listActiveAssignments,
} from '../services/operational';
import { listWorkers } from '../services/workers';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import { getApiErrorMessage } from '../lib/api';
import type { ActiveAssignment, AssignmentHistoryRow, OperationalContext, Worker } from '../types';

const CONTEXT_LABEL: Record<OperationalContext, string> = {
  HARVEST_WEIGHING: 'Pesaje en cosecha',
  POSTHARVEST_AUTHORIZATION: 'Autorización en postcosecha',
};
const CONTEXT_HELP: Record<OperationalContext, string> = {
  HARVEST_WEIGHING: 'Trabajador que aparece como quien registra/entrega en la báscula de cosecha.',
  POSTHARVEST_AUTHORIZATION:
    'Trabajador que aparece como quien recibe/autoriza en postcosecha.',
};

function fmt(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString();
}

function ContextCard({
  assignment,
  workers,
  onChanged,
}: {
  assignment: ActiveAssignment;
  workers: Worker[];
  onChanged: () => void;
}) {
  const ctx = assignment.context;
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AssignmentHistoryRow[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const assign = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await assignWorker(ctx, selected);
      setSelected('');
      onChanged();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearAssignment(ctx);
      onChanged();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history === null) {
      try {
        setHistory(await getAssignmentHistory(ctx));
      } catch {
        setHistory([]);
      }
    }
  };

  const workerName = (id: string) => workers.find((w) => w.id === id)?.nombre ?? id;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-content">{CONTEXT_LABEL[ctx]}</h2>
          <p className="text-sm text-muted">{CONTEXT_HELP[ctx]}</p>
        </div>
        {assignment.worker ? (
          <Badge color="green">
            <span className="inline-flex items-center gap-1">
              <UserCheck size={13} /> {assignment.worker.nombre}
            </span>
          </Badge>
        ) : (
          <Badge color="amber">
            <span className="inline-flex items-center gap-1">
              <UserX size={13} /> Sin operador
            </span>
          </Badge>
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Select
            label="Asignar trabajador"
            value={selected}
            disabled={busy}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">— Selecciona un trabajador —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nombre} ({w.codigoInterno})
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={assign} disabled={busy || !selected} leftIcon={<UserCheck size={16} />}>
            Asignar
          </Button>
          {assignment.worker && (
            <Button variant="secondary" onClick={clear} disabled={busy}>
              Liberar
            </Button>
          )}
        </div>
      </div>

      <button
        onClick={toggleHistory}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-content"
      >
        <History size={14} /> {showHistory ? 'Ocultar' : 'Ver'} historial
      </button>
      {showHistory && (
        <div className="overflow-hidden rounded-lg border border-border">
          {history === null ? (
            <Spinner label="Cargando historial…" />
          ) : history.length === 0 ? (
            <p className="p-3 text-sm text-muted">Sin movimientos.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-background text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2">Trabajador</th>
                  <th className="px-3 py-2">Desde</th>
                  <th className="px-3 py-2">Hasta</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-3 py-2 text-content">{workerName(h.workerId)}</td>
                    <td className="px-3 py-2 text-muted">{fmt(h.validFrom)}</td>
                    <td className="px-3 py-2 text-muted">{fmt(h.validTo)}</td>
                    <td className="px-3 py-2">
                      {h.active ? <Badge color="green">Activo</Badge> : <Badge>Histórico</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function OperationalAssignmentsPage() {
  const { data: assignments, loading, error, reload } = useAsyncData(listActiveAssignments, []);
  const [workers, setWorkers] = useState<Worker[]>([]);

  const loadWorkers = useCallback(() => {
    listWorkers({ status: 'ACTIVE' })
      .then(setWorkers)
      .catch(() => setWorkers([]));
  }, []);
  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-content">Operadores activos</h1>
        <p className="text-sm text-muted">
          Define qué trabajador ocupa cada posición operativa. El backend usa esta asignación para
          firmar las operaciones; los documentos ya emitidos conservan el nombre original.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {(assignments ?? []).map((a) => (
            <ContextCard key={a.context} assignment={a} workers={workers} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
