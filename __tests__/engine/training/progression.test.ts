import { calculateWeeklyProgression, ProgressionInput } from '@/engine/training/progression';
import { PlayerAttributes } from '@/types';

const baseAttrs: PlayerAttributes = {
  finishing: 70, passing: 70, crossing: 70, dribbling: 70,
  heading: 70, longShots: 70, freeKicks: 70,
  vision: 70, composure: 70, decisions: 70,
  positioning: 70, aggression: 70, leadership: 70,
  pace: 70, stamina: 70, strength: 70, agility: 70, jumping: 70,
};

const makeInput = (overrides: Partial<ProgressionInput> = {}): ProgressionInput => ({
  age: 22,
  attributes: { ...baseAttrs },
  effectivePotential: 85,
  minutesPlayedRecent: 360,
  totalPossibleMinutes: 540,
  avgRatingRecent: 7.0,
  trainingFocus: 'balanced',
  trainingFacilityLevel: 3,
  staffTrainingBonus: 0,
  ...overrides,
});

describe('calculateWeeklyProgression', () => {
  it('young player with good minutes evolves positively', () => {
    const result = calculateWeeklyProgression(makeInput({ age: 19 }));
    const totalChange = Object.values(result.attributeChanges).reduce((s, v) => s + v, 0);
    expect(totalChange).toBeGreaterThan(0);
  });

  it('more minutes played = faster progression', () => {
    const fewMinutes = calculateWeeklyProgression(makeInput({ minutesPlayedRecent: 90, totalPossibleMinutes: 540 }));
    const manyMinutes = calculateWeeklyProgression(makeInput({ minutesPlayedRecent: 450, totalPossibleMinutes: 540 }));
    const fewTotal = Object.values(fewMinutes.attributeChanges).reduce((s, v) => s + v, 0);
    const manyTotal = Object.values(manyMinutes.attributeChanges).reduce((s, v) => s + v, 0);
    expect(manyTotal).toBeGreaterThan(fewTotal);
  });

  it('better performance = faster progression', () => {
    const low = calculateWeeklyProgression(makeInput({ avgRatingRecent: 5.5 }));
    const high = calculateWeeklyProgression(makeInput({ avgRatingRecent: 8.0 }));
    const lowTotal = Object.values(low.attributeChanges).reduce((s, v) => s + v, 0);
    const highTotal = Object.values(high.attributeChanges).reduce((s, v) => s + v, 0);
    expect(highTotal).toBeGreaterThan(lowTotal);
  });

  it('veteran (31+) declines by default', () => {
    const result = calculateWeeklyProgression(makeInput({ age: 33, minutesPlayedRecent: 90, totalPossibleMinutes: 540, avgRatingRecent: 6.0 }));
    expect(result.attributeChanges.pace).toBeLessThanOrEqual(0);
    expect(result.attributeChanges.stamina).toBeLessThanOrEqual(0);
  });

  it('veteran with excellent performance can slow decline', () => {
    const badVet = calculateWeeklyProgression(makeInput({ age: 32, minutesPlayedRecent: 90, totalPossibleMinutes: 540, avgRatingRecent: 5.5 }));
    const goodVet = calculateWeeklyProgression(makeInput({ age: 32, minutesPlayedRecent: 480, totalPossibleMinutes: 540, avgRatingRecent: 7.8 }));
    const badTotal = Object.values(badVet.attributeChanges).reduce((s, v) => s + v, 0);
    const goodTotal = Object.values(goodVet.attributeChanges).reduce((s, v) => s + v, 0);
    expect(goodTotal).toBeGreaterThan(badTotal);
  });

  it('player at potential ceiling barely evolves', () => {
    const highAttrs: PlayerAttributes = {
      finishing: 85, passing: 85, crossing: 85, dribbling: 85,
      heading: 85, longShots: 85, freeKicks: 85,
      vision: 85, composure: 85, decisions: 85,
      positioning: 85, aggression: 85, leadership: 85,
      pace: 85, stamina: 85, strength: 85, agility: 85, jumping: 85,
    };
    const atCeiling = calculateWeeklyProgression(makeInput({ attributes: highAttrs, effectivePotential: 85 }));
    const totalChange = Object.values(atCeiling.attributeChanges).reduce((s, v) => s + v, 0);
    expect(Math.abs(totalChange)).toBeLessThan(1);
  });

  it('25+ player with zero minutes does not evolve', () => {
    const result = calculateWeeklyProgression(makeInput({ age: 27, minutesPlayedRecent: 0, totalPossibleMinutes: 540 }));
    const totalChange = Object.values(result.attributeChanges).reduce((s, v) => s + v, 0);
    expect(totalChange).toBe(0);
  });

  it('higher training facility boosts progression', () => {
    const low = calculateWeeklyProgression(makeInput({ trainingFacilityLevel: 1 }));
    const high = calculateWeeklyProgression(makeInput({ trainingFacilityLevel: 5 }));
    const lowTotal = Object.values(low.attributeChanges).reduce((s, v) => s + v, 0);
    const highTotal = Object.values(high.attributeChanges).reduce((s, v) => s + v, 0);
    expect(highTotal).toBeGreaterThan(lowTotal);
  });

  it('higher staffTrainingBonus yields monotonically larger gains for a developing player', () => {
    const low = calculateWeeklyProgression(makeInput({ age: 21, staffTrainingBonus: 0 })).attributeChanges.passing;
    const high = calculateWeeklyProgression(makeInput({ age: 21, staffTrainingBonus: 0.3 })).attributeChanges.passing;
    expect(high).toBeGreaterThan(low);
  });

  it('staffTrainingBonus of 0 keeps the previous (facility-only) behaviour', () => {
    const change = calculateWeeklyProgression(makeInput({ age: 21, staffTrainingBonus: 0 })).attributeChanges.passing;
    expect(change).toBeGreaterThan(0);
    expect(Number.isFinite(change)).toBe(true);
  });
});

const attrs40: PlayerAttributes = {
  finishing: 40, passing: 40, crossing: 40, dribbling: 40, heading: 40,
  longShots: 40, freeKicks: 40, vision: 40, composure: 40, decisions: 40,
  positioning: 40, aggression: 40, leadership: 40, pace: 40, stamina: 40,
  strength: 40, agility: 40, jumping: 40,
};

const growing: ProgressionInput = {
  age: 19,
  attributes: attrs40,
  effectivePotential: 85,
  minutesPlayedRecent: 90,
  totalPossibleMinutes: 90,
  avgRatingRecent: 7.5,
  trainingFocus: 'balanced',
  trainingFacilityLevel: 3,
};

describe('calculateWeeklyProgression staffTrainingBonus', () => {
  it('a positive staffTrainingBonus increases growth vs none', () => {
    const without = calculateWeeklyProgression({ ...growing });
    const withBonus = calculateWeeklyProgression({ ...growing, staffTrainingBonus: 0.3 });
    expect(withBonus.attributeChanges.passing).toBeGreaterThan(without.attributeChanges.passing);
  });

  it('defaults to no change in behaviour when bonus is omitted (back-compat)', () => {
    const omitted = calculateWeeklyProgression({ ...growing });
    const zero = calculateWeeklyProgression({ ...growing, staffTrainingBonus: 0 });
    expect(zero.attributeChanges.passing).toBeCloseTo(omitted.attributeChanges.passing, 10);
  });
});
