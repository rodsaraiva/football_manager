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

describe('generateCrest — variedade', () => {
  it('seeds diferentes geram conjuntos de cores variados (não tudo igual)', () => {
    const fills = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const c = generateCrest(new SeededRng(seed));
      for (const p of c.paths) fills.add(p.fill);
    }
    // com paleta de 10 cores e 40 seeds, esperamos diversidade real
    expect(fills.size).toBeGreaterThanOrEqual(4);
  });

  it('todo fill pertence à paleta declarada', () => {
    const palette = new Set([
      '#1b2a4a', '#27486f', '#3a6ea5', '#b03a2e', '#7d3c98',
      '#1e7a46', '#c9a227', '#d7dadd', '#0f1626', '#8a8d91',
    ]);
    for (let seed = 0; seed < 30; seed++) {
      const c = generateCrest(new SeededRng(seed));
      for (const p of c.paths) expect(palette.has(p.fill)).toBe(true);
    }
  });

  it('o número de paths varia entre seeds (camadas opcionais)', () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      counts.add(generateCrest(new SeededRng(seed)).paths.length);
    }
    expect(counts.size).toBeGreaterThanOrEqual(2);
  });
});
