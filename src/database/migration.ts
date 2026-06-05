/**
 * save_id migration for legacy (pre-isolation) databases. Pure of React/Expo so it can
 * be unit-tested with a real better-sqlite3 handle. Two twins share one intent:
 *  - migrateSaveIdAsync: production path (expo-sqlite, async getAllAsync/execAsync).
 *  - migrateSaveId: synchronous test path (better-sqlite3).
 *
 * On a FRESH DB the columns already exist (SCHEMA_SQL declares them), so every ALTER is
 * skipped. On a LEGACY DB the columns are added NULLABLE (ADD COLUMN can't be NOT NULL on a
 * populated table); if exactly one save exists we adopt all orphan rows into it.
 */
export const WORLD_TABLES_FOR_MIGRATION = [
  'clubs', 'players', 'player_attributes', 'club_finances', 'competitions',
  'competition_entries', 'fixtures', 'transfers', 'transfer_offers',
  'transfer_blocks', 'tactics', 'staff', 'board_objectives',
  'board_trust_history', 'club_reputation_history', 'season_competition_results',
  'season_relegated', 'season_awards', 'season_player_titles', 'player_stats',
];

/** Minimal async surface shared by expo-sqlite (and any async driver). */
export interface AsyncMigrationDb {
  getAllAsync(sql: string): Promise<unknown[]>;
  execAsync(sql: string): Promise<unknown>;
}

/** Minimal synchronous surface shared by better-sqlite3. */
export interface SyncMigrationDb {
  prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown };
  exec(sql: string): unknown;
}

async function hasColumnAsync(db: AsyncMigrationDb, table: string, column: string): Promise<boolean> {
  const cols = (await db.getAllAsync(`PRAGMA table_info(${table})`)) as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

async function tableExistsAsync(db: AsyncMigrationDb, table: string): Promise<boolean> {
  const rows = (await db.getAllAsync(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
  )) as Array<{ name: string }>;
  return rows.length > 0;
}

/** Async production migration (expo-sqlite). Idempotent. */
export async function migrateSaveIdAsync(db: AsyncMigrationDb): Promise<void> {
  for (const t of WORLD_TABLES_FOR_MIGRATION) {
    if ((await tableExistsAsync(db, t)) && !(await hasColumnAsync(db, t, 'save_id'))) {
      await db.execAsync(`ALTER TABLE ${t} ADD COLUMN save_id INTEGER`);
    }
  }
  const saves = (await db.getAllAsync('SELECT id FROM save_games')) as Array<{ id: number }>;
  if (saves.length === 1) {
    const only = saves[0].id;
    for (const t of WORLD_TABLES_FOR_MIGRATION) {
      if ((await tableExistsAsync(db, t)) && (await hasColumnAsync(db, t, 'save_id'))) {
        await db.execAsync(`UPDATE ${t} SET save_id = ${only} WHERE save_id IS NULL`);
      }
    }
  }
}

/** Synchronous twin for tests (better-sqlite3). Same semantics. */
export function migrateSaveId(raw: SyncMigrationDb): void {
  const tableExists = (t: string) =>
    (raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").all(t) as unknown[]).length > 0;
  const hasCol = (t: string) =>
    (raw.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).some((c) => c.name === 'save_id');

  for (const t of WORLD_TABLES_FOR_MIGRATION) {
    if (tableExists(t) && !hasCol(t)) raw.exec(`ALTER TABLE ${t} ADD COLUMN save_id INTEGER`);
  }
  const saves = raw.prepare('SELECT id FROM save_games').all() as Array<{ id: number }>;
  if (saves.length === 1) {
    const only = saves[0].id;
    for (const t of WORLD_TABLES_FOR_MIGRATION) {
      if (tableExists(t) && hasCol(t)) raw.exec(`UPDATE ${t} SET save_id = ${only} WHERE save_id IS NULL`);
    }
  }
}
