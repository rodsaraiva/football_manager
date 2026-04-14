import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import { archiveSeason } from '../../../src/engine/history/season-archiver';

function seedLeagueCompetition(rawDb: Database.Database): void {
  rawDb.prepare(
    `INSERT INTO competitions (id, name, type, format, season, league_id)
     VALUES (1, 'Test League', 'league', 'round_robin', 1, 1)`,
  ).run();
}

function seedRoundRobinFixtures(rawDb: Database.Database, competitionId: number, season: number): void {
  const clubs = rawDb.prepare('SELECT id FROM clubs WHERE league_id = 1').all() as Array<{ id: number }>;
  let fid = 1;
  for (let i = 0; i < clubs.length; i++) {
    for (let j = 0; j < clubs.length; j++) {
      if (i === j) continue;
      rawDb.prepare(
        `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, played)
         VALUES (?, ?, ?, ?, NULL, ?, ?, 0)`,
      ).run(fid++, competitionId, season, 1, clubs[i].id, clubs[j].id);
    }
  }
}

function finishAllFixturesForCompetition(
  rawDb: Database.Database,
  competitionId: number,
  season: number,
  scoreFn: (homeId: number, awayId: number) => [number, number],
): void {
  const rows = rawDb
    .prepare('SELECT id, home_club_id, away_club_id FROM fixtures WHERE competition_id = ? AND season = ?')
    .all(competitionId, season) as Array<{ id: number; home_club_id: number; away_club_id: number }>;
  for (const r of rows) {
    const [h, a] = scoreFn(r.home_club_id, r.away_club_id);
    rawDb.prepare('UPDATE fixtures SET home_goals = ?, away_goals = ?, played = 1 WHERE id = ?').run(h, a, r.id);
  }
}

describe('archiveSeason — league titles', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    seedLeagueCompetition(rawDb);
    seedRoundRobinFixtures(rawDb, 1, 1);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('writes champion for the top league by points', async () => {
    finishAllFixturesForCompetition(rawDb, 1, 1, (home, away) => {
      if (home === 1) return [3, 0];
      if (away === 1) return [0, 3];
      return [1, 1];
    });

    await archiveSeason(db, 1);

    const result = rawDb
      .prepare('SELECT * FROM season_competition_results WHERE season = ? AND competition_id = ?')
      .get(1, 1) as { champion_club_id: number; runner_up_club_id: number | null } | undefined;
    expect(result).toBeDefined();
    expect(result!.champion_club_id).toBe(1);
  });

  it('writes relegated clubs for the league', async () => {
    finishAllFixturesForCompetition(rawDb, 1, 1, (home, away) => {
      if (home === 2) return [0, 3];
      if (away === 2) return [3, 0];
      return [1, 1];
    });

    await archiveSeason(db, 1);

    const relegated = rawDb
      .prepare('SELECT * FROM season_relegated WHERE season = ? AND league_id = ?')
      .all(1, 1) as Array<{ club_id: number; final_position: number }>;
    expect(relegated.length).toBeGreaterThan(0);
    expect(relegated.some((r) => r.club_id === 2)).toBe(true);
  });

  it('is idempotent — running twice does not duplicate rows', async () => {
    finishAllFixturesForCompetition(rawDb, 1, 1, () => [1, 1]);
    await archiveSeason(db, 1);
    await archiveSeason(db, 1);
    const count = (rawDb
      .prepare('SELECT COUNT(*) AS c FROM season_competition_results WHERE season = 1 AND competition_id = 1')
      .get() as { c: number }).c;
    expect(count).toBe(1);
  });
});

