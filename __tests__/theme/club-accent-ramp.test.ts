import { deriveAccentRamp, mixWithBlack, luminance } from '@/theme/club-accent';

describe('mixWithBlack', () => {
  it('blends white toward black by t', () => {
    expect(mixWithBlack('#ffffff', 0.5)).toBe('#808080');
  });
  it('leaves black unchanged', () => {
    expect(mixWithBlack('#000000', 0.4)).toBe('#000000');
  });
});

describe('deriveAccentRamp', () => {
  it('keeps the base accent and derives a dim shade + bright tint', () => {
    const r = deriveAccentRamp('#4361ee');
    expect(r.accent).toBe('#4361ee');
    // dim é mais escuro que base; bright é mais claro que base
    expect(luminance(r.accentDim)).toBeLessThan(luminance(r.accent));
    expect(luminance(r.accentBright)).toBeGreaterThan(luminance(r.accent));
  });

  it('onAccent é legível: texto branco sobre accent escuro, preto sobre claro', () => {
    expect(deriveAccentRamp('#101010').onAccent).toBe('#ffffff'); // accent escuro → texto branco
    expect(deriveAccentRamp('#f5f5f5').onAccent).toBe('#000000'); // accent claro → texto preto
  });

  it('mantém ordenação dim < base < bright em luminância para accents médios', () => {
    const r = deriveAccentRamp('#DA291C');
    expect(luminance(r.accentDim)).toBeLessThan(luminance(r.accent));
    expect(luminance(r.accent)).toBeLessThan(luminance(r.accentBright));
  });
});
