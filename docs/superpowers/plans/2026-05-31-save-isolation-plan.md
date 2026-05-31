# Save Isolation (Real Multi-Save) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make each save an independent world — creating/playing save B never touches save A — by adding `save_id` to every world table, scoping every query by `save_id`, seeding a fresh world per save (with per-save ID offsets), and deleting a save's entire world transactionally.

**Architecture:** Single shared SQLite file, single global `DbHandle`. World tables (`clubs`, `players`, `player_attributes`, `club_finances`, `competitions`, `competition_entries`, `fixtures`, `transfers`, `transfer_offers`, `transfer_blocks`, `tactics`, `staff`, `board_objectives`, `board_trust_history`, `club_reputation_history`, `season_*`, `player_stats`) get a `save_id INTEGER` column. `countries`/`leagues`/`app_settings` stay global reference. Every world query gains a required `saveId: number` parameter (after `db`) so `tsc --noEmit` flags every unmigrated call site. Per-save ID offset `saveId * SAVE_ID_STRIDE` (STRIDE = `100_000_000`) eliminates `MAX(id)` and per-season offset collisions across saves. `seedWorldForSave` clones the world for one save; `deleteSave` wipes one save's world in a transaction. Engine stays pure: `save_id` arrives only as a function parameter (`AdvanceWeekParams.saveId` already exists; `ensureSeasonFixtures(db, saveId, season)`), never via store import.

**Tech Stack:** TypeScript 5.9 strict, React Native (Expo 54), Zustand, Jest 29 + ts-jest, `better-sqlite3` (tests, real in-memory, never mocked) / `expo-sqlite` (runtime), SQLite. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-05-31-save-isolation-design.md`

### File Structure

| File | Action | Why |
|---|---|---|
| `src/database/constants.ts` | **Create** | Export `SAVE_ID_STRIDE` + `saveOffset(saveId)` — single source of the per-save ID space. Engine-pure (no React). |
| `src/database/schema.ts` | Modify | Declare `save_id INTEGER NOT NULL` on world tables in `SCHEMA_SQL`; update `UNIQUE(...)` to prefix `save_id`; add composite indexes. |
| `src/store/database-store.ts` | Modify | Idempotent `addColumnIfMissing(db,'<t>','save_id','INTEGER')` per world table; legacy single-save adoption; remove the global reseed-on-empty for world tables (keep only reference seed). |
| `src/database/seed.ts` | Modify | Add `seedWorldForSave(db, data, saveId)` + `generateWorldSeedSQLForSave(data, saveId)` (web string variant) — insert clubs/players/attributes/staff/tactics with `save_id` and offset IDs. Keep `seedDatabase`/`generateSeedSQL` for reference-only (countries/leagues). |
| `src/database/queries/clubs.ts` | Modify | Add `saveId` param + `WHERE save_id = ?` / column on INSERT. |
| `src/database/queries/players.ts` | Modify | Same. |
| `src/database/queries/fixtures.ts` | Modify | Same (`createFixture`, `getFixturesByWeek`, `getFixturesByClub`, …). |
| `src/database/queries/board.ts` | Modify | Same (objectives/trust/reputation scoped). |
| `src/database/queries/player-stats.ts` | Modify | Same (`save_id` column; `getPlayerStatsByCompetition` scoped). |
| `src/database/queries/finances.ts`, `tactics.ts`, `transfers.ts`, `staff.ts`, `history.ts`, `leagues.ts` (competitions only) | Modify | Same pattern; `leagues.ts` `getAllLeagues`/`getAllCountries` stay global. |
| `src/database/queries/saves.ts` | Modify | `deleteSave` becomes transactional, wipes all world rows of the save. `createSave` unchanged. |
| `src/engine/competition/calendar.ts` | Modify | `ensureSeasonFixtures(db, saveId, season)`; persist with `save_id` + `saveOffset`. |
| `src/engine/game-loop.ts` | Modify | Thread `saveId` into every internal query call (param already on `AdvanceWeekParams`). |
| `src/screens/NewGameScreen.tsx` | Modify | Replace global DELETEs with `seedWorldForSave` + scoped calendar; pass `saveId` to every query. |
| `src/screens/EndOfSeasonScreen.tsx` | Modify | Youth `MAX(id) WHERE save_id=?`; calendar with `saveOffset`; pass `saveId`. |
| `src/screens/home/HomeScreen.tsx` + other screens | Modify | Pass `currentSave.id` to scoped queries (compiler-guided). |
| `__tests__/database/test-helpers.ts` | Modify | Add `seedWorldForSave` re-export helper for tests + `createTestDb` already builds the new schema. |
| `__tests__/save-isolation/*.test.ts` | **Create** | Anchor isolation + per-feature tests (real better-sqlite3). |

---

### Task 1: ID-space constant + per-save offset helper

**Files:**
- Create: `src/database/constants.ts`
- Test: `__tests__/database/constants.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/constants.test.ts`:

```ts
import { SAVE_ID_STRIDE, saveOffset } from '@/database/constants';

describe('save id space', () => {
  it('STRIDE is large enough for one world (>= 100M)', () => {
    expect(SAVE_ID_STRIDE).toBeGreaterThanOrEqual(100_000_000);
  });

  it('saveOffset(saveId) = saveId * STRIDE', () => {
    expect(saveOffset(1)).toBe(SAVE_ID_STRIDE);
    expect(saveOffset(3)).toBe(3 * SAVE_ID_STRIDE);
  });

  it('offsets of different saves never overlap for ids below STRIDE', () => {
    const a = saveOffset(1) + 999_999; // any raw id within one world
    const b = saveOffset(2) + 0;
    expect(a).toBeLessThan(b);
  });

  it('stays within Number.MAX_SAFE_INTEGER for thousands of saves', () => {
    expect(saveOffset(10_000) + SAVE_ID_STRIDE).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

Run: `npx jest __tests__/database/constants.test.ts`
Expected: FAIL — `Cannot find module '@/database/constants'`.

- [ ] **Step 3: Minimal implementation**

Create `src/database/constants.ts`:

```ts
/**
 * Each save owns a disjoint ID space [saveId*STRIDE, (saveId+1)*STRIDE).
 * STRIDE is larger than the maximum number of clubs+players+fixtures+competitions
 * one save accumulates across all seasons, so raw seed/season ids never collide
 * across saves. Stays within Number.MAX_SAFE_INTEGER for thousands of saves.
 */
export const SAVE_ID_STRIDE = 100_000_000;

export function saveOffset(saveId: number): number {
  return saveId * SAVE_ID_STRIDE;
}
```

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx jest __tests__/database/constants.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/constants.ts __tests__/database/constants.test.ts
git commit -m "feat(db): espaço de IDs por save (SAVE_ID_STRIDE + saveOffset) — base do isolamento"
```

---

### Task 2: Schema — `save_id` columns, `UNIQUE` prefixes, composite indexes

**Files:**
- Modify: `src/database/schema.ts` (lines 50-66 clubs, 68-93 players, 95-115 player_attributes, 117-129 player_stats, 131-139 staff, 141-149 club_finances, 151-158 competitions, 160-166 competition_entries, 168-180 fixtures, 191-201 transfers, 203-217 transfer_offers, 219-225 transfer_blocks, 227-240 tactics, 272-337 season_*/board_*/reputation, 359-365 indexes)
- Test: `__tests__/database/schema-save-id.test.ts`

This task touches only the **fresh** schema (`createTestDb` → `createAllTables` → `SCHEMA_SQL`). The idempotent migration for existing DBs is Task 3.

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/schema-save-id.test.ts`:

```ts
import { createTestDb } from '../database/test-helpers';

const WORLD_TABLES = [
  'clubs', 'players', 'player_attributes', 'club_finances', 'competitions',
  'competition_entries', 'fixtures', 'transfers', 'transfer_offers',
  'transfer_blocks', 'tactics', 'staff', 'board_objectives',
  'board_trust_history', 'club_reputation_history', 'season_competition_results',
  'season_relegated', 'season_awards', 'season_player_titles', 'player_stats',
];

const REFERENCE_TABLES = ['countries', 'leagues', 'app_settings'];

