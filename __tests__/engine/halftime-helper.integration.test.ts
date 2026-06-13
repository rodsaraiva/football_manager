import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture, getFixturesByWeek } from '@/database/queries/fixtures';
import { startUserMatchHalftime, orientResultToFixture, halftimeSeed } from '@/engine/match-day/halftime';
import { MatchResult } from '@/engine/simulation/match-engine';

async function buildCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, 1, league.id);
    clubsByLeague[league.id] = clubs.map(c => c.id);
  }
  const calendar = generateSeasonCalendar({
    season: 1, leagues, clubsByLeague,
    championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, 1, {
      id: comp.id, name: comp.name, type: comp.type, format: comp.format,
      season: comp.season, leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) await addCompetitionEntry(db, 1, entry);
  for (const fixture of calendar.fixtures) {
    await createFixture(db, 1, {
      id: fixture.id, competitionId: fixture.competitionId, season: fixture.season,
      week: fixture.week, round: fixture.round as string | null,
      homeClubId: fixture.homeClubId, awayClubId: fixture.awayClubId,
    });
  }
}

describe('startUserMatchHalftime', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await buildCalendar(db);
  });

  afterEach(() => rawDb.close());

  it('returns a halftime context with the user oriented as the engine home side', async () => {
    const ctx = await startUserMatchHalftime({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
    expect(ctx).not.toBeNull();
    expect(ctx!.homeSquad.length).toBeGreaterThanOrEqual(7);
    expect(ctx!.homeBench.length).toBeGreaterThanOrEqual(0);
    expect(typeof ctx!.opponentName).toBe('string');
    expect(ctx!.homeTactic).toBeDefined();
    // First-half events only (minute <= 45)
    for (const ev of ctx!.halftime.events) {
      expect(ev.minute).toBeLessThanOrEqual(45);
    }
  });

  it('returns null when the user has no fixture this week', async () => {
    // Week 5 is pre-league (no league fixtures generated for club 1 yet)
    const ctx = await startUserMatchHalftime({ dbHandle: db, season: 1, week: 5, playerClubId: 1, saveId: 1 });
    expect(ctx).toBeNull();
  });

  it('uses an isolated seed independent of the weekly rng', () => {
    expect(halftimeSeed(1, 7, 123)).toBe(1 * 100000 + 7 * 100 + 123);
    expect(halftimeSeed(2, 7, 123)).not.toBe(halftimeSeed(1, 7, 123));
  });
});

describe('orientResultToFixture', () => {
  const result: MatchResult = {
    homeGoals: 3, awayGoals: 1,
    events: [], homeRatings: [{ playerId: 1, rating: 8 }], awayRatings: [{ playerId: 2, rating: 6 }],
    stats: {
      homePossession: 60, awayPossession: 40, homeShots: 10, awayShots: 5,
      homeShotsOnTarget: 6, awayShotsOnTarget: 2, homeFouls: 8, awayFouls: 12,
      homeCorners: 7, awayCorners: 3, homeXG: 2.1, awayXG: 0.8,
    },
    attendance: 30000,
  };

  it('returns the result unchanged when the user is home', () => {
    expect(orientResultToFixture(result, true)).toEqual(result);
  });

  it('swaps home/away (goals, stats, ratings) when the user is away', () => {
    const swapped = orientResultToFixture(result, false);
    expect(swapped.homeGoals).toBe(1);
    expect(swapped.awayGoals).toBe(3);
    expect(swapped.stats.homePossession).toBe(40);
    expect(swapped.stats.awayPossession).toBe(60);
    expect(swapped.stats.homeShots).toBe(5);
    expect(swapped.stats.awayShots).toBe(10);
    expect(swapped.homeRatings).toEqual(result.awayRatings);
    expect(swapped.awayRatings).toEqual(result.homeRatings);
    expect(swapped.attendance).toBe(30000);
  });
});
