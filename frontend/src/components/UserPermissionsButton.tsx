import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { IconButton, Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Toggle } from './ui/Toggle';
import { Alert, Badge, Spinner } from './ui/misc';
import { getUserPermissions, setUserPermissions } from '../services/users';
import { PERMISSION_MODULES, PERMISSION_PRESETS } from '../lib/permissions';
import { getApiErrorMessage } from '../lib/api';
import type { UserRow } from '../types';

/**
 * Editor de permisos visuales y de acción por usuario (override).
 * - Los permisos "ver" deciden qué pantallas ve el usuario en el menú.
 * - Lista vacía => el usuario vuelve a la plantilla de su rol.
 * - SUPER_ADMIN no es editable (siempre tiene todo).
 */
export function UserPermissionsButton({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [usesTemplate, setUsesTemplate] = useState(true);

  const isSuper = user.role === 'SUPER_ADMIN';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserPermissions(user.id);
      // Partimos de los permisos EFECTIVOS actuales (estado real).
      setSelected(new Set(data.effective));
      setUsesTemplate(data.usesTemplate);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setOpen(true);
    setSaved(false);
    if (!isSuper) load();
  };

  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const applyPreset = (permissions: string[]) => setSelected(new Set(permissions));

  const save = async (asTemplate: boolean) => {
    setSaving(true);
    setError(null);
    try {
      // asTemplate => override vacío (vuelve a la plantilla del rol).
      await setUserPermissions(user.id, asTemplate ? [] : [...selected]);
      setSaved(true);
      setUsesTemplate(asTemplate);
      setTimeout(() => setOpen(false), 800);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <IconButton
        icon={<ShieldCheck size={16} />}
        label="Permisos"
        tone="info"
        onClick={openModal}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Permisos · ${user.nombre}`}
        footer={
          isSuper ? (
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => save(true)}
                disabled={saving || loading}
                title="Elimina el override y usa la plantilla del rol"
              >
                Usar plantilla del rol
              </Button>
              <Button onClick={() => save(false)} disabled={saving || loading}>
                Guardar permisos
              </Button>
            </>
          )
        }
      >
        {isSuper ? (
          <Alert variant="info">El Super Admin siempre tiene todos los permisos.</Alert>
        ) : loading ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}
            {saved && <Alert variant="success">Permisos guardados.</Alert>}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">
                Los permisos <strong>Ver</strong> deciden qué pantallas aparecen en el menú de este
                usuario.
              </p>
              {usesTemplate ? (
                <Badge color="blue">Plantilla del rol</Badge>
              ) : (
                <Badge color="amber">Personalizado</Badge>
              )}
            </div>

            {/* Presets rápidos */}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Perfiles rápidos
              </div>
              <div className="flex flex-wrap gap-2">
                {PERMISSION_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    title={p.description}
                    onClick={() => applyPreset(p.permissions)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-content transition hover:bg-primary-light hover:text-primary"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Módulos y acciones */}
            {PERMISSION_MODULES.map((m) => (
              <div key={m.module} className="rounded-lg border border-border p-3">
                <div className="mb-2 text-sm font-semibold text-content">{m.module}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {m.items.map((it) => (
                    <Toggle
                      key={it.key}
                      checked={selected.has(it.key)}
                      onChange={(v) => toggle(it.key, v)}
                      label={it.label}
                      description={it.kind === 'view' ? 'Permiso visual' : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
