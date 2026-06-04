import { rollInjuryDuration } from '@/engine/simulation/injury';
import { SeededRng } from '@/engine/rng';

describe('rollInjuryDuration', () => {
  it('returns a value in [1, 8]', () => {
    for (let seed = 0; seed < 200; seed++) {
      const d = rollInjuryDuration(new SeededRng(seed));
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(8);
      expect(Number.isInteger(d)).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(rollInjuryDuration(new SeededRng(42))).toBe(rollInjuryDuration(new SeededRng(42)));
  });

  it('is weighted toward short durations (mean < midpoint 4.5)', () => {
    const rng = new SeededRng(7);
    let total = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) total += rollInjuryDuration(rng);
    expect(total / N).toBeLessThan(4.5);
  });
});
