import { generateCrest, Crest } from '@/engine/identity/crest-generator';
import { SeededRng } from '@/engine/rng';

describe('generateCrest — determinismo e estrutura', () => {
  it('mesma seed produz exatamente o mesmo Crest', () => {
    const a = generateCrest(new SeededRng(42));
    const b = generateCrest(new SeededRng(42));
    expect(a).toEqual(b);
    // serializável: deep-equal via JSON sobrevive (sem funções/refs)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('produz ao menos um path e um viewBox no formato "minX minY w h"', () => {
    const c: Crest = generateCrest(new SeededRng(1));
    expect(c.paths.length).toBeGreaterThanOrEqual(1);
    expect(c.viewBox).toMatch(/^0 0 \d+ \d+$/);
    for (const p of c.paths) {
      expect(typeof p.d).toBe('string');
      expect(p.d.length).toBeGreaterThan(0);
      expect(p.d[0]).toBe('M'); // todo path começa com move-to
      expect(p.fill).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
