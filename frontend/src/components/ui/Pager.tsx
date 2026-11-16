import { Button } from './Button';

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  sizes?: number[];
}

/** Paginación simple: "Mostrando a–b de N", tamaño de página y Anterior/Siguiente. */
export function Pager({ page, pageSize, total, onPage, onPageSize, sizes = [20, 50, 100] }: PagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted">
        {from}–{to} de {total} · Página {current} de {totalPages}
      </span>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <select
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-content"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Filas por página"
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s} por página
              </option>
            ))}
          </select>
        )}
        <Button variant="secondary" disabled={current <= 1} onClick={() => onPage(current - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" disabled={current >= totalPages} onClick={() => onPage(current + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
