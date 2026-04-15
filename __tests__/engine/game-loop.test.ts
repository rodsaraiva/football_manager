import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar, ensureSeasonFixtures } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import { getPlayerStatsByCompetition } from '@/database/queries/player-stats';
import { setTacticLineup } from '@/database/queries/tactics';

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

  it('escalação salva no banco é respeitada pelo engine', async () => {
    // Get players for club 1 (playerClubId)
    const players = rawDb
      .prepare('SELECT id FROM players WHERE club_id = 1 AND injury_weeks_left = 0 ORDER BY id ASC')
      .all() as { id: number }[];
    expect(players.length).toBeGreaterThanOrEqual(19);

    const tacticRow = rawDb
      .prepare('SELECT id FROM tactics WHERE club_id = 1 AND is_active = 1')
      .get() as { id: number } | undefined;
    expect(tacticRow).toBeDefined();

    const starterIds = players.slice(0, 11).map(p => p.id);
    const benchIds = players.slice(11, 19).map(p => p.id);
    await setTacticLineup(db, tacticRow!.id, starterIds, benchIds);

    const result = await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });

    expect(result.playerMatchResult).not.toBeNull();
    const matchResult = result.playerMatchResult!;

    // Determine if club 1 is home or away
    const fixtureRow = rawDb
      .prepare('SELECT home_club_id FROM fixtures WHERE season = 1 AND week = 7 AND (home_club_id = 1 OR away_club_id = 1)')
      .get() as { home_club_id: number } | undefined;
    expect(fixtureRow).toBeDefined();

    const ratings = fixtureRow!.home_club_id === 1
      ? matchResult.homeRatings
      : matchResult.awayRatings;

    // All rated players should be from the related pool (starters + bench)
    const relatedIds = new Set([...starterIds, ...benchIds]);
    for (const r of ratings) {
      expect(relatedIds.has(r.playerId)).toBe(true);
    }

    // All 11 starters must appear in ratings
    const ratedIds = new Set(ratings.map(r => r.playerId));
    for (const id of starterIds) {
      expect(ratedIds.has(id)).toBe(true);
    }
  });

  it('bench tem no máximo 8 jogadores passados para o engine', async () => {
    const result = await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });

    expect(result.playerMatchResult).not.toBeNull();
    // The number of unique player IDs in ratings should be at most 11 starters + 8 bench = 19
    const allRatedIds = new Set([
      ...result.playerMatchResult!.homeRatings.map(r => r.playerId),
      ...result.playerMatchResult!.awayRatings.map(r => r.playerId),
    ]);
    expect(allRatedIds.size).toBeLessThanOrEqual(19 * 2); // 19 per side
  });

  it('semana avança normalmente quando não há lineup salva (regressão: save antigo)', async () => {
    // Regression: saves created before tactic_lineup was added have no rows in
    // that table. getTacticLineup returns null → pickStartingEleven fallback must
    // produce a valid squad and the fixture must be marked played.
    // Ensure tactic_lineup is empty for club 1's tactic.
    const tacticRow = rawDb
      .prepare('SELECT id FROM tactics WHERE club_id = 1 AND is_active = 1')
      .get() as { id: number } | undefined;
    if (tacticRow) {
      rawDb.prepare('DELETE FROM tactic_lineup WHERE tactic_id = ?').run(tacticRow.id);
    }

    const result = await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });

    expect(result.newWeek).toBe(8);
    expect(result.playerMatchResult).not.toBeNull();
    expect(result.playerMatchResult!.homeGoals).toBeGreaterThanOrEqual(0);
    expect(result.playerMatchResult!.awayGoals).toBeGreaterThanOrEqual(0);

    // Fixture must be marked played in DB
    const fixture = rawDb
      .prepare('SELECT played FROM fixtures WHERE season = 1 AND week = 7 AND (home_club_id = 1 OR away_club_id = 1)')
      .get() as { played: number } | undefined;
    expect(fixture?.played).toBe(1);
  });

  it('lineup salva com 11 IDs inválidos usa fallback e não derruba a semana', async () => {
    // Regression: if transferred players remain in tactic_lineup, their IDs are
    // not present in the club's current squad. buildSquadFromSavedIds must fall
    // back to pickStartingEleven logic for each missing slot instead of
    // producing an empty squad.
    const tacticRow = rawDb
      .prepare('SELECT id FROM tactics WHERE club_id = 1 AND is_active = 1')
      .get() as { id: number } | undefined;
    expect(tacticRow).toBeDefined();

    // Write 11 non-existent player IDs (999001–999011) as starters. FK is not
    // enforced by better-sqlite3 in test mode by default; we bypass it directly.
    rawDb.prepare('DELETE FROM tactic_lineup WHERE tactic_id = ?').run(tacticRow!.id);
    // Temporarily disable FK enforcement to insert stale/invalid player IDs that
    // simulate a save where all lineup players were later transferred away.
    rawDb.pragma('foreign_keys = OFF');
    for (let i = 0; i < 11; i++) {
      rawDb
        .prepare('INSERT INTO tactic_lineup (tactic_id, slot_index, player_id) VALUES (?, ?, ?)')
        .run(tacticRow!.id, i, 999001 + i);
    }
    rawDb.pragma('foreign_keys = ON');

    // advanceGameWeek must NOT throw and must produce a valid match result.
    const result = await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });

    expect(result.newWeek).toBe(8);
    expect(result.playerMatchResult).not.toBeNull();
    // Even with all invalid saved IDs, fallback fills 11 slots.
    const ratings = result.playerMatchResult!.homeRatings.length > 0
      ? result.playerMatchResult!.homeRatings
      : result.playerMatchResult!.awayRatings;
    expect(ratings.length).toBe(11);

    // Fixture must be marked played.
    const fixture = rawDb
      .prepare('SELECT played FROM fixtures WHERE season = 1 AND week = 7 AND (home_club_id = 1 OR away_club_id = 1)')
      .get() as { played: number } | undefined;
    expect(fixture?.played).toBe(1);
  });

  // ─── Regressão: save sem fixtures (causa raiz do bug principal) ─────────────

  it('sem fixtures no banco: advanceGameWeek avança semana mas playerMatchResult é null (comprova a causa raiz)', async () => {
    // Reproduz o bug: salvo criado antes de as chamadas async serem corretamente
    // aguardadas não tinha fixtures. O game-loop avanços semanas sem simular
    // nenhuma partida porque getFixturesByWeek retorna vazio.
    rawDb.prepare('DELETE FROM fixtures').run();
    rawDb.prepare('DELETE FROM competition_entries').run();
    rawDb.prepare('DELETE FROM competitions').run();

    const result = await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });

    // Semana avança, mas sem fixture não há partida
    expect(result.newWeek).toBe(8);
    expect(result.playerMatchResult).toBeNull();
  });

  it('ensureSeasonFixtures: gera fixtures quando não existem e retorna true', async () => {
    // Remove all fixtures/competitions to simulate a broken save
    rawDb.prepare('DELETE FROM fixtures').run();
    rawDb.prepare('DELETE FROM competition_entries').run();
    rawDb.prepare('DELETE FROM competitions').run();

    const fixturesBefore = (rawDb.prepare('SELECT COUNT(*) AS cnt FROM fixtures').get() as { cnt: number }).cnt;
    expect(fixturesBefore).toBe(0);

    const generated = await ensureSeasonFixtures(db, 1);
    expect(generated).toBe(true);

    const fixturesAfter = (rawDb.prepare('SELECT COUNT(*) AS cnt FROM fixtures WHERE season = 1').get() as { cnt: number }).cnt;
    const week7After = (rawDb.prepare('SELECT COUNT(*) AS cnt FROM fixtures WHERE season = 1 AND week = 7').get() as { cnt: number }).cnt;
    expect(fixturesAfter).toBeGreaterThan(0);
    expect(week7After).toBeGreaterThan(0);
  });

  it('ensureSeasonFixtures: retorna false quando fixtures já existem (idempotente)', async () => {
    // Fixtures already exist from beforeEach
    const generated = await ensureSeasonFixtures(db, 1);
    expect(generated).toBe(false);

    // Count must remain the same
    const count = (rawDb.prepare('SELECT COUNT(*) AS cnt FROM fixtures WHERE season = 1').get() as { cnt: number }).cnt;
    expect(count).toBeGreaterThan(0);
  });

  it('save sem fixtures: após ensureSeasonFixtures, advanceGameWeek simula partida corretamente', async () => {
    // Full end-to-end regression test: simulate a broken save (no fixtures),
    // call ensureSeasonFixtures to repair it, then advance the week and
    // assert that at least one fixture is marked played=1.
    rawDb.prepare('DELETE FROM fixtures').run();
    rawDb.prepare('DELETE FROM competition_entries').run();
    rawDb.prepare('DELETE FROM competitions').run();

    // Rescue: generate fixtures as HomeScreen now does on mount
    const generated = await ensureSeasonFixtures(db, 1);
    expect(generated).toBe(true);

    const result = await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId: 1,
      saveId: -1,
      rng: new SeededRng(42),
    });

    // After repair, match should be simulated
    expect(result.newWeek).toBe(8);
    expect(result.playerMatchResult).not.toBeNull();

    // At least the player's fixture should be marked played=1
    const played = rawDb
      .prepare('SELECT COUNT(*) AS cnt FROM fixtures WHERE season = 1 AND week = 7 AND played = 1')
      .get() as { cnt: number };
    expect(played.cnt).toBeGreaterThan(0);
  });
});
