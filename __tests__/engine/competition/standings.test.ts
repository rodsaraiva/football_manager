import { calculateStandings, compareStandings } from '@/engine/competition/standings';
import { Fixture } from '@/types';

function makeFixture(home: number, away: number, homeGoals: number, awayGoals: number): Fixture {
  return {
    id: 0, competitionId: 1, season: 1, week: 1, round: null,
    homeClubId: home, awayClubId: away,
    homeGoals, awayGoals, played: true, attendance: null,
  };
}

describe('calculateStandings', () => {
  it('awards 3 points for a win', () => {
    const fixtures = [makeFixture(1, 2, 3, 0)];
    const standings = calculateStandings(fixtures, [1, 2]);
    const team1 = standings.find(s => s.clubId === 1)!;
    expect(team1.points).toBe(3);
    expect(team1.wins).toBe(1);
    expect(team1.goalsFor).toBe(3);
  });

  it('awards 1 point each for a draw', () => {
    const fixtures = [makeFixture(1, 2, 1, 1)];
    const standings = calculateStandings(fixtures, [1, 2]);
    expect(standings[0].points).toBe(1);
    expect(standings[1].points).toBe(1);
    expect(standings[0].draws).toBe(1);
  });

  it('awards 0 points for a loss', () => {
    const fixtures = [makeFixture(1, 2, 0, 2)];
    const standings = calculateStandings(fixtures, [1, 2]);
    const team1 = standings.find(s => s.clubId === 1)!;
    expect(team1.points).toBe(0);
    expect(team1.losses).toBe(1);
  });

  it('sorts by points, then goal difference, then goals scored', () => {
    const fixtures = [
      makeFixture(1, 2, 2, 0),
      makeFixture(3, 4, 5, 0),
      makeFixture(2, 3, 1, 1),
    ];
    const standings = calculateStandings(fixtures, [1, 2, 3, 4]);
    expect(standings[0].clubId).toBe(3);
    expect(standings[1].clubId).toBe(1);
  });

  it('ignores unplayed fixtures', () => {
    const played = makeFixture(1, 2, 2, 0);
    const unplayed: Fixture = {
      id: 0, competitionId: 1, season: 1, week: 2, round: null,
      homeClubId: 1, awayClubId: 2,
      homeGoals: null, awayGoals: null, played: false, attendance: null,
    };
    const standings = calculateStandings([played, unplayed], [1, 2]);
    expect(standings[0].played).toBe(1);
  });

  it('calculates goal difference correctly', () => {
    const fixtures = [
      makeFixture(1, 2, 3, 1),
      makeFixture(2, 1, 2, 0),
    ];
    const standings = calculateStandings(fixtures, [1, 2]);
    const team1 = standings.find(s => s.clubId === 1)!;
    expect(team1.goalsFor).toBe(3);
    expect(team1.goalsAgainst).toBe(3);
    expect(team1.goalDifference).toBe(0);
  });

  it('includes all teams even with no matches', () => {
    const standings = calculateStandings([], [1, 2, 3]);
    expect(standings).toHaveLength(3);
    for (const s of standings) {
      expect(s.points).toBe(0);
      expect(s.played).toBe(0);
    }
  });
});

function fx(id: number, home: number, away: number, hg: number, ag: number): Fixture {
  return {
    id, competitionId: 1, season: 1, week: 1, round: null,
    homeClubId: home, awayClubId: away, homeGoals: hg, awayGoals: ag,
    played: true, attendance: null,
  };
}

describe('calculateStandings — head-to-head tiebreaker', () => {
  it('ranks the H2H winner above a club equal on pts/GD/GF', () => {
    // Clubs 1 and 2 each beat club 3 by the same margin, so pts/GD/GF are equal,
    // but club 1 beat club 2 head-to-head 1-0 (which also feeds GD/GF — so make
    // the non-H2H games asymmetric to neutralise GD/GF and isolate H2H).
    const fixtures: Fixture[] = [
      fx(1, 1, 2, 1, 0), // club 1 beats club 2 (H2H)
      fx(2, 1, 3, 0, 1), // club 1 loses to 3
      fx(3, 2, 3, 1, 0), // club 2 beats 3
    ];
    // Totals: club1 pts3 GF1 GA1 GD0; club2 pts3 GF1 GA1 GD0 → equal on pts/GD/GF.
    const table = calculateStandings(fixtures, [1, 2, 3]);
    const ids = table.map((e) => e.clubId);
    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2)); // H2H winner first
  });

  it('falls back to clubId for fully-equal clubs (deterministic)', () => {
    const table = calculateStandings([], [5, 2, 9]);
    expect(table.map((e) => e.clubId)).toEqual([2, 5, 9]);
  });

  it('compareStandings is a pure comparator usable standalone', () => {
    const a = { clubId: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 0, goalDifference: 3, points: 3 };
    const b = { clubId: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 3, goalDifference: -3, points: 0 };
    expect(compareStandings(a, b, [])).toBeLessThan(0); // a ranks first
  });
});
