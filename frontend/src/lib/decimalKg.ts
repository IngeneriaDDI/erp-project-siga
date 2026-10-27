// Aritmética decimal exacta para kg (sin floats): se trabaja en micro-kg (BigInt, 6 decimales).

const KG_RE = /^\d+([.,]\d{1,6})?$/;

/** "1,25" → 1250000n. null si el texto no es válido (≥ 0, máx. 6 decimales). */
export function parseKgMicro(text: string): bigint | null {
  const t = text.trim();
  if (!KG_RE.test(t)) return null;
  const [int, dec = ''] = t.replace(',', '.').split('.');
  return BigInt(int) * 1_000_000n + BigInt(dec.padEnd(6, '0'));
}

/** micro-kg → texto con hasta `maxDecimals` decimales, sin ceros sobrantes. */
export function formatMicroKg(micro: bigint, maxDecimals = 3): string {
  const int = micro / 1_000_000n;
  const frac = (micro % 1_000_000n).toString().padStart(6, '0').slice(0, maxDecimals);
  const trimmed = frac.replace(/0+$/, '');
  const intStr = int.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return trimmed ? `${intStr},${trimmed}` : intStr;
}

/** Formatea un string decimal de la API ("1234.5") para mostrar (coma decimal, miles con punto). */
export function formatKgString(kg: string | null | undefined, maxDecimals = 3): string {
  if (kg === null || kg === undefined || kg === '') return '—';
  const micro = parseKgMicro(kg);
  return micro === null ? kg : formatMicroKg(micro, maxDecimals);
}
