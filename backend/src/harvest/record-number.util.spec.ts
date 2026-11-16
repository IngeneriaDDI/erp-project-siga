import { allocateRecordNumbers, sortByFechaStable } from './record-number.util';

describe('sortByFechaStable', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);

  it('ordena por fecha ascendente', () => {
    const r = sortByFechaStable([
      { fecha: d('2026-03-02'), k: 'c' },
      { fecha: d('2026-03-01'), k: 'a' },
      { fecha: d('2026-03-03'), k: 'd' },
    ]);
    expect(r.map((x) => x.k)).toEqual(['a', 'c', 'd']);
  });

  it('conserva el orden original dentro del mismo día (estable)', () => {
    const r = sortByFechaStable([
      { fecha: d('2026-03-02'), k: '1' },
      { fecha: d('2026-03-01'), k: '2' },
      { fecha: d('2026-03-02'), k: '3' },
      { fecha: d('2026-03-01'), k: '4' },
    ]);
    expect(r.map((x) => x.k)).toEqual(['2', '4', '1', '3']);
  });

  it('no modifica el arreglo original', () => {
    const src = [{ fecha: d('2026-03-02') }, { fecha: d('2026-03-01') }];
    sortByFechaStable(src);
    expect(src[0].fecha).toEqual(d('2026-03-02'));
  });
});

describe('allocateRecordNumbers', () => {
  const clientReturning = (last: number | null) => ({
    $queryRaw: jest.fn().mockResolvedValue(last === null ? [] : [{ last }]),
  });

  it('devuelve el primer número del bloque reservado (1 registro)', async () => {
    const c = clientReturning(1581);
    expect(await allocateRecordNumbers(c as never, 't1', 1)).toBe(1581);
  });

  it('un bloque de N empieza en last - N + 1', async () => {
    const c = clientReturning(2000);
    // Se reservan 1000: 1001..2000
    expect(await allocateRecordNumbers(c as never, 't1', 1000)).toBe(1001);
  });

  it('empresa nueva: el primer registro es el 1', async () => {
    const c = clientReturning(1);
    expect(await allocateRecordNumbers(c as never, 't1', 1)).toBe(1);
  });

  it('pasa el tenant y la cantidad como parámetros (no concatenados)', async () => {
    const c = clientReturning(5);
    await allocateRecordNumbers(c as never, 'tenant-x', 3);
    const args = c.$queryRaw.mock.calls[0];
    expect(args.slice(1)).toEqual([3, 'tenant-x']);
  });

  it('falla si la empresa no existe', async () => {
    await expect(allocateRecordNumbers(clientReturning(null) as never, 'x', 1)).rejects.toThrow();
  });

  it('rechaza cantidades inválidas', async () => {
    for (const n of [0, -1, 1.5]) {
      await expect(allocateRecordNumbers(clientReturning(1) as never, 't', n)).rejects.toThrow();
    }
  });
});
