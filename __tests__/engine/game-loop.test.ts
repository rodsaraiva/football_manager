import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import { getPlayerStatsByCompetition } from '@/database/queries/player-stats';

describe('advanceGameWeek', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    // Generate season calendar and persist fixtures
    const leagues = await getAllLeagues(db);
    const clubsByLeague: Record<number, number[]> = {};
    for (const league of leagues) {
      const clubs = await getClubsByLeague(db, league.id);
      clubsByLeague[league.id] = clubs.map(c => c.id);
    }
    const calendar = generateSeasonCalendar({
      season: 1,
      leagues,
      clubsByLeague,
      championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
    });
    for (const comp of calendar.competitions) {
      await createCompetition(db, {
        id: comp.id,
        name: comp.name,
        type: comp.type,
        format: comp.format,
        season: comp.season,
        leagueId: comp.leagueId,
      });
    }
    for (const entry of calendar.entries) {
      await addCompetitionEntry(db, entry);
    }
    for (const fixture of calendar.fixtures) {
      await createFixture(db, {
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

  afterEach(() => rawDb.close());

  it('advances the week and returns results', async () => {
    const result = await advanceGameWeek({
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

  it('simulates player match with real engine and returns events', async () => {
    const result = await advanceGameWeek({
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

  it('persists fixture results to DB', async () => {
    await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });
    // Check that fixtures for week 7 are now played
    const fixtures = rawDb.prepare('SELECT * FROM fixtures WHERE season = 1 AND week = 7 AND played = 1').all();
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('is deterministic', async () => {
    // Snapshot player state before r1 so we can restore it for r2
    const playerSnapshot = rawDb.prepare('SELECT * FROM players').all() as Array<Record<string, unknown>>;
    const attrSnapshot = rawDb.prepare('SELECT * FROM player_attributes').all() as Array<Record<string, unknown>>;

    const r1 = await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(42) });

    // Full reset: fixtures, events, stats, and player attributes/fitness modified by r1
    rawDb.prepare('UPDATE fixtures SET played = 0, home_goals = NULL, away_goals = NULL WHERE season = 1 AND week = 7').run();
    rawDb.prepare('DELETE FROM match_events').run();
    rawDb.prepare('DELETE FROM player_stats').run();
    for (const p of playerSnapshot) {
      rawDb.prepare('UPDATE players SET fitness = ?, injury_weeks_left = ?, morale = ? WHERE id = ?')
        .run(p.fitness, p.injury_weeks_left, p.morale, p.id);
    }
    for (const a of attrSnapshot) {
      rawDb.prepare(
        `UPDATE player_attributes SET finishing=?, passing=?, crossing=?, dribbling=?, heading=?,
         long_shots=?, free_kicks=?, vision=?, composure=?, decisions=?,
         positioning=?, aggression=?, leadership=?, pace=?, stamina=?,
         strength=?, agility=?, jumping=? WHERE player_id=?`,
      ).run(
        a.finishing, a.passing, a.crossing, a.dribbling, a.heading,
        a.long_shots, a.free_kicks, a.vision, a.composure, a.decisions,
        a.positioning, a.aggression, a.leadership, a.pace, a.stamina,
        a.strength, a.agility, a.jumping, a.player_id,
      );
    }

    const r2 = await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(42) });

    if (r1.playerMatchResult && r2.playerMatchResult) {
      expect(r1.playerMatchResult.homeGoals).toBe(r2.playerMatchResult.homeGoals);
      expect(r1.playerMatchResult.awayGoals).toBe(r2.playerMatchResult.awayGoals);
    }
  });

  it('wraps season at week 46', async () => {
    const result = await advanceGameWeek({
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

  it('archives the season automatically when advancing past week 46', async () => {
    // The beforeEach has already seeded a full calendar for season 1.
    // League fixtures run from week 7 to week 44 (20-team double round-robin).
    // Pre-mark one league fixture from week 7 as played so the archiver has
    // standings data to record when advanceGameWeek triggers it at week 46.
    rawDb
      .prepare(
        `UPDATE fixtures SET home_goals = 3, away_goals = 0, played = 1
         WHERE season = 1 AND week = 7
         LIMIT 1`,
      )
      .run();

    await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 46,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });

    const archived = rawDb
      .prepare(
        'SELECT COUNT(*) AS c FROM season_competition_results WHERE season = 1',
      )
      .get() as { c: number };
    expect(archived.c).toBeGreaterThan(0);
  });

  it('persists player_stats rows for the real-engine match', async () => {
    const result = await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });

    // The player's fixture must have been simulated with the real engine
    expect(result.playerMatchResult).not.toBeNull();

    // Determine which competition the player's fixture belongs to
    const fixtureRow = rawDb
      .prepare('SELECT competition_id FROM fixtures WHERE season = 1 AND week = 7 AND (home_club_id = 1 OR away_club_id = 1)')
      .get() as { competition_id: number } | undefined;
    expect(fixtureRow).toBeDefined();

    const competitionId = fixtureRow!.competition_id;
    const stats = await getPlayerStatsByCompetition(db, 1, competitionId);

    // Both teams have 11 players rated → at least 22 rows with appearances > 0
    const withAppearances = stats.filter(s => s.appearances > 0);
    expect(withAppearances.length).toBeGreaterThanOrEqual(22);
  });
});
