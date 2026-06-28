import { z } from 'zod';
import { parseRows, parseRow } from '../../src/database/parse-rows';

const rowSchema = z
  .object({ id: z.number(), name: z.string(), club_id: z.number().nullable() })
  .passthrough();

describe('parseRows', () => {
  it('aceita linhas válidas e deixa passar colunas extras', () => {
    const rows = [
      { id: 1, name: 'a', club_id: 10, extra: 'x' },
      { id: 2, name: 'b', club_id: null },
    ];
    const out = parseRows(rowSchema, rows, 'q.test');
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(1);
    expect(out[1].club_id).toBeNull();
  });

  it('lança erro com o queryName quando uma coluna está faltando', () => {
    const rows = [{ id: 1, club_id: 10 }];
    expect(() => parseRows(rowSchema, rows, 'q.missingCol')).toThrow(/q\.missingCol/);
    expect(() => parseRows(rowSchema, rows, 'q.missingCol')).toThrow(/name/);
  });

  it('lança erro com o queryName quando o tipo está errado', () => {
    const rows = [{ id: 'nan', name: 'a', club_id: 10 }];
    expect(() => parseRows(rowSchema, rows, 'q.wrongType')).toThrow(/q\.wrongType/);
    expect(() => parseRows(rowSchema, rows, 'q.wrongType')).toThrow(/id/);
  });

  it('lança quando o driver não retorna um array', () => {
    expect(() => parseRows(rowSchema, undefined, 'q.notArray')).toThrow(/q\.notArray/);
  });
});

describe('parseRow', () => {
  it('aceita uma linha válida', () => {
    const out = parseRow(rowSchema, { id: 9, name: 'z', club_id: null }, 'q.one');
    expect(out.id).toBe(9);
  });

  it('lança com o queryName quando row é null e o schema não é nulável', () => {
    expect(() => parseRow(rowSchema, null, 'q.nullRow')).toThrow(/q\.nullRow/);
  });

  it('trata row null como null quando o schema é .nullable()', () => {
    expect(parseRow(rowSchema.nullable(), null, 'q.optional')).toBeNull();
  });

  it('normaliza undefined (sem linha) para null sob schema nulável', () => {
    expect(parseRow(rowSchema.nullable(), undefined, 'q.optional')).toBeNull();
  });
});
