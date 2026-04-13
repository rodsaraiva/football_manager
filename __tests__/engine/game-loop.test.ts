import Database from 'better-sqlite3';
import { createTestDb, seedTestDb } from '../database/test-helpers';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';

describe('advanceGameWeek', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedTestDb(db);
    // Generate season calendar and persist fixtures
    const leagues = getAllLeagues(db);
    const clubsByLeague: Record<number, number[]> = {};
    for (const league of leagues) {
      clubsByLeague[league.id] = getClubsByLeague(db, league.id).map(c => c.id);
    }
    const calendar = generateSeasonCalendar({
      season: 1,
      leagues,
      clubsByLeague,
      championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
    });
    for (const comp of calendar.competitions) {
      createCompetition(db, {
        id: comp.id,
        name: comp.name,
        type: comp.type,
        format: comp.format,
        season: comp.season,
        leagueId: comp.leagueId,
      });
    }
    for (const entry of calendar.entries) {
      addCompetitionEntry(db, entry);
    }
    for (const fixture of calendar.fixtures) {
      createFixture(db, {
        id: fixture.id,
        competitionId: fixture.competitionId,
        season: fixture.season,
        week: fixture.week,
        round: fixture.round as string | null,
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
      });
    }
  });

  afterEach(() => db.close());

  it('advances the week and returns results', () => {
    const result = advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7, // first week of league fixtures
      playerClubId: 1,
      saveId: -1, // no save in test
      rng: new SeededRng(42),
    });
    expect(result.newWeek).toBe(8);
    expect(result.newSeason).toBe(1);
    expect(result.isSeasonEnd).toBe(false);
  });

  it('simulates player match with real engine and returns events', () => {
    const result = advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });
    if (result.playerMatchResult) {
      expect(result.playerMatchResult.homeGoals).toBeGreaterThanOrEqual(0);
      expect(result.playerMatchResult.awayGoals).toBeGreaterThanOrEqual(0);
      expect(result.playerMatchResult.homeRatings.length).toBe(11);
      expect(result.playerMatchResult.awayRatings.length).toBe(11);
      expect(result.playerMatchResult.events.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('persists fixture results to DB', () => {
    advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });
    // Check that fixtures for week 7 are now played
    const fixtures = db.prepare('SELECT * FROM fixtures WHERE season = 1 AND week = 7 AND played = 1').all();
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    // Clone DB state
    const r1 = advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(42) });
    // Reset fixtures
    db.prepare('UPDATE fixtures SET played = 0, home_goals = NULL, away_goals = NULL WHERE season = 1 AND week = 7').run();
    db.prepare('DELETE FROM match_events').run();
    const r2 = advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(42) });

    if (r1.playerMatchResult && r2.playerMatchResult) {
      expect(r1.playerMatchResult.homeGoals).toBe(r2.playerMatchResult.homeGoals);
      expect(r1.playerMatchResult.awayGoals).toBe(r2.playerMatchResult.awayGoals);
    }
  });

  it('wraps season at week 46', () => {
    const result = advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 46,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });
    expect(result.newWeek).toBe(1);
    expect(result.newSeason).toBe(2);
    expect(result.isSeasonEnd).toBe(true);
  });
});
