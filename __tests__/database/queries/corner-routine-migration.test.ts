import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { getSetPieceTakers, setSetPieceTakers } from '@/database/queries/set-piece-takers';

it('SCHEMA_SQL cria set_piece_takers.corner_routine default auto', () => {
  const db = createTestDb();
  const col = (db.prepare('PRAGMA table_info(set_piece_takers)').all() as Array<{ name: string; dflt_value: string | null }>).find((c) => c.name === 'corner_routine');
  expect(col).toBeDefined();
  expect(col!.dflt_value).toContain('auto');
});

it('grava e lê cornerRoutine', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const clubId = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(TEST_SAVE_ID) as { c: number }).c;
  await setSetPieceTakers(db, TEST_SAVE_ID, clubId, { cornerRoutine: 'far_post' });
  const saved = await getSetPieceTakers(db, TEST_SAVE_ID, clubId);
  expect(saved?.cornerRoutine).toBe('far_post');
});

it('DB legado: ADD COLUMN idempotente default auto', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE set_piece_takers (save_id INTEGER, club_id INTEGER, PRIMARY KEY (save_id, club_id))');
  db.exec("ALTER TABLE set_piece_takers ADD COLUMN corner_routine TEXT NOT NULL DEFAULT 'auto'");
  db.prepare('INSERT INTO set_piece_takers (save_id, club_id) VALUES (1, 1)').run();
  const row = db.prepare('SELECT corner_routine AS r FROM set_piece_takers WHERE save_id=1 AND club_id=1').get() as { r: string };
  expect(row.r).toBe('auto');
});
