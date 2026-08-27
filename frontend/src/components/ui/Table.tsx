import { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: (row: T) => string;
  empty?: string;
}

export function Table<T>({ columns, rows, keyField, empty = 'Sin registros' }: Props<T>) {
  return (
    // overflow-x-auto => scroll horizontal en móvil sin romper el layout.
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-background">
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={keyField(row)} className="transition hover:bg-background/60">
                {columns.map((col, i) => (
                  <td key={i} className={`whitespace-nowrap px-4 py-3 text-content ${col.className ?? ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
