import { create } from 'zustand';
import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, SAVE_ID_INDEXES_SQL } from '@/database/schema';
import { generateReferenceSeedSQL } from '@/database/seed';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { DbHandle } from '@/database/queries/players';
import { migrateSaveIdAsync } from '@/database/migration';

interface DatabaseState {
  db: SQLite.SQLiteDatabase | null;
  dbHandle: DbHandle | null;
  isReady: boolean;
  error: string | null;
}

interface DatabaseActions {
  initialize: () => Promise<void>;
}

type DatabaseStore = DatabaseState & DatabaseActions;

/**
 * Adds a column if it doesn't already exist. SQLite doesn't support
 * "ADD COLUMN IF NOT EXISTS", so we check PRAGMA table_info.
 */
async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const cols = (await db.getAllAsync(`PRAGMA table_info(${table})`)) as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Wraps expo-sqlite database to match DbHandle interface used by query layer.
 */
export function wrapExpoDb(db: SQLite.SQLiteDatabase): DbHandle {
  return {
    prepare: (sql: string) => ({
      all: async (...params: unknown[]) =>
        db.getAllAsync(sql, params as SQLite.SQLiteBindParams) as Promise<unknown[]>,
      get: async (...params: unknown[]) =>
        db.getFirstAsync(sql, params as SQLite.SQLiteBindParams) as Promise<unknown>,
      run: async (...params: unknown[]) => {
        const result = await db.runAsync(sql, params as SQLite.SQLiteBindParams);
        return { lastInsertRowid: result.lastInsertRowId };
      },
    }),
  };
}