describe('schema save_id', () => {
  const db = createTestDb();

  it.each(WORLD_TABLES)('world table %s has a save_id column', (t) => {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('save_id');
  });

  it.each(REFERENCE_TABLES)('reference table %s has NO save_id column', (t) => {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).not.toContain('save_id');
  });

  it('board_objectives allows the same (club_id, season) for two saves', () => {
    db.prepare("INSERT INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (1, 7, 1, 'league_position', 5, 'a')").run();
    expect(() =>
      db.prepare("INSERT INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (2, 7, 1, 'league_position', 5, 'b')").run(),
    ).not.toThrow();
  });

  it('board_objectives still rejects a duplicate (save_id, club_id, season)', () => {
    expect(() =>
      db.prepare("INSERT INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (1, 7, 1, 'league_position', 5, 'dup')").run(),
    ).toThrow(/UNIQUE/);
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

Run: `npx jest __tests__/database/schema-save-id.test.ts`
Expected: FAIL — world tables lack `save_id`; the dual-save insert throws UNIQUE on `(club_id, season)`.

- [ ] **Step 3: Minimal implementation**

In `src/database/schema.ts`, edit `SCHEMA_SQL`. Add `save_id INTEGER NOT NULL REFERENCES save_games(id)` to each world table and prefix the listed `UNIQUE(...)`. Exact edits:

- `clubs` (after line 51 `id ...`): add `  save_id             INTEGER NOT NULL REFERENCES save_games(id),`
- `players` (after `id INTEGER PRIMARY KEY,`): add `  save_id            INTEGER NOT NULL REFERENCES save_games(id),`
- `player_attributes` (after `player_id INTEGER PRIMARY KEY ...,`): add `  save_id     INTEGER NOT NULL REFERENCES save_games(id),`
- `player_stats` (after `competition_id ...,`): add `  save_id        INTEGER NOT NULL REFERENCES save_games(id),`
- `staff`, `club_finances`, `competitions`, `competition_entries`, `fixtures`, `transfers`, `transfer_offers`, `transfer_blocks`, `tactics`: add `  save_id ... INTEGER NOT NULL REFERENCES save_games(id),` after their `id`/PK line.
- `season_competition_results`: add `save_id` column and change `UNIQUE(season, competition_id)` → `UNIQUE(save_id, season, competition_id)`.
- `season_relegated`: add `save_id`; `UNIQUE(season, league_id, club_id)` → `UNIQUE(save_id, season, league_id, club_id)`.
- `season_awards`: add `save_id`; `UNIQUE(season, competition_id, award_type, rank)` → `UNIQUE(save_id, season, competition_id, award_type, rank)`.
- `season_player_titles`: add `save_id`; `UNIQUE(season, competition_id, player_id)` → `UNIQUE(save_id, season, competition_id, player_id)`.
- `club_reputation_history`: add `save_id`; `UNIQUE(club_id, season)` → `UNIQUE(save_id, club_id, season)`.
- `board_objectives`: add `save_id`; `UNIQUE(club_id, season)` → `UNIQUE(save_id, club_id, season)`.
- `board_trust_history`: add `save_id`; `UNIQUE(club_id, season)` → `UNIQUE(save_id, club_id, season)`.

> Keep `competition_entries` PK `(competition_id, club_id)` — its ids are per-save via offset, no change needed beyond the new `save_id` column for scoping/deletion.

Append the composite indexes before the closing backtick (after line 365):

```sql
CREATE INDEX IF NOT EXISTS idx_players_save_club        ON players(save_id, club_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_save_season_week ON fixtures(save_id, season, week);
CREATE INDEX IF NOT EXISTS idx_fixtures_save_comp        ON fixtures(save_id, competition_id);
CREATE INDEX IF NOT EXISTS idx_finances_save_club        ON club_finances(save_id, club_id);
CREATE INDEX IF NOT EXISTS idx_clubs_save_league         ON clubs(save_id, league_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_save_comp    ON player_stats(save_id, season, competition_id);
CREATE INDEX IF NOT EXISTS idx_tactics_save_club         ON tactics(save_id, club_id);
```

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx jest __tests__/database/schema-save-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/database/schema.ts __tests__/database/schema-save-id.test.ts
git commit -m "feat(db): save_id em tabelas de mundo + UNIQUE(save_id,...) + índices compostos (schema fresh)"
```

---

### Task 3: Idempotent migration + legacy single-save adoption

**Files:**
- Modify: `src/store/database-store.ts` (insert after line 185 `app_settings` block, before the seed block at 187-197)
- Test: `__tests__/database/migration-save-id.test.ts`

The migration runs on **existing** DBs (legacy schema without `save_id`). `ADD COLUMN ... NOT NULL` is impossible on a populated table, so the migrated column is nullable. Legacy adoption: if exactly one `save_games` row exists, claim all `save_id IS NULL` world rows for it.

We extract the migration into a testable pure-ish function so the test can drive it with a better-sqlite3 handle (the store's `initialize` is bound to expo-sqlite and is exercised in the browser step of Task 11).

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/migration-save-id.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDbHandle } from './test-helpers';
import { migrateSaveId } from '@/store/database-store';

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
    migrateSaveId(createTestDbHandle(db) as never, db); // see Step 3 signature
    const cols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('save_id');
    // second run must not throw (idempotent)
    expect(() => migrateSaveId(createTestDbHandle(db) as never, db)).not.toThrow();
  });

  it('adopts orphan world rows when exactly one save exists', () => {
    const db = legacyDb();
    db.prepare("INSERT INTO save_games (name, player_club_id) VALUES ('A', 5)").run();
    db.prepare('INSERT INTO clubs (id, name, league_id) VALUES (5, ?, 1)').run('X');
    db.prepare('INSERT INTO players (id, name, club_id) VALUES (10, ?, 5)').run('P');
    const saveId = (db.prepare('SELECT id FROM save_games').get() as { id: number }).id;

    migrateSaveId(createTestDbHandle(db) as never, db);

    expect((db.prepare('SELECT save_id FROM clubs WHERE id=5').get() as { save_id: number }).save_id).toBe(saveId);
    expect((db.prepare('SELECT save_id FROM players WHERE id=10').get() as { save_id: number }).save_id).toBe(saveId);
  });

  it('leaves orphan rows NULL when two saves exist (cannot guess owner)', () => {
    const db = legacyDb();
    db.prepare("INSERT INTO save_games (name, player_club_id) VALUES ('A', 5)").run();
    db.prepare("INSERT INTO save_games (name, player_club_id) VALUES ('B', 6)").run();
    db.prepare('INSERT INTO clubs (id, name, league_id) VALUES (5, ?, 1)').run('X');

    migrateSaveId(createTestDbHandle(db) as never, db);

    expect((db.prepare('SELECT save_id FROM clubs WHERE id=5').get() as { save_id: number | null }).save_id).toBeNull();
  });
});
```

> Note: `migrateSaveId` takes the raw better-sqlite3 `db` here so the test can use synchronous `PRAGMA`/`ALTER`. In production it receives the expo `SQLiteDatabase`. To keep one signature, `migrateSaveId` accepts a minimal sync-or-async exec interface. We implement the **synchronous** path (works for both better-sqlite3 in tests and is mirrored by the async store code). See Step 3.

- [ ] **Step 2: Run it (expect FAIL)**

Run: `npx jest __tests__/database/migration-save-id.test.ts`
Expected: FAIL — `migrateSaveId` is not exported.

- [ ] **Step 3: Minimal implementation**

In `src/store/database-store.ts`, add an exported helper that operates on the async expo db (the production path) AND export a small synchronous twin used by tests. To avoid duplicating logic, implement the column list once and a single async function for production, plus a thin synchronous `migrateSaveId` for the test/better-sqlite3 path:

```ts
const WORLD_TABLES_FOR_MIGRATION = [
  'clubs', 'players', 'player_attributes', 'club_finances', 'competitions',
  'competition_entries', 'fixtures', 'transfers', 'transfer_offers',
  'transfer_blocks', 'tactics', 'staff', 'board_objectives',
  'board_trust_history', 'club_reputation_history', 'season_competition_results',
  'season_relegated', 'season_awards', 'season_player_titles', 'player_stats',
];

/** Async production migration (expo-sqlite). Idempotent. */
export async function migrateSaveIdAsync(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const t of WORLD_TABLES_FOR_MIGRATION) {
    await addColumnIfMissing(db, t, 'save_id', 'INTEGER');
  }
  const saves = (await db.getAllAsync('SELECT id FROM save_games')) as Array<{ id: number }>;
  if (saves.length === 1) {
    const only = saves[0].id;
    for (const t of WORLD_TABLES_FOR_MIGRATION) {
      const cols = (await db.getAllAsync(`PRAGMA table_info(${t})`)) as Array<{ name: string }>;
      if (cols.some((c) => c.name === 'save_id')) {
        await db.execAsync(`UPDATE ${t} SET save_id = ${only} WHERE save_id IS NULL`);
      }
    }
  }
}

/** Synchronous twin for tests (better-sqlite3). Same semantics. The first arg is unused
 *  in the sync path; kept so the production call site and tests share an intent. */
export function migrateSaveId(_handle: unknown, raw: import('better-sqlite3').Database): void {
  const hasCol = (t: string) =>
    (raw.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).some((c) => c.name === 'save_id');
  for (const t of WORLD_TABLES_FOR_MIGRATION) {
    if (tableExists(raw, t) && !hasCol(t)) raw.exec(`ALTER TABLE ${t} ADD COLUMN save_id INTEGER`);
  }
  const saves = raw.prepare('SELECT id FROM save_games').all() as Array<{ id: number }>;
  if (saves.length === 1) {
    const only = saves[0].id;
    for (const t of WORLD_TABLES_FOR_MIGRATION) {
      if (tableExists(raw, t) && hasCol(t)) raw.exec(`UPDATE ${t} SET save_id = ${only} WHERE save_id IS NULL`);
    }
  }
}

function tableExists(raw: import('better-sqlite3').Database, t: string): boolean {
  return !!raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
}
```

Then call `await migrateSaveIdAsync(db);` inside `initialize()` right after the `app_settings` block (after line 185, before the seed block).

> `better-sqlite3` is a devDependency already used by tests; importing its type via `import('better-sqlite3').Database` is type-only and does not pull it into the runtime bundle. If `tsc` complains about the type import in app code, change the param to `raw: { prepare: Function; exec: (s: string) => unknown }` (structural) — pick whichever keeps `tsc --noEmit` clean.

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx jest __tests__/database/migration-save-id.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/database-store.ts __tests__/database/migration-save-id.test.ts
git commit -m "feat(db): migração idempotente de save_id + adoção do mundo legado pelo save único"
```

---

### Task 4: `seedWorldForSave` — clone the world per save with offset IDs

**Files:**
- Modify: `src/database/seed.ts` (add functions after line 90)
- Modify: `__tests__/database/test-helpers.ts` (export `seedWorldForSave` passthrough for tests, and `seedReferenceTablesTest`)
- Test: `__tests__/save-isolation/seed-world.test.ts`

`seedWorldForSave` inserts clubs/players/attributes/staff/tactics for one `saveId`, rewriting every world id with `saveOffset(saveId)` and rewriting internal FKs (`player.club_id`, `staff.club_id`, `tactic.club_id`) with the same offset. `league_id`/`country_id` stay raw (reference). Wrapped in `BEGIN/COMMIT` with `ROLLBACK` on error (mirrors `seedDatabase` lines 9-43).

- [ ] **Step 1: Write the failing test**

Create `__tests__/save-isolation/seed-world.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { seedReferenceTables, seedWorldForSave } from '@/database/seed';
import { saveOffset } from '@/database/constants';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  createAllTables(db);
  return db;
}

describe('seedWorldForSave', () => {
  it('two saves get disjoint, equal-count player sets', () => {
    const db = freshDb();
    const data = generateSeedData(42);
    seedReferenceTables(db, data); // countries + leagues only (global)
    // create save rows so the FK target exists
    db.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    db.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + data.clubs[0].id);

    seedWorldForSave(db, data, 1);
    seedWorldForSave(db, data, 2);

    const cntA = (db.prepare('SELECT COUNT(*) c FROM players WHERE save_id=1').get() as { c: number }).c;
    const cntB = (db.prepare('SELECT COUNT(*) c FROM players WHERE save_id=2').get() as { c: number }).c;
    expect(cntA).toBe(data.players.length);
    expect(cntB).toBe(data.players.length);

    // no cross-save id overlap: every save-1 player id < save-2's min id
    const maxA = (db.prepare('SELECT MAX(id) m FROM players WHERE save_id=1').get() as { m: number }).m;
    const minB = (db.prepare('SELECT MIN(id) m FROM players WHERE save_id=2').get() as { m: number }).m;
    expect(maxA).toBeLessThan(minB);
  });

  it('rewrites player.club_id with the same save offset (FK stays inside the save)', () => {
    const db = freshDb();
    const data = generateSeedData(42);
    seedReferenceTables(db, data);
    db.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    seedWorldForSave(db, data, 1);

    const orphan = db.prepare(
      'SELECT COUNT(*) c FROM players p WHERE p.save_id=1 AND p.club_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id=p.club_id AND c.save_id=1)',
    ).get() as { c: number };
    expect(orphan.c).toBe(0);
  });

  it('rolls back on failure (duplicate save world)', () => {
    const db = freshDb();
    const data = generateSeedData(42);
    seedReferenceTables(db, data);
    db.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    seedWorldForSave(db, data, 1);
    expect(() => seedWorldForSave(db, data, 1)).toThrow(); // PK collision on clubs
    // first seed intact, no partial second seed
    const cnt = (db.prepare('SELECT COUNT(*) c FROM clubs WHERE save_id=1').get() as { c: number }).c;
    expect(cnt).toBe(data.clubs.length);
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

Run: `npx jest __tests__/save-isolation/seed-world.test.ts`
Expected: FAIL — `seedReferenceTables`/`seedWorldForSave` not exported.

- [ ] **Step 3: Minimal implementation**

In `src/database/seed.ts`, add (the local `DbHandle` interface at lines 3-6 already has `prepare(...).run` + `exec`):

```ts
import { saveOffset } from './constants';

/** Inserts only the global reference tables (countries, leagues). Safe to call once. */
export function seedReferenceTables(db: DbHandle, data: SeedData): void {
  const insertCountry = db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)');
  for (const c of data.countries) insertCountry.run(c.id, c.name, c.code, c.continent);
  const insertLeague = db.prepare('INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const l of data.leagues) insertLeague.run(l.id, l.name, l.countryId, l.divisionLevel, l.numTeams, l.promotionSpots, l.relegationSpots);
}

/** Clones the world (clubs/players/attributes/staff/tactics) for one save, offsetting all
 *  world ids and internal FKs by saveOffset(saveId). Reference FKs (country_id, league_id)
 *  stay raw. Transactional: ROLLBACK on any error. */
export function seedWorldForSave(db: DbHandle, data: SeedData, saveId: number): void {
  const off = saveOffset(saveId);
  db.exec('BEGIN TRANSACTION');
  try {
    const insertClub = db.prepare('INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const c of data.clubs) insertClub.run(c.id + off, saveId, c.name, c.shortName, c.countryId, c.leagueId, c.reputation, c.budget, c.wageBudget, c.stadiumName, c.stadiumCapacity, c.trainingFacilities, c.youthAcademy, c.medicalDepartment, c.primaryColor, c.secondaryColor);

    const insertPlayer = db.prepare('INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent, preferred_foot, weak_foot_ability) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of data.players) insertPlayer.run(p.id + off, saveId, p.name, p.nationality, p.age, p.position, p.secondaryPosition, p.clubId === null ? null : p.clubId + off, p.wage, p.contractEnd, p.marketValue, p.basePotential, p.effectivePotential, p.morale, p.fitness, p.injuryWeeksLeft, p.isFreeAgent ? 1 : 0, p.preferredFoot, p.weakFootAbility);

    const insertAttrs = db.prepare('INSERT INTO player_attributes (player_id, save_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of data.playerAttributes) insertAttrs.run(a.playerId + off, saveId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading, a.longShots, a.freeKicks, a.vision, a.composure, a.decisions, a.positioning, a.aggression, a.leadership, a.pace, a.stamina, a.strength, a.agility, a.jumping);

    const insertStaff = db.prepare('INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of data.staff) insertStaff.run(s.id + off, saveId, s.name, s.role, s.clubId === null ? null : s.clubId + off, s.ability, s.wage, s.contractEnd);

    const insertTactic = db.prepare('INSERT INTO tactics (id, save_id, club_id, name, is_active, formation, mentality, pressing, passing_style, tempo, width) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of data.tactics) insertTactic.run(t.id + off, saveId, t.clubId + off, t.name, t.isActive ? 1 : 0, t.formation, t.mentality, t.pressing, t.passingStyle, t.tempo, t.width);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
```

Also add a web string variant mirroring `generateSeedSQL` for the expo path (used by NewGameScreen on web — Task 9):

```ts
/** SQL-string variant of seedWorldForSave for execAsync on web. */
export function generateWorldSeedSQLForSave(data: SeedData, saveId: number): string {
  const off = saveOffset(saveId);
  const stmts: string[] = ['BEGIN TRANSACTION;'];
  for (const c of data.clubs) stmts.push(`INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color) VALUES (${c.id + off}, ${saveId}, ${esc(c.name)}, ${esc(c.shortName)}, ${c.countryId}, ${c.leagueId}, ${c.reputation}, ${c.budget}, ${c.wageBudget}, ${esc(c.stadiumName)}, ${c.stadiumCapacity}, ${c.trainingFacilities}, ${c.youthAcademy}, ${c.medicalDepartment}, ${esc(c.primaryColor)}, ${esc(c.secondaryColor)});`);
  for (const p of data.players) stmts.push(`INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent, preferred_foot, weak_foot_ability) VALUES (${p.id + off}, ${saveId}, ${esc(p.name)}, ${esc(p.nationality)}, ${p.age}, ${esc(p.position)}, ${esc(p.secondaryPosition)}, ${p.clubId === null ? 'NULL' : p.clubId + off}, ${p.wage}, ${p.contractEnd}, ${p.marketValue}, ${p.basePotential}, ${p.effectivePotential}, ${p.morale}, ${p.fitness}, ${p.injuryWeeksLeft}, ${p.isFreeAgent ? 1 : 0}, ${esc(p.preferredFoot)}, ${p.weakFootAbility});`);
  for (const a of data.playerAttributes) stmts.push(`INSERT INTO player_attributes (player_id, save_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (${a.playerId + off}, ${saveId}, ${a.finishing}, ${a.passing}, ${a.crossing}, ${a.dribbling}, ${a.heading}, ${a.longShots}, ${a.freeKicks}, ${a.vision}, ${a.composure}, ${a.decisions}, ${a.positioning}, ${a.aggression}, ${a.leadership}, ${a.pace}, ${a.stamina}, ${a.strength}, ${a.agility}, ${a.jumping});`);
  for (const s of data.staff) stmts.push(`INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end) VALUES (${s.id + off}, ${saveId}, ${esc(s.name)}, ${esc(s.role)}, ${s.clubId === null ? 'NULL' : s.clubId + off}, ${s.ability}, ${s.wage}, ${s.contractEnd});`);
  for (const t of data.tactics) stmts.push(`INSERT INTO tactics (id, save_id, club_id, name, is_active, formation, mentality, pressing, passing_style, tempo, width) VALUES (${t.id + off}, ${saveId}, ${t.clubId + off}, ${esc(t.name)}, ${t.isActive ? 1 : 0}, ${esc(t.formation)}, ${esc(t.mentality)}, ${esc(t.pressing)}, ${esc(t.passingStyle)}, ${esc(t.tempo)}, ${esc(t.width)});`);
  stmts.push('COMMIT;');
  return stmts.join('\n');
}
```

In `__tests__/database/test-helpers.ts`, re-export for convenience (so isolation tests import from one place):

```ts
export { seedReferenceTables, seedWorldForSave } from '@/database/seed';
```

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx jest __tests__/save-isolation/seed-world.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/seed.ts __tests__/database/test-helpers.ts __tests__/save-isolation/seed-world.test.ts
git commit -m "feat(db): seedWorldForSave/seedReferenceTables — clona o mundo por save com IDs offsetados"
```

---

### Task 5: Scope core read queries — `clubs`, `players`, `fixtures` (compiler-guided)

**Files:**
- Modify: `src/database/queries/clubs.ts` (42-81), `src/database/queries/players.ts` (112-272), `src/database/queries/fixtures.ts` (63-166)
- Test: `__tests__/save-isolation/scoped-queries.test.ts`

Add `saveId: number` as the **2nd** parameter (after `db`) to every world function and inject `WHERE save_id = ?` / the column on INSERT. This task does the three highest-traffic modules; Task 6 does the rest. `tsc --noEmit` will go red across call sites until Tasks 9-10 migrate them — that's the safety net; run `tsc` at the END of Task 10, not here.

- [ ] **Step 1: Write the failing test**

Create `__tests__/save-isolation/scoped-queries.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { getClubsByLeague, getClubById } from '@/database/queries/clubs';
import { getPlayersByClub } from '@/database/queries/players';
import { createFixture, getFixturesByWeek } from '@/database/queries/fixtures';

describe('scoped queries respect save_id', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  const data = generateSeedData(42);
  const leagueId = data.leagues[0].id;
  const clubRaw = data.clubs.find((c) => c.leagueId === leagueId)!;

  beforeEach(() => {
    raw = new Database(':memory:');
    createAllTables(raw);
    db = createTestDbHandle(raw);
    seedReferenceTables(raw, data);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + clubRaw.id);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + clubRaw.id);
    seedWorldForSave(raw, data, 1);
    seedWorldForSave(raw, data, 2);
  });
  afterEach(() => raw.close());

  it('getClubsByLeague returns only the requested save', async () => {
    const a = await getClubsByLeague(db, 1, leagueId);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((c) => c.id >= saveOffset(1) && c.id < saveOffset(2))).toBe(true);
  });

  it('getPlayersByClub of save 1 is unaffected by save 2', async () => {
    const clubId1 = clubRaw.id + saveOffset(1);
    const before = await getPlayersByClub(db, 1, clubId1);
    // mutate save 2 squad: move one of save-2 players to free agency
    raw.prepare('UPDATE players SET club_id = NULL WHERE save_id = 2').run();
    const after = await getPlayersByClub(db, 1, clubId1);
    expect(after.length).toBe(before.length);
  });

  it('getFixturesByWeek is scoped; creating a fixture in save 1 is invisible to save 2', async () => {
    const clubId1 = clubRaw.id + saveOffset(1);
    const other1 = (data.clubs.find((c) => c.leagueId === leagueId && c.id !== clubRaw.id)!).id + saveOffset(1);
    await createFixture(db, 1, { id: saveOffset(1) + 1, competitionId: saveOffset(1) + 1, season: 1, week: 1, homeClubId: clubId1, awayClubId: other1 });
    // competition row needed for FK if FK-on; insert minimal
    expect((await getFixturesByWeek(db, 1, 1, 1)).length).toBe(1);
    expect((await getFixturesByWeek(db, 2, 1, 1)).length).toBe(0);
  });

  it('getClubById is scoped to the save', async () => {
    const c = await getClubById(db, 1, clubRaw.id + saveOffset(1));
    expect(c).not.toBeNull();
    expect(await getClubById(db, 2, clubRaw.id + saveOffset(1))).toBeNull();
  });
});
```

> If FK-on is enabled by `db-hardening`, the `createFixture` test needs a `competitions` row first; insert one in the test setup with `raw.prepare("INSERT INTO competitions (id, save_id, name, type, format, season, league_id) VALUES (?,1,'L','league','round_robin',1,?)").run(saveOffset(1)+1, leagueId)`. Add it if the suite runs with FK-on.

- [ ] **Step 2: Run it (expect FAIL)**

Run: `npx jest __tests__/save-isolation/scoped-queries.test.ts`
Expected: FAIL — current `getClubsByLeague(db, leagueId)` etc. have no `saveId` param; arguments mismatch / rows leak across saves.

- [ ] **Step 3: Minimal implementation**

`src/database/queries/clubs.ts` — exact rewrites:

```ts
export async function getClubById(db: DbHandle, saveId: number, clubId: number): Promise<Club | null> {
  const row = await db.prepare('SELECT * FROM clubs WHERE save_id = ? AND id = ?').get(saveId, clubId) as ClubRow | undefined;
  return row ? rowToClub(row) : null;
}

