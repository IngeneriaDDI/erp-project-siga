import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { getHarvestFieldConfig, updateHarvestFieldConfig } from '../services/fieldConfig';
import { updateTenant } from '../services/tenants';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Alert, Spinner } from '../components/ui/misc';
import { getApiErrorMessage } from '../lib/api';
import type { FieldConfigEntry, WeightUnit } from '../types';

const FIELD_LABEL: Record<string, string> = {
  primera_fila: 'Primera fila',
  ultima_fila: 'Última fila',
  estado_roja: 'Estado roja (¿fruta roja?)',
  observaciones: 'Observaciones',
};

export default function FieldConfigPage() {
  const { activeTenantId, weightUnit, setActiveTenant } = useAuth();

  // --- Unidad de peso de la empresa ---
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [unitSaved, setUnitSaved] = useState(false);

  const changeUnit = async (unit: WeightUnit) => {
    if (!activeTenantId) return;
    setSavingUnit(true);
    setUnitError(null);
    setUnitSaved(false);
    try {
      await updateTenant(activeTenantId, { weightUnit: unit });
      setActiveTenant(activeTenantId, unit); // refleja el cambio de inmediato
      setUnitSaved(true);
      setTimeout(() => setUnitSaved(false), 2500);
    } catch (e) {
      setUnitError(getApiErrorMessage(e));
    } finally {
      setSavingUnit(false);
    }
  };

  // --- Configuración de campos ---
  const { data, loading, error } = useAsyncData(getHarvestFieldConfig, []);
  const [items, setItems] = useState<FieldConfigEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const setRequired = (fieldName: string, value: boolean) =>
    setItems((prev) =>
      prev.map((it) =>
        it.fieldName === fieldName
          ? { ...it, isRequired: value, isVisible: value ? true : it.isVisible }
          : it,
      ),
    );
  const setVisible = (fieldName: string, value: boolean, isRequired: boolean) => {
    if (!value && isRequired) return;
    setItems((prev) => prev.map((it) => (it.fieldName === fieldName ? { ...it, isVisible: value } : it)));
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateHarvestFieldConfig(items);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-content">Configuración del módulo de cosecha</h1>
        <p className="text-sm text-muted">Ajustes por empresa para la captura y visualización de cosecha.</p>
      </div>

      {/* Unidad de peso */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card">
        <div>
          <h2 className="font-semibold text-content">Unidad de peso para captura y visualización</h2>
          <p className="text-sm text-muted">
            Define cómo verán e ingresarán los pesos los usuarios de esta empresa. La información
            siempre se almacena internamente en gramos; esto solo cambia la presentación.
          </p>
        </div>

        {!activeTenantId ? (
          <Alert variant="info">Selecciona una empresa en la barra superior para configurar su unidad de peso.</Alert>
        ) : (
          <>
            {unitError && <Alert>{unitError}</Alert>}
            {unitSaved && <Alert variant="success">Unidad de peso actualizada.</Alert>}
            <div className="max-w-xs">
              <Select
                label="Unidad"
                value={weightUnit}
                disabled={savingUnit}
                onChange={(e) => changeUnit(e.target.value as WeightUnit)}
              >
                <option value="GRAMS">Gramos (g)</option>
                <option value="KILOGRAMS">Kilogramos (kg)</option>
              </Select>
            </div>
          </>
        )}
      </div>

      {/* Campos configurables */}
      <div className="space-y-3">
        <div>
          <h2 className="font-semibold text-content">Campos del formulario de cosecha</h2>
          <p className="text-sm text-muted">Un campo obligatorio queda siempre visible.</p>
        </div>

        {error && <Alert>{error}</Alert>}
        {saveError && <Alert>{saveError}</Alert>}
        {saved && <Alert variant="success">Configuración guardada.</Alert>}

        {loading ? (
          <Spinner />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-card">
            {items.map((it) => (
              <div key={it.fieldName} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-medium text-content">{FIELD_LABEL[it.fieldName] ?? it.fieldName}</div>
                <div className="flex flex-wrap gap-6">
                  <Toggle checked={it.isVisible} onChange={(v) => setVisible(it.fieldName, v, it.isRequired)} label="Visible" disabled={it.isRequired} />
                  <Toggle checked={it.isRequired} onChange={(v) => setRequired(it.fieldName, v)} label="Obligatorio" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || loading} leftIcon={<Save size={16} />}>
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </Button>
        </div>
      </div>
    </div>
  );
}
