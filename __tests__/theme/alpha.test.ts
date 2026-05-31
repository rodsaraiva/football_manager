import { alpha } from '@/theme/alpha';
import { colors } from '@/theme/tokens';

describe('alpha', () => {
  it('matches the legacy #06d6a0aa string at t=0.667', () => {
    expect(alpha(colors.success, 0.667)).toBe('#06d6a0aa'); // aa = 170/255 ≈ 0.667 (round(0.667*255)=170)
  });
  it('t=0 → fully transparent suffix; t=1 → opaque suffix', () => {
    expect(alpha('#ffffff', 0)).toBe('#ffffff00');
    expect(alpha('#ffffff', 1)).toBe('#ffffffff');
  });
  it('clamps t outside [0,1]', () => {
    expect(alpha('#000000', -1)).toBe('#00000000');
    expect(alpha('#000000', 2)).toBe('#000000ff');
  });
  it('expands a 3-digit hex before appending alpha', () => {
    expect(alpha('#fff', 1)).toBe('#ffffffff');
  });
  it('returns input unchanged for invalid hex (never throws)', () => {
    expect(alpha('nope', 0.5)).toBe('nope');
    expect(alpha('#12', 0.5)).toBe('#12');
  });
  it('reproduces the report-screen concat values', () => {
    expect(alpha('#06d6a0', 0.8)).toBe('#06d6a0cc'); // success + 'cc'
    expect(alpha('#ffd166', 0.2)).toBe('#ffd16633'); // warning + '33'
    expect(alpha('#4361ee', 0.2)).toBe('#4361ee33'); // primary + '33'
  });
});