export async function getClubsByLeague(db: DbHandle, saveId: number, leagueId: number): Promise<Club[]> {
  const rows = await db.prepare('SELECT * FROM clubs WHERE save_id = ? AND league_id = ?').all(saveId, leagueId) as ClubRow[];
  return rows.map(rowToClub);
}

export async function getAllClubs(db: DbHandle, saveId: number): Promise<Club[]> {
  const rows = await db.prepare('SELECT * FROM clubs WHERE save_id = ?').all(saveId) as ClubRow[];
  return rows.map(rowToClub);
}

export async function updateClubBudget(db: DbHandle, saveId: number, clubId: number, budget: number): Promise<void> {
  await db.prepare('UPDATE clubs SET budget = ? WHERE save_id = ? AND id = ?').run(budget, saveId, clubId);
}

export async function getClubsByCountry(db: DbHandle, saveId: number, countryId: number): Promise<ClubWithDivision[]> {
  const rows = (await db.prepare(
    `SELECT clubs.*, leagues.division_level AS division_level
     FROM clubs JOIN leagues ON clubs.league_id = leagues.id
     WHERE clubs.save_id = ? AND leagues.country_id = ?`,
  ).all(saveId, countryId)) as Array<ClubRow & { division_level: number }>;
  return rows.map((r) => ({ ...rowToClub(r), divisionLevel: r.division_level }));
}

