import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  /** Texto adicional por el que también se puede buscar (p. ej. código, documento). */
  keywords?: string;
}

interface Props {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Texto de la opción vacía (permite limpiar la selección). '' para ocultarla. */
  clearLabel?: string;
  emptyText?: string;
}

/**
 * Lista desplegable con búsqueda por texto (nombre y/o código).
 * Controlado: `value` + `onChange`. Pensado para catálogos grandes
 * (trabajadores, lotes) donde se busca por código.
 */
export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = '— Selecciona —',
  disabled,
  clearLabel = '',
  emptyText = 'Sin resultados',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Enfoca el buscador al abrir.
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1" ref={rootRef}>
      {label && <label className="text-sm font-medium text-content">{label}</label>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:bg-background disabled:text-muted ${
            selected ? 'text-content' : 'text-muted'
          }`}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown size={16} className="shrink-0 text-muted" />
        </button>

        {open && !disabled && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
              <Search size={15} className="text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filtered[0]) choose(filtered[0].value);
                  }
                }}
                placeholder="Buscar por nombre o código…"
                className="w-full bg-transparent text-sm text-content outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-muted hover:text-content"
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {clearLabel && (
                <li>
                  <button
                    type="button"
                    onClick={() => choose('')}
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-muted hover:bg-background"
                  >
                    {clearLabel}
                  </button>
                </li>
              )}
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
              ) : (
                filtered.map((o) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      onClick={() => choose(o.value)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-background ${
                        o.value === value ? 'bg-primary-light text-primary' : 'text-content'
                      }`}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.value === value && <Check size={15} className="shrink-0" />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
