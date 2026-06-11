import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { League } from '@/types';

const leagues: League[] = [
  { id: 1, name: 'Premier League', countryId: 1, divisionLevel: 1, numTeams: 20, promotionSpots: 0, relegationSpots: 3 },
  { id: 2, name: 'La Liga', countryId: 2, divisionLevel: 1, numTeams: 20, promotionSpots: 0, relegationSpots: 3 },
];
const clubsByLeague: Record<number, number[]> = {
  1: Array.from({ length: 20 }, (_, i) => i + 1),
  2: Array.from({ length: 20 }, (_, i) => i + 21),
};
// CL clubs are drawn from clubs that ALSO play league fixtures.
const championsLeagueClubs = [1, 2, 3, 4, 21, 22, 23, 24];

describe('calendar — no same-week double fixture', () => {
  it('no club has two fixtures in the same (season, week)', () => {
    const cal = generateSeasonCalendar({ season: 1, leagues, clubsByLeague, championsLeagueClubs });
    const seen = new Map<string, string>();
    for (const f of cal.fixtures) {
      for (const clubId of [f.homeClubId, f.awayClubId]) {
        const key = `${clubId}:${f.week}`;
        if (seen.has(key)) {
          throw new Error(`Club ${clubId} double-booked in week ${f.week}: ${seen.get(key)} and comp ${f.competitionId}`);
        }
        seen.set(key, `comp ${f.competitionId}`);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('all cup round-1 and CL group fixtures sit at or after the knockout band start', () => {
    const cal = generateSeasonCalendar({ season: 1, leagues, clubsByLeague, championsLeagueClubs });
    const nonLeague = cal.fixtures.filter((f) => {
      const comp = cal.competitions.find((c) => c.id === f.competitionId)!;
      return comp.type !== 'league';
    });
    for (const f of nonLeague) {
      expect(f.week).toBeGreaterThanOrEqual(47);
    }
  });
});
