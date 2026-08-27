import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm',
  secondary: 'bg-surface border border-border text-content hover:bg-background',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm',
  success: 'bg-success text-white hover:opacity-90 shadow-sm',
  ghost: 'text-muted hover:bg-primary-light hover:text-primary',
  outline: 'border border-primary text-primary hover:bg-primary-light',
};

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1',
  md: 'px-4 py-2 text-sm gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  className = '',
  children,
  ...props
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {leftIcon}
      {children}
    </button>
  );
}

// -------------------------------------------------------------------------
// Botón compacto solo-icono para acciones en tablas (con tooltip/aria-label).
// -------------------------------------------------------------------------
type Tone = 'neutral' | 'primary' | 'info' | 'success' | 'danger';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string; // texto para tooltip y accesibilidad
  tone?: Tone;
}

const tones: Record<Tone, string> = {
  neutral: 'text-muted hover:bg-background hover:text-content',
  primary: 'text-primary hover:bg-primary-light',
  info: 'text-secondary hover:bg-secondary/10',
  success: 'text-success hover:bg-success/10',
  danger: 'text-danger hover:bg-danger/10',
};

export function IconButton({ icon, label, tone = 'neutral', className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${tones[tone]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
}
