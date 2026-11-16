import { compressRecordNumbers } from './record-ranges.util';

describe('compressRecordNumbers', () => {
  it('un tramo continuo', () => {
    expect(compressRecordNumbers([1580, 1581, 1582, 1583])).toBe('#1580–1583');
  });

  it('un solo registro', () => {
    expect(compressRecordNumbers([42])).toBe('#42');
  });

  it('varios tramos y sueltos, ordenados aunque lleguen desordenados', () => {
    expect(compressRecordNumbers([1620, 1580, 1581, 1582, 1590, 1619])).toBe('#1580–1582, 1590, 1619–1620');
  });

  it('ignora repetidos, nulos e indefinidos', () => {
    expect(compressRecordNumbers([5, 5, null, undefined, 6])).toBe('#5–6');
  });

  it('vacío si no hay números', () => {
    expect(compressRecordNumbers([])).toBe('');
    expect(compressRecordNumbers([null, undefined])).toBe('');
  });
});
