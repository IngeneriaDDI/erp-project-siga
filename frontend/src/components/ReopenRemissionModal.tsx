import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getRemissionCandidates, reopenRemission } from '../services/harvestRemissions';
import { getApiErrorMessage } from '../lib/api';
import { formatWeight } from '../lib/weight';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Pager } from './ui/Pager';
import { Table } from './ui/Table';
import { Alert, Badge, Spinner } from './ui/misc';
import type { Remission, RemissionCandidate, RemissionCandidates } from '../types';

interface Props {
  remission: Remission;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Reabrir y recalcular una remisión con calidades rechazadas: se puede añadir y quitar
 * registros. Los de calidades ya recibidas quedan bloqueados, y los que pertenecen a
 * otra remisión no se pueden añadir (hay que editar esa remisión para liberarlos).
 */
export function ReopenRemissionModal({ remission, open, onClose, onDone }: Props) {
  const { weightUnit } = useAuth();
  const fmtW = (g: number) => formatWeight(g, weightUnit);
  const [cands, setCands] = useState<RemissionCandidates | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    setPage(1);
    getRemissionCandidates({
      date: remission.fecha.slice(0, 10),
      lotId: remission.lotId,
      remissionId: remission.id,
    })
      .then((c) => {
        if (cancelled) return;
        setCands(c);
        setSelected(new Set(c.records.filter((r) => r.enEstaRemision).map((r) => r.id)));
      })
      .catch((e) => !cancelled && setError(getApiErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, remission.id, remission.fecha, remission.lotId]);

  const records = cands?.records ?? [];
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const pageSafe = Math.min(page, pages);
  const paged = records.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const toggle = (c: RemissionCandidate) => {
    setNotice(null);
    const n = c.recordNumber ?? '';
    if (c.bloqueado) {
      setNotice(
        c.enEstaRemision
          ? `El registro ${n} pertenece a una calidad ya recibida: no se puede quitar.`
          : `El registro ${n} tiene una calidad ya recibida en esta remisión: no se puede añadir.`,
      );
      return;
    }
    if (c.remision) {
      setNotice(
        `No es posible añadir el registro ${n}: ya está ligado a la remisión ${c.remision}. Edita esa remisión para liberarlo.`,
      );
      return;
    }
    if (!c.valido) {
      setNotice(`El registro ${n} está incompleto (sin peso o canastillas).`);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
  };

  const totals = useMemo(() => {
    let peso = 0;
    let cans = 0;
    for (const c of records) {
      if (selected.has(c.id)) {
        peso += c.pesoGramos;
        cans += c.canastillas;
      }
    }
    return { peso, cans };
  }, [records, selected]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await reopenRemission(remission.id, [...selected]);
      onDone();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Reabrir y recalcular ${remission.documentNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            leftIcon={<RotateCcw size={16} />}
            onClick={save}
            disabled={saving || loading || selected.size === 0}
          >
            {saving ? 'Recalculando…' : 'Recalcular remisión'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Marca los registros que deben quedar en la remisión. Se vuelven a leer sus valores actuales
          (peso, canastillas y calidad) y las calidades rechazadas quedan de nuevo pendientes de
          recepción. Las calidades ya recibidas no se modifican y el consecutivo se conserva.
        </p>
        {error && <Alert>{error}</Alert>}
        {notice && <Alert variant="warning">{notice}</Alert>}
        {loading ? (
          <Spinner />
        ) : (
          <>
            <Table<RemissionCandidate>
              keyField={(c) => c.id}
              rows={paged}
              columns={[
                {
                  header: '',
                  render: (c) => (
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c)}
                      aria-label={`Registro ${c.recordNumber ?? ''}`}
                    />
                  ),
                },
                { header: 'N.°', render: (c) => c.recordNumber ?? '—' },
                { header: 'Trabajador', render: (c) => `${c.workerCodigo} · ${c.workerNombre}` },
                { header: 'Calidad', render: (c) => c.qualityNombre },
                { header: 'Peso', render: (c) => fmtW(c.pesoGramos), className: 'text-right' },
                { header: 'Canast.', render: (c) => c.canastillas, className: 'text-right' },
                {
                  header: 'Estado',
                  render: (c) =>
                    c.bloqueado ? (
                      <Badge color="gray">{c.enEstaRemision ? 'Recibido (fijo)' : 'Calidad recibida'}</Badge>
                    ) : c.remision ? (
                      <Badge color="gray">En {c.remision}</Badge>
                    ) : !c.valido ? (
                      <Badge color="red">Incompleto</Badge>
                    ) : c.enEstaRemision ? (
                      <Badge color="amber">En esta remisión</Badge>
                    ) : (
                      <Badge color="green">Disponible</Badge>
                    ),
                },
              ]}
            />
            <Pager
              page={pageSafe}
              pageSize={pageSize}
              total={records.length}
              onPage={setPage}
              onPageSize={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              sizes={[25, 50, 100]}
            />
            <div className="rounded-lg bg-primary-light p-3">
              <span className="font-medium text-content">{selected.size}</span> registros ·{' '}
              <span className="font-medium text-primary">{fmtW(totals.peso)}</span> · {totals.cans} canastillas
              <span className="ml-2 text-xs text-muted">(el servidor recalcula al guardar)</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
