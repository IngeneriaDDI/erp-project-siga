import { parseCsv, toCsv, normalizeRef } from './csv.util';

describe('parseCsv', () => {
  it('maneja comillas, comas internas y saltos de línea', () => {
    const csv = 'a,b,c\r\n1,"hola, mundo","línea1\nlínea2"\n2,x,y';
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['a', 'b', 'c']);
    expect(rows[1]).toEqual(['1', 'hola, mundo', 'línea1\nlínea2']);
    expect(rows[2]).toEqual(['2', 'x', 'y']);
  });

  it('respeta comillas escapadas ("")', () => {
    const rows = parseCsv('col\n"dice ""hola"""');
    expect(rows[1][0]).toBe('dice "hola"');
  });

  it('ignora filas vacías y BOM', () => {
    const rows = parseCsv('﻿a,b\n1,2\n\n');
    expect(rows).toHaveLength(2);
  });

  it('autodetecta el separador ";" (export de Excel en español)', () => {
    const csv = 'finca;codigo;nombre\nTECNOBERRIES;1;NN\nTECNOBERRIES;5;MARIA';
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['finca', 'codigo', 'nombre']);
    expect(rows[1]).toEqual(['TECNOBERRIES', '1', 'NN']);
    expect(rows[2]).toEqual(['TECNOBERRIES', '5', 'MARIA']);
  });
});

describe('toCsv', () => {
  it('escapa valores con coma/comilla', () => {
    const out = toCsv(['x', 'y'], [{ x: 'a,b', y: 'c"d' }]);
    expect(out).toBe('x,y\r\n"a,b","c""d"');
  });
});

describe('normalizeRef', () => {
  it('recorta, quita tildes y pasa a minúsculas', () => {
    expect(normalizeRef('  Fínca   A ')).toBe('finca a');
    expect(normalizeRef('PRIMERA')).toBe('primera');
  });
});
