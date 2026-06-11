import { simulateWeekFixtures, ClubMatchData, FixtureSimInput } from '@/engine/simulation/match-runner';
import { pickStartingEleven, buildBench, PlayerForPick } from '@/engine/simulation/squad-selection';
import { SeededRng } from '@/engine/rng';
import { PlayerAttributes } from '@/types';
import { Tactic } from '@/types/tactic';

const ATTRS = (o: number): PlayerAttributes => ({
  finishing: o, passing: o, crossing: o, dribbling: o, heading: o,
  longShots: o, freeKicks: o, vision: o, composure: o, decisions: o,
  positioning: o, aggression: o, leadership: o, pace: o, stamina: o,
  strength: o, agility: o, jumping: o,
});

const DEFAULT_TACTIC: Tactic = {
  id: 0, clubId: 0, name: 'D', isActive: true, formation: '4-4-2',
  mentality: 'balanced', pressing: 'medium', passingStyle: 'mixed',
  tempo: 'normal', width: 'normal', attackFocus: 'balanced', subStrategy: 'balanced',
};

function squadOf(clubId: number, overall: number): PlayerForPick[] {
  const slots: PlayerForPick['position'][] = ['GK','CB','CB','LB','RB','CM','CM','LM','RM','ST','ST','CB','ST'];
  return slots.map((position, i) => ({
    id: clubId * 100 + i, position, secondaryPosition: null,
    attributes: ATTRS(overall), morale: 70, fitness: 100, injuryWeeksLeft: 0, suspensionWeeksLeft: 0,
  }));
}

function clubData(clubId: number, overall: number, reputation: number): ClubMatchData {
  const raw = squadOf(clubId, overall);
  const squad = pickStartingEleven(raw, '4-4-2');
  const startIds = new Set(squad.map(p => p.id));
  return { clubId, reputation, squad, bench: buildBench(raw, startIds), tactic: { ...DEFAULT_TACTIC, clubId } };
}

describe('simulateWeekFixtures', () => {
  it('returns exactly one result per fixture', () => {
    const fixtures: FixtureSimInput[] = [
      { fixtureId: 1, homeClubId: 10, awayClubId: 20 },
      { fixtureId: 2, homeClubId: 30, awayClubId: 40 },
    ];
    const clubMap = new Map<number, ClubMatchData>([
      [10, clubData(10, 70, 60)], [20, clubData(20, 70, 60)],
      [30, clubData(30, 70, 60)], [40, clubData(40, 70, 60)],
    ]);
    const out = simulateWeekFixtures({ fixtures, clubData: clubMap, rng: new SeededRng(42) });
    expect(out).toHaveLength(2);
    expect(out.map(r => r.fixtureId).sort()).toEqual([1, 2]);
    expect(out[0].result.homeRatings.length).toBe(11);
  });

  it('is deterministic with the same seed', () => {
    const fixtures: FixtureSimInput[] = [{ fixtureId: 1, homeClubId: 10, awayClubId: 20 }];
    const map = () => new Map<number, ClubMatchData>([[10, clubData(10, 70, 60)], [20, clubData(20, 70, 60)]]);
    const a = simulateWeekFixtures({ fixtures, clubData: map(), rng: new SeededRng(99) });
    const b = simulateWeekFixtures({ fixtures, clubData: map(), rng: new SeededRng(99) });
    expect(a[0].result.homeGoals).toBe(b[0].result.homeGoals);
    expect(a[0].result.awayGoals).toBe(b[0].result.awayGoals);
  });

  it('the stronger club wins more often across many seeds (not a rep coin-flip)', () => {
    let strongWins = 0;
    const N = 60;
    for (let s = 0; s < N; s++) {
      const fixtures: FixtureSimInput[] = [{ fixtureId: 1, homeClubId: 10, awayClubId: 20 }];
      const map = new Map<number, ClubMatchData>([
        [10, clubData(10, 82, 55)], // strong squad, modest reputation
        [20, clubData(20, 55, 75)], // weak squad, high reputation
      ]);
      const out = simulateWeekFixtures({ fixtures, clubData: map, rng: new SeededRng(s + 1) });
      if (out[0].result.homeGoals > out[0].result.awayGoals) strongWins++;
    }
    expect(strongWins).toBeGreaterThan(N / 2);
  });

  it('tolerates an empty squad (records 0-0, does not throw)', () => {
    const fixtures: FixtureSimInput[] = [{ fixtureId: 1, homeClubId: 10, awayClubId: 20 }];
    const empty: ClubMatchData = { clubId: 10, reputation: 50, squad: [], bench: [], tactic: { ...DEFAULT_TACTIC, clubId: 10 } };
    const map = new Map<number, ClubMatchData>([[10, empty], [20, clubData(20, 70, 60)]]);
    expect(() => simulateWeekFixtures({ fixtures, clubData: map, rng: new SeededRng(1) })).not.toThrow();
  });
});
