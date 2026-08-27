import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ban, Eye, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import { listWorkers } from '../services/workers';
import { listLots } from '../services/lots';
import { listQualities } from '../services/qualities';
import { cancelHarvest, listHarvest, type HarvestFilters } from '../services/harvest';
import { Button, IconButton } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Table } from '../components/ui/Table';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import { getApiErrorMessage } from '../lib/api';
import { formatWeight } from '../lib/weight';
import { PERMS } from '../lib/permissions';
import type { HarvestRecord } from '../types';

export default function HarvestListPage() {
  const { hasPermission, weightUnit } = useAuth();
  const navigate = useNavigate();
  const canCreate = hasPermission(PERMS.HARVEST_RECORDS_CREATE);
  const canEdit = hasPermission(PERMS.HARVEST_RECORDS_UPDATE);

  const [filters, setFilters] = useState<HarvestFilters>({ page: 1, pageSize: 20 });
  const farms = useAsyncData(() => listFarms('ACTIVE'), []);
  const workers = useAsyncData(() => listWorkers({ status: 'ACTIVE' }), []);
  const lots = useAsyncData(() => listLots({ status: 'ACTIVE' }), []);
  const qualities = useAsyncData(() => listQualities({ status: 'ACTIVE' }), []);

  const { data, loading, error, reload } = useAsyncData(
    () => listHarvest(filters),
    [JSON.stringify(filters)],
  );

  const [actionError, setActionError] = useState<string | null>(null);

  const setFilter = (patch: Partial<HarvestFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));

  const cancel = async (rec: HarvestRecord) => {
    if (!window.confirm('¿Anular este registro de cosecha?')) return;
    setActionError(null);
    try {
      await cancelHarvest(rec.id);
      reload();
    } catch (e) {
      setActionError(getApiErrorMessage(e));
    }
  };

  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-content">Registros de cosecha</h1>
          <p className="text-sm text-muted">{total} registro(s)</p>
        </div>
        {canCreate && (
          <Link to="/harvest/new">
            <Button leftIcon={<Plus size={16} />}>Registrar cosecha</Button>
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-3 shadow-card sm:grid-cols-3 lg:grid-cols-4">
        <Input label="Desde" type="date" onChange={(e) => setFilter({ fechaDesde: e.target.value || undefined })} />
        <Input label="Hasta" type="date" onChange={(e) => setFilter({ fechaHasta: e.target.value || undefined })} />
        <Select label="Finca" onChange={(e) => setFilter({ farmId: e.target.value || undefined })}>
          <option value="">Todas</option>
          {(farms.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </Select>
        <Select label="Trabajador" onChange={(e) => setFilter({ workerId: e.target.value || undefined })}>
          <option value="">Todos</option>
          {(workers.data ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.codigoInterno} · {w.nombre}
            </option>
          ))}
        </Select>
        <Select label="Lote" onChange={(e) => setFilter({ lotId: e.target.value || undefined })}>
          <option value="">Todos</option>
          {(lots.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombreLote}
            </option>
          ))}
        </Select>
        <Select label="Calidad" onChange={(e) => setFilter({ qualityId: e.target.value || undefined })}>
          <option value="">Todas</option>
          {(qualities.data ?? []).map((q) => (
            <option key={q.id} value={q.id}>
              {q.nombre}
            </option>
          ))}
        </Select>
        <Select
          label="Estado"
          onChange={(e) => setFilter({ status: (e.target.value || undefined) as HarvestFilters['status'] })}
        >
          <option value="">Todos</option>
          <option value="ACTIVE">Activos</option>
          <option value="CANCELLED">Anulados</option>
        </Select>
      </div>

      {error && <Alert>{error}</Alert>}
      {actionError && <Alert>{actionError}</Alert>}

      {loading ? (
        <Spinner />
      ) : (
        <Table<HarvestRecord>
          keyField={(r) => r.id}
          rows={data?.data ?? []}
          columns={[
            { header: 'Fecha', render: (r) => r.fecha?.slice(0, 10) },
            { header: 'Finca', render: (r) => r.farm?.nombre ?? '—' },
            { header: 'Trabajador', render: (r) => r.worker?.nombre ?? '—' },
            { header: 'Lote', render: (r) => r.lot?.nombreLote ?? '—' },
            { header: 'Variedad', render: (r) => r.variedad },
            { header: 'Calidad', render: (r) => r.quality?.nombre ?? '—' },
            { header: 'Peso', render: (r) => formatWeight(r.gramosCosechados, weightUnit), className: 'text-right' },
            {
              header: 'Estado',
              render: (r) =>
                r.status === 'ACTIVE' ? <Badge color="green">Activo</Badge> : <Badge color="red">Anulado</Badge>,
            },
            {
              header: 'Acciones',
              render: (r) => (
                <div className="flex items-center gap-1">
                  <IconButton
                    icon={<Eye size={16} />}
                    label="Ver detalle"
                    tone="primary"
                    onClick={() => navigate(`/harvest/${r.id}`)}
                  />
                  {canEdit && r.status === 'ACTIVE' && (
                    <>
                      <IconButton
                        icon={<Pencil size={16} />}
                        label="Editar"
                        tone="info"
                        onClick={() => navigate(`/harvest/${r.id}/edit`)}
                      />
                      <IconButton
                        icon={<Ban size={16} />}
                        label="Anular"
                        tone="danger"
                        onClick={() => cancel(r)}
                      />
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      {/* Paginación */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">
          Página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setFilters((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setFilters((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
