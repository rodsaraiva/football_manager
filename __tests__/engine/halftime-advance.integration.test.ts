import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture, getFixturesByWeek } from '@/database/queries/fixtures';
import { MatchResult } from '@/engine/simulation/match-engine';

// Mirror of the game-loop integration setup: build + persist the season-1 calendar.
async function buildCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, 1, league.id);
    clubsByLeague[league.id] = clubs.map(c => c.id);
  }
  const calendar = generateSeasonCalendar({
    season: 1,
    leagues,
    clubsByLeague,
    championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, 1, {
      id: comp.id, name: comp.name, type: comp.type, format: comp.format,
      season: comp.season, leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) {
    await addCompetitionEntry(db, 1, entry);
  }
  for (const fixture of calendar.fixtures) {
    await createFixture(db, 1, {
      id: fixture.id, competitionId: fixture.competitionId, season: fixture.season,
      week: fixture.week, round: fixture.round as string | null,
      homeClubId: fixture.homeClubId, awayClubId: fixture.awayClubId,
    });
  }
}

function fakeResult(homeGoals: number, awayGoals: number): MatchResult {
  return {
    homeGoals, awayGoals, events: [], homeRatings: [], awayRatings: [],
    stats: {
      homePossession: 55, awayPossession: 45, homeShots: 9, awayShots: 4,
      homeShotsOnTarget: 5, awayShotsOnTarget: 2, homeFouls: 8, awayFouls: 10,
      homeCorners: 6, awayCorners: 2, homeXG: 1.8, awayXG: 0.7,
    },
    attendance: 42000,
  };
}

describe('advanceGameWeek with userMatchResultOverride (two-phase halftime)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await buildCalendar(db);
  });

  afterEach(() => rawDb.close());

  it('persists the override scoreline for the user fixture and still advances the week', async () => {
    const fixtures = await getFixturesByWeek(db, 1, 1, 7);
    const userFixture = fixtures.find(f => f.homeClubId === 1 || f.awayClubId === 1)!;
    expect(userFixture).toBeDefined();

    // Pick a scoreline the engine would essentially never produce so we know it
    // came from the override (7 home / 0 away).
    const override = fakeResult(7, 0);

    const result = await advanceGameWeek({
      dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1,
      rng: new SeededRng(42),
      userMatchResultOverride: override,
    });

    expect(result.newWeek).toBe(8);
    expect(result.playerMatchResult?.homeGoals).toBe(7);
    expect(result.playerMatchResult?.awayGoals).toBe(0);

    const persisted = rawDb.prepare(
      'SELECT home_goals, away_goals, attendance, played FROM fixtures WHERE id = ?',
    ).get(userFixture.id) as { home_goals: number; away_goals: number; attendance: number; played: number };
    expect(persisted.home_goals).toBe(7);
    expect(persisted.away_goals).toBe(0);
    expect(persisted.attendance).toBe(42000);
    expect(persisted.played).toBe(1);
  });

  it('without an override behaves as before — week advances and a result is produced', async () => {
    const result = await advanceGameWeek({
      dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1,
      rng: new SeededRng(42),
    });
    expect(result.newWeek).toBe(8);
    expect(result.newSeason).toBe(1);
    expect(result.playerMatchResult).not.toBeNull();
    expect(result.playerMatchResult!.homeRatings.length).toBe(11);
  });

  it('AI fixtures are still simulated and persisted when an override is present', async () => {
    const override = fakeResult(3, 1);
    await advanceGameWeek({
      dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1,
      rng: new SeededRng(42),
      userMatchResultOverride: override,
    });
    // Every week-7 fixture should be marked played, including AI-only matches.
    const playedCount = rawDb.prepare(
      'SELECT COUNT(*) AS c FROM fixtures WHERE season = 1 AND week = 7 AND played = 1',
    ).get() as { c: number };
    expect(playedCount.c).toBeGreaterThan(1);
  });
});
