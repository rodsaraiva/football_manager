import { resolveBadgeStyle } from '@/components/kit/badgeStyle';
import { colors } from '@/theme';

describe('resolveBadgeStyle', () => {
  it('success preenche com colors.success e texto legível', () => {
    const r = resolveBadgeStyle('success', '#22aa55');
    expect(r.backgroundColor).toBe(colors.success);
    expect(['#ffffff', '#000000']).toContain(r.textColor);
  });
  it('accent usa o accent do clube como fundo', () => {
    expect(resolveBadgeStyle('accent', '#22aa55').backgroundColor).toBe('#22aa55');
  });
  it('neutral, danger, warning, primary mapeiam para tokens', () => {
    expect(resolveBadgeStyle('danger', '#000').backgroundColor).toBe(colors.danger);
    expect(resolveBadgeStyle('warning', '#000').backgroundColor).toBe(colors.warning);
    expect(resolveBadgeStyle('primary', '#000').backgroundColor).toBe(colors.primary);
    expect(resolveBadgeStyle('neutral', '#000').backgroundColor).toBe(colors.surfaceLight);
  });
});
