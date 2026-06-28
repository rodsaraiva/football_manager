import { resolveStatBar } from '@/components/kit/statBarStyle';
import { getBarColor } from '@/utils/player-colors';
import { mixWithWhite } from '@/theme/club-accent';

describe('resolveStatBar', () => {
  it('default (rating) deriva a cor de getBarColor', () => {
    const r = resolveStatBar(80, 99);
    expect(r.colorEnd).toBe(getBarColor(80));
    expect(r.valueColor).toBe(getBarColor(80));
    expect(r.colorStart).toBe(mixWithWhite(getBarColor(80), 0.35));
  });

  it('com accent override usa a cor do clube no fim/valor e o tint no início', () => {
    const r = resolveStatBar(80, 99, '#FFFFFF');
    expect(r.colorEnd).toBe('#FFFFFF');
    expect(r.valueColor).toBe('#FFFFFF');
    expect(r.colorStart).toBe(mixWithWhite('#FFFFFF', 0.35));
  });

  it('clampa o fillPercent em [0,100] independente do tone', () => {
    expect(resolveStatBar(200, 99).fillPercent).toBe(100);
    expect(resolveStatBar(-5, 99).fillPercent).toBe(0);
    expect(resolveStatBar(50, 99, '#FFFFFF').fillPercent).toBeCloseTo((50 / 99) * 100);
  });
});
