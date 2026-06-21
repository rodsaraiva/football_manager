import { typography, FONT_FAMILY, fontSize } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

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

describe('textStyle helper', () => {
  it('resolve fontSize/lineHeight/fontWeight/fontFamily do token', () => {
    const s = textStyle('title');
    expect(s.fontSize).toBe(typography.title.size);
    expect(s.lineHeight).toBe(typography.title.lineHeight);
    expect(s.fontWeight).toBe(typography.title.weight);
    expect(s.fontFamily).toBe(typography.title.family);
  });

  it('aplica letterSpacing quando o token tem', () => {
    expect(textStyle('label').letterSpacing).toBe(typography.label.letterSpacing);
    expect(textStyle('body').letterSpacing).toBeUndefined();
  });

  it('stat recebe fontVariant tabular-nums', () => {
    expect(textStyle('stat').fontVariant).toEqual(['tabular-nums']);
    expect(textStyle('body').fontVariant).toBeUndefined();
  });

  it('overrides têm precedência sobre o token', () => {
    const s = textStyle('body', { fontSize: 99, color: '#abcdef' });
    expect(s.fontSize).toBe(99);
    expect(s.color).toBe('#abcdef');
    expect(s.fontFamily).toBe(typography.body.family); // não sobrescrito permanece
  });
});
