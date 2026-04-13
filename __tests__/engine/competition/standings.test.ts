import { calculateStandings, StandingsEntry } from '@/engine/competition/standings';
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
