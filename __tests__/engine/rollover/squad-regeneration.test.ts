import { regenerateAiSquadSeason, AiPlayerProgressInput } from '@/engine/rollover/squad-regeneration';
import { calculateMarketValue } from '@/engine/transfer/market-value';
import { SeededRng } from '@/engine/rng';

function mk(over: Partial<AiPlayerProgressInput>): AiPlayerProgressInput {
  return {
    playerId: 1, age: 24, currentOverall: 65, basePotential: 80,
    effectivePotential: 75, contractYearsLeft: 3, seasonAvgRating: 7.4,
    minutesPercent: 80, ...over,
  };
}

describe('regenerateAiSquadSeason', () => {
  it('raises effective potential for a high-rating young player', () => {
    const [d] = regenerateAiSquadSeason({ players: [mk({ age: 20, seasonAvgRating: 7.8, minutesPercent: 90 })], rng: new SeededRng(1) });
    expect(d.newEffectivePotential).toBeGreaterThanOrEqual(75);
  });

  it('freezes potential when seasonAvgRating is null (insufficient minutes)', () => {
    const [d] = regenerateAiSquadSeason({ players: [mk({ seasonAvgRating: null, minutesPercent: 0 })], rng: new SeededRng(1) });
    expect(d.newEffectivePotential).toBe(75);
  });

  it('recomputes market value from real overall (not frozen, not 70)', () => {
    const input = mk({ age: 20, currentOverall: 68, effectivePotential: 82, contractYearsLeft: 4 });
    const [d] = regenerateAiSquadSeason({ players: [input], rng: new SeededRng(1) });
    const expected = calculateMarketValue({
      overall: 68,
      effectivePotential: d.newEffectivePotential,
      age: 21, // age advanced by one season
      contractYearsLeft: 4,
    });
    expect(d.newMarketValue).toBe(expected);
  });

  it('declines effective potential for an underperforming veteran', () => {
    const [d] = regenerateAiSquadSeason({ players: [mk({ age: 33, currentOverall: 60, effectivePotential: 70, basePotential: 75, seasonAvgRating: 4.5, minutesPercent: 60 })], rng: new SeededRng(1) });
    expect(d.newEffectivePotential).toBeLessThan(70);
  });

  it('returns one delta per input player in the same order', () => {
    const out = regenerateAiSquadSeason({ players: [mk({ playerId: 1 }), mk({ playerId: 2 }), mk({ playerId: 3 })], rng: new SeededRng(1) });
    expect(out.map(d => d.playerId)).toEqual([1, 2, 3]);
  });
});
