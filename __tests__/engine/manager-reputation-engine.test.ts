import { computeManagerReputationDelta, ManagerRepInput } from '@/engine/board/manager-reputation-engine';

const base: ManagerRepInput = {
  current: 50,
  leaguePosition: 10,
  totalTeams: 20,
  wonLeague: false,
  wonCup: false,
  wasPromoted: false,
  wasRelegated: false,
  objectiveMet: false,
};

describe('computeManagerReputationDelta', () => {
  it('winning the league is the biggest single positive contributor', () => {
    const league = computeManagerReputationDelta({ ...base, wonLeague: true });
    const cup = computeManagerReputationDelta({ ...base, wonCup: true });
    const promo = computeManagerReputationDelta({ ...base, wasPromoted: true });
    expect(league.delta).toBeGreaterThan(0);
    expect(league.delta).toBeGreaterThan(cup.delta);
    expect(league.delta).toBeGreaterThan(promo.delta);
  });

  it('a cup win and a promotion are positive', () => {
    expect(computeManagerReputationDelta({ ...base, wonCup: true }).delta).toBeGreaterThan(0);
    expect(computeManagerReputationDelta({ ...base, wasPromoted: true }).delta).toBeGreaterThan(0);
  });

  it('a top-third finish gives a small positive', () => {
    // 20 teams → top third = top ~7. Position 5 qualifies; hold objective met so the
    // failed-objective penalty does not mask the top-third bonus.
    const top = computeManagerReputationDelta({ ...base, leaguePosition: 5, objectiveMet: true });
    const mid = computeManagerReputationDelta({ ...base, leaguePosition: 10, objectiveMet: true });
    expect(top.delta).toBeGreaterThan(0);
    expect(mid.delta).toBe(0); // mid-table, objective met → neutral
  });

  it('relegation is negative', () => {
    expect(computeManagerReputationDelta({ ...base, wasRelegated: true }).delta).toBeLessThan(0);
  });

  it('failing the objective is a small negative', () => {
    const failed = computeManagerReputationDelta({ ...base, objectiveMet: false, leaguePosition: 10 });
    const met = computeManagerReputationDelta({ ...base, objectiveMet: true, leaguePosition: 10 });
    expect(failed.delta).toBeLessThan(0);
    expect(met.delta).toBeGreaterThanOrEqual(failed.delta);
    // Objective met (no other contributor) should not be a penalty.
    expect(met.delta).toBeGreaterThanOrEqual(0);
  });

  it('clamps at the upper bound of 100', () => {
    const r = computeManagerReputationDelta({
      ...base, current: 99, wonLeague: true, wonCup: true, wasPromoted: true, objectiveMet: true, leaguePosition: 1,
    });
    expect(r.next).toBeLessThanOrEqual(100);
    expect(r.next).toBe(100);
  });

  it('clamps at the lower bound of 1', () => {
    const r = computeManagerReputationDelta({ ...base, current: 2, wasRelegated: true, objectiveMet: false });
    expect(r.next).toBeGreaterThanOrEqual(1);
  });

  it('next = current + delta', () => {
    const r = computeManagerReputationDelta({ ...base, wonCup: true });
    expect(r.next).toBe(base.current + r.delta);
  });

  it('null league position does not crash and yields no top-third bonus', () => {
    const r = computeManagerReputationDelta({ ...base, leaguePosition: null, objectiveMet: true });
    expect(Number.isFinite(r.delta)).toBe(true);
    expect(r.delta).toBe(0);
  });
});
