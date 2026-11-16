import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FolderOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import { listOrders, openOrder, type OrderFilters } from '../services/productionOrders';
import { getApiErrorMessage } from '../lib/api';
import { formatWeight } from '../lib/weight';
import { PERMS } from '../lib/permissions';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Table } from '../components/ui/Table';
import { Pager } from '../components/ui/Pager';
import { OperatorStatusBanner } from '../components/OperatorStatusBanner';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import type { ProductionOrder, ProductionOrderStatus } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ status }: { status: ProductionOrderStatus }) {
  if (status === 'ACEPTADA') return <Badge color="green">Aceptada</Badge>;
  if (status === 'ANULADA') return <Badge color="red">Anulada</Badge>;
  if (status === 'ABIERTA') return <Badge color="blue">Abierta</Badge>;
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
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const doOpen = async () => {
    setOpenError(null);
    if (!farmId) {
      setOpenError('Selecciona una finca');
      return;
    }
    setOpening(true);
    try {
      const order = await openOrder({ date, farmId });
      navigate(`/production-orders/${order.id}`);
    } catch (e) {
      setOpenError(getApiErrorMessage(e));
    } finally {
      setOpening(false);
    }
  };

  const [filters, setFilters] = useState<OrderFilters>({ page: 1, pageSize: 20 });
  const { data, loading, error } = useAsyncData(() => listOrders(filters), [JSON.stringify(filters)]);
  const setFilter = (patch: Partial<OrderFilters>) => setFilters((p) => ({ ...p, ...patch, page: 1 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-content">Órdenes de producción</h1>
        <p className="text-sm text-muted">
          La orden se abre al iniciar el día, recibe las remisiones y se cierra al final con el
          consolidado de toda la cosecha de la finca.
        </p>
      </div>

      {/* Abrir */}
      {canCreate && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-card">
          <h2 className="font-semibold text-content">Abrir orden del día</h2>
          <OperatorStatusBanner onBlockedChange={setOpBlocked} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <SearchableSelect
              label="Finca"
              value={farmId}
              onChange={setFarmId}
              options={(farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }))}
            />
            <div className="flex items-end">
              <Button
                leftIcon={<FolderOpen size={16} />}
                onClick={doOpen}
                disabled={opening || !farmId || opBlocked}
                className="w-full"
              >
                {opening ? 'Abriendo…' : 'Abrir orden'}
              </Button>
            </div>
          </div>
          {openError && <Alert>{openError}</Alert>}
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
            <option value="ABIERTA">Abierta</option>
            <option value="PENDIENTE_ACEPTACION">Pendiente aceptación</option>
            <option value="ACEPTADA">Aceptada</option>
            <option value="ANULADA">Anulada</option>
          </Select>
        </div>

        {error && <Alert>{error}</Alert>}
        {loading ? (
          <Spinner />
        ) : (
          <>
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
          <Pager
            page={data?.page ?? 1}
            pageSize={data?.pageSize ?? filters.pageSize ?? 20}
            total={data?.total ?? 0}
            onPage={(p) => setFilters((prev) => ({ ...prev, page: p }))}
            onPageSize={(sz) => setFilters((prev) => ({ ...prev, pageSize: sz, page: 1 }))}
          />
          </>
        )}
      </div>
    </div>
  );
}
