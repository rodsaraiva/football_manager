import { recalculatePotential, PotentialInput } from '@/engine/training/potential';

describe('recalculatePotential', () => {
  const base: PotentialInput = {
    basePotential: 80,
    effectivePotential: 80,
    currentOverall: 65,
    seasonRatings: [{ avgRating: 7.0, minutesPercent: 60 }],
  };

  it('performance above expected raises potential', () => {
    const result = recalculatePotential({
      ...base,
      seasonRatings: [
        { avgRating: 7.8, minutesPercent: 80 },
        { avgRating: 7.5, minutesPercent: 75 },
        { avgRating: 7.6, minutesPercent: 85 },
      ],
    });
    expect(result.newEffectivePotential).toBeGreaterThan(80);
  });

  it('performance below expected lowers potential', () => {
    const result = recalculatePotential({
      ...base,
      seasonRatings: [
        { avgRating: 5.5, minutesPercent: 60 },
        { avgRating: 5.8, minutesPercent: 55 },
      ],
    });
    expect(result.newEffectivePotential).toBeLessThan(80);
  });

  it('caps upward at base + 15', () => {
    const result = recalculatePotential({
      ...base,
      effectivePotential: 94,
      seasonRatings: [
        { avgRating: 9.0, minutesPercent: 90 },
        { avgRating: 9.0, minutesPercent: 90 },
        { avgRating: 9.0, minutesPercent: 90 },
      ],
    });
    expect(result.newEffectivePotential).toBeLessThanOrEqual(95);
  });

  it('caps downward at base - 20, but never below current overall', () => {
    const result = recalculatePotential({
      ...base,
      currentOverall: 65,
      effectivePotential: 62,
      seasonRatings: [
        { avgRating: 4.5, minutesPercent: 40 },
        { avgRating: 4.5, minutesPercent: 40 },
        { avgRating: 4.5, minutesPercent: 40 },
      ],
    });
    expect(result.newEffectivePotential).toBeGreaterThanOrEqual(60);
    expect(result.newEffectivePotential).toBeGreaterThanOrEqual(65);
  });

  it('insufficient minutes freezes potential', () => {
    const result = recalculatePotential({
      ...base,
      seasonRatings: [{ avgRating: 7.0, minutesPercent: 20 }],
    });
    expect(result.newEffectivePotential).toBe(80);
  });

  it('no season data freezes potential', () => {
    const result = recalculatePotential({ ...base, seasonRatings: [] });
    expect(result.newEffectivePotential).toBe(80);
  });
});
