/** Normaliza para comparar: sin tildes, sin mayúsculas, sin espacios extremos. */
export function normSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Búsqueda "código primero":
 *  - Si lo escrito coincide EXACTAMENTE con el código de uno o más ítems,
 *    devuelve solo esos (p. ej. "6" → el lote 6, no el 16 ni el 26).
 *  - Si no hay coincidencia exacta, hace la búsqueda parcial normal sobre el
 *    texto (p. ej. "1" sin lote "1" → 1A, 1B, 10…).
 */
export function searchCodeFirst<T>(
  items: T[],
  query: string,
  getCodes: (item: T) => string[],
  getText: (item: T) => string,
): T[] {
  const q = normSearch(query);
  if (!q) return items;
  const exact = items.filter((it) => getCodes(it).some((c) => c && normSearch(c) === q));
  if (exact.length > 0) return exact;
  return items.filter((it) => normSearch(getText(it)).includes(q));
}
