import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  createSequence,
  listSequences,
  updateSequence,
} from '../services/documentSequences';
import { getApiErrorMessage } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import type { DocumentSequence } from '../types';

const TYPE_LABEL: Record<string, string> = {
  REMISSION: 'Remisiones',
  PRODUCTION_ORDER: 'Órdenes de producción',
};
const DEFAULT_PREFIX: Record<string, string> = { REMISSION: 'REM', PRODUCTION_ORDER: 'OP' };
const TYPES: Array<'REMISSION' | 'PRODUCTION_ORDER'> = ['REMISSION', 'PRODUCTION_ORDER'];

const preview = (prefix: string, current: number, padding: number) =>
  `${prefix}-${String(current + 1).padStart(padding, '0')}`;

export default function DocumentSequencesPage() {
  const { data, loading, error, reload } = useAsyncData(listSequences, []);
  const [editing, setEditing] = useState<DocumentSequence | null>(null);
  const [form, setForm] = useState({ prefix: '', paddingLength: 6, currentNumber: 0, active: true });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        prefix: editing.prefix,
        paddingLength: editing.paddingLength,
        currentNumber: editing.currentNumber,
        active: editing.active,
      });
    }
  }, [editing]);

  const seqFor = (type: string) =>
    (data ?? []).find((s) => s.documentType === type && !s.farmId && !s.year) ?? null;

  const create = async (type: 'REMISSION' | 'PRODUCTION_ORDER') => {
    setSaveError(null);
    try {
      await createSequence({ documentType: type, prefix: DEFAULT_PREFIX[type], paddingLength: 6, currentNumber: 0 });
      reload();
    } catch (e) {
      setSaveError(getApiErrorMessage(e));
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateSequence(editing.id, {
        prefix: form.prefix,
        paddingLength: Number(form.paddingLength),
        currentNumber: Number(form.currentNumber),
        active: form.active,
      });
      setEditing(null);
      reload();
    } catch (e) {
      setSaveError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-content">Consecutivos de documentos</h1>
        <p className="text-sm text-muted">
          Configura el prefijo, el relleno con ceros y el número inicial para continuar la
          numeración que ya lleva la finca. El próximo documento usará el número actual + 1.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {saveError && <Alert>{saveError}</Alert>}

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {TYPES.map((type) => {
            const seq = seqFor(type);
            return (
              <div key={type} className="rounded-xl border border-border bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-content">{TYPE_LABEL[type]}</div>
                    {seq ? (
                      <div className="mt-1 text-sm text-muted">
                        Próximo: <span className="font-medium text-primary">{preview(seq.prefix, seq.currentNumber, seq.paddingLength)}</span>
                        {' · '}
                        {seq.active ? <Badge color="green">Activa</Badge> : <Badge color="gray">Inactiva</Badge>}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-muted">Sin configurar (arrancará en 1 automáticamente).</div>
                    )}
                  </div>
                  {seq ? (
                    <Button variant="secondary" onClick={() => setEditing(seq)}>Editar</Button>
                  ) : (
                    <Button onClick={() => create(type)}>Configurar</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar consecutivo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} leftIcon={<Save size={16} />}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Prefijo" value={form.prefix} onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))} />
          <Input
            label="Relleno con ceros (dígitos)"
            type="number"
            value={form.paddingLength}
            onChange={(e) => setForm((f) => ({ ...f, paddingLength: Number(e.target.value) }))}
          />
          <Input
            label="Número actual (el próximo será este + 1)"
            type="number"
            value={form.currentNumber}
            onChange={(e) => setForm((f) => ({ ...f, currentNumber: Number(e.target.value) }))}
          />
          <label className="flex items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Activa
          </label>
          <p className="text-xs text-muted">
            Vista previa del próximo: <span className="font-medium text-primary">{preview(form.prefix || '?', Number(form.currentNumber) || 0, Number(form.paddingLength) || 6)}</span>
          </p>
        </div>
      </Modal>
    </div>
  );
}