export const useDatabaseStore = create<DatabaseStore>((set) => ({
  db: null,
  dbHandle: null,
  isReady: false,
  error: null,
  initialize: async () => {
    try {
      console.log('[DB] Opening database...');
      const db = await SQLite.openDatabaseAsync('football-manager.db');
      console.log('[DB] Database opened, setting pragmas...');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      console.log('[DB] Creating tables...');
      await db.execAsync(SCHEMA_SQL);

      // Idempotent migrations — add columns that may be missing from older DBs
      await addColumnIfMissing(db, 'transfer_offers', 'offer_type', "TEXT NOT NULL DEFAULT 'transfer'");
      await addColumnIfMissing(db, 'transfer_offers', 'loan_end', 'INTEGER');
      await addColumnIfMissing(db, 'transfer_offers', 'created_week', 'INTEGER');
      await addColumnIfMissing(db, 'transfer_offers', 'created_season', 'INTEGER');
      await addColumnIfMissing(db, 'transfer_offers', 'round_count', 'INTEGER NOT NULL DEFAULT 0');
      // Ensure transfer_blocks exists (was added after the first shipped schema)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS transfer_blocks (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id         INTEGER NOT NULL,
          offering_club_id  INTEGER NOT NULL,
          blocked_until_season INTEGER NOT NULL,
          blocked_until_week   INTEGER NOT NULL
        );
      `);
      // Tactics: new orientation/substitution fields
      await addColumnIfMissing(db, 'tactics', 'attack_focus', "TEXT NOT NULL DEFAULT 'balanced'");
      await addColumnIfMissing(db, 'tactics', 'sub_strategy', "TEXT NOT NULL DEFAULT 'balanced'");

      // Economy depth: preserve parent wage during loans; track consecutive debt weeks.
      await addColumnIfMissing(db, 'players', 'loan_wage', 'INTEGER');
      await addColumnIfMissing(db, 'clubs', 'debt_weeks', 'INTEGER NOT NULL DEFAULT 0');

      // Board stakes: game-over flag once the manager is dismissed.
      await addColumnIfMissing(db, 'save_games', 'ended', 'INTEGER NOT NULL DEFAULT 0');

      // Progression wiring: club-wide training focus + fractional attribute accumulators
      await addColumnIfMissing(db, 'clubs', 'training_focus', "TEXT NOT NULL DEFAULT 'balanced'");
      for (const c of [
        'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'long_shots',
        'free_kicks', 'vision', 'composure', 'decisions', 'positioning', 'aggression',
        'leadership', 'pace', 'stamina', 'strength', 'agility', 'jumping',
      ]) {
        await addColumnIfMissing(db, 'player_attributes', `${c}_progress`, 'REAL NOT NULL DEFAULT 0');
      }

      // Transfer/loan listing flags
      await addColumnIfMissing(db, 'players', 'is_transfer_listed', 'INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'players', 'is_loan_listed',     'INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'players', 'asking_price',       'INTEGER');
      await addColumnIfMissing(db, 'players', 'loan_wage_share',    'REAL');

      // Retirement tracking (streak + announced flag)
      await addColumnIfMissing(db, 'players', 'consecutive_low_morale_weeks', 'INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'players', 'will_retire_at_season_end',    'INTEGER NOT NULL DEFAULT 0');

      // Migration: corrige wages inflados em 100x por bug antigo em computeWage (Math.round * 10 em vez de /10).
      // Heurística: média de wage acima de 50k indica DB seedado pelo código bugado — divide por 100.
      const wageProbe = await db.getFirstAsync<{ avg: number | null }>('SELECT AVG(wage) AS avg FROM players') ?? { avg: null };
      if (wageProbe.avg && wageProbe.avg > 50000) {
        await db.execAsync('UPDATE players SET wage = wage / 100');
      }

      // Season history tables (added post-initial-schema)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS season_competition_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season INTEGER NOT NULL,
          competition_id INTEGER NOT NULL,
          champion_club_id INTEGER NOT NULL,
          runner_up_club_id INTEGER,
          UNIQUE(season, competition_id)
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS season_relegated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season INTEGER NOT NULL,
          league_id INTEGER NOT NULL,
          club_id INTEGER NOT NULL,
          final_position INTEGER NOT NULL,
          UNIQUE(season, league_id, club_id)
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS season_awards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season INTEGER NOT NULL,
          competition_id INTEGER NOT NULL,
          award_type TEXT NOT NULL CHECK(award_type IN ('top_scorer','top_assister','mvp','breakthrough')),
          rank INTEGER NOT NULL DEFAULT 1,
          player_id INTEGER NOT NULL,
          club_id INTEGER NOT NULL,
          value REAL NOT NULL,
          UNIQUE(season, competition_id, award_type, rank)
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS season_player_titles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season INTEGER NOT NULL,
          competition_id INTEGER NOT NULL,
          club_id INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          UNIQUE(season, competition_id, player_id)
        );
      `);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_awards_player ON season_awards(player_id);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_awards_season_comp ON season_awards(season, competition_id);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_results_season ON season_competition_results(season);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_relegated_season ON season_relegated(season);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_player_titles_player ON season_player_titles(player_id);`);

      // Board system (added post-initial-schema)
      await addColumnIfMissing(db, 'save_games', 'board_trust', 'INTEGER NOT NULL DEFAULT 50');

      // Assistants system (added post-initial-schema)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS assistants (
          id                      INTEGER PRIMARY KEY AUTOINCREMENT,
          club_id                 INTEGER NOT NULL,
          save_id                 INTEGER NOT NULL,
          role                    TEXT    NOT NULL,
          name                    TEXT    NOT NULL,
          age                     INTEGER NOT NULL,
          archetype               TEXT    NOT NULL,
          seasons_at_club         INTEGER NOT NULL DEFAULT 0,
          retirement_age          INTEGER NOT NULL,
          wage_per_month          INTEGER NOT NULL,
          will_retire_next_season INTEGER NOT NULL DEFAULT 0,
          UNIQUE(save_id, role)
        );
        CREATE INDEX IF NOT EXISTS idx_assistants_save ON assistants(save_id);
        CREATE INDEX IF NOT EXISTS idx_assistants_club ON assistants(club_id);
      `);

      // App settings key-value store (added for i18n)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // Save isolation: add save_id to legacy world tables (idempotent) and adopt
      // orphan rows when a single save exists. Fresh DBs already have the columns.
      await migrateSaveIdAsync(db);

      // Composite save_id indexes — created only now, after the columns are guaranteed
      // to exist (on legacy DBs they were just added by the migration above).
      await db.execAsync(SAVE_ID_INDEXES_SQL);

      // Seed ONLY the global reference tables (countries + leagues) when empty. Each save
      // seeds its own world (clubs/players/...) via NewGameScreen → save isolation means the
      // boot path must NOT wipe or seed world tables globally (that erased other saves).
      const countryCount = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM countries');
      if (!countryCount || countryCount.cnt === 0) {
        await db.execAsync('DELETE FROM leagues; DELETE FROM countries;');
        console.log('[DB] Seeding reference tables...');
        await db.execAsync(generateReferenceSeedSQL(generateSeedData(2026)));
        console.log('[DB] Reference seed complete!');
      }

      const handle = wrapExpoDb(db);
      console.log('[DB] Database ready!');
      set({ db, dbHandle: handle, isReady: true, error: null });
    } catch (err) {
      const msg = (err as Error).message || 'Unknown database error';
      console.error('[DB] Initialization failed:', msg);
      set({ error: msg, isReady: false });
    }
  },
}));
