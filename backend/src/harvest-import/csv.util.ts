/**
 * Utilidades CSV (RFC 4180) y normalización de referencias.
 * Sin dependencias externas: parser tolerante a comillas, comas y saltos de
 * línea dentro de campos entrecomillados.
 */

/**
 * Detecta el separador de la PRIMERA línea: coma o punto y coma.
 * Excel en español suele guardar CSV con ';'. Si hay más ';' que ',' fuera de
 * comillas en el encabezado, se usa ';'.
 */
export function detectDelimiter(text: string): ',' | ';' {
  let comma = 0;
  let semi = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c === ',') comma++;
    else if (!inQuotes && c === ';') semi++;
    else if (!inQuotes && c === '\n') break; // solo la primera línea
  }
  return semi > comma ? ';' : ',';
}

/** Parsea CSV a filas de strings. La primera fila son los encabezados.
 *  Autodetecta el separador (',' o ';') para tolerar exports de Excel-ES. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // Quita BOM si viene.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = detectDelimiter(src);

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignora; \r\n o \r solos
    } else {
      field += c;
    }
  }
  // Última celda/fila (si el archivo no termina en newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Elimina filas totalmente vacías.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Escapa un valor para CSV (comillas si contiene coma, comilla o salto). */
export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serializa filas (objetos) a CSV dado un orden de columnas. */
export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','));
  return [head, ...body].join('\r\n');
}

/**
 * Normaliza una referencia humana: recorta, colapsa espacios, quita tildes y
 * pasa a minúsculas. Usada para resolver código/nombre → GUID.
 */
export function normalizeRef(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita tildes/diacríticos
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
