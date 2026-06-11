import { SeededRng } from '@/engine/rng';
import {
  resolveKnockoutTie,
  buildNextKnockoutRound,
  isKnockoutComplete,
  seedClChampionsKnockout,
  PlayedKnockoutFixture,
} from '@/engine/competition/knockout';

const tie = (home: number, away: number, hg: number, ag: number): PlayedKnockoutFixture => ({
  homeClubId: home, awayClubId: away, homeGoals: hg, awayGoals: ag, round: 1,
});

describe('resolveKnockoutTie', () => {
  it('home win advances home, no shootout', () => {
    const w = resolveKnockoutTie(tie(10, 20, 2, 1), new SeededRng(1));
    expect(w.winnerClubId).toBe(10);
    expect(w.loserClubId).toBe(20);
    expect(w.viaShootout).toBe(false);
    expect(w.shootoutScore).toBeNull();
  });

  it('away win advances away, no shootout', () => {
    const w = resolveKnockoutTie(tie(10, 20, 0, 3), new SeededRng(1));
    expect(w.winnerClubId).toBe(20);
    expect(w.viaShootout).toBe(false);
  });

  it('draw is resolved by a shootout returning one of the two clubs', () => {
    const w = resolveKnockoutTie(tie(10, 20, 1, 1), new SeededRng(99));
    expect([10, 20]).toContain(w.winnerClubId);
    expect(w.viaShootout).toBe(true);
    expect(w.shootoutScore).not.toBeNull();
    const [wp, lp] = w.shootoutScore!;
    expect(wp).toBeGreaterThan(lp); // winner scored more penalties
    expect(wp).toBeLessThanOrEqual(10); // best-of-5 + bounded sudden death
  });

  it('shootout is deterministic for the same seed', () => {
    const a = resolveKnockoutTie(tie(10, 20, 1, 1), new SeededRng(99));
    const b = resolveKnockoutTie(tie(10, 20, 1, 1), new SeededRng(99));
    expect(a.winnerClubId).toBe(b.winnerClubId);
    expect(a.shootoutScore).toEqual(b.shootoutScore);
  });
});

describe('buildNextKnockoutRound', () => {
  const repAll = new Map<number, number>();

  it('8 winners → 4 fixtures in round N+1, no bye', () => {
    const { fixtures, byeClubIds } = buildNextKnockoutRound({
      competitionId: 5, season: 1, completedRound: 1,
      winners: [1, 2, 3, 4, 5, 6, 7, 8], pendingByeClubIds: [],
      week: 49, reputationByClubId: repAll,
    });
    expect(fixtures).toHaveLength(4);
    expect(fixtures.every((f) => f.round === 2)).toBe(true);
    expect(fixtures.every((f) => f.week === 49)).toBe(true);
    expect(byeClubIds).toEqual([]);
  });

  it('includes pending byes as participants in the next round', () => {
    const { fixtures } = buildNextKnockoutRound({
      competitionId: 5, season: 1, completedRound: 1,
      winners: [1, 2], pendingByeClubIds: [3, 4],
      week: 49, reputationByClubId: repAll,
    });
    const ids = fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it('odd survivors → highest-reputation club gets the bye', () => {
    const rep = new Map<number, number>([[1, 50], [2, 90], [3, 60]]);
    const { fixtures, byeClubIds } = buildNextKnockoutRound({
      competitionId: 5, season: 1, completedRound: 1,
      winners: [1, 2, 3], pendingByeClubIds: [],
      week: 49, reputationByClubId: rep,
    });
    expect(byeClubIds).toEqual([2]); // highest rep
    expect(fixtures).toHaveLength(1);
    const ids = [fixtures[0].homeClubId, fixtures[0].awayClubId].sort((a, b) => a - b);
    expect(ids).toEqual([1, 3]);
  });

  it('2 survivors → 1 final fixture', () => {
    const { fixtures } = buildNextKnockoutRound({
      competitionId: 5, season: 1, completedRound: 2,
      winners: [1, 2], pendingByeClubIds: [],
      week: 51, reputationByClubId: repAll,
    });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].round).toBe(3);
  });
});

describe('isKnockoutComplete', () => {
  it('true when exactly one club remains', () => {
    expect(isKnockoutComplete([7], [])).toBe(true);
    expect(isKnockoutComplete([], [7])).toBe(true);
  });
  it('false when two or more remain', () => {
    expect(isKnockoutComplete([7, 8], [])).toBe(false);
    expect(isKnockoutComplete([7], [8])).toBe(false);
  });
});

describe('seedClChampionsKnockout', () => {
  it('pairs group winners vs the other group runners-up', () => {
    const fixtures = seedClChampionsKnockout({
      competitionId: 9, season: 1, week: 49,
      groups: { A: [11, 12], B: [21, 22] }, // each group ordered 1st..2nd
    });
    // winner A (11) vs runner-up B (22); winner B (21) vs runner-up A (12)
    expect(fixtures).toHaveLength(2);
    expect(fixtures.every((f) => f.round === 1)).toBe(true);
    const pairs = fixtures.map((f) => [f.homeClubId, f.awayClubId]);
    expect(pairs).toContainEqual([11, 22]);
    expect(pairs).toContainEqual([21, 12]);
  });
});
