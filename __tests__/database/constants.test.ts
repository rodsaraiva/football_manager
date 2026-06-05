import { SAVE_ID_STRIDE, saveOffset } from '@/database/constants';

describe('save id space', () => {
  it('STRIDE is large enough for one world (>= 100M)', () => {
    expect(SAVE_ID_STRIDE).toBeGreaterThanOrEqual(100_000_000);
  });

  it('saveOffset(saveId) = saveId * STRIDE', () => {
    expect(saveOffset(1)).toBe(SAVE_ID_STRIDE);
    expect(saveOffset(3)).toBe(3 * SAVE_ID_STRIDE);
  });

  it('offsets of different saves never overlap for ids below STRIDE', () => {
    const a = saveOffset(1) + 999_999; // any raw id within one world
    const b = saveOffset(2) + 0;
    expect(a).toBeLessThan(b);
  });

  it('stays within Number.MAX_SAFE_INTEGER for thousands of saves', () => {
    expect(saveOffset(10_000) + SAVE_ID_STRIDE).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
