import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileText, ListChecks, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import { listLots } from '../services/lots';
import {
  createRemission,
  getRemissionCandidates,
  listRemissions,
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
import { Pager } from '../components/ui/Pager';
import { OperatorStatusBanner } from '../components/OperatorStatusBanner';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import type {
  Remission,
  RemissionCandidate,
  RemissionCandidates,
  RemissionStatus,
} from '../types';

const today = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ status }: { status: RemissionStatus }) {
  if (status === 'RECIBIDA') return <Badge color="green">Recibida</Badge>;
  if (status === 'ANULADA') return <Badge color="red">Anulada</Badge>;
  return <Badge color="amber">Pendiente recepción</Badge>;
}

// Un registro se puede remitir si es válido y aún no está en otra remisión.
const isSelectable = (c: RemissionCandidate) => c.valido && !c.remision;

export default function RemissionsPage() {
  const { hasPermission, weightUnit } = useAuth();
  const navigate = useNavigate();
  const canCreate = hasPermission(PERMS.HARVEST_REMISSIONS_CREATE);
  const [opBlocked, setOpBlocked] = useState(false);
  const fmtW = (g: number) => formatWeight(g, weightUnit);

  const farms = useAsyncData(() => listFarms('ACTIVE'), []);
  const lots = useAsyncData(() => listLots({ status: 'ACTIVE' }), []);

  // --- Generar remisión (parcial) ---
  const [date, setDate] = useState(today());
  const [farmId, setFarmId] = useState('');
  const [lotId, setLotId] = useState('');
  const [cands, setCands] = useState<RemissionCandidates | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [loadingCands, setLoadingCands] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [candPage, setCandPage] = useState(1);
  const [candPageSize, setCandPageSize] = useState(50);

  const farmLots = useMemo(
    () => (lots.data ?? []).filter((l) => l.farmId === farmId),
    [lots.data, farmId],
  );

  const resetSelection = () => {
    setCands(null);
    setSelected(new Set());
    setRangeFrom('');
    setRangeTo('');
    setCandPage(1);
  };

  const loadCandidates = async () => {
    setFormError(null);
    resetSelection();
    if (!lotId) {
      setFormError('Selecciona un lote');
      return;
    }
    setLoadingCands(true);
    try {
      setCands(await getRemissionCandidates({ date, lotId }));
    } catch (e) {
      setFormError(getApiErrorMessage(e));
    } finally {
      setLoadingCands(false);
    }
  };

  const records = cands?.records ?? [];
  const selectable = records.filter(isSelectable);
  // Paginación en cliente: la selección (rango, "todos", casillas) abarca todas las páginas.
  const candPages = Math.max(1, Math.ceil(records.length / candPageSize));
  const candPageSafe = Math.min(candPage, candPages);
  const pagedRecords = records.slice((candPageSafe - 1) * candPageSize, candPageSafe * candPageSize);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyRange = () => {
    setFormError(null);
    const from = rangeFrom ? Number(rangeFrom) : undefined;
    const to = rangeTo ? Number(rangeTo) : undefined;
    if (from === undefined && to === undefined) {
      setFormError('Indica el N.° desde y/o hasta');
      return;
    }
    if (from !== undefined && to !== undefined && from > to) {
      setFormError('El N.° "desde" no puede ser mayor que el "hasta"');
      return;
    }
    const ids = selectable
      .filter(
        (c) =>
          c.recordNumber !== null &&
          (from === undefined || c.recordNumber >= from) &&
          (to === undefined || c.recordNumber <= to),
      )
      .map((c) => c.id);
    if (ids.length === 0) {
      setFormError('Ningún registro pendiente de este lote cae en ese rango');
      return;
    }
    setSelected(new Set(ids));
  };

  // Totales del seleccionado (cálculo informativo; el servidor recalcula al crear).
  const selectedRecords = records.filter((c) => selected.has(c.id));
  const totals = useMemo(() => {
    let peso = 0;
    let cans = 0;
    const byQ = new Map<string, { nombre: string; peso: number; cans: number }>();
    for (const c of selectedRecords) {
      peso += c.pesoGramos;
      cans += c.canastillas;
      const q = byQ.get(c.qualityId) ?? { nombre: c.qualityNombre, peso: 0, cans: 0 };
      q.peso += c.pesoGramos;
      q.cans += c.canastillas;
      byQ.set(c.qualityId, q);
    }
    return { peso, cans, byQuality: [...byQ.entries()].map(([id, v]) => ({ id, ...v })) };
  }, [selectedRecords]);

  const selectedNumbers = selectedRecords
    .map((c) => c.recordNumber)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  const rangeLabel = selectedNumbers.length
    ? `#${selectedNumbers[0]}–${selectedNumbers[selectedNumbers.length - 1]}`
    : '';

  const doCreate = async () => {
    setCreating(true);
    setFormError(null);
    try {
      const rem = await createRemission({ date, lotId, recordIds: [...selected] });
      setConfirmOpen(false);
      resetSelection();
      setHistoryKey((k) => k + 1);
      navigate(`/harvest-remissions/${rem.id}`);
    } catch (e) {
      setFormError(getApiErrorMessage(e));
      setConfirmOpen(false);
      // Los pendientes pudieron cambiar (otro usuario): se vuelve a consultar.
      loadCandidates();
    } finally {
      setCreating(false);
    }
  };

  // --- Historial ---
  const [filters, setFilters] = useState<RemissionFilters>({ page: 1, pageSize: 20 });
  const { data, loading, error } = useAsyncData(
    () => listRemissions(filters),
    [JSON.stringify(filters), historyKey],
  );
  const setFilter = (patch: Partial<RemissionFilters>) => setFilters((p) => ({ ...p, ...patch, page: 1 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-content">Remisiones de cosecha</h1>
        <p className="text-sm text-muted">
          Entrega de fruta por lote desde Cosecha hacia Postcosecha. Puedes remitir solo una parte de
          los registros del día (por rango de N.°).
        </p>
      </div>

      {/* Generar */}
      {canCreate && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-card">
          <h2 className="font-semibold text-content">Generar remisión</h2>
          <OperatorStatusBanner onBlockedChange={setOpBlocked} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="Fecha de cosecha"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                resetSelection();
              }}
            />
            <SearchableSelect
              label="Finca"
              value={farmId}
              onChange={(v) => {
                setFarmId(v);
                setLotId('');
                resetSelection();
              }}
              options={(farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }))}
            />
            <SearchableSelect
              label="Lote"
              value={lotId}
              onChange={(v) => {
                setLotId(v);
                resetSelection();
              }}
              disabled={!farmId}
              placeholder={farmId ? '— Selecciona —' : 'Elige una finca primero'}
              options={farmLots.map((l) => ({
                value: l.id,
                label: l.nombreLote,
                code: l.nombreLote,
                keywords: `${l.nombreLote} ${l.variedad}`,
              }))}
            />
            <div className="flex items-end">
              <Button
                leftIcon={<Search size={16} />}
                onClick={loadCandidates}
                disabled={loadingCands || !lotId}
                className="w-full"
              >
                {loadingCands ? 'Consultando…' : 'Consultar registros'}
              </Button>
            </div>
          </div>

          {formError && <Alert>{formError}</Alert>}

          {cands && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Lote <span className="font-medium text-content">{cands.lot.nombreLote}</span> ·{' '}
                {cands.records.length} registros del día ·{' '}
                <span className="font-medium text-content">{cands.pendientes} pendientes</span> de remitir
              </p>

              {selectable.length === 0 ? (
                <Alert variant="warning">
                  No hay registros pendientes de remitir para este lote y fecha.
                </Alert>
              ) : (
                <>
                  {/* Selección por rango */}
                  <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
                    <div className="w-32">
                      <Input
                        label="N.° desde"
                        inputMode="numeric"
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    <div className="w-32">
                      <Input
                        label="N.° hasta"
                        inputMode="numeric"
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    <Button variant="secondary" leftIcon={<ListChecks size={16} />} onClick={applyRange}>
                      Seleccionar rango
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setSelected(new Set(selectable.map((c) => c.id)))}
                    >
                      Todos los pendientes
                    </Button>
                    <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
                      Limpiar
                    </Button>
                  </div>

                  <Table<RemissionCandidate>
                    keyField={(c) => c.id}
                    rows={pagedRecords}
                    columns={[
                      {
                        header: '',
                        render: (c) => (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={selected.has(c.id)}
                            disabled={!isSelectable(c)}
                            onChange={() => toggle(c.id)}
                            aria-label={`Seleccionar registro ${c.recordNumber ?? ''}`}
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
                          c.remision ? (
                            <Badge color="gray">En {c.remision}</Badge>
                          ) : !c.valido ? (
                            <Badge color="red">Incompleto</Badge>
                          ) : (
                            <Badge color="green">Pendiente</Badge>
                          ),
                      },
                    ]}
                  />
                  <Pager
                    page={candPageSafe}
                    pageSize={candPageSize}
                    total={records.length}
                    onPage={setCandPage}
                    onPageSize={(s) => {
                      setCandPageSize(s);
                      setCandPage(1);
                    }}
                    sizes={[25, 50, 100, 200]}
                  />

                  {/* Resumen de la selección */}
                  <div className="grid gap-3 rounded-lg bg-primary-light p-4 sm:grid-cols-4">
                    <div>
                      <div className="text-xs text-muted">Registros seleccionados</div>
                      <div className="text-lg font-bold text-content">
                        {selected.size}
                        {rangeLabel && <span className="ml-2 text-sm font-medium text-muted">{rangeLabel}</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Total peso</div>
                      <div className="text-lg font-bold text-primary">{fmtW(totals.peso)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Total canastillas</div>
                      <div className="text-lg font-bold text-content">{totals.cans}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Por calidad</div>
                      <div className="text-sm text-content">
                        {totals.byQuality.length === 0
                          ? '—'
                          : totals.byQuality.map((q) => `${q.nombre}: ${fmtW(q.peso)}`).join(' · ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      leftIcon={<FileText size={16} />}
                      onClick={() => setConfirmOpen(true)}
                      disabled={opBlocked || selected.size === 0}
                    >
                      Crear remisión
                    </Button>
                  </div>
                </>
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
          <>
          <Table<Remission>
            keyField={(r) => r.id}
            rows={data?.data ?? []}
            columns={[
              { header: 'Consecutivo', render: (r) => r.documentNumber },
              { header: 'Fecha', render: (r) => r.fecha?.slice(0, 10) },
              { header: 'Finca', render: (r) => r.farmNombre ?? '—' },
              { header: 'Lote', render: (r) => r.lotNombre ?? '—' },
              { header: 'Registros', render: (r) => r.registrosRango || '—' },
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
          <Pager
            page={data?.page ?? 1}
            pageSize={data?.pageSize ?? filters.pageSize ?? 20}
            total={data?.total ?? 0}
            onPage={(p) => setFilters((prev) => ({ ...prev, page: p }))}
            onPageSize={(s) => setFilters((prev) => ({ ...prev, pageSize: s, page: 1 }))}
          />
          </>
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
        {cands && (
          <div className="space-y-2 text-sm text-content">
            <p>Se creará una remisión con estos totales (el sistema los recalcula al guardar):</p>
            <ul className="list-inside list-disc text-muted">
              <li>Lote: <span className="font-medium text-content">{cands.lot.nombreLote}</span></li>
              <li>Fecha: <span className="font-medium text-content">{date}</span></li>
              <li>
                Registros: <span className="font-medium text-content">{selected.size} {rangeLabel && `(${rangeLabel})`}</span>
              </li>
              <li>Total: <span className="font-medium text-content">{fmtW(totals.peso)} · {totals.cans} canastillas</span></li>
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