export async function updateClubReputation(db: DbHandle, saveId: number, clubId: number, reputation: number): Promise<void> {
  await db.prepare('UPDATE clubs SET reputation = ? WHERE save_id = ? AND id = ?').run(reputation, saveId, clubId);
}
```

`src/database/queries/players.ts` — apply the same shape to **every** exported function (`getPlayersByClub`, `getPlayersWithAttributesByClub`, `getPlayerById`, `searchPlayers`, `updatePlayerMorale`, `getFreeAgents`, `getFreeAgentsWithAttributes`, `setTransferListing`, `setLoanListing`, `retirePlayer`, `getPlayersAboutToRetire`, `getListedPlayers`). Example for the two used in the test:

```ts
export async function getPlayersByClub(db: DbHandle, saveId: number, clubId: number): Promise<Player[]> {
  const rows = await db.prepare('SELECT * FROM players WHERE save_id = ? AND club_id = ?').all(saveId, clubId) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export async function getPlayerById(db: DbHandle, saveId: number, playerId: number): Promise<PlayerWithAttributes | null> {
  // add "save_id = ? AND" to the existing WHERE; pass saveId as the first bind param
}
```

`src/database/queries/fixtures.ts` — `createFixture` adds the `save_id` column; the rest add scope:

```ts
export async function createFixture(db: DbHandle, saveId: number, input: CreateFixtureInput): Promise<number> {
  const result = await db.prepare(
    `INSERT INTO fixtures (id, save_id, competition_id, season, week, round, home_club_id, away_club_id, played)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(input.id, saveId, input.competitionId, input.season, input.week, input.round ?? null, input.homeClubId, input.awayClubId) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function getFixturesByWeek(db: DbHandle, saveId: number, season: number, week: number): Promise<Fixture[]> {
  const rows = await db.prepare('SELECT * FROM fixtures WHERE save_id = ? AND season = ? AND week = ?').all(saveId, season, week) as FixtureRow[];
  return rows.map(rowToFixture);
}

export async function getFixturesByClub(db: DbHandle, saveId: number, clubId: number, season: number): Promise<Fixture[]> {
  const rows = await db.prepare('SELECT * FROM fixtures WHERE save_id = ? AND season = ? AND (home_club_id = ? OR away_club_id = ?)').all(saveId, season, clubId, clubId) as FixtureRow[];
  return rows.map(rowToFixture);
}

export async function updateFixtureResult(db: DbHandle, saveId: number, fixtureId: number, homeGoals: number, awayGoals: number, attendance?: number): Promise<void> {
  await db.prepare('UPDATE fixtures SET home_goals = ?, away_goals = ?, played = 1, attendance = ? WHERE save_id = ? AND id = ?').run(homeGoals, awayGoals, attendance ?? null, saveId, fixtureId);
}

export async function getNextFixtureForClub(db: DbHandle, saveId: number, clubId: number, season: number): Promise<Fixture | null> {
  const row = await db.prepare(
    `SELECT * FROM fixtures WHERE save_id = ? AND played = 0 AND season = ? AND (home_club_id = ? OR away_club_id = ?) ORDER BY week ASC LIMIT 1`,
  ).get(saveId, season, clubId, clubId) as FixtureRow | undefined;
  return row ? rowToFixture(row) : null;
}

export async function getRecentFixturesForClub(db: DbHandle, saveId: number, clubId: number, season: number, limit = 5): Promise<Fixture[]> {
  const rows = await db.prepare(
    `SELECT * FROM fixtures WHERE save_id = ? AND played = 1 AND season = ? AND (home_club_id = ? OR away_club_id = ?) ORDER BY week DESC LIMIT ?`,
  ).all(saveId, season, clubId, clubId, limit) as FixtureRow[];
  return rows.map(rowToFixture);
}
```

`addMatchEvent`/`getMatchEvents` operate on `match_events` (per-owner via `fixture_id`, no own `save_id` column) — **leave their signatures unchanged**.

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx jest __tests__/save-isolation/scoped-queries.test.ts`
Expected: PASS (4 tests). (Other suites and `tsc` are RED until Task 10 — do not run the full suite yet.)

- [ ] **Step 5: Commit**

```bash
git add src/database/queries/clubs.ts src/database/queries/players.ts src/database/queries/fixtures.ts __tests__/save-isolation/scoped-queries.test.ts
git commit -m "feat(db): escopa clubs/players/fixtures por save_id (param obrigatório)"
```

---

### Task 6: Scope remaining world queries — board, player-stats, finances, tactics, transfers, staff, history, competitions

**Files:**
- Modify: `src/database/queries/board.ts` (31-101), `player-stats.ts` (45-110+), `finances.ts` (34-47), `tactics.ts` (71-159), `transfers.ts` (69-192), `staff.ts` (26-31), `history.ts` (84-229), `leagues.ts` (102-127 — `createCompetition`, `addCompetitionEntry`; `getAllLeagues`/`getAllCountries` stay global)
- Test: `__tests__/save-isolation/board-collision.test.ts`

The board-collision test is the concrete spec finding ("objectives keyed by (club_id, season) collide across saves"). Same `saveId`-after-`db` pattern everywhere.

- [ ] **Step 1: Write the failing test**

Create `__tests__/save-isolation/board-collision.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { createTestDbHandle } from '../database/test-helpers';
import { upsertBoardObjective, getBoardObjective } from '@/database/queries/board';

describe('board objectives isolation', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  beforeEach(() => {
    raw = new Database(':memory:');
    createAllTables(raw);
    db = createTestDbHandle(raw);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',1,'','')").run();
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',1,'','')").run();
  });
  afterEach(() => raw.close());

  it('same (club_id, season) in two saves coexist and do not overwrite', async () => {
    await upsertBoardObjective(db, 1, { clubId: 7, season: 1, type: 'league_position', target: 4, description: 'A wants top 4' });
    await upsertBoardObjective(db, 2, { clubId: 7, season: 1, type: 'survival', target: null, description: 'B must survive' });

    const a = await getBoardObjective(db, 1, 7, 1);
    const b = await getBoardObjective(db, 2, 7, 1);
    expect(a?.description).toBe('A wants top 4');
    expect(b?.description).toBe('B must survive');
  });

  it('upsert in save 1 re-runs without touching save 2', async () => {
    await upsertBoardObjective(db, 1, { clubId: 7, season: 1, type: 'league_position', target: 4, description: 'A v1' });
    await upsertBoardObjective(db, 2, { clubId: 7, season: 1, type: 'survival', target: null, description: 'B' });
    await upsertBoardObjective(db, 1, { clubId: 7, season: 1, type: 'league_position', target: 2, description: 'A v2' });
    expect((await getBoardObjective(db, 1, 7, 1))?.description).toBe('A v2');
    expect((await getBoardObjective(db, 2, 7, 1))?.description).toBe('B');
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

Run: `npx jest __tests__/save-isolation/board-collision.test.ts`
Expected: FAIL — `upsertBoardObjective`/`getBoardObjective` have no `saveId` param.

- [ ] **Step 3: Minimal implementation**

`src/database/queries/board.ts`:

```ts
export async function insertReputationHistory(db: DbHandle, saveId: number, entry: Omit<ReputationHistoryEntry, 'id'>): Promise<void> {
  await db.prepare('INSERT INTO club_reputation_history (save_id, club_id, season, reputation, delta) VALUES (?, ?, ?, ?, ?)').run(saveId, entry.clubId, entry.season, entry.reputation, entry.delta);
}
export async function getReputationHistory(db: DbHandle, saveId: number, clubId: number): Promise<ReputationHistoryEntry[]> {
  const rows = (await db.prepare('SELECT * FROM club_reputation_history WHERE save_id = ? AND club_id = ? ORDER BY season DESC').all(saveId, clubId)) as ReputationHistoryRow[];
  return rows.map((r) => ({ id: r.id, clubId: r.club_id, season: r.season, reputation: r.reputation, delta: r.delta }));
}

export async function upsertBoardObjective(db: DbHandle, saveId: number, obj: Omit<BoardObjective, 'id'>): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (?, ?, ?, ?, ?, ?)').run(saveId, obj.clubId, obj.season, obj.type, obj.target ?? null, obj.description);
}
export async function getBoardObjective(db: DbHandle, saveId: number, clubId: number, season: number): Promise<BoardObjective | null> {
  const row = (await db.prepare('SELECT * FROM board_objectives WHERE save_id = ? AND club_id = ? AND season = ?').get(saveId, clubId, season)) as BoardObjectiveRow | undefined;
  if (!row) return null;
  return { id: row.id, clubId: row.club_id, season: row.season, type: row.type as BoardObjectiveType, target: row.target, description: row.description };
}

export async function insertTrustHistory(db: DbHandle, saveId: number, entry: Omit<BoardTrustEntry, 'id'>): Promise<void> {
  await db.prepare('INSERT INTO board_trust_history (save_id, club_id, season, trust, outcome) VALUES (?, ?, ?, ?, ?)').run(saveId, entry.clubId, entry.season, entry.trust, entry.outcome);
}
export async function getTrustHistory(db: DbHandle, saveId: number, clubId: number): Promise<BoardTrustEntry[]> {
  const rows = (await db.prepare('SELECT * FROM board_trust_history WHERE save_id = ? AND club_id = ? ORDER BY season DESC').all(saveId, clubId)) as BoardTrustRow[];
  return rows.map((r) => ({ id: r.id, clubId: r.club_id, season: r.season, trust: r.trust, outcome: r.outcome as TrustOutcome }));
}
```

> `getSaveBoardTrust`/`updateSaveBoardTrust` already key off `save_games.id` — **leave unchanged**.

`src/database/queries/player-stats.ts`: add `save_id` to the INSERT in `upsertPlayerStats` and scope `getPlayerStatsByCompetition`:

```ts
export async function getPlayerStatsByCompetition(db: DbHandle, saveId: number, season: number, competitionId: number): Promise<PlayerStats[]> {
  const rows = await db.prepare('SELECT * FROM player_stats WHERE save_id = ? AND season = ? AND competition_id = ?').all(saveId, season, competitionId) as PlayerStatsRow[];
  return rows.map(rowToPlayerStats);
}
```
For `upsertPlayerStats(db, saveId, input)`: add `save_id` to the column list and `saveId` to the bind params (it currently uses `INSERT ... ON CONFLICT` on the `(player_id, season, competition_id)` PK — keep the PK; `save_id` is a stored attribute, the PK already keys per-save because `player_id` is per-save). `getPlayerStatsForPlayer(db, saveId, playerId)` adds `save_id = ? AND`.

`src/database/queries/finances.ts`: `addFinanceEntry(db, saveId, input)` adds `save_id` column; `getFinancesBySeason(db, saveId, clubId, season)` and `getSeasonBalance(db, saveId, clubId, season)` add `save_id = ? AND` (this directly fixes "club_finances wiped/collide").

`src/database/queries/tactics.ts`: `getActiveTactic(db, saveId, clubId)`, `updateTactic(db, saveId, tacticId, updates)`, `setTacticLineup(db, saveId, ...)`, `getTacticLineup(db, saveId, tacticId)`, `getTacticPositions(db, saveId, tacticId)` add `save_id` scope on the `tactics` row (positions/lineup stay per-owner via `tactic_id`, but pass `saveId` for the `tactics` lookups they JOIN/guard).

`src/database/queries/transfers.ts`: every function gains `saveId` after `db`; INSERTs (`createTransfer`, `createOffer`) add the `save_id` column; SELECT/UPDATE/DELETE add `save_id = ?`.

`src/database/queries/staff.ts`: `getStaffByClub(db, saveId, clubId)`, `getStaffByRole(db, saveId, role)` add `save_id = ?`.

`src/database/queries/history.ts`: `getSeasonSummary`, `getCompetitionHistory`, `getClubTrophies`, `getPlayerAwards`, `getPlayerTitles` add `saveId` and `save_id = ?` on the `season_*` tables they read.

`src/database/queries/leagues.ts`: `createCompetition(db, saveId, input)` and `addCompetitionEntry(db, saveId, input)` add the `save_id` column. `getAllLeagues(db)` and `getAllCountries(db)` are **reference — unchanged**.

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx jest __tests__/save-isolation/board-collision.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/queries/board.ts src/database/queries/player-stats.ts src/database/queries/finances.ts src/database/queries/tactics.ts src/database/queries/transfers.ts src/database/queries/staff.ts src/database/queries/history.ts src/database/queries/leagues.ts __tests__/save-isolation/board-collision.test.ts
git commit -m "feat(db): escopa board/stats/finances/tactics/transfers/staff/history/competitions por save_id"
```

---

### Task 7: `deleteSave` wipes the whole world transactionally

**Files:**
- Modify: `src/database/queries/saves.ts` (81-83)
- Test: `__tests__/save-isolation/delete-save.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/save-isolation/delete-save.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { deleteSave } from '@/database/queries/saves';

const WORLD = ['clubs','players','player_attributes','staff','tactics','board_objectives','board_trust_history','club_reputation_history'];

describe('deleteSave', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  const data = generateSeedData(42);

  beforeEach(() => {
    raw = new Database(':memory:');
    createAllTables(raw);
    db = createTestDbHandle(raw);
    seedReferenceTables(raw, data);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + data.clubs[0].id);
    seedWorldForSave(raw, data, 1);
    seedWorldForSave(raw, data, 2);
    // an assistant for each save
    raw.prepare("INSERT INTO assistants (club_id, save_id, role, name, age, archetype, retirement_age, wage_per_month) VALUES (?,1,'squad','Joe',40,'tactician',65,1000)").run(saveOffset(1)+data.clubs[0].id);
    raw.prepare("INSERT INTO assistants (club_id, save_id, role, name, age, archetype, retirement_age, wage_per_month) VALUES (?,2,'squad','Bob',40,'tactician',65,1000)").run(saveOffset(2)+data.clubs[0].id);
  });
  afterEach(() => raw.close());

  it('removes every world row of the deleted save and the assistants', async () => {
    await deleteSave(db, 2);
    for (const t of WORLD) {
      const c = (raw.prepare(`SELECT COUNT(*) c FROM ${t} WHERE save_id = 2`).get() as { c: number }).c;
      expect(c).toBe(0);
    }
    expect((raw.prepare('SELECT COUNT(*) c FROM assistants WHERE save_id = 2').get() as { c: number }).c).toBe(0);
    expect((raw.prepare('SELECT COUNT(*) c FROM save_games WHERE id = 2').get() as { c: number }).c).toBe(0);
  });

  it('does not touch save 1', async () => {
    const before = (raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id = 1').get() as { c: number }).c;
    await deleteSave(db, 2);
    expect((raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id = 1').get() as { c: number }).c).toBe(before);
    expect((raw.prepare('SELECT COUNT(*) c FROM save_games WHERE id = 1').get() as { c: number }).c).toBe(1);
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

Run: `npx jest __tests__/save-isolation/delete-save.test.ts`
Expected: FAIL — current `deleteSave` leaves world rows + assistants for save 2.

- [ ] **Step 3: Minimal implementation**

In `src/database/queries/saves.ts`, replace `deleteSave`:

```ts
const DELETE_BY_SAVE_TABLES = [
  'player_attributes', 'players', 'club_finances', 'competition_entries', 'fixtures',
  'transfers', 'transfer_offers', 'transfer_blocks', 'tactics', 'staff', 'board_objectives',
  'board_trust_history', 'club_reputation_history', 'season_competition_results',
  'season_relegated', 'season_awards', 'season_player_titles', 'player_stats',
  'competitions', 'assistants', 'clubs',
]; // children before parents (clubs last) so manual order works even without FK-on

export async function deleteSave(db: DbHandle, saveId: number): Promise<void> {
  // owner-derived tables first (no own save_id): match_events via fixtures, tactic_* via tactics
  await db.prepare('DELETE FROM match_events WHERE fixture_id IN (SELECT id FROM fixtures WHERE save_id = ?)').run(saveId);
  await db.prepare('DELETE FROM tactic_positions WHERE tactic_id IN (SELECT id FROM tactics WHERE save_id = ?)').run(saveId);
  await db.prepare('DELETE FROM tactic_lineup WHERE tactic_id IN (SELECT id FROM tactics WHERE save_id = ?)').run(saveId);
  for (const t of DELETE_BY_SAVE_TABLES) {
    await db.prepare(`DELETE FROM ${t} WHERE save_id = ?`).run(saveId);
  }
  await db.prepare('DELETE FROM save_games WHERE id = ?').run(saveId);
}
```

> Wrap in a transaction in the production store call site if available; the better-sqlite3 test path executes each statement immediately, which is fine for the assertions. (Coordinate with `db-hardening`, which owns transaction wrapping; the manual child-before-parent order keeps it correct without FK-on.)

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx jest __tests__/save-isolation/delete-save.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/queries/saves.ts __tests__/save-isolation/delete-save.test.ts
git commit -m "feat(db): deleteSave apaga o mundo inteiro do save (transacional, sem órfãos)"
```

---

### Task 8: `ensureSeasonFixtures(db, saveId, season)` + per-save offset (no season-1 cross-save collision)

**Files:**
- Modify: `src/engine/competition/calendar.ts` (157-238)
- Test: `__tests__/save-isolation/calendar-isolation.test.ts`

The season-1 raw-id collision is the root finding. Solution: id = `saveOffset(saveId) + seasonOffset + rawId`, where `seasonOffset` keeps the existing per-season spacing **inside** the save's space. Persisted rows carry `save_id`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/save-isolation/calendar-isolation.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';
import { getFixturesByWeek } from '@/database/queries/fixtures';

describe('ensureSeasonFixtures isolation (season 1)', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  const data = generateSeedData(42);

  beforeEach(() => {
    raw = new Database(':memory:');
    createAllTables(raw);
    db = createTestDbHandle(raw);
    seedReferenceTables(raw, data);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + data.clubs[0].id);
    seedWorldForSave(raw, data, 1);
    seedWorldForSave(raw, data, 2);
  });
  afterEach(() => raw.close());

  it('generates season-1 fixtures per save without colliding ids', async () => {
    await ensureSeasonFixtures(db, 1, 1);
    const aCount = (raw.prepare('SELECT COUNT(*) c FROM fixtures WHERE save_id = 1').get() as { c: number }).c;
    await ensureSeasonFixtures(db, 2, 1); // must NOT wipe save 1
    const aAfter = (raw.prepare('SELECT COUNT(*) c FROM fixtures WHERE save_id = 1').get() as { c: number }).c;
    expect(aCount).toBeGreaterThan(0);
    expect(aAfter).toBe(aCount);
    // disjoint id spaces
    const maxA = (raw.prepare('SELECT MAX(id) m FROM fixtures WHERE save_id = 1').get() as { m: number }).m;
    const minB = (raw.prepare('SELECT MIN(id) m FROM fixtures WHERE save_id = 2').get() as { m: number }).m;
    expect(maxA).toBeLessThan(minB);
  });

  it('getFixturesByWeek of save 1 never returns save 2 fixtures', async () => {
    await ensureSeasonFixtures(db, 1, 1);
    await ensureSeasonFixtures(db, 2, 1);
    const wk1A = await getFixturesByWeek(db, 1, 1, 1);
    expect(wk1A.every((f) => f.id >= saveOffset(1) && f.id < saveOffset(2))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it (expect FAIL)**

Run: `npx jest __tests__/save-isolation/calendar-isolation.test.ts`
Expected: FAIL — `ensureSeasonFixtures` has signature `(db, season)`, regen for save 2 deletes save-1's season-1 rows (global `DELETE ... WHERE season = ?`), ids collide.

- [ ] **Step 3: Minimal implementation**

In `src/engine/competition/calendar.ts`, change `ensureSeasonFixtures` to take `saveId` and scope all reads/deletes/inserts. Replace lines 157-238:

```ts
import { saveOffset } from '@/database/constants';

export async function ensureSeasonFixtures(db: DbHandle, saveId: number, season: number): Promise<boolean> {
  const existing = await db
    .prepare('SELECT COUNT(*) AS cnt FROM fixtures WHERE save_id = ? AND season = ?')
    .get(saveId, season) as { cnt: number };
  if (existing.cnt >= 100) return false;

  // Wipe partial state for THIS save's season only.
  await db.prepare('DELETE FROM match_events WHERE fixture_id IN (SELECT id FROM fixtures WHERE save_id = ? AND season = ?)').run(saveId, season);
  await db.prepare('DELETE FROM fixtures WHERE save_id = ? AND season = ?').run(saveId, season);
  await db.prepare('DELETE FROM competition_entries WHERE competition_id IN (SELECT id FROM competitions WHERE save_id = ? AND season = ?)').run(saveId, season);
  await db.prepare('DELETE FROM competitions WHERE save_id = ? AND season = ?').run(saveId, season);

  const allLeagues = await getAllLeagues(db); // reference, unscoped
  const clubsByLeague: Record<number, number[]> = {};
  const championsLeagueClubs: number[] = [];
  for (const league of allLeagues) {
    const leagueClubs = await getClubsByLeague(db, saveId, league.id);
    const sorted = [...leagueClubs].sort((a, b) => b.reputation - a.reputation);
    clubsByLeague[league.id] = leagueClubs.map(c => c.id);
    for (const c of sorted.slice(0, 2)) {
      if (championsLeagueClubs.length < 8) championsLeagueClubs.push(c.id);
    }
  }
  if (championsLeagueClubs.length < 8) {
    const allIds = Object.values(clubsByLeague).flat();
    for (const id of allIds) {
      if (!championsLeagueClubs.includes(id) && championsLeagueClubs.length < 8) championsLeagueClubs.push(id);
    }
  }

  // clubsByLeague already carries per-save club ids (saveOffset applied by getClubsByLeague).
  const calendar = generateSeasonCalendar({ season, leagues: allLeagues, clubsByLeague, championsLeagueClubs });

  // Per-season spacing inside the save's id space.
  const off = saveOffset(saveId);
  const compIdOffset = off + (season > 1 ? season * 10000 : 0);
  const fixtureIdOffset = off + (season > 1 ? season * 100000 : 0);

  for (const comp of calendar.competitions) {
    await createCompetition(db, saveId, { id: comp.id + compIdOffset, name: comp.name, type: comp.type, format: comp.format, season, leagueId: comp.leagueId });
  }
  for (const entry of calendar.entries) {
    await addCompetitionEntry(db, saveId, { competitionId: entry.competitionId + compIdOffset, clubId: entry.clubId, groupName: entry.groupName, seed: entry.seed });
  }
  for (const fixture of calendar.fixtures) {
    await createFixture(db, saveId, {
      id: fixture.id + fixtureIdOffset,
      competitionId: fixture.competitionId + compIdOffset,
      season,
      week: fixture.week,
      round: fixture.round !== null ? String(fixture.round) : null,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
    });
  }
  return true;
}
```

> `generateSeasonCalendar` produces `clubId` values from `clubsByLeague`, which already contain per-save (offset) club ids — so `homeClubId`/`awayClubId`/`entry.clubId` are correct without further offsetting. Verify by reading `generateSeasonCalendar` before editing; if it re-derives club ids from `leagues`/raw seed, pass the offset club ids through unchanged (the function consumes the provided `clubsByLeague`).

- [ ] **Step 4: Run it (expect PASS)**

Run: `npx jest __tests__/save-isolation/calendar-isolation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/competition/calendar.ts __tests__/save-isolation/calendar-isolation.test.ts
git commit -m "feat(engine): ensureSeasonFixtures escopado por save + offset de IDs (sem colisão season-1)"
```

---

### Task 9: Wire `NewGameScreen` — seed per save instead of global DELETEs

**Files:**
- Modify: `src/screens/NewGameScreen.tsx` (151-270+; the global-DELETE block at 204-218, calendar block at 219-270)
- No unit test (UI screen). Browser-validated in Task 11.

- [ ] **Step 1: Replace the global wipe with `seedWorldForSave`**

After `createSave(...)` (line 156-162) and `startNewGame(...)` (164), seed THIS save's world before any club/objective query. Insert right after `startNewGame(...)`:

```ts
      // Seed this save's own world (clubs/players/staff/tactics with offset ids).
      const seedData = generateSeedData(2026);
      const worldSQL = generateWorldSeedSQLForSave(seedData, saveId);
      await db!.execAsync(worldSQL);
```

(Import `generateSeedData` from `../../scripts/generate-seed-data` and `generateWorldSeedSQLForSave` from `@/database/seed`. `selectedClub.id` becomes the per-save club id: use `saveOffset(saveId) + selectedClub.id` wherever a club id is passed to scoped queries below. Import `saveOffset` from `@/database/constants`.)

Delete the entire global-DELETE block (lines 208-218: `DELETE FROM match_events ... DELETE FROM club_finances;`). It is replaced by per-save seeding + scoped calendar.

- [ ] **Step 2: Pass `saveId` and offset club ids to every query in this handler**

Concrete edits in `handleStartGame`:

- `upsertBoardObjective(dbHandle, saveId, { clubId: saveOffset(saveId) + selectedClub.id, season: 1, ... })`
- `setCurrentObjective({ ..., clubId: saveOffset(saveId) + selectedClub.id, ... })`
- assistants loop: `generateAssistant({ role, clubId: saveOffset(saveId) + selectedClub.id, saveId, rng })`
- `const club = await getClubById(dbHandle, saveId, saveOffset(saveId) + selectedClub.id);`
- calendar block (219-270): replace the manual loop with a single call `await ensureSeasonFixtures(dbHandle, saveId, 1);` (now scoped + offset), removing the duplicated inline competition/entry/fixture loops. Import `ensureSeasonFixtures` from `@/engine/competition/calendar`.

- [ ] **Step 3: Type-check this file in isolation**

Run: `npx tsc --noEmit` (will still show errors in other unmigrated screens — focus on NewGameScreen lines being green; full green at Task 10).

- [ ] **Step 4: Commit**

```bash
git add src/screens/NewGameScreen.tsx
git commit -m "feat(ui): NewGameScreen seeda o mundo do save (sem DELETEs globais) + calendário escopado"
```

---

### Task 10: Wire `EndOfSeasonScreen`, `HomeScreen`, `game-loop`, remaining screens → `tsc` green

**Files:**
- Modify: `src/engine/game-loop.ts` (324 onward — thread `saveId` into internal query calls), `src/screens/EndOfSeasonScreen.tsx` (395-514), `src/screens/home/HomeScreen.tsx`, and any other screen the compiler flags.
- No new unit test (covered by anchor test in Task 11). UI browser-validated in Task 11.

- [ ] **Step 1: Youth gen per-save MAX(id) + offset (EndOfSeasonScreen)**

Replace line 405:

```ts
        const maxIdRow = await dbHandle.prepare('SELECT MAX(id) as maxId FROM players WHERE save_id = ?').get(saveId) as { maxId: number };
        let nextId = (maxIdRow?.maxId ?? saveOffset(saveId)) + 1;
```

Add `save_id` to the youth INSERTs (players + player_attributes) — include `saveId` in the column list and bind params. Use `saveOffset(saveId) + playerClubId` if `playerClubId` is still the raw seed id; prefer reading `currentSave.id` and the already-offset `playerClubId` from the store (it should already be the per-save club id after Task 9 wiring). Replace the calendar persistence (468-514) with `await ensureSeasonFixtures(dbHandle, saveId, newSeason);`.

> Source `saveId` at the top of the handler: `const saveId = useGameStore.getState().currentSave?.id; if (!saveId) return;` (or from the existing `currentSave` in scope). Import `saveOffset` from `@/database/constants`.

- [ ] **Step 2: Thread `saveId` through `game-loop.ts`**

`advanceGameWeek` already destructures `saveId` (line 324). Add `saveId` as the 2nd argument to every scoped query it calls (`getPlayersByClub(db, saveId, clubId)`, `getClubById(db, saveId, clubId)`, `updateFixtureResult(db, saveId, ...)`, `upsertBoardObjective(db, saveId, ...)`, fixtures/finances/transfers/stats calls, `ensureSeasonFixtures(db, saveId, season)`). The compiler enumerates them. `getAssistantsBySave`/`updateSaveWeek`/`getSaveBoardTrust` already take `saveId` — unchanged.

- [ ] **Step 3: HomeScreen + other screens**

`HomeScreen.tsx`: read `const saveId = currentSave?.id;` (guard `if (!currentSave) return;` at line 199 already exists) and pass `saveId` + offset club id to `ensureSeasonFixtures`, `getFixturesByClub`, `getNextFixtureForClub`, `getRecentFixturesForClub`, `getClubById`, `getPlayersByClub`, `getActiveTactic`, etc. Repeat for every screen `tsc` flags (Club/Tactics/Reports/Transfer/Finance/Squad screens): inject `currentSave.id` as `saveId`.

- [ ] **Step 4: Full type-check (the safety net closes)**

Run: `npx tsc --noEmit`
Expected: exit 0. Any remaining error is an unmigrated call site — fix it (that is the point of the required `saveId` param).

- [ ] **Step 5: Commit**

```bash
git add src/engine/game-loop.ts src/screens/EndOfSeasonScreen.tsx src/screens/home/HomeScreen.tsx src/screens
git commit -m "feat: propaga saveId por game-loop + telas; youth/calendar por save; tsc verde"
```

---

### Task 11: Anchor isolation test + legacy reseed path + full verification + browser

**Files:**
- Modify: `src/store/database-store.ts` (seed block 187-197 — stop wiping world tables globally; only seed reference tables on empty)
- Test: `__tests__/save-isolation/anchor-isolation.test.ts`

- [ ] **Step 1: Write the anchor test**

Create `__tests__/save-isolation/anchor-isolation.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { getPlayersByClub, updatePlayerMorale } from '@/database/queries/players';
import { updateClubBudget, getClubById } from '@/database/queries/clubs';
import { deleteSave } from '@/database/queries/saves';

describe('ANCHOR: playing save A never mutates save B', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  const data = generateSeedData(42);
  const club = data.clubs[0];

  beforeEach(() => {
    raw = new Database(':memory:');
    createAllTables(raw);
    db = createTestDbHandle(raw);
    seedReferenceTables(raw, data);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + club.id);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + club.id);
    seedWorldForSave(raw, data, 1);
    seedWorldForSave(raw, data, 2);
  });
  afterEach(() => raw.close());

  it('budget/morale changes in A leave B identical', async () => {
    const clubA = saveOffset(1) + club.id;
    const clubB = saveOffset(2) + club.id;
    const bBefore = await getPlayersByClub(db, 2, clubB);

    await updateClubBudget(db, 1, clubA, 999);
    const aPlayers = await getPlayersByClub(db, 1, clubA);
    await updatePlayerMorale(db, 1, aPlayers[0].id, 1);

    const bAfter = await getPlayersByClub(db, 2, clubB);
    expect(bAfter).toEqual(bBefore);
    expect((await getClubById(db, 2, clubB))?.budget).not.toBe(999);
  });

  it('deleting B does not touch A', async () => {
    const aBefore = (raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id=1').get() as { c: number }).c;
    await deleteSave(db, 2);
    expect((raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id=1').get() as { c: number }).c).toBe(aBefore);
    expect((raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id=2').get() as { c: number }).c).toBe(0);
  });
});
```

- [ ] **Step 2: Run it (expect PASS — all wiring done)**

Run: `npx jest __tests__/save-isolation/anchor-isolation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Fix the global reseed-on-empty (database-store)**

In `src/store/database-store.ts` (187-197), the empty-DB seed must NOT clear/seed world tables globally (a fresh save now seeds its own world via NewGameScreen). Change the block to seed only reference tables on empty:

```ts
      const countryCount = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM countries');
      if (!countryCount || countryCount.cnt === 0) {
        await db.execAsync('DELETE FROM leagues; DELETE FROM countries;');
        const data = generateSeedData(2026);
        await db.execAsync(generateReferenceSeedSQL(data)); // countries + leagues only
      }
```

Add `generateReferenceSeedSQL(data)` to `src/database/seed.ts` (the countries+leagues halves of `generateSeedSQL`, lines 60-66). Keep `generateSeedSQL` for any remaining callers, or update them.

> This removes the destructive `DELETE FROM players/clubs/...` on boot — the spec's "new game wipes other saves" finding's last vector.

- [ ] **Step 4: Full suite + type-check**

Run: `npx jest 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green — baseline 536 + ~17 new isolation tests, 0 failures. If a legacy non-isolation test fails because it called a now-2-arg query, fix the call (pass a `saveId`, e.g. `1`, and seed via `seedWorldForSave(db, data, 1)` in that test's setup).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Browser validation (Playwright MCP)**

Start the web server (harness background: `CI=1 npx expo start --web --port 19006`; navigate `localhost:8082`). Then:
- New Game → pick club X → start. Note squad/budget/next fixture.
- Back to MainMenu → New Game → pick club Y → start. Play 1 week.
- MainMenu → Load the **first** save → confirm its squad, budget, calendar, and finances are intact (the original "new game wipes other saves" bug is gone).
- MainMenu → Delete the second save → confirm the first is untouched and the deleted one is gone.
- Sanity: console has no SQLite errors (no `NOT NULL constraint failed: *.save_id`, no `UNIQUE` violations).

- [ ] **Step 6: Commit + push (with user authorization)**

```bash
git add src/store/database-store.ts src/database/seed.ts __tests__/save-isolation/anchor-isolation.test.ts
git commit -m "feat(db): seed apenas referência no boot (sem wipe global) + teste-âncora de isolamento"
git push origin main
```

---

## Sequencing & dependencies

- **Strict order:** Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Tasks 1-4 build the foundation (id space, schema, migration, seed). Tasks 5-6 break call-site types on purpose; Tasks 9-10 fix them; **`tsc --noEmit` is only expected green at the end of Task 10**. The anchor test (Task 11) needs all query scoping (5-8) done.
- **Within Tasks 5-6** the query modules are independent and could be split across parallel subagents, but each leaves `tsc` red, so re-converge before Task 9.
- **Cross-epic:**
  - `db-hardening` **owns** transaction wrapping (use it to wrap `deleteSave`/`seedWorldForSave` in the store), composite-index consolidation (the indexes added in Task 2 are proposed here; let `db-hardening` own the final set), FK-on in tests, and any table-rebuild needed to enforce the new `UNIQUE(save_id, …)` on **legacy** DBs (this epic only guarantees the new constraints on fresh DBs; legacy is mitigated by single-save adoption in Task 3).
  - `match-consequences` (`suspension_weeks_left`), `progression-wired` (`training_focus`), `competitions-real` (`season_promoted`, knockout state) add their columns/tables **with `save_id`** following this epic's pattern; they must rebase onto the new `(db, saveId, …)` signatures.
- **Assumed handled by siblings (do not redesign):** the migration mechanism (`addColumnIfMissing` + `CREATE … IF NOT EXISTS`) is shared with `db-hardening`; FK-on in tests is `db-hardening`'s switch.

## Definition of done

- `npx tsc --noEmit` exits 0 (every world query call site migrated to `(db, saveId, …)`).
- `npx jest` fully green: baseline 536 tests + the new isolation suites (`constants`, `schema-save-id`, `migration-save-id`, `seed-world`, `scoped-queries`, `board-collision`, `delete-save`, `calendar-isolation`, `anchor-isolation`), 0 failures.
- Browser-validated (Task 11 Step 5): creating/playing/deleting save B never alters save A — squad, budget, calendar, finances, board objectives all isolated; no `save_id` constraint errors in console.
- All commits landed; pushed only after user authorization.

---

## Self-review

- **Spec coverage (every gap → a task):**
  - "world tables have no save_id" → Tasks 2-3 (schema + migration). ✅
  - "save slots are an illusion / new game wipes other saves" → Tasks 9 (seed per save, drop global DELETEs) + 11 Step 3 (boot no longer wipes world) + anchor test. ✅
  - "starting a new game globally deletes season-1 data and finances" → Task 9 removes the `DELETE FROM fixtures WHERE season=1 … club_finances` block. ✅
  - "board objectives/trust/reputation keyed by (club_id, season) collide" → Task 2 (`UNIQUE(save_id, …)`) + Task 6 + `board-collision.test.ts`. ✅
  - "youth & fixture IDs from global MAX(id) collide" → Task 1 (id space) + Task 8 (calendar offset) + Task 10 Step 1 (`MAX(id) WHERE save_id=?`). ✅
  - "deleteSave orphans assistants/world" → Task 7 + `delete-save.test.ts`. ✅
  - "ensureSeasonFixtures season-1 raw-id collision" → Task 8 + `calendar-isolation.test.ts`. ✅
- **Placeholder scan:** no "TBD"/"similar to Task N"; every cited path/signature read from source (`schema.ts`, `database-store.ts`, `saves.ts`, `assistants.ts`, `seed.ts`, `players.ts`, `clubs.ts`, `board.ts`, `fixtures.ts`, `player-stats.ts`, `calendar.ts`, `game-loop.ts`, `NewGameScreen.tsx`, `EndOfSeasonScreen.tsx`, `game-store.ts`, `test-helpers.ts`).
- **Type/signature consistency:** the `saveId`-after-`db` convention matches the existing `assistants` precedent (`getAssistantsBySave(db, saveId)`); `createFixture`/`upsertBoardObjective`/`getClubsByLeague`/`getPlayersByClub` new signatures match their callers updated in Tasks 9-10. `DbHandle` import path (`@/database/queries/players`) unchanged. `better-sqlite3` type-only import in Task 3 flagged with a structural fallback to keep `tsc` clean.
- **Engine purity:** `save_id` enters `engine/` only as a parameter (`ensureSeasonFixtures(db, saveId, season)`, `AdvanceWeekParams.saveId`); no store import added to `engine/`.
