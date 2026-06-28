import Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers';

it('SCHEMA_SQL cria players.match_sharpness com default 100', () => {
  const db = createTestDb();
  const cols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string; dflt_value: string | null }>;
  const col = cols.find((c) => c.name === 'match_sharpness');
  expect(col).toBeDefined();
  expect(col!.dflt_value).toBe('100');
});

it('DB legado sem a coluna recebe ADD COLUMN idempotente', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE players (id INTEGER PRIMARY KEY, fitness INTEGER NOT NULL DEFAULT 100)');
  const hasCol = () => (db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>).some((c) => c.name === 'match_sharpness');
  expect(hasCol()).toBe(false);
  db.exec('ALTER TABLE players ADD COLUMN match_sharpness INTEGER NOT NULL DEFAULT 100');
  expect(hasCol()).toBe(true);
  db.prepare('INSERT INTO players (id) VALUES (1)').run();
  const row = db.prepare('SELECT match_sharpness FROM players WHERE id = 1').get() as { match_sharpness: number };
  expect(row.match_sharpness).toBe(100);
});
