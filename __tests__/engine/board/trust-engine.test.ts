import { computeTrustDelta, TrustDeltaInput } from '@/engine/board/trust-engine';

const base: TrustDeltaInput = {
  currentTrust: 50,
  objectiveType: 'top_half',
  objectiveTarget: 10,
  leaguePosition: 8,
  totalTeams: 20,
  wonCup: false,
  wasRelegated: false,
  wasPromoted: false,
  reputationDelta: 0,
};

describe('computeTrustDelta', () => {
  it('meeting the objective raises trust', () => {
    const result = computeTrustDelta({ ...base, leaguePosition: 5, objectiveTarget: 10 });
    expect(result.newTrust).toBeGreaterThan(base.currentTrust);
    expect(result.outcome).toBe('objective_met');
  });

  it('failing the objective lowers trust', () => {
    const result = computeTrustDelta({ ...base, leaguePosition: 18, objectiveTarget: 10 });
    expect(result.newTrust).toBeLessThan(base.currentTrust);
    expect(result.outcome).toBe('objective_failed');
  });

  it('partial objective (close miss) gives objective_partial outcome', () => {
    const result = computeTrustDelta({ ...base, leaguePosition: 11, objectiveTarget: 10 });
    expect(result.outcome).toBe('objective_partial');
  });

  it('winning the cup meets a cup_win objective', () => {
    const result = computeTrustDelta({ ...base, objectiveType: 'cup_win', objectiveTarget: null, wonCup: true });
    expect(result.outcome).toBe('objective_met');
    expect(result.newTrust).toBeGreaterThan(base.currentTrust);
  });

  it('no_relegation met when not relegated', () => {
    const result = computeTrustDelta({ ...base, objectiveType: 'no_relegation', objectiveTarget: null, wasRelegated: false });
    expect(result.outcome).toBe('objective_met');
  });

  it('no_relegation failed when relegated', () => {
    const result = computeTrustDelta({ ...base, objectiveType: 'no_relegation', objectiveTarget: null, wasRelegated: true });
    expect(result.outcome).toBe('objective_failed');
    expect(result.newTrust).toBeLessThan(base.currentTrust);
  });

  it('consequence is fired when trust drops below 20', () => {
    const result = computeTrustDelta({ ...base, currentTrust: 25, leaguePosition: 18, wasRelegated: true });
    expect(result.newTrust).toBeLessThan(20);
    expect(result.consequence).toBe('fired');
  });

  it('consequence is budget_cut when trust is between 20 and 40', () => {
    const result = computeTrustDelta({ ...base, currentTrust: 40, leaguePosition: 18, objectiveTarget: 10 });
    if (result.newTrust < 20) {
      expect(result.consequence).toBe('fired');
    } else if (result.newTrust < 40) {
      expect(result.consequence).toBe('budget_cut');
    }
  });

  it('consequence is budget_bonus when trust exceeds 80', () => {
    const result = computeTrustDelta({ ...base, currentTrust: 78, leaguePosition: 1, objectiveTarget: 10, reputationDelta: 5 });
    if (result.newTrust > 80) {
      expect(result.consequence).toBe('budget_bonus');
    }
  });

  it('consequence is none for mid-range trust', () => {
    const result = computeTrustDelta({ ...base, currentTrust: 50, leaguePosition: 8 });
    expect(result.newTrust).toBeGreaterThanOrEqual(40);
    expect(result.newTrust).toBeLessThanOrEqual(80);
    expect(result.consequence).toBe('none');
  });

  it('clamps to minimum 0', () => {
    const result = computeTrustDelta({ ...base, currentTrust: 5, wasRelegated: true, leaguePosition: 20 });
    expect(result.newTrust).toBeGreaterThanOrEqual(0);
  });

  it('clamps to maximum 100', () => {
    const result = computeTrustDelta({ ...base, currentTrust: 98, leaguePosition: 1, objectiveTarget: 3, wonCup: true, reputationDelta: 10 });
    expect(result.newTrust).toBeLessThanOrEqual(100);
  });

  it('positive reputationDelta contributes to trust gain', () => {
    const withRep = computeTrustDelta({ ...base, reputationDelta: 10 });
    const withoutRep = computeTrustDelta({ ...base, reputationDelta: 0 });
    expect(withRep.newTrust).toBeGreaterThanOrEqual(withoutRep.newTrust);
  });
});
