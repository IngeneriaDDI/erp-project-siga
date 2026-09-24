import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { listFarms } from '../services/farms';
import { listWorkers } from '../services/workers';
import { listLots } from '../services/lots';
import { listContainers } from '../services/containers';
import { listQualities } from '../services/qualities';
import { getHarvestFieldConfig, getHarvestTenantSettings } from '../services/fieldConfig';
import {
  createHarvest,
  getHarvest,
  updateHarvest,
  type HarvestSaveInput,
} from '../services/harvest';
import { harvestSchema } from '../schemas/harvest';
import { getApiErrorMessage } from '../lib/api';
import { Input } from '../components/ui/Input';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { FormSection } from '../components/ui/FormSection';
import { Alert, Spinner } from '../components/ui/misc';
import { DynamicContainerRows } from '../components/harvest/DynamicContainerRows';
import { OperatorStatusBanner } from '../components/OperatorStatusBanner';
import { useAuth } from '../context/AuthContext';
import {
  displayToGrams,
  formatWeight,
  gramsToInputValue,
  weightInputStep,
  weightUnitLabel,
} from '../lib/weight';

interface FormValues {
  fecha: string;
  farmId: string;
  workerId: string;
  lotId: string;
  qualityId: string;
  pesoBrutoInput: number; // valor en la UNIDAD DE PRESENTACIÓN (g o kg)
  containers: { containerId: string; unidades: number }[];
  primeraFila?: string;
  ultimaFila?: string;
  estadoRoja?: boolean;
  observaciones?: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString('es-CO');
const emptyToUndef = (v?: string) => (v && v.trim() ? v.trim() : undefined);

export default function HarvestFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { weightUnit } = useAuth();

  const farms = useAsyncData(() => listFarms('ACTIVE'), []);
  const workers = useAsyncData(() => listWorkers({ status: 'ACTIVE' }), []);
  const lots = useAsyncData(() => listLots({ status: 'ACTIVE' }), []);
  const containersQ = useAsyncData(() => listContainers('ACTIVE'), []);
  const qualities = useAsyncData(() => listQualities({ status: 'ACTIVE', visibleEnCosecha: true }), []);
  const config = useAsyncData(getHarvestFieldConfig, []);
  // Ajuste por empresa: ¿se filtran los trabajadores por finca? (resuelto por el tenant actual).
  const tenantSettings = useAsyncData(getHarvestTenantSettings, []);
  const filterByFarm = tenantSettings.data?.workersFilteredByFarm ?? true;

