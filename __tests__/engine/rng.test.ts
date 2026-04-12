import { SeededRng } from '@/engine/rng';

describe('SeededRng', () => {
  it('produces deterministic results for the same seed', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());
    expect(results1).toEqual(results2);
  });

  it('produces different results for different seeds', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(99);
    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());
    expect(results1).not.toEqual(results2);
  });

  it('next() returns values between 0 and 1', () => {
    const rng = new SeededRng(123);
    for (let i = 0; i < 1000; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('nextInt(min, max) returns integers in range [min, max]', () => {
    const rng = new SeededRng(456);
    for (let i = 0; i < 1000; i++) {
      const val = rng.nextInt(1, 99);
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(99);
    }
  });

  it('nextFloat(min, max) returns floats in range [min, max)', () => {
    const rng = new SeededRng(789);
    for (let i = 0; i < 1000; i++) {
      const val = rng.nextFloat(0.1, 0.8);
      expect(val).toBeGreaterThanOrEqual(0.1);
      expect(val).toBeLessThan(0.8);
    }
  });

  it('pick() selects a random element from an array', () => {
    const rng = new SeededRng(42);
    const items = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('shuffle() returns all elements in different order', () => {
    const rng = new SeededRng(42);
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = rng.shuffle([...original]);
    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
    expect(shuffled).not.toEqual(original);
  });

  it('weightedPick() respects weights', () => {
    const rng = new SeededRng(42);
    const items = ['rare', 'common'];
    const weights = [1, 99];
    const counts: Record<string, number> = { rare: 0, common: 0 };
    for (let i = 0; i < 10000; i++) {
      counts[rng.weightedPick(items, weights)]++;
    }
    expect(counts.common).toBeGreaterThan(counts.rare * 5);
  });
});
