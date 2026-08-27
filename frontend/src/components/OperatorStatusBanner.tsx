import { useEffect, useState } from 'react';
import { UserCheck, UserX } from 'lucide-react';
import { getMyOperationalStatus } from '../services/operational';
import type { MyOperationalStatus } from '../types';
import { Alert } from './ui/misc';

/**
 * Muestra quién firma la operación (trabajador activo de la cuenta operativa)
 * o advierte si la cuenta está bloqueada por falta de trabajador asignado.
 * No renderiza nada para usuarios nominativos (sin contexto operativo).
 *
 * onBlockedChange informa al contenedor si debe deshabilitar la creación.
 */
export function OperatorStatusBanner({
  onBlockedChange,
}: {
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const [status, setStatus] = useState<MyOperationalStatus | null>(null);

  useEffect(() => {
    let alive = true;
    getMyOperationalStatus()
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        const blocked = !!s.operationalContext && s.requiresWorker && !s.activeWorker;
        onBlockedChange?.(blocked);
      })
      .catch(() => {
        /* silencioso: usuarios sin contexto o sin permiso */
      });
    return () => {
      alive = false;
    };
  }, [onBlockedChange]);

  if (!status || !status.operationalContext) return null;

  if (status.activeWorker) {
    return (
      <Alert variant="info">
        <span className="inline-flex items-center gap-2">
          <UserCheck size={16} />
          Estás registrando como <strong>{status.activeWorker.nombre}</strong> (operador activo de
          esta cuenta).
        </span>
      </Alert>
    );
  }

  if (status.requiresWorker) {
    return (
      <Alert variant="warning">
        <span className="inline-flex items-center gap-2">
          <UserX size={16} />
          No hay un trabajador asignado a esta operación. Un administrador debe asignar el operador
          activo antes de poder registrar.
        </span>
      </Alert>
    );
  }

  return null;
}
