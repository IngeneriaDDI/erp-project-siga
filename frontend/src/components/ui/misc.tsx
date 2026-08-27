import { ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Status } from '../../types';

export function StatusBadge({ status }: { status: Status }) {
  const active = status === 'ACTIVE';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? 'bg-success/10 text-success' : 'bg-slate-100 text-muted'
      }`}
    >
      {active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

type BadgeColor = 'gray' | 'green' | 'red' | 'blue' | 'amber';

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: BadgeColor }) {
  const colors: Record<BadgeColor, string> = {
    gray: 'bg-slate-100 text-muted',
    green: 'bg-success/10 text-success',
    red: 'bg-danger/10 text-danger',
    blue: 'bg-primary-light text-primary',
    amber: 'bg-accent/10 text-accent',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

type AlertVariant = 'error' | 'info' | 'success' | 'warning';

export function Alert({ children, variant = 'error' }: { children: ReactNode; variant?: AlertVariant }) {
  const styles: Record<AlertVariant, string> = {
    error: 'bg-danger/10 text-danger border-danger/20',
    info: 'bg-primary-light text-primary border-primary/20',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-accent/10 text-accent border-accent/30',
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles[variant]}`}>{children}</div>;
}
