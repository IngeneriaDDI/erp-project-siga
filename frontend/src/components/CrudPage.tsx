import { ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Ban, CheckCircle2, Pencil, Plus, Save } from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { Table, Column } from './ui/Table';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Alert, Spinner, StatusBadge } from './ui/misc';
import { getApiErrorMessage } from '../lib/api';
import type { Status } from '../types';

export interface CrudField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'password';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  hideOnEdit?: boolean;
  step?: string; // para inputs numéricos (p. ej. decimales en kg)
}

type FormValues = Record<string, unknown>;

interface CrudPageProps<T> {
  title: string;
  singular?: string; // p. ej. "Trabajador" para "Nuevo trabajador"
  description?: string;
  columns: Column<T>[];
  rows: T[];
  loading: boolean;
  error?: string | null;
  fields: CrudField[];
  getId: (row: T) => string;
  getStatus?: (row: T) => Status;
  toForm: (row: T) => FormValues;
  onCreate: (values: FormValues) => Promise<void>;
  onUpdate: (id: string, values: FormValues) => Promise<void>;
  onToggleStatus?: (row: T) => Promise<void>;
  canWrite: boolean;
  onReload: () => void;
  extraHeader?: ReactNode;
}

function defaultValues(fields: CrudField[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) v[f.name] = f.type === 'checkbox' ? false : '';
  return v;
}

export function CrudPage<T>(props: CrudPageProps<T>) {
  const {
    title,
    singular,
    description,
    columns,
    rows,
    loading,
    error,
    fields,
    getId,
    getStatus,
    toForm,
    onCreate,
    onUpdate,
    onToggleStatus,
    canWrite,
    onReload,
    extraHeader,
  } = props;

  const noun = singular ?? title;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<T | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, reset, formState } = useForm<FormValues>();

  const openNew = () => {
    setCurrent(null);
    setFormError(null);
    reset(defaultValues(fields));
    setOpen(true);
  };

  const openEdit = (row: T) => {
    setCurrent(row);
    setFormError(null);
    reset(toForm(row));
    setOpen(true);
  };

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const clean: FormValues = {};
    for (const [k, val] of Object.entries(values)) {
      if (val === '' || val === undefined || val === null) continue;
      clean[k] = val;
    }
    try {
      if (current) await onUpdate(getId(current), clean);
      else await onCreate(clean);
      setOpen(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onReload();
    } catch (e) {
      setFormError(getApiErrorMessage(e));
    }
  });

  const visibleFields = fields.filter((f) => !(current && f.hideOnEdit));

  const actionColumns: Column<T>[] = [];
  if (getStatus) {
    actionColumns.push({ header: 'Estado', render: (r) => <StatusBadge status={getStatus(r)} /> });
  }
  if (canWrite) {
    actionColumns.push({
      header: 'Acciones',
      render: (r) => {
        const active = getStatus ? getStatus(r) === 'ACTIVE' : true;
        return (
          <div className="flex items-center gap-1">
            <IconButton
              icon={<Pencil size={16} />}
              label="Editar"
              tone="info"
              onClick={() => openEdit(r)}
            />
            {onToggleStatus && getStatus && (
              <IconButton
                icon={active ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                label={active ? 'Desactivar' : 'Activar'}
                tone={active ? 'danger' : 'success'}
                onClick={() => onToggleStatus(r).then(onReload)}
              />
            )}
          </div>
        );
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-content">{title}</h1>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {extraHeader}
          {canWrite && (
            <Button onClick={openNew} leftIcon={<Plus size={16} />}>
              {singular ? `Nuevo ${singular.toLowerCase()}` : 'Nuevo'}
            </Button>
          )}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {saved && <Alert variant="success">Cambios guardados correctamente.</Alert>}

      {loading ? <Spinner /> : <Table columns={[...columns, ...actionColumns]} rows={rows} keyField={getId} />}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={current ? `Editar ${noun.toLowerCase()}` : `Nuevo ${noun.toLowerCase()}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={formState.isSubmitting} leftIcon={<Save size={16} />}>
              Guardar
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          {formError && <Alert>{formError}</Alert>}
          {visibleFields.map((f) => {
            if (f.type === 'checkbox') {
              return (
                <label key={f.name} className="flex items-center gap-2 text-sm text-content">
                  <input type="checkbox" className="h-4 w-4 accent-primary" {...register(f.name)} />
                  {f.label}
                </label>
              );
            }
            if (f.type === 'select') {
              return (
                <Select key={f.name} label={f.label} {...register(f.name, { required: f.required })}>
                  <option value="">— Selecciona —</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              );
            }
            if (f.type === 'textarea') {
              return (
                <div key={f.name} className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-content">{f.label}</label>
                  <textarea
                    className="rounded-lg border border-border px-3 py-2 text-sm text-content outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                    rows={3}
                    {...register(f.name, { required: f.required })}
                  />
                </div>
              );
            }
            return (
              <Input
                key={f.name}
                label={f.label}
                type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
                step={f.type === 'number' ? f.step : undefined}
                placeholder={f.placeholder}
                {...register(f.name, { required: f.required, valueAsNumber: f.type === 'number' })}
              />
            );
          })}
        </form>
      </Modal>
    </div>
  );
}
