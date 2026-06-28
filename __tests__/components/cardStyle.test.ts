import { resolveCardStyle } from '@/components/kit/cardStyle';
import { colors } from '@/theme';

const ACCENT = '#22aa55';

describe('resolveCardStyle', () => {
  it('hero tem maior elevação que summary e detail', () => {
    const hero = resolveCardStyle('hero', ACCENT);
    const summary = resolveCardStyle('summary', ACCENT);
    const detail = resolveCardStyle('detail', ACCENT);
    expect(hero.elevation.elevation).toBeGreaterThanOrEqual(summary.elevation.elevation);
    expect(summary.elevation.elevation).toBeGreaterThanOrEqual(detail.elevation.elevation);
  });

  it('hero destaca borda com accent', () => {
    expect(resolveCardStyle('hero', ACCENT).borderColor).toBe(ACCENT);
  });

  it('detail usa surface + borda neutra', () => {
    const r = resolveCardStyle('detail', ACCENT);
    expect(r.backgroundColor).toBe(colors.surface);
    expect(r.borderColor).toBe(colors.border);
  });

  it('todas as variantes têm radius e padding > 0', () => {
    (['hero', 'summary', 'detail'] as const).forEach((v) => {
      const r = resolveCardStyle(v, ACCENT);
      expect(r.radius).toBeGreaterThan(0);
      expect(r.padding).toBeGreaterThan(0);
    });
  });
});
