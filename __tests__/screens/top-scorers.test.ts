import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { buildTopScorers } from '@/screens/league/top-scorers';

const S = TEST_SAVE_ID;

function insertStats(raw: Database.Database, playerId: number, goals: number, assists: number) {
  raw.prepare(
    `INSERT INTO player_stats (player_id, save_id, season, competition_id, appearances, goals, assists,
      yellow_cards, red_cards, avg_rating, minutes_played)
     VALUES (?, ?, 1, 100, 10, ?, ?, 0, 0, 7.0, 900)`,
  ).run(playerId, S, goals, assists);
}

describe('buildTopScorers', () => {
  let raw: Database.Database;
  let db: DbHandle;
  let p1: number;
  let p2: number;
  let p3: number;

  beforeEach(() => {
    raw = createTestDb();
    seedTestDb(raw);
    db = createTestDbHandle(raw);
    raw.prepare(
      `INSERT INTO competitions (id, save_id, name, type, format, season, league_id)
       VALUES (100, ?, 'Test Cup', 'cup', 'knockout', 1, NULL)`,
    ).run(S);
    const players = raw.prepare('SELECT id FROM players WHERE club_id IS NOT NULL ORDER BY id LIMIT 3').all() as { id: number }[];
    [p1, p2, p3] = players.map((p) => p.id);
    insertStats(raw, p1, 12, 3);
    insertStats(raw, p2, 20, 1);
    insertStats(raw, p3, 0, 5);
  });
  afterEach(() => raw.close());

  it('orders by goals desc and resolves player names', async () => {
    const rows = await buildTopScorers(db, S, 1, 100);
    expect(rows.map((r) => r.playerId)).toEqual([p2, p1]); // 20 before 12
    expect(rows[0]).toMatchObject({ playerId: p2, goals: 20, assists: 1 });
    expect(rows[0].name.length).toBeGreaterThan(0);
  });

  it('excludes players with zero goals', async () => {
    const rows = await buildTopScorers(db, S, 1, 100);
    expect(rows.find((r) => r.playerId === p3)).toBeUndefined();
  });

  it('returns empty for a competition with no stats', async () => {
    expect(await buildTopScorers(db, S, 1, 999)).toEqual([]);
  });
});
