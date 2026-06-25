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

      // Pre-season: pending-window flag + standalone friendlies table (kept out of
      // the official fixtures/competitions so it never pollutes standings/history).
      await addColumnIfMissing(db, 'save_games', 'preseason_pending', 'INTEGER NOT NULL DEFAULT 0');

      // P5 press conference: one-time gate set after a user match, cleared on the
      // press screen. Mirrors preseason_pending exactly.
      await addColumnIfMissing(db, 'save_games', 'press_pending', 'INTEGER NOT NULL DEFAULT 0');

      // P6 manager career: career-wide manager reputation (persists across club switches)
      // + a one-time gate set at season-end when rival clubs offered the job.
      await addColumnIfMissing(db, 'save_games', 'manager_reputation', 'INTEGER NOT NULL DEFAULT 50');
      await addColumnIfMissing(db, 'save_games', 'job_offers_pending', 'INTEGER NOT NULL DEFAULT 0');
      // W2 rescue offers: set when the manager is dismissed at season-end and routed
      // to smaller-club rescue offers (decline all = game over). Mirrors job_offers_pending.
      await addColumnIfMissing(db, 'save_games', 'unemployed', 'INTEGER NOT NULL DEFAULT 0');
      // C4 manager job market: spell de desemprego como estado (temporada de início +
      // poupança pessoal) + tabela de contrato do técnico (1 ativo por save).
      await addColumnIfMissing(db, 'save_games', 'unemployed_since_season', 'INTEGER');
      await addColumnIfMissing(db, 'save_games', 'manager_savings', 'INTEGER NOT NULL DEFAULT 0');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS manager_contracts (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id         INTEGER NOT NULL,
          club_id         INTEGER NOT NULL,
          start_season    INTEGER NOT NULL,
          end_season      INTEGER NOT NULL,
          wage_per_season INTEGER NOT NULL,
          release_clause  INTEGER NOT NULL,
          expectation     INTEGER NOT NULL,
          UNIQUE(save_id)
        );
        CREATE INDEX IF NOT EXISTS idx_manager_contracts_save ON manager_contracts(save_id);
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS job_offers (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id          INTEGER NOT NULL,
          season           INTEGER NOT NULL,
          offering_club_id INTEGER NOT NULL,
          status           TEXT    NOT NULL DEFAULT 'pending',
          UNIQUE(save_id, season, offering_club_id)
        );
        CREATE INDEX IF NOT EXISTS idx_job_offers_save_status ON job_offers(save_id, season, status);
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS friendlies (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id       INTEGER NOT NULL,
          season        INTEGER NOT NULL,
          home_club_id  INTEGER NOT NULL,
          away_club_id  INTEGER NOT NULL,
          home_goals    INTEGER,
          away_goals    INTEGER,
          played        INTEGER NOT NULL DEFAULT 0,
          attendance    INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_friendlies_save_season ON friendlies(save_id, season);
      `);

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

      // C8-a pré-temporada: afiação (match sharpness)
      await addColumnIfMissing(db, 'players', 'match_sharpness', 'INTEGER NOT NULL DEFAULT 100');

      // C8-c injury severity tiers + return-fitness cap
      await addColumnIfMissing(db, 'players', 'injury_severity', 'TEXT');
      await addColumnIfMissing(db, 'players', 'injury_return_fitness', 'INTEGER');

      // Retirement tracking (streak + announced flag)
      await addColumnIfMissing(db, 'players', 'consecutive_low_morale_weeks', 'INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'players', 'will_retire_at_season_end',    'INTEGER NOT NULL DEFAULT 0');

      // Player interactions (praise/criticize) cooldown: one individual talk per week.
      await addColumnIfMissing(db, 'players', 'last_interaction_season', 'INTEGER');
      await addColumnIfMissing(db, 'players', 'last_interaction_week',   'INTEGER');

      // C2 youth academy: squad tier, academy reputation, youth coach specialization.
      await addColumnIfMissing(db, 'players', 'squad_tier', "TEXT NOT NULL DEFAULT 'first'");
      await addColumnIfMissing(db, 'clubs', 'academy_reputation', 'INTEGER NOT NULL DEFAULT 50');
      await addColumnIfMissing(db, 'staff', 'youth_specialization', "TEXT NOT NULL DEFAULT 'balanced'");
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS youth_loans (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id        INTEGER NOT NULL,
          player_id      INTEGER NOT NULL,
          parent_club_id INTEGER NOT NULL,
          loan_club_id   INTEGER NOT NULL,
          start_season   INTEGER NOT NULL,
          loan_end       INTEGER NOT NULL,
          minutes_played INTEGER NOT NULL DEFAULT 0,
          appearances    INTEGER NOT NULL DEFAULT 0,
          rating_sum     REAL    NOT NULL DEFAULT 0,
          recalled       INTEGER NOT NULL DEFAULT 0,
          settled        INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_youth_loans_save_parent ON youth_loans(save_id, parent_club_id);
        CREATE INDEX IF NOT EXISTS idx_youth_loans_active      ON youth_loans(save_id, settled, recalled);
        CREATE TABLE IF NOT EXISTS academy_reputation_history (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id    INTEGER NOT NULL,
          club_id    INTEGER NOT NULL,
          season     INTEGER NOT NULL,
          reputation INTEGER NOT NULL,
          delta      INTEGER NOT NULL,
          UNIQUE(save_id, club_id, season)
        );
        CREATE INDEX IF NOT EXISTS idx_academy_rep_hist ON academy_reputation_history(save_id, club_id, season);
        CREATE INDEX IF NOT EXISTS idx_players_save_tier ON players(save_id, club_id, squad_tier);
      `);

      // Scouting fog-of-war: knowledge per scouted (non-own) player (added post-initial-schema).
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS scouting (
          save_id   INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          knowledge INTEGER NOT NULL DEFAULT 0,
          scout_id  INTEGER,
          PRIMARY KEY (save_id, player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_scouting_save ON scouting(save_id);
      `);

      // C3 scout_missions + staff.archetype (added post-initial-schema).
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS scout_missions (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id          INTEGER NOT NULL,
          scout_id         INTEGER NOT NULL,
          type             TEXT    NOT NULL,
          target_player_id INTEGER,
          target_club_id   INTEGER,
          region_code      TEXT,
          weeks_elapsed    INTEGER NOT NULL DEFAULT 0,
          status           TEXT    NOT NULL DEFAULT 'active',
          created_season   INTEGER NOT NULL,
          created_week     INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scout_missions_save  ON scout_missions(save_id, status);
        CREATE INDEX IF NOT EXISTS idx_scout_missions_scout ON scout_missions(save_id, scout_id);
      `);
      await addColumnIfMissing(db, 'staff', 'archetype', 'TEXT');

      // P7 set-piece takers: per-club designated penalty/free-kick/corner taker
      // (NULL id = engine auto-picks, the legacy behavior). Only the user's club rows.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS set_piece_takers (
          save_id            INTEGER NOT NULL,
          club_id            INTEGER NOT NULL,
          penalty_taker_id   INTEGER,
          free_kick_taker_id INTEGER,
          corner_taker_id    INTEGER,
          PRIMARY KEY (save_id, club_id)
        );
      `);
      // C8-f rotina de escanteio
      await addColumnIfMissing(db, 'set_piece_takers', 'corner_routine', "TEXT NOT NULL DEFAULT 'auto'");

      // P8 achievements: per-save unlocked milestones + one-time onboarding gate.
      await addColumnIfMissing(db, 'save_games', 'onboarding_seen', 'INTEGER NOT NULL DEFAULT 0');
      // C8-g sentimento de mídia acumulado por save
      await addColumnIfMissing(db, 'save_games', 'media_sentiment', 'INTEGER NOT NULL DEFAULT 0');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS achievements (
          save_id        INTEGER NOT NULL,
          achievement_id TEXT    NOT NULL,
          season         INTEGER NOT NULL,
          week           INTEGER NOT NULL,
          PRIMARY KEY (save_id, achievement_id)
        );
        CREATE INDEX IF NOT EXISTS idx_achievements_save ON achievements(save_id);
      `);

      // W3 inbox/news: persistent headlines per save. Mirror the schema.ts DDL exactly.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS news_items (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id     INTEGER NOT NULL REFERENCES save_games(id),
          season      INTEGER NOT NULL,
          week        INTEGER NOT NULL,
          category    TEXT    NOT NULL,
          title_key   TEXT    NOT NULL,
          title_vars  TEXT    NOT NULL DEFAULT '{}',
          body_key    TEXT    NOT NULL,
          body_vars   TEXT    NOT NULL DEFAULT '{}',
          icon        TEXT    NOT NULL DEFAULT '📰',
          priority    INTEGER NOT NULL DEFAULT 50,
          read        INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_news_save_season ON news_items(save_id, season, week);
        CREATE INDEX IF NOT EXISTS idx_news_save_read   ON news_items(save_id, read);
      `);

      // C6 inbox: caixa de tarefas/decisões. Espelha exatamente a DDL de schema.ts.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS inbox_threads (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id         INTEGER NOT NULL REFERENCES save_games(id),
          category        TEXT    NOT NULL,
          ref_kind        TEXT    NOT NULL DEFAULT 'none',
          ref_id          INTEGER,
          action_kind     TEXT    NOT NULL DEFAULT 'none',
          status          TEXT    NOT NULL DEFAULT 'open',
          deadline_season INTEGER,
          deadline_week   INTEGER,
          read            INTEGER NOT NULL DEFAULT 0,
          last_season     INTEGER NOT NULL,
          last_week       INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inbox_messages (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id     INTEGER NOT NULL REFERENCES save_games(id),
          thread_id   INTEGER NOT NULL REFERENCES inbox_threads(id),
          season      INTEGER NOT NULL,
          week        INTEGER NOT NULL,
          title_key   TEXT    NOT NULL,
          title_vars  TEXT    NOT NULL DEFAULT '{}',
          body_key    TEXT    NOT NULL,
          body_vars   TEXT    NOT NULL DEFAULT '{}',
          icon        TEXT    NOT NULL DEFAULT '📨',
          from_self   INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_inbox_threads_save_status ON inbox_threads(save_id, status, deadline_season, deadline_week);
        CREATE INDEX IF NOT EXISTS idx_inbox_threads_save_read   ON inbox_threads(save_id, read);
        CREATE INDEX IF NOT EXISTS idx_inbox_msgs_save_thread    ON inbox_messages(save_id, thread_id);
      `);

      // C5 squad psychology: per-player archetype + fallout state, morale-driver ledger,
      // chemistry clique graph. Legacy saves get defaults 'balanced'/'none'.
      await addColumnIfMissing(db, 'players', 'personality',   "TEXT NOT NULL DEFAULT 'balanced'");
      await addColumnIfMissing(db, 'players', 'fallout_state', "TEXT NOT NULL DEFAULT 'none'");
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS morale_events (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id   INTEGER NOT NULL REFERENCES save_games(id),
          player_id INTEGER NOT NULL REFERENCES players(id),
          kind      TEXT    NOT NULL,
          delta     REAL    NOT NULL,
          season    INTEGER NOT NULL,
          week      INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chemistry_links (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id   INTEGER NOT NULL REFERENCES save_games(id),
          club_id   INTEGER NOT NULL REFERENCES clubs(id),
          group_idx INTEGER NOT NULL,
          player_id INTEGER NOT NULL REFERENCES players(id),
          cohesion  REAL    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_morale_events_player ON morale_events(save_id, player_id, season, week);
        CREATE INDEX IF NOT EXISTS idx_chem_links_club      ON chemistry_links(save_id, club_id);
      `);

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

      // C1 dynasty/legacy (added post-initial-schema): mirror of schema.ts tables so
      // legacy saves gain them on open. IF NOT EXISTS = no historical rebuild.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS club_legends (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id       INTEGER NOT NULL REFERENCES save_games(id),
          club_id       INTEGER NOT NULL REFERENCES clubs(id),
          player_id     INTEGER NOT NULL REFERENCES players(id),
          legend_score  INTEGER NOT NULL,
          appearances   INTEGER NOT NULL,
          goals         INTEGER NOT NULL,
          trophies      INTEGER NOT NULL,
          individual_awards INTEGER NOT NULL,
          first_season  INTEGER NOT NULL,
          last_season   INTEGER NOT NULL,
          UNIQUE(save_id, club_id, player_id)
        );
        CREATE TABLE IF NOT EXISTS club_records (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id     INTEGER NOT NULL REFERENCES save_games(id),
          club_id     INTEGER NOT NULL REFERENCES clubs(id),
          record_type TEXT    NOT NULL,
          value       INTEGER NOT NULL,
          holder_id   INTEGER,
          season      INTEGER,
          fixture_ref INTEGER,
          detail      TEXT    NOT NULL DEFAULT '',
          UNIQUE(save_id, club_id, record_type)
        );
        CREATE TABLE IF NOT EXISTS rivalries (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id     INTEGER NOT NULL REFERENCES save_games(id),
          club_a_id   INTEGER NOT NULL REFERENCES clubs(id),
          club_b_id   INTEGER NOT NULL REFERENCES clubs(id),
          intensity   INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 100),
          origin      TEXT    NOT NULL,
          UNIQUE(save_id, club_a_id, club_b_id)
        );
        CREATE TABLE IF NOT EXISTS manager_career (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id       INTEGER NOT NULL REFERENCES save_games(id),
          season        INTEGER NOT NULL,
          club_id       INTEGER NOT NULL REFERENCES clubs(id),
          division_level INTEGER NOT NULL,
          league_position INTEGER,
          total_teams   INTEGER NOT NULL,
          trophies      INTEGER NOT NULL DEFAULT 0,
          manager_reputation INTEGER NOT NULL,
          exit_reason   TEXT    NOT NULL DEFAULT 'stayed',
          UNIQUE(save_id, season)
        );
        CREATE INDEX IF NOT EXISTS idx_legends_club   ON club_legends(save_id, club_id);
        CREATE INDEX IF NOT EXISTS idx_records_club   ON club_records(save_id, club_id);
        CREATE INDEX IF NOT EXISTS idx_rivalries_save ON rivalries(save_id, club_a_id, club_b_id);
        CREATE INDEX IF NOT EXISTS idx_mgr_career     ON manager_career(save_id, season);
      `);

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
