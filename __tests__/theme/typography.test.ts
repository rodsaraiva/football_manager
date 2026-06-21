import { typography, FONT_FAMILY, fontSize } from '@/theme/tokens';

const VARIANTS = ['display','headline','title','subheading','body','label','caption','stat'] as const;

describe('typography token', () => {
  it('tem as 8 variantes com size/lineHeight/weight/family', () => {
    for (const v of VARIANTS) {
      const t = typography[v];
      expect(t).toBeDefined();
      expect(typeof t.size).toBe('number');
      expect(t.size).toBeGreaterThan(0);
      expect(t.lineHeight).toBeGreaterThanOrEqual(t.size); // line-height nunca < size
      expect(['400','600','700','800']).toContain(t.weight);
      expect(typeof t.family).toBe('string');
      expect(t.family.length).toBeGreaterThan(0);
    }
  });

  it('escala de tamanho é decrescente de display→caption', () => {
    expect(typography.display.size).toBeGreaterThan(typography.headline.size);
    expect(typography.headline.size).toBeGreaterThan(typography.title.size);
    expect(typography.title.size).toBeGreaterThan(typography.subheading.size);
    expect(typography.subheading.size).toBeGreaterThanOrEqual(typography.body.size);
    expect(typography.body.size).toBeGreaterThan(typography.caption.size);
  });

  it('família das variantes de UI é Manrope; stat usa Saira Condensed tabular', () => {
    for (const v of ['display','headline','title','subheading','body','label','caption'] as const) {
      expect(typography[v].family).toMatch(/^Manrope/);
    }
    expect(typography.stat.family).toMatch(/^SairaCondensed/);
    expect(typography.stat.tabular).toBe(true);
  });

  it('FONT_FAMILY mapeia famílias usadas pelas variantes', () => {
    const families = Object.values(FONT_FAMILY);
    for (const v of VARIANTS) expect(families).toContain(typography[v].family);
  });

  it('fontSize legado segue exportado (retrocompat)', () => {
    expect(fontSize.md).toBe(14);
    expect(fontSize.display).toBe(56);
  });
});
