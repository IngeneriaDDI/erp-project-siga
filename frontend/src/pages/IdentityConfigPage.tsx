import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPositions, setPosition } from '../services/operational';
import { getTenant, updateTenant } from '../services/tenants';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Alert, Spinner } from '../components/ui/misc';
import { getApiErrorMessage } from '../lib/api';
import type { IdentityStrategy, OperationalContext, PositionConfig } from '../types';

const STRATEGY_LABEL: Record<IdentityStrategy, string> = {
  NAMED_USERS: 'Usuarios nominativos (cada persona su cuenta)',
  SHARED_OPERATIONAL_USERS: 'Cuentas operativas compartidas (trabajador activo)',
  HYBRID: 'Híbrido (nominativos + cuentas operativas)',
};

const CONTEXTS: OperationalContext[] = ['HARVEST_WEIGHING', 'POSTHARVEST_AUTHORIZATION'];
const CONTEXT_LABEL: Record<OperationalContext, string> = {
  HARVEST_WEIGHING: 'Pesaje en cosecha',
  POSTHARVEST_AUTHORIZATION: 'Autorización en postcosecha',
};

interface Row {
  context: OperationalContext;
  enabled: boolean;
  requiresAssignedWorker: boolean;
}

function mergeRows(configs: PositionConfig[]): Row[] {
  return CONTEXTS.map((ctx) => {
    const found = configs.find((c) => c.context === ctx);
    return {
      context: ctx,
      enabled: found ? found.enabled : true,
      // Por defecto exige trabajador asignado (comportamiento seguro).
      requiresAssignedWorker: found ? found.requiresAssignedWorker : true,
    };
  });
}

export default function IdentityConfigPage() {
  const { activeTenantId } = useAuth();

  // --- Estrategia de identidad ---
  const [strategy, setStrategy] = useState<IdentityStrategy>('NAMED_USERS');
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [strategyMsg, setStrategyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // --- Posiciones ---
  const [rows, setRows] = useState<Row[]>(mergeRows([]));
  const [loading, setLoading] = useState(false);
  const [posMsg, setPosMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingCtx, setSavingCtx] = useState<OperationalContext | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    setLoading(true);
    Promise.all([getTenant(activeTenantId), getPositions()])
      .then(([tenant, positions]) => {
        setStrategy(tenant.identityStrategy ?? 'NAMED_USERS');
        setRows(mergeRows(positions));
      })
      .catch(() => setRows(mergeRows([])))
      .finally(() => setLoading(false));
  }, [activeTenantId]);

  const changeStrategy = async (next: IdentityStrategy) => {
    if (!activeTenantId) return;
    setStrategy(next);
    setSavingStrategy(true);
    setStrategyMsg(null);
    try {
      await updateTenant(activeTenantId, { identityStrategy: next });
      setStrategyMsg({ ok: true, text: 'Estrategia de identidad actualizada.' });
    } catch (e) {
      setStrategyMsg({ ok: false, text: getApiErrorMessage(e) });
    } finally {
      setSavingStrategy(false);
    }
  };

  const updateRow = (ctx: OperationalContext, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.context === ctx ? { ...r, ...patch } : r)));

  const saveRow = async (row: Row) => {
    setSavingCtx(row.context);
    setPosMsg(null);
    try {
      await setPosition({
        context: row.context,
        enabled: row.enabled,
        requiresAssignedWorker: row.requiresAssignedWorker,
      });
      setPosMsg({ ok: true, text: `Posición "${CONTEXT_LABEL[row.context]}" guardada.` });
    } catch (e) {
      setPosMsg({ ok: false, text: getApiErrorMessage(e) });
    } finally {
      setSavingCtx(null);
    }
  };

  if (!activeTenantId) {
    return (
      <div className="max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold text-content">Identidad y posiciones operativas</h1>
          <p className="text-sm text-muted">Configuración por empresa.</p>
        </div>
        <Alert variant="info">
          Selecciona una empresa en la barra superior para configurar su identidad.
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-content">Identidad y posiciones operativas</h1>
        <p className="text-sm text-muted">
          Define cómo se identifican las personas en esta empresa y qué posiciones exigen un
          trabajador asignado.
        </p>
      </div>

      {/* Estrategia de identidad */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card">
        <div>
          <h2 className="font-semibold text-content">Estrategia de identidad</h2>
          <p className="text-sm text-muted">
            Nominativa mantiene el comportamiento actual. Las cuentas operativas registran quién
            firma según el trabajador activo, sin reemplazar al usuario autenticado.
          </p>
        </div>
        {strategyMsg && (
          <Alert variant={strategyMsg.ok ? 'success' : 'error'}>{strategyMsg.text}</Alert>
        )}
        <div className="max-w-md">
          <Select
            label="Estrategia"
            value={strategy}
            disabled={savingStrategy || loading}
            onChange={(e) => changeStrategy(e.target.value as IdentityStrategy)}
          >
            {(Object.keys(STRATEGY_LABEL) as IdentityStrategy[]).map((s) => (
              <option key={s} value={s}>
                {STRATEGY_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Posiciones operativas */}
      <div className="space-y-3">
        <div>
          <h2 className="font-semibold text-content">Posiciones operativas</h2>
          <p className="text-sm text-muted">
            Si una posición exige trabajador asignado y no hay ninguno activo, el backend bloquea la
            operación hasta que un administrador asigne el operador.
          </p>
        </div>
        {posMsg && <Alert variant={posMsg.ok ? 'success' : 'error'}>{posMsg.text}</Alert>}

        {loading ? (
          <Spinner />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.context}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="font-medium text-content">{CONTEXT_LABEL[row.context]}</div>
                <div className="flex flex-wrap items-center gap-6">
                  <Toggle
                    checked={row.enabled}
                    onChange={(v) => updateRow(row.context, { enabled: v })}
                    label="Habilitada"
                  />
                  <Toggle
                    checked={row.requiresAssignedWorker}
                    onChange={(v) => updateRow(row.context, { requiresAssignedWorker: v })}
                    label="Exige trabajador"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveRow(row)}
                    disabled={savingCtx === row.context}
                    leftIcon={<Save size={15} />}
                  >
                    Guardar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