describe('archiveSeason — cup & continental', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('writes champion and runner-up from the cup final (highest round)', async () => {
    // Seed a cup competition
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (100, 'Test Cup', 'cup', 'knockout', 1, NULL)`,
    ).run();

    // Seed two cup fixtures in different rounds
    rawDb.prepare(
      `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, home_goals, away_goals, played)
       VALUES (9001, 100, 1, 30, '1', 1, 3, 2, 1, 1)`,
    ).run(); // earlier round
    rawDb.prepare(
      `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, home_goals, away_goals, played)
       VALUES (9002, 100, 1, 40, '2', 1, 2, 3, 1, 1)`,
    ).run(); // final — highest round value, club 1 wins

    await archiveSeason(db, 1);

    const result = rawDb
      .prepare('SELECT * FROM season_competition_results WHERE season = 1 AND competition_id = 100')
      .get() as { champion_club_id: number; runner_up_club_id: number | null } | undefined;
    expect(result).toBeDefined();
    expect(result!.champion_club_id).toBe(1);
    expect(result!.runner_up_club_id).toBe(2);
  });

  it('handles a continental competition with no clear runner-up (tie-final fallback)', async () => {
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (200, 'Test Continental', 'continental', 'knockout', 1, NULL)`,
    ).run();
    // Only one fixture, and it's a draw — fallback: home as champion
    rawDb.prepare(
      `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, home_goals, away_goals, played)
       VALUES (9100, 200, 1, 45, '1', 5, 6, 1, 1, 1)`,
    ).run();

    await archiveSeason(db, 1);

    const result = rawDb
      .prepare('SELECT * FROM season_competition_results WHERE season = 1 AND competition_id = 200')
      .get() as { champion_club_id: number; runner_up_club_id: number | null } | undefined;
    expect(result).toBeDefined();
    expect(result!.champion_club_id).toBe(5);
    expect(result!.runner_up_club_id).toBe(6);
  });
});

