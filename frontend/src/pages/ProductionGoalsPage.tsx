import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { MasterImportButton } from '../components/MasterImportButton';
import { Input } from '../components/ui/Input';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Alert, Spinner } from '../components/ui/misc';
import { getApiErrorMessage } from '../lib/api';
import { formatKgString, formatMicroKg, parseKgMicro } from '../lib/decimalKg';
import { useAsyncData } from '../hooks/useAsyncData';
import { listLots } from '../services/lots';
import {
  createGoals,
  deleteGoals,
  GoalSummary,
  listGoals,
  updateGoals,
} from '../services/productionGoals';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const PAGE_SIZES = [25, 50, 100];
const emptyMonths = () => Array<string>(12).fill('');

export default function ProductionGoalsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const yearNum = /^\d{4}$/.test(year) ? Number(year) : undefined;
  const monthNum = month ? Number(month) : undefined;

  const { data, loading, error, reload } = useAsyncData(
    () => listGoals({ page, pageSize, year: yearNum, month: monthNum, search: debounced || undefined }),
    [page, pageSize, yearNum, monthNum, debounced],
  );
  const lots = useAsyncData(() => listLots({ status: 'ACTIVE' }), []);

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // ---- Formulario ----
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GoalSummary | null>(null);
  const [lotId, setLotId] = useState('');
  const [formYear, setFormYear] = useState(String(new Date().getFullYear()));
  const [values, setValues] = useState<string[]>(emptyMonths());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lotOptions = useMemo(
    () =>
      (lots.data ?? [])
        .filter((l) => (l.numeroPlantas ?? 0) > 0)
        .map((l) => ({
          value: l.id,
          label: `${l.nombreLote} · ${l.variedad} (${l.numeroPlantas} plantas)`,
          keywords: l.nombreLote,
        })),
    [lots.data],
  );
  const selectedLot = (lots.data ?? []).find((l) => l.id === lotId);
  const plants = editing ? editing.plantasActuales ?? editing.plantas ?? 0 : selectedLot?.numeroPlantas ?? 0;

  const openNew = () => {
    setEditing(null);
    setLotId('');
    setFormYear(String(new Date().getFullYear()));
    setValues(emptyMonths());
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (row: GoalSummary) => {
    setEditing(row);
    setLotId(row.lotId);
    setFormYear(String(row.year));
    const v = emptyMonths();
    for (const m of row.months) v[m.month - 1] = m.kgPlanta.replace('.', ',');
    setValues(v);
    setFormError(null);
    setOpen(true);
  };

  // Totales en vivo con aritmética entera (micro-kg), sin floats.
  const parsed = values.map(parseKgMicro);
  const allValid = parsed.every((p) => p !== null);
  const sumMicro = parsed.reduce<bigint>((acc, p) => acc + (p ?? 0n), 0n);
  const totalLotMicro = sumMicro * BigInt(plants || 0);

  const save = async () => {
    setFormError(null);
    if (!editing && !lotId) return setFormError('Selecciona un lote');
    if (!/^\d{4}$/.test(formYear)) return setFormError('Año inválido');
    if (!allValid) {
      return setFormError('Completa los 12 meses con números ≥ 0 (máx. 6 decimales). Usa 0 si no hay meta.');
    }
    const months = values.map((v, i) => ({ month: i + 1, kgPerPlant: v.trim().replace(',', '.') }));
    setSaving(true);
    try {
      const res = editing
        ? await updateGoals(editing.lotId, editing.year, months)
        : await createGoals({ lotId, year: Number(formYear), months });
      setOpen(false);
      setNotice(
        res.roundedCount
          ? `Guardado. ${res.roundedCount} valor(es) se redondearon a 3 decimales en gramos.`
          : 'Metas guardadas correctamente.',
      );
      setTimeout(() => setNotice(null), 4000);
      reload();
    } catch (e) {
      setFormError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: GoalSummary) => {
    if (!window.confirm(`¿Eliminar las metas del lote ${row.lotNombre} para ${row.year}?`)) return;
    try {
      await deleteGoals(row.lotId, row.year);
      reload();
    } catch (e) {
      setNotice(getApiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-content">Metas de producción</h1>
          <p className="text-sm text-muted">
            Meta mensual en kg por planta, por lote y año. Se guarda en gramos (3 decimales).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MasterImportButton entity="goals" onDone={reload} />
          <Button onClick={openNew} leftIcon={<Plus size={16} />}>
            Nueva meta
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por lote o finca…"
            className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="w-28">
          <Input
            placeholder="Año"
            inputMode="numeric"
            maxLength={4}
            value={year}
            onChange={(e) => {
              setYear(e.target.value.replace(/\D/g, ''));
              setPage(1);
            }}
          />
        </div>
        <select
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm text-content"
        >
          <option value="">Todos los meses</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-background">
              <tr>
                {[
                  '', 'Año', 'Lote', 'Variedad', 'Finca', 'Plantas',
                  month ? `Meta ${MONTHS[Number(month) - 1]} (kg/planta)` : null,
                  'Total anual (kg/planta)', 'Total lote (kg)', 'Acciones',
                ]
                  .filter((h) => h !== null)
                  .map((h, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted">
                    Sin metas registradas
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const key = `${r.lotId}-${r.year}`;
                  const isOpen = expanded === key;
                  return (
                    <Fragment key={key}>
                      <tr className="hover:bg-background/60">
                        <td className="px-4 py-3">
                          <IconButton
                            icon={isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            label={isOpen ? 'Ocultar meses' : 'Ver 12 meses'}
                            onClick={() => setExpanded(isOpen ? null : key)}
                          />
                        </td>
                        <td className="px-4 py-3">{r.year}</td>
                        <td className="px-4 py-3">{r.lotNombre ?? '—'}</td>
                        <td className="px-4 py-3">{r.variedad ?? '—'}</td>
                        <td className="px-4 py-3">{r.farmNombre ?? '—'}</td>
                        <td className="px-4 py-3">{r.plantas ?? '—'}</td>
                        {month && <td className="px-4 py-3">{formatKgString(r.monthValueKg, 6)}</td>}
                        <td className="px-4 py-3 font-medium">{formatKgString(r.totalKgPlanta, 6)}</td>
                        <td className="px-4 py-3 font-medium">{formatKgString(r.totalKgLote, 3)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <IconButton icon={<Pencil size={16} />} label="Editar" tone="info" onClick={() => openEdit(r)} />
                            <IconButton icon={<Trash2 size={16} />} label="Eliminar" tone="danger" onClick={() => remove(r)} />
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-background/40">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                              {r.months.map((m) => (
                                <div key={m.month} className="rounded-lg border border-border bg-surface p-2">
                                  <div className="text-xs text-muted">{MONTHS[m.month - 1]}</div>
                                  <div className="text-sm font-semibold text-content">
                                    {formatKgString(m.kgPlanta, 6)} kg/planta
                                  </div>
                                  <div className="text-xs text-muted">{formatKgString(m.kgLote, 3)} kg lote</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>{total === 0 ? 'Sin resultados' : `Mostrando ${from}–${to} de ${total}`}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              Por página
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-border px-2 py-1 text-sm text-content"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" onClick={() => setPage(page - 1)} disabled={page <= 1} leftIcon={<ChevronLeft size={16} />}>
              Anterior
            </Button>
            <span>
              Página {page} de {totalPages}
            </span>
            <Button variant="secondary" onClick={() => setPage(page + 1)} disabled={page >= totalPages} leftIcon={<ChevronRight size={16} />}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar metas · ${editing.lotNombre} · ${editing.year}` : 'Nuevas metas de producción'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving} leftIcon={<Save size={16} />}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <Alert>{formError}</Alert>}

          {!editing && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <SearchableSelect
                  label="Lote"
                  value={lotId}
                  onChange={setLotId}
                  options={lotOptions}
                  placeholder="Selecciona un lote activo con plantas"
                />
              </div>
              <Input
                label="Año"
                inputMode="numeric"
                maxLength={4}
                value={formYear}
                onChange={(e) => setFormYear(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MONTHS.map((m, i) => (
              <Input
                key={m}
                label={`${m} (kg/planta)`}
                inputMode="decimal"
                placeholder="0"
                value={values[i]}
                error={values[i] !== '' && parsed[i] === null ? 'Número inválido' : undefined}
                onChange={(e) => setValues(values.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg bg-primary-light p-3 text-center">
            <div>
              <div className="text-xs text-muted">Plantas del lote</div>
              <div className="text-lg font-bold text-content">{plants || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Total anual (kg/planta)</div>
              <div className="text-lg font-bold text-content">{formatMicroKg(sumMicro, 6)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Total lote (kg)</div>
              <div className="text-lg font-bold text-success">{formatMicroKg(totalLotMicro, 3)}</div>
            </div>
          </div>
          <p className="text-xs text-muted">
            Los 12 meses son obligatorios (usa 0 si no hay meta). Se acepta coma o punto decimal.
          </p>
        </div>
      </Modal>
    </div>
  );
}
