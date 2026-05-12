import { computeReputationDelta, ReputationDeltaInput } from '@/engine/board/reputation-engine';

const base: ReputationDeltaInput = {
  currentReputation: 50,
  leaguePosition: 8,
  totalTeams: 20,
  wonLeague: false,
  wonCup: false,
  wasRelegated: false,
  wasPromoted: false,
  budgetBalance: 0,
  squadAverageOverall: 70,
  staffAverageAbility: 10,
};

describe('computeReputationDelta', () => {
  it('returns unchanged reputation for a median season', () => {
    const result = computeReputationDelta(base);
    expect(result.newReputation).toBe(base.currentReputation);
    expect(result.delta).toBe(0);
  });

  it('applies relegation penalty', () => {
    const result = computeReputationDelta({ ...base, wasRelegated: true });
    expect(result.newReputation).toBeLessThan(base.currentReputation);
    expect(result.breakdown.relegationPenalty).toBeLessThan(0);
  });

  it('applies promotion bonus', () => {
    const result = computeReputationDelta({ ...base, wasPromoted: true });
    expect(result.newReputation).toBeGreaterThan(base.currentReputation);
    expect(result.breakdown.promotionBonus).toBeGreaterThan(0);
  });

  it('applies league title bonus', () => {
    const result = computeReputationDelta({ ...base, wonLeague: true, leaguePosition: 1 });
    expect(result.newReputation).toBeGreaterThan(base.currentReputation);
    expect(result.breakdown.titlesDelta).toBeGreaterThan(0);
  });

  it('applies cup win bonus', () => {
    const result = computeReputationDelta({ ...base, wonCup: true });
    expect(result.newReputation).toBeGreaterThan(base.currentReputation);
    expect(result.breakdown.titlesDelta).toBeGreaterThan(0);
  });

  it('applies top-3 league position bonus', () => {
    const result = computeReputationDelta({ ...base, leaguePosition: 2 });
    expect(result.newReputation).toBeGreaterThan(base.currentReputation);
    expect(result.breakdown.performanceDelta).toBeGreaterThan(0);
  });

  it('applies bottom-3 league position penalty (without relegation)', () => {
    const result = computeReputationDelta({ ...base, leaguePosition: 19 });
    expect(result.newReputation).toBeLessThan(base.currentReputation);
    expect(result.breakdown.performanceDelta).toBeLessThan(0);
  });

  it('applies budget surplus bonus', () => {
    const result = computeReputationDelta({ ...base, budgetBalance: 5_000_000 });
    expect(result.breakdown.financialDelta).toBeGreaterThan(0);
  });

  it('applies budget deficit penalty', () => {
    const result = computeReputationDelta({ ...base, budgetBalance: -5_000_000 });
    expect(result.breakdown.financialDelta).toBeLessThan(0);
  });

  it('clamps result to minimum 1', () => {
    const result = computeReputationDelta({
      ...base,
      currentReputation: 5,
      wasRelegated: true,
      leaguePosition: 20,
      budgetBalance: -10_000_000,
    });
    expect(result.newReputation).toBeGreaterThanOrEqual(1);
  });

  it('clamps result to maximum 100', () => {
    const result = computeReputationDelta({
      ...base,
      currentReputation: 98,
      wonLeague: true,
      wonCup: true,
      wasPromoted: true,
      leaguePosition: 1,
      budgetBalance: 10_000_000,
    });
    expect(result.newReputation).toBeLessThanOrEqual(100);
  });

  it('delta equals newReputation minus currentReputation', () => {
    const result = computeReputationDelta({ ...base, wonLeague: true });
    expect(result.delta).toBe(result.newReputation - base.currentReputation);
  });
});