describe('archiveSeason — top scorers / assisters', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    // Seed a league competition and round-robin fixtures so archiver sees it.
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (1, 'Test League', 'league', 'round_robin', 1, 1)`,
    ).run();
    const clubs = rawDb.prepare('SELECT id FROM clubs WHERE league_id = 1').all() as Array<{ id: number }>;
    let fid = 1;
    for (let i = 0; i < clubs.length; i++) {
      for (let j = 0; j < clubs.length; j++) {
        if (i === j) continue;
        rawDb.prepare(
          `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, home_goals, away_goals, played)
           VALUES (?, 1, 1, 1, NULL, ?, ?, 1, 0, 1)`,
        ).run(fid++, clubs[i].id, clubs[j].id);
      }
    }
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('writes top 5 scorers and top 5 assisters from match_events', async () => {
    // Use any fixture id=1 to attach events to.
    const players = rawDb.prepare('SELECT id, club_id FROM players LIMIT 10').all() as Array<{ id: number; club_id: number }>;
    // Player[0] scores 5 goals, each with Player[1] as assister.
    for (let i = 0; i < 5; i++) {
      rawDb.prepare(
        `INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id)
         VALUES (1, ?, 'goal', ?, ?)`,
      ).run(10 + i, players[0].id, players[1].id);
    }
    // Player[2] scores 1 goal, no assist.
    rawDb.prepare(
      `INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id)
       VALUES (1, 80, 'goal', ?, NULL)`,
    ).run(players[2].id);

    await archiveSeason(db, 1);

    const scorers = rawDb.prepare(
      `SELECT rank, player_id, value FROM season_awards
       WHERE season = 1 AND competition_id = 1 AND award_type = 'top_scorer'
       ORDER BY rank ASC`,
    ).all() as Array<{ rank: number; player_id: number; value: number }>;
    expect(scorers.length).toBeGreaterThanOrEqual(2);
    expect(scorers[0].rank).toBe(1);
    expect(scorers[0].player_id).toBe(players[0].id);
    expect(scorers[0].value).toBe(5);

    const assisters = rawDb.prepare(
      `SELECT rank, player_id, value FROM season_awards
       WHERE season = 1 AND competition_id = 1 AND award_type = 'top_assister'
       ORDER BY rank ASC`,
    ).all() as Array<{ rank: number; player_id: number; value: number }>;
    expect(assisters.length).toBeGreaterThanOrEqual(1);
    expect(assisters[0].rank).toBe(1);
    expect(assisters[0].player_id).toBe(players[1].id);
    expect(assisters[0].value).toBe(5);
  });

  it('limits to top 5 even when more candidates exist', async () => {
    const players = rawDb.prepare('SELECT id FROM players LIMIT 10').all() as Array<{ id: number }>;
    // 7 different scorers, each with 1 goal. Only top 5 by deterministic tiebreak (lowest player_id) should land.
    for (let i = 0; i < 7; i++) {
      rawDb.prepare(
        `INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id)
         VALUES (1, ?, 'goal', ?, NULL)`,
      ).run(10 + i, players[i].id);
    }
    await archiveSeason(db, 1);
    const scorers = rawDb.prepare(
      `SELECT rank FROM season_awards WHERE season = 1 AND competition_id = 1 AND award_type = 'top_scorer'`,
    ).all() as Array<{ rank: number }>;
    expect(scorers.length).toBe(5);
  });
});

describe('archiveSeason — MVP & breakthrough', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (1, 'Test League', 'league', 'round_robin', 1, 1)`,
    ).run();
    const clubs = rawDb.prepare('SELECT id FROM clubs WHERE league_id = 1').all() as Array<{ id: number }>;
    let fid = 1;
    for (let i = 0; i < clubs.length; i++) {
      for (let j = 0; j < clubs.length; j++) {
        if (i === j) continue;
        rawDb.prepare(
          `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, home_goals, away_goals, played)
           VALUES (?, 1, 1, 1, NULL, ?, ?, 1, 0, 1)`,
        ).run(fid++, clubs[i].id, clubs[j].id);
      }
    }
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('writes MVP as highest avg_rating meeting the minimum games threshold', async () => {
    const numClubs = (rawDb.prepare('SELECT COUNT(*) AS c FROM clubs WHERE league_id = 1').get() as { c: number }).c;
    const maxPossible = (numClubs - 1) * 2;
    const threshold = Math.ceil(maxPossible / 2);

    // Player 10 clears the threshold with rating 8.2; Player 11 has higher rating 9.5 but only 1 appearance.
    rawDb.prepare(
      `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played)
       VALUES (10, 1, 1, ?, 0, 0, 0, 0, 8.2, ?)`,
    ).run(threshold, threshold * 90);
    rawDb.prepare(
      `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played)
       VALUES (11, 1, 1, 1, 0, 0, 0, 0, 9.5, 90)`,
    ).run();

    await archiveSeason(db, 1);

    const mvp = rawDb.prepare(
      `SELECT player_id, club_id, value FROM season_awards
       WHERE season = 1 AND competition_id = 1 AND award_type = 'mvp'`,
    ).get() as { player_id: number; club_id: number; value: number } | undefined;
    expect(mvp).toBeDefined();
    expect(mvp!.player_id).toBe(10);
    expect(mvp!.value).toBeCloseTo(8.2);
  });

  it('writes breakthrough only for players aged <= 21', async () => {
    const numClubs = (rawDb.prepare('SELECT COUNT(*) AS c FROM clubs WHERE league_id = 1').get() as { c: number }).c;
    const threshold = Math.ceil(((numClubs - 1) * 2) / 2);

    rawDb.prepare('UPDATE players SET age = 20 WHERE id = 10').run();
    rawDb.prepare('UPDATE players SET age = 28 WHERE id = 11').run();
    rawDb.prepare(
      `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played)
       VALUES (10, 1, 1, ?, 0, 0, 0, 0, 8.0, ?)`,
    ).run(threshold, threshold * 90);
    rawDb.prepare(
      `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played)
       VALUES (11, 1, 1, ?, 0, 0, 0, 0, 9.0, ?)`,
    ).run(threshold, threshold * 90);

    await archiveSeason(db, 1);

    const breakthrough = rawDb.prepare(
      `SELECT player_id FROM season_awards
       WHERE season = 1 AND competition_id = 1 AND award_type = 'breakthrough'`,
    ).get() as { player_id: number } | undefined;
    expect(breakthrough).toBeDefined();
    expect(breakthrough!.player_id).toBe(10);
  });

  it('does not write MVP if nobody meets the minimum games threshold', async () => {
    // player_stats left empty for competition 1 — nobody eligible.
    await archiveSeason(db, 1);
    const mvp = rawDb.prepare(
      `SELECT * FROM season_awards WHERE season = 1 AND competition_id = 1 AND award_type = 'mvp'`,
    ).get();
    expect(mvp).toBeUndefined();
  });
});
