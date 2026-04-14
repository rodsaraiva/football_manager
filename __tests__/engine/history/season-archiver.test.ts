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
