/**
 * Comprime números de registro en tramos legibles:
 *   [1580,1581,1582,1590] → "#1580–1582, 1590"
 * Devuelve '' si no hay números.
 */
export function compressRecordNumbers(numbers: (number | null | undefined)[]): string {
  const nums = [...new Set(numbers.filter((n): n is number => typeof n === 'number'))].sort(
    (a, b) => a - b,
  );
  if (nums.length === 0) return '';

  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    const cur = nums[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = cur;
    prev = cur;
  }
  return `#${parts.join(', ')}`;
}
