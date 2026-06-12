import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import { archiveSeason } from '../../../src/engine/history/season-archiver';

function seedLeagueCompetition(rawDb: Database.Database): void {
  rawDb.prepare(
    `INSERT INTO competitions (id, save_id, name, type, format, season, league_id)
     VALUES (1, 1, 'Test League', 'league', 'round_robin', 1, 1)`,
  ).run();
}

function seedRoundRobinFixtures(rawDb: Database.Database, competitionId: number, season: number): void {
  const clubs = rawDb.prepare('SELECT id FROM clubs WHERE league_id = 1').all() as Array<{ id: number }>;
  let fid = 1;
  for (let i = 0; i < clubs.length; i++) {
    for (let j = 0; j < clubs.length; j++) {
      if (i === j) continue;
      rawDb.prepare(
        `INSERT INTO fixtures (id, save_id, competition_id, season, week, round, home_club_id, away_club_id, played)
         VALUES (?, 1, ?, ?, ?, NULL, ?, ?, 0)`,
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

describe('archiveSeason prize awards', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    seedLeagueCompetition(rawDb);
    seedRoundRobinFixtures(rawDb, 1, 1);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('returns league prizes ranked by final position (champion > relegated)', async () => {
    // Club 1 wins every game it plays → finishes first; others draw among themselves.
    finishAllFixturesForCompetition(rawDb, 1, 1, (home, away) => {
      if (home === 1) return [3, 0];
      if (away === 1) return [0, 3];
      return [1, 1];
    });

    const awards = await archiveSeason(db, 1, 1);

    expect(Array.isArray(awards)).toBe(true);
    expect(awards.length).toBeGreaterThan(0);

    const champ = awards.find((a) => a.clubId === 1);
    expect(champ).toBeDefined();
    expect(champ!.amount).toBeGreaterThan(0);
    expect(champ!.description).toMatch(/prize/i);

    const sorted = [...awards].sort((a, b) => b.amount - a.amount);
    // The champion earns the most; the lowest-placed club earns less.
    expect(champ!.amount).toBe(sorted[0].amount);
    expect(sorted[0].amount).toBeGreaterThan(sorted[sorted.length - 1].amount);
  });
});