  const { register, control, handleSubmit, watch, reset, setValue, getValues } = useForm<FormValues>({
    defaultValues: {
      fecha: today(),
      farmId: '',
      workerId: '',
      lotId: '',
      qualityId: '',
      pesoBrutoInput: undefined as unknown as number,
      containers: [{ containerId: '', unidades: 1 }],
      primeraFila: '',
      ultimaFila: '',
      estadoRoja: false,
      observaciones: '',
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'containers' });

  const [registrarFilas, setRegistrarFilas] = useState(false);
  const [errorList, setErrorList] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Cuenta operativa sin trabajador asignado => el backend bloquea; reflejamos en UI.
  const [opBlocked, setOpBlocked] = useState(false);

  useEffect(() => {
    if (editing && id) {
      getHarvest(id)
        .then((rec) => {
          setRegistrarFilas(Boolean(rec.primeraFila || rec.ultimaFila));
          reset({
            fecha: rec.fecha?.slice(0, 10) ?? today(),
            farmId: rec.farm?.id ?? '',
            workerId: rec.worker?.id ?? '',
            lotId: rec.lot?.id ?? '',
            qualityId: rec.quality?.id ?? '',
            // BD (gramos) → valor en la unidad de presentación (evita doble conversión).
            pesoBrutoInput: gramsToInputValue(rec.pesoBrutoGramos, weightUnit),
            containers:
              rec.containers && rec.containers.length
                ? rec.containers.map((c) => ({ containerId: c.containerId, unidades: c.unidades }))
                : [{ containerId: '', unidades: 1 }],
            primeraFila: rec.primeraFila ?? '',
            ultimaFila: rec.ultimaFila ?? '',
            estadoRoja: rec.estadoRoja ?? false,
            observaciones: rec.observaciones ?? '',
          });
        })
        .catch((e) => setFormError(getApiErrorMessage(e)));
    }
  }, [editing, id, reset, weightUnit]);

  // Prellena el recipiente por defecto (el marcado como predeterminado), solo al crear.
  useEffect(() => {
    if (editing) return;
    const def = (containersQ.data ?? []).find((c) => c.isDefault);
    if (!def) return;
    const current = getValues('containers');
    if (current?.length === 1 && !current[0]?.containerId) {
      setValue('containers.0.containerId', def.id);
    }
  }, [editing, containersQ.data, getValues, setValue]);

  const farmId = watch('farmId');
  const lotId = watch('lotId');
  const rows = watch('containers');
  // pesoBrutoInput está en la unidad de presentación; pesoBruto es el valor INTERNO en gramos.
  const pesoBrutoInput = Number(watch('pesoBrutoInput')) || 0;
  const pesoBruto = displayToGrams(pesoBrutoInput, weightUnit);
  const estadoRojaVal = watch('estadoRoja');

  // Si la empresa filtra por finca, solo trabajadores de la finca; si no, todos.
  const farmWorkers = filterByFarm
    ? (workers.data ?? []).filter((w) => w.farmId === farmId)
    : (workers.data ?? []);
  const farmNameById = new Map((farms.data ?? []).map((f) => [f.id, f.nombre]));
  const farmLots = (lots.data ?? []).filter((l) => l.farmId === farmId);
  const variedad = (lots.data ?? []).find((l) => l.id === lotId)?.variedad ?? '';

  const containerWeight = (cid?: string) => containersQ.data?.find((c) => c.id === cid)?.pesoGramos ?? 0;
  const pesoTotalRecipientes = (rows ?? []).reduce(
    (acc, r) => acc + (Number(r.unidades) || 0) * containerWeight(r.containerId),
    0,
  );
  const gramos = pesoBruto - pesoTotalRecipientes;

  const cfg = (field: string) => config.data?.find((c) => c.fieldName === field);
  const isVisible = (f: string) => cfg(f)?.isVisible ?? true;
  const isRequired = (f: string) => cfg(f)?.isRequired ?? false;

  // --- Lógica de filas (primera/última) ---
  const anyFilaVisible = isVisible('primera_fila') || isVisible('ultima_fila');
  const filaRequired = isRequired('primera_fila') || isRequired('ultima_fila');
  const showFilas = filaRequired || registrarFilas;

  const onSubmit = handleSubmit(async (values) => {
    setErrorList([]);
    setFormError(null);

    const candidate = {
      fecha: values.fecha,
      farmId: values.farmId,
      workerId: values.workerId,
      lotId: values.lotId,
      qualityId: values.qualityId,
      // Convierte a gramos en el BORDE de salida (nunca envía kg a la API).
      pesoBrutoGramos: displayToGrams(Number(values.pesoBrutoInput) || 0, weightUnit),
      containers: (values.containers ?? [])
        .filter((r) => r.containerId)
        .map((r) => ({ containerId: r.containerId, unidades: Number(r.unidades) || 0 })),
    };

    const msgs: string[] = [];
    const parsed = harvestSchema.safeParse(candidate);
    if (!parsed.success) parsed.error.issues.forEach((i) => msgs.push(i.message));
    if (pesoTotalRecipientes > pesoBruto) {
      msgs.push('El peso de recipientes no puede superar el peso bruto');
    }
    if (gramos < 0) msgs.push('Los gramos cosechados no pueden ser negativos');

    // Campos configurables obligatorios (texto)
    if (isVisible('primera_fila') && isRequired('primera_fila') && !emptyToUndef(values.primeraFila)) {
      msgs.push('El campo "Primera fila" es obligatorio');
    }
    if (isVisible('ultima_fila') && isRequired('ultima_fila') && !emptyToUndef(values.ultimaFila)) {
      msgs.push('El campo "Última fila" es obligatorio');
    }
    if (isVisible('observaciones') && isRequired('observaciones') && !emptyToUndef(values.observaciones)) {
      msgs.push('El campo "Observaciones" es obligatorio');
    }
    // Coherencia primera <= última (si ambos numéricos)
    const p = emptyToUndef(values.primeraFila);
    const u = emptyToUndef(values.ultimaFila);
    if (showFilas && p && u && /^\d+$/.test(p) && /^\d+$/.test(u) && Number(p) > Number(u)) {
      msgs.push('La última fila debe ser mayor o igual que la primera fila');
    }

    if (msgs.length) {
      setErrorList(Array.from(new Set(msgs)));
      return;
    }

    const payload: HarvestSaveInput = {
      ...candidate,
      primeraFila: isVisible('primera_fila') && showFilas ? emptyToUndef(values.primeraFila) : undefined,
      ultimaFila: isVisible('ultima_fila') && showFilas ? emptyToUndef(values.ultimaFila) : undefined,
      estadoRoja: isVisible('estado_roja') ? Boolean(values.estadoRoja) : undefined,
      observaciones: isVisible('observaciones') ? emptyToUndef(values.observaciones) : undefined,
    };

    setSubmitting(true);
    try {
      if (editing && id) {
        await updateHarvest(id, payload);
        navigate(`/harvest/${id}`);
      } else {
        const rec = await createHarvest(payload);
        navigate(`/harvest/${rec.id}`);
      }
    } catch (e) {
      setFormError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  });

  const dataLoading =
    farms.loading ||
    workers.loading ||
    lots.loading ||
    containersQ.loading ||
    qualities.loading ||
    config.loading ||
    tenantSettings.loading;

  if (dataLoading) return <Spinner label="Cargando formulario…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-content">{editing ? 'Editar' : 'Registrar'} cosecha</h1>
        <Button variant="secondary" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/harvest')}>
          Volver
        </Button>
      </div>

      {!editing && <OperatorStatusBanner onBlockedChange={setOpBlocked} />}
      {formError && <Alert>{formError}</Alert>}
      {errorList.length > 0 && (
        <Alert>
          <ul className="list-inside list-disc">
            {errorList.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-6">
        <FormSection title="Datos generales">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Fecha" type="date" {...register('fecha')} />
            <Controller
              control={control}
              name="farmId"
              render={({ field }) => (
                <SearchableSelect
                  label="Finca"
                  value={field.value ?? ''}
                  onChange={(v) => {
                    field.onChange(v);
                    setValue('workerId', '');
                    setValue('lotId', '');
                  }}
                  options={(farms.data ?? []).map((f) => ({ value: f.id, label: f.nombre }))}
                />
              )}
            />
            <Controller
              control={control}
              name="workerId"
              render={({ field }) => (
                <SearchableSelect
                  label="Trabajador"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  disabled={filterByFarm && !farmId}
                  placeholder={
                    filterByFarm && !farmId ? 'Elige una finca primero' : '— Selecciona —'
                  }
                  options={farmWorkers.map((w) => ({
                    value: w.id,
                    // Con el filtro apagado se muestra la finca (home) para reducir errores.
                    label: filterByFarm
                      ? `${w.codigoInterno} · ${w.nombre}`
                      : `${w.codigoInterno} · ${w.nombre} — ${farmNameById.get(w.farmId) ?? 'finca'}`,
                    keywords: `${w.codigoInterno} ${w.nombre} ${w.documento ?? ''} ${
                      farmNameById.get(w.farmId) ?? ''
                    }`,
                  }))}
                />
              )}
            />
            <Controller
              control={control}
              name="qualityId"
              render={({ field }) => (
                <SearchableSelect
                  label="Calidad"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  options={(qualities.data ?? []).map((q) => ({ value: q.id, label: q.nombre }))}
                />
              )}
            />
            <Controller
              control={control}
              name="lotId"
              render={({ field }) => (
                <SearchableSelect
                  label="Lote"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  disabled={!farmId}
                  placeholder={farmId ? '— Selecciona —' : 'Elige una finca primero'}
                  options={farmLots.map((l) => ({
                    value: l.id,
                    label: l.nombreLote,
                    keywords: `${l.nombreLote} ${l.variedad}`,
                  }))}
                />
              )}
            />
            <Input label="Variedad (del lote)" value={variedad} readOnly disabled />
          </div>
        </FormSection>

        <FormSection
          title="Pesaje"
          description={`El peso se ingresa en ${weightUnitLabel(weightUnit)} (se almacena internamente en gramos).`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Peso bruto (${weightUnitLabel(weightUnit)})`}
              type="number"
              step={weightInputStep(weightUnit)}
              min={0}
              {...register('pesoBrutoInput', { valueAsNumber: true })}
            />
          </div>
        </FormSection>

        <FormSection title="Recipientes" description="Uno o varios recipientes por pesaje.">
          <DynamicContainerRows
            fields={fields}
            register={register}
            control={control}
            remove={remove}
            append={() => append({ containerId: '', unidades: 1 })}
            containers={containersQ.data ?? []}
            rows={rows ?? []}
            unit={weightUnit}
          />
        </FormSection>

        {/* Resumen del cálculo (en vivo) */}
        <div className="grid gap-3 rounded-xl bg-primary-light p-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted">Peso bruto</div>
            <div className="text-lg font-semibold text-content">{formatWeight(pesoBruto, weightUnit)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Peso recipientes</div>
            <div className="text-lg font-semibold text-content">{formatWeight(pesoTotalRecipientes, weightUnit)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Peso cosechado</div>
            <div className={`text-lg font-bold ${gramos < 0 ? 'text-danger' : 'text-primary'}`}>{formatWeight(gramos, weightUnit)}</div>
          </div>
        </div>

        {/* Filas (primera/última) según configuración */}
        {anyFilaVisible && (
          <FormSection title="Filas">
            {!filaRequired && (
              <Toggle
                checked={registrarFilas}
                onChange={(v) => {
                  setRegistrarFilas(v);
                  if (!v) {
                    setValue('primeraFila', '');
                    setValue('ultimaFila', '');
                  }
                }}
                label="Registrar filas"
                description="Actívalo para diligenciar primera y última fila."
              />
            )}
            {showFilas && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {isVisible('primera_fila') && (
                  <Input label={`Primera fila${isRequired('primera_fila') ? ' *' : ''}`} {...register('primeraFila')} />
                )}
                {isVisible('ultima_fila') && (
                  <Input label={`Última fila${isRequired('ultima_fila') ? ' *' : ''}`} {...register('ultimaFila')} />
                )}
              </div>
            )}
          </FormSection>
        )}

        {/* Estado roja (booleano) y observaciones según configuración */}
        {(isVisible('estado_roja') || isVisible('observaciones')) && (
          <FormSection title="Adicionales">
            <div className="space-y-4">
              {isVisible('estado_roja') && (
                <Toggle
                  checked={Boolean(estadoRojaVal)}
                  onChange={(v) => setValue('estadoRoja', v)}
                  label={`¿Presenta fruta roja?${isRequired('estado_roja') ? ' *' : ''}`}
                />
              )}
              {isVisible('observaciones') && (
                <Input label={`Observaciones${isRequired('observaciones') ? ' *' : ''}`} {...register('observaciones')} />
              )}
            </div>
          </FormSection>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/harvest')}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={submitting || (!editing && opBlocked)}
            leftIcon={<Save size={16} />}
          >
            {submitting ? 'Guardando…' : 'Guardar cosecha'}
          </Button>
        </div>
      </form>
    </div>
  );
}
