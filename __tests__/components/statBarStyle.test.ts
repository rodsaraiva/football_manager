import { resolveStatBar } from '@/components/kit/statBarStyle';
import { getBarColor } from '@/utils/player-colors';

describe('resolveStatBar', () => {
  it('fillPercent clampa entre 0 e 100', () => {
    expect(resolveStatBar(0, 99).fillPercent).toBe(0);
    expect(resolveStatBar(99, 99).fillPercent).toBe(100);
    expect(resolveStatBar(200, 99).fillPercent).toBe(100);
    expect(resolveStatBar(-5, 99).fillPercent).toBe(0);
  });
  it('valueColor e colorEnd batem com getBarColor(value)', () => {
    const r = resolveStatBar(80, 99);
    expect(r.valueColor).toBe(getBarColor(80));
    expect(r.colorEnd).toBe(getBarColor(80));
  });
  it('colorStart é um tint mais claro que colorEnd (gradiente)', () => {
    const r = resolveStatBar(80, 99);
    expect(r.colorStart).not.toBe(r.colorEnd);
  });
  it('maxValue customizado afeta fillPercent', () => {
    expect(resolveStatBar(5, 10).fillPercent).toBe(50);
  });
});
