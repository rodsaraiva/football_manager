import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { addMatchEvent, getMatchEvents } from '@/database/queries/fixtures';
import { migrateMatchEventGeometry } from '@/database/migration';

function columnsOf(db: Database.Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name),
  );
}

it('SCHEMA_SQL cria match_events com xg/x/y/phase', () => {
  const db = createTestDb();
  const cols = columnsOf(db, 'match_events');
  for (const c of ['xg', 'x', 'y', 'phase']) expect(cols.has(c)).toBe(true);
});

it('grava e lê xg via addMatchEvent/getMatchEvents (round-trip)', async () => {
  const raw = createTestDb();
  seedTestDb(raw);
  raw.pragma('foreign_keys = OFF'); // testa a camada de query, não a integridade referencial
  const db = createTestDbHandle(raw);
  await addMatchEvent(db, {
    fixtureId: 1, minute: 10, type: 'goal', playerId: 1, secondaryPlayerId: null,
    xg: 0.42, x: 0.85, y: 0.5, phase: 'open_play',
  });
  const events = await getMatchEvents(db, 1);
  expect(events).toHaveLength(1);
  expect(events[0].xg).toBeCloseTo(0.42, 5);
  expect(events[0].type).toBe('goal');
});

it('evento sem xg/geometria persiste com null e lê sem xg', async () => {
  const raw = createTestDb();
  seedTestDb(raw);
  raw.pragma('foreign_keys = OFF');
  const db = createTestDbHandle(raw);
  await addMatchEvent(db, { fixtureId: 2, minute: 15, type: 'yellow', playerId: 1, secondaryPlayerId: null });
  const events = await getMatchEvents(db, 2);
  expect(events).toHaveLength(1);
  expect(events[0].xg).toBeUndefined();
  const row = raw.prepare('SELECT x, y, phase FROM match_events WHERE fixture_id = 2').get() as {
    x: number | null; y: number | null; phase: string | null;
  };
  expect(row.x).toBeNull();
  expect(row.y).toBeNull();
  expect(row.phase).toBeNull();
});

it('DB legado sem as colunas: migração adiciona xg/x/y/phase e SELECT não quebra', () => {
  const db = new Database(':memory:');
  // Schema legado de match_events (pré-L2).
  db.exec(`CREATE TABLE match_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    minute INTEGER NOT NULL,
    type TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    secondary_player_id INTEGER
  )`);
  db.prepare('INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id) VALUES (?,?,?,?,?)')
    .run(1, 10, 'goal', 1, null);

  expect(columnsOf(db, 'match_events').has('xg')).toBe(false);

  migrateMatchEventGeometry(db);

  const cols = columnsOf(db, 'match_events');
  for (const c of ['xg', 'x', 'y', 'phase']) expect(cols.has(c)).toBe(true);

  // Linha legada sobrevive, colunas novas = NULL.
  const row = db.prepare('SELECT xg, x, y, phase FROM match_events WHERE fixture_id = 1').get() as {
    xg: number | null; x: number | null; y: number | null; phase: string | null;
  };
  expect(row.xg).toBeNull();
  expect(row.x).toBeNull();

  // Idempotente: rodar de novo não lança.
  expect(() => migrateMatchEventGeometry(db)).not.toThrow();
});
