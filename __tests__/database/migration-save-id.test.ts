import Database from 'better-sqlite3';
import { migrateSaveId } from '@/database/migration';

/** Builds a LEGACY (pre-save_id) schema with one club + one player, no save_id columns. */
function legacyDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE save_games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, current_season INTEGER NOT NULL DEFAULT 1, current_week INTEGER NOT NULL DEFAULT 1, player_club_id INTEGER NOT NULL, difficulty TEXT NOT NULL DEFAULT 'normal', created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, league_id INTEGER NOT NULL);
    CREATE TABLE players (id INTEGER PRIMARY KEY, name TEXT NOT NULL, club_id INTEGER);
    CREATE TABLE board_objectives (id INTEGER PRIMARY KEY AUTOINCREMENT, club_id INTEGER NOT NULL, season INTEGER NOT NULL, type TEXT NOT NULL, target INTEGER, description TEXT NOT NULL);
  `);
  return db;
}

describe('save_id migration (legacy DB)', () => {
  it('adds save_id columns idempotently', () => {
    const db = legacyDb();
    migrateSaveId(db);
    const cols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('save_id');
    // second run must not throw (idempotent)
    expect(() => migrateSaveId(db)).not.toThrow();
  });

  it('adopts orphan world rows when exactly one save exists', () => {
    const db = legacyDb();
    db.prepare("INSERT INTO save_games (name, player_club_id) VALUES ('A', 5)").run();
    db.prepare('INSERT INTO clubs (id, name, league_id) VALUES (5, ?, 1)').run('X');
    db.prepare('INSERT INTO players (id, name, club_id) VALUES (10, ?, 5)').run('P');
    const saveId = (db.prepare('SELECT id FROM save_games').get() as { id: number }).id;

    migrateSaveId(db);

    expect((db.prepare('SELECT save_id FROM clubs WHERE id=5').get() as { save_id: number }).save_id).toBe(saveId);
    expect((db.prepare('SELECT save_id FROM players WHERE id=10').get() as { save_id: number }).save_id).toBe(saveId);
  });

  it('leaves orphan rows NULL when two saves exist (cannot guess owner)', () => {
    const db = legacyDb();
    db.prepare("INSERT INTO save_games (name, player_club_id) VALUES ('A', 5)").run();
    db.prepare("INSERT INTO save_games (name, player_club_id) VALUES ('B', 6)").run();
    db.prepare('INSERT INTO clubs (id, name, league_id) VALUES (5, ?, 1)').run('X');

    migrateSaveId(db);

    expect((db.prepare('SELECT save_id FROM clubs WHERE id=5').get() as { save_id: number | null }).save_id).toBeNull();
  });
});
