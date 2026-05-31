# Database Hardening (indexes, transactions, FK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make persistence fast and atomic — add `CREATE INDEX IF NOT EXISTS` on the hottest foreign keys, introduce a `DbHandle`-based `runInTransaction` helper wrapping the `setTacticLineup` / end-of-season rollover / new-game batches, and turn `foreign_keys = ON` in the test harness (matching runtime), fixing any integrity failures that surface.

**Architecture:** Three independent deliveries, all inside `src/database/` + the two batch screens + the test harness, with **zero changes to `engine/`**:
1. **Indexes** — appended as idempotent DDL to the tail of `SCHEMA_SQL` (`src/database/schema.ts`). Applied automatically at runtime boot (`database-store.ts:67` runs `db.execAsync(SCHEMA_SQL)`) and in tests (`createAllTables` → `db.exec(SCHEMA_SQL)`). No migration framework — same idempotent string re-run on boot, consistent with how `save-isolation`/`db-hardening` siblings evolve the schema.
2. **Transactions** — a new pure `src/database/transaction.ts` exporting `runInTransaction<T>(db: DbHandle, fn) : Promise<T>` that drives `BEGIN`/`COMMIT`/`ROLLBACK` via `db.prepare(...).run()` (the only interface common to both `wrapExpoDb` and `createTestDbHandle`). `setTacticLineup`, `handleContinue` (end-of-season rollover) and `handleStartGame` (new game) wrap their multi-write batch in it.
3. **FK in tests** — `createTestDb` calls `db.pragma('foreign_keys = ON')` after `createAllTables`, matching runtime (`database-store.ts:65`). The single intentional local override in `game-loop.test.ts:334` stays.

**Tech Stack:** TypeScript 5.9 (strict), Jest 29 + ts-jest, `better-sqlite3` (tests, real in-memory DB — never mocked), `expo-sqlite` (runtime). React Native / Expo for the two screens. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-05-31-db-hardening-design.md`

### File Structure

| File | Create/Modify | Why |
|---|---|---|
| `src/database/schema.ts` | Modify (append ~10 `CREATE INDEX` to `SCHEMA_SQL`, before closing backtick at line 366) | Declare indexes on hot FKs; idempotent, applied in runtime + tests. |
| `src/database/transaction.ts` | **Create** | The single reusable atomicity helper; depends only on `DbHandle`. |
| `src/database/queries/tactics.ts` | Modify (`setTacticLineup`, lines 144-157) | Wrap DELETE + INSERT loop in `runInTransaction`. |
| `src/screens/EndOfSeasonScreen.tsx` | Modify (`handleContinue`, lines 325-530) | Rollover batch atomic; fix error `catch` to not advance week on failure (§7 of spec). |
| `src/screens/NewGameScreen.tsx` | Modify (`handleStartGame`, lines 204-282) | DELETE-cascade + fixture batch-insert atomic. |
| `__tests__/database/test-helpers.ts` | Modify (`createTestDb`, lines 6-10) | Turn FK ON to match runtime. |
| `__tests__/database/transaction.test.ts` | **Create** | TDD for the helper. |
| `__tests__/database/queries/tactics.test.ts` | **Create** | TDD for `setTacticLineup` atomicity + the existing read paths it touches. |
| `__tests__/database/schema.test.ts` | Modify (append index-existence + EXPLAIN cases) | Assert indexes are created. |

No changes to `src/store/database-store.ts` (its `wrapExpoDb` already provides `prepare().run()`; FK is already ON at runtime). No new tables, so `TABLE_NAMES` is untouched.

---

### Task 1: `runInTransaction` helper (atomicity primitive)

**Files:**
- Create: `src/database/transaction.ts`
- Test: `__tests__/database/transaction.test.ts`

This task has no dependency on FK being ON; it uses a tiny standalone table so it can run regardless of harness state.

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/transaction.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import { runInTransaction } from '@/database/transaction';

describe('runInTransaction', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    rawDb.exec('CREATE TABLE IF NOT EXISTS tx_probe (id INTEGER PRIMARY KEY, v TEXT NOT NULL);');
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('commits all writes when fn resolves', async () => {
    await runInTransaction(db, async () => {
      await db.prepare('INSERT INTO tx_probe (id, v) VALUES (1, ?)').run('a');
      await db.prepare('INSERT INTO tx_probe (id, v) VALUES (2, ?)').run('b');
    });
    const count = rawDb.prepare('SELECT COUNT(*) AS c FROM tx_probe').get() as { c: number };
    expect(count.c).toBe(2);
  });

  it('rolls back every write when fn throws mid-batch', async () => {
    await expect(
      runInTransaction(db, async () => {
        await db.prepare('INSERT INTO tx_probe (id, v) VALUES (1, ?)').run('a');
        await db.prepare('INSERT INTO tx_probe (id, v) VALUES (2, ?)').run('b');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const count = rawDb.prepare('SELECT COUNT(*) AS c FROM tx_probe').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('propagates the return value of fn', async () => {
    const result = await runInTransaction(db, async () => {
      await db.prepare('INSERT INTO tx_probe (id, v) VALUES (1, ?)').run('a');
      return 42;
    });
    expect(result).toBe(42);
  });

  it('propagates the original error, not a ROLLBACK error', async () => {
    await expect(
      runInTransaction(db, async () => {
        throw new Error('original-cause');
      }),
    ).rejects.toThrow('original-cause');
  });

  it('throws on nested transactions (no savepoints by design)', async () => {
    await expect(
      runInTransaction(db, async () => {
        await runInTransaction(db, async () => {
          await db.prepare('INSERT INTO tx_probe (id, v) VALUES (1, ?)').run('a');
        });
      }),
    ).rejects.toThrow(/within a transaction/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/database/transaction.test.ts`
Expected: FAIL — `Cannot find module '@/database/transaction'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/database/transaction.ts`:

```ts
import { DbHandle } from './queries/players';

/**
 * Runs `fn` inside a single SQLite transaction on the given handle.
 * Commits on success, rolls back on any error and re-throws the original error.
 * Backend-agnostic: drives BEGIN/COMMIT/ROLLBACK via DbHandle.prepare().run(),
 * the only interface common to wrapExpoDb (runtime) and createTestDbHandle (tests).
 * Does NOT support nesting — a nested call throws "cannot start a transaction
 * within a transaction", which is intentional (no savepoints; surface the bug).
 */
export async function runInTransaction<T>(
  db: DbHandle,
  fn: () => Promise<T>,
): Promise<T> {
  await db.prepare('BEGIN').run();
  try {
    const result = await fn();
    await db.prepare('COMMIT').run();
    return result;
  } catch (err) {
    try {
      await db.prepare('ROLLBACK').run();
    } catch {
      // Transaction already aborted by SQLite; swallow so the original error surfaces.
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/database/transaction.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add src/database/transaction.ts __tests__/database/transaction.test.ts
git commit -m "feat(db): runInTransaction helper para atomicidade dos batches multi-write"
```

---

### Task 2: Indexes on hot foreign keys

**Files:**
- Modify: `src/database/schema.ts` (append `CREATE INDEX IF NOT EXISTS` block before the closing backtick at line 366)
- Test: `__tests__/database/schema.test.ts` (append two `it(...)` cases after line 68)

- [ ] **Step 1: Write the failing tests**

Append these two cases inside the `describe('Database Schema', ...)` block in `__tests__/database/schema.test.ts`, right before the closing `});` of the describe (after the existing "is idempotent" test at line 68):

```ts
  it('creates indexes on the hottest foreign keys', () => {
    createAllTables(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    for (const expected of [
      'idx_players_club',
      'idx_fixtures_season_week',
      'idx_fixtures_home',
      'idx_fixtures_away',
      'idx_finances_club_season',
      'idx_match_events_fixture',
      'idx_comp_entries_club',
      'idx_player_stats_season',
      'idx_transfer_offers_status',
      'idx_transfer_offers_club',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('uses idx_players_club for a club_id lookup (query plan)', () => {
    createAllTables(db);
    const plan = db
      .prepare('EXPLAIN QUERY PLAN SELECT * FROM players WHERE club_id = ?')
      .all(1) as { detail: string }[];
    const usesIndex = plan.some((row) => /USING\b.*\bINDEX idx_players_club/.test(row.detail));
    expect(usesIndex).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/database/schema.test.ts`
Expected: FAIL — `expect(received).toContain('idx_players_club')` (indexes not yet declared); the query-plan case fails too.

- [ ] **Step 3: Write the minimal implementation**

In `src/database/schema.ts`, append the following block immediately after the existing index declarations (after `CREATE INDEX IF NOT EXISTS idx_assistants_club ON assistants(club_id);` on line 365, and before the closing backtick `` ` `` on line 366):

```sql
CREATE INDEX IF NOT EXISTS idx_players_club           ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_season_week   ON fixtures(season, week);
CREATE INDEX IF NOT EXISTS idx_fixtures_home          ON fixtures(home_club_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_away          ON fixtures(away_club_id);
CREATE INDEX IF NOT EXISTS idx_finances_club_season   ON club_finances(club_id, season);
CREATE INDEX IF NOT EXISTS idx_match_events_fixture   ON match_events(fixture_id);
CREATE INDEX IF NOT EXISTS idx_comp_entries_club      ON competition_entries(club_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_season    ON player_stats(season, competition_id);
CREATE INDEX IF NOT EXISTS idx_transfer_offers_status ON transfer_offers(status);
CREATE INDEX IF NOT EXISTS idx_transfer_offers_club   ON transfer_offers(offering_club_id);
```

Note: `transfer_offers` is created with all its columns inline (`schema.ts:203-217`, including `status` at line 210 and `offering_club_id` at line 206), so the index DDL is valid against the schema as defined in `SCHEMA_SQL`. All referenced tables/columns exist in `SCHEMA_SQL`: `players.club_id` (75), `fixtures(season,week,home_club_id,away_club_id)` (171-175), `club_finances(club_id,season)` (143-144), `match_events.fixture_id` (184), `competition_entries.club_id` (162), `player_stats(season,competition_id)` (119-120).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/database/schema.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add src/database/schema.ts __tests__/database/schema.test.ts
git commit -m "feat(db): índices nas FKs quentes (players.club_id, fixtures, finances, etc.)"
```

---

### Task 3: `setTacticLineup` atomicity

**Files:**
- Modify: `src/database/queries/tactics.ts` (`setTacticLineup`, lines 144-157)
- Test: `__tests__/database/queries/tactics.test.ts` **(new)**

This task is ordered **after Task 5** (FK ON in the harness) because the atomicity test forces a mid-loop failure by inserting a `player_id` that violates the `tactic_lineup.player_id REFERENCES players(id)` FK (`schema.ts:254`) — which only throws when FK enforcement is ON. See "Sequencing & dependencies". The implementation itself (wrapping in `runInTransaction`) does not depend on FK and could ship earlier; the test does.

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/queries/tactics.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { setTacticLineup, getTacticLineup } from '@/database/queries/tactics';

describe('setTacticLineup', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let tacticId: number;
  let realPlayerIds: number[];

  beforeEach(() => {
    rawDb = createTestDb(); // FK is ON (Task 5)
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const tactic = rawDb.prepare('SELECT id FROM tactics LIMIT 1').get() as { id: number };
    tacticId = tactic.id;
    realPlayerIds = (rawDb.prepare('SELECT id FROM players LIMIT 18').all() as { id: number }[]).map((r) => r.id);
  });
  afterEach(() => rawDb.close());

  it('persists starters then bench in slot order', async () => {
    const starters = realPlayerIds.slice(0, 11);
    const bench = realPlayerIds.slice(11, 18);
    await setTacticLineup(db, tacticId, starters, bench);

    const lineup = await getTacticLineup(db, tacticId);
    expect(lineup).not.toBeNull();
    expect(lineup!.starterIds).toEqual(starters);
    expect(lineup!.benchIds).toEqual(bench);
  });

  it('replaces an existing lineup wholesale', async () => {
    await setTacticLineup(db, tacticId, realPlayerIds.slice(0, 11), realPlayerIds.slice(11, 18));
    const newStarters = realPlayerIds.slice(7, 18);
    await setTacticLineup(db, tacticId, newStarters, []);

    const lineup = await getTacticLineup(db, tacticId);
    expect(lineup!.starterIds).toEqual(newStarters);
    expect(lineup!.benchIds).toEqual([]);
  });

  it('is atomic: an invalid player mid-batch leaves the previous lineup intact', async () => {
    const original = realPlayerIds.slice(0, 11);
    await setTacticLineup(db, tacticId, original, []);

    // Build a batch whose 3rd element is a non-existent player_id (FK violation).
    const broken = [realPlayerIds[0], realPlayerIds[1], 999999, ...realPlayerIds.slice(2, 10)];
    await expect(setTacticLineup(db, tacticId, broken, [])).rejects.toThrow();

    // The opening DELETE must have been rolled back too — original lineup survives.
    const lineup = await getTacticLineup(db, tacticId);
    expect(lineup).not.toBeNull();
    expect(lineup!.starterIds).toEqual(original);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/database/queries/tactics.test.ts`
Expected: FAIL — the atomicity case fails: without a transaction the opening `DELETE FROM tactic_lineup` already committed, so `getTacticLineup` returns `null` (or partial) instead of `original`.

- [ ] **Step 3: Write the minimal implementation**

In `src/database/queries/tactics.ts`, add the import at the top (after line 13 `import { DbHandle } from './players';`):

```ts
import { runInTransaction } from '../transaction';
```

Replace `setTacticLineup` (lines 144-157) with:

```ts
export async function setTacticLineup(
  db: DbHandle,
  tacticId: number,
  starters: number[],
  bench: number[],
): Promise<void> {
  await runInTransaction(db, async () => {
    await db.prepare('DELETE FROM tactic_lineup WHERE tactic_id = ?').run(tacticId);
    const all = [...starters, ...bench];
    for (let i = 0; i < all.length; i++) {
      await db.prepare(
        'INSERT INTO tactic_lineup (tactic_id, slot_index, player_id) VALUES (?, ?, ?)',
      ).run(tacticId, i, all[i]);
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/database/queries/tactics.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Regression — the game-loop test that disables FK**

`game-loop.test.ts:331-340` deletes the lineup and inserts invalid IDs with FK OFF on purpose, then re-enables FK, then calls `advanceGameWeek`. It does **not** call `setTacticLineup`, so wrapping that function does not affect it. Confirm:

Run: `npx jest __tests__/engine/game-loop.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 6: Type-check + commit**

```bash
npx tsc --noEmit
git add src/database/queries/tactics.ts __tests__/database/queries/tactics.test.ts
git commit -m "fix(db): setTacticLineup atômico (DELETE + INSERTs em runInTransaction)"
```

---

### Task 4: Wrap end-of-season rollover and new-game in transactions (UI)

**Files:**
- Modify: `src/screens/EndOfSeasonScreen.tsx` (`handleContinue`, lines 325-530)
- Modify: `src/screens/NewGameScreen.tsx` (`handleStartGame`, lines 204-282)

No new unit test creates a React component harness here (these are screen handlers wired to real DB writes already covered structurally by Task 1's atomicity guarantee). Correctness of the wrap is verified by `tsc`, the existing suite, and the Playwright browser walk (Task 6). The atomicity *mechanism* is already unit-tested in Task 1.

#### 4a. EndOfSeasonScreen

- [ ] **Step 1: Add the import**

In `src/screens/EndOfSeasonScreen.tsx`, add after line 32 (`import { SeededRng } from '@/engine/rng';`):

```ts
import { runInTransaction } from '@/database/transaction';
```

- [ ] **Step 2: Wrap the batch and fix the error path**

The mutation batch is lines 330-515 (from `const newSeason = season;` through the fixtures loop). The success-side store updates (519-521) must run only **after** COMMIT. Restructure `handleContinue` (lines 325-530) so the whole DB batch is inside `runInTransaction`, and the `catch` no longer advances the week:

Wrap the batch: change the start of the `try` body so the batch runs inside the helper. Concretely, after `setStarting(true);` (line 327), replace the existing `try { ... } catch (err) { ... } finally { ... }` (lines 329-529) with:

```ts
    try {
      // The store's `season` is already the new season (set by advanceGameWeek).
      const newSeason = season;

      await runInTransaction(dbHandle, async () => {
        // 1. Age all non-retired players …
        await dbHandle
          .prepare('UPDATE players SET age = age + 1 WHERE club_id IS NOT NULL OR is_free_agent = 1')
          .run();

        // … (keep the ENTIRE existing batch body verbatim: steps 1b, 2, 2b, 3,
        //    4 youth generation, calendar generation, persist competitions/entries/fixtures —
        //    i.e. the current lines 341-515, unchanged, including their inner
        //    try/catch "May already exist" blocks which keep swallowing UNIQUE
        //    violations locally so they do NOT abort the transaction) …
      });

      // Runs only after COMMIT:
      setPendingAnnouncedRetirementIds([]);
      setNewSeason(false);
      updateWeek(newSeason, 1);
      navigation.navigate('Game');
    } catch (err) {
      // The transaction rolled the DB back to the pre-rollover state.
      // Do NOT advance the week / mark the season started — let the user retry.
      console.error('[EndOfSeason] rollover failed, rolled back:', err);
      setStarting(false);
      return;
    } finally {
      setStarting(false);
    }
```

Key behavioral changes vs. current code (spec §7):
- The success store mutations (`setPendingAnnouncedRetirementIds`/`setNewSeason(false)`/`updateWeek(newSeason, 1)`) move **inside the try, after the wrap** (were lines 519-521).
- `navigation.navigate('Game')` moves out of `finally` into the success path. On error we `return` without navigating, so a failed rollover keeps the user on the EndOfSeason screen to retry.
- The old `catch` (522-525) that did `setNewSeason(false); updateWeek(season, 1);` — i.e. advanced anyway after partial failure — is removed.
- The inner `try/catch` "May already exist" blocks (current lines 469-480, 486-495, 502-514) stay **as-is**: they capture locally and never re-throw, so they do not trigger ROLLBACK (spec §6).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

#### 4b. NewGameScreen

- [ ] **Step 4: Add the import**

In `src/screens/NewGameScreen.tsx`, add (alongside the existing imports, e.g. after the `@/store/database-store` import on line 16):

```ts
import { runInTransaction } from '@/database/transaction';
```

- [ ] **Step 5: Wrap the calendar batch in a single transaction**

The batch lives at lines 205-282 inside `handleStartGame`. Today it uses two raw `db!.execAsync` blocks (lines 208 and 277) that are **not** in the same transaction. Replace the multi-statement DELETE `execAsync` (lines 208-218) and the fixtures-insert `execAsync` (lines 277-279) so the whole sequence (deletes → generate → competitions/entries → batch fixture insert) runs inside one `runInTransaction(dbHandle, …)`. The DELETE block becomes individual `dbHandle.prepare(stmt).run()` calls so they share the helper's transaction; the bulk fixtures INSERT stays a single multi-VALUES statement for performance (line 272 comment is explicit about not reverting to per-row inserts).

Replace lines 205-282 (the `try { … } catch (err) { console.error(...) }`) with:

```ts
      try {
        await runInTransaction(dbHandle, async () => {
          // Limpa tudo que referencia competitions (FK chain) antes de regenerar o calendário.
          await dbHandle.prepare('DELETE FROM match_events WHERE fixture_id IN (SELECT id FROM fixtures WHERE season = 1)').run();
          await dbHandle.prepare('DELETE FROM player_stats WHERE competition_id IN (SELECT id FROM competitions WHERE season = 1)').run();
          await dbHandle.prepare('DELETE FROM season_player_titles WHERE competition_id IN (SELECT id FROM competitions WHERE season = 1)').run();
          await dbHandle.prepare('DELETE FROM season_awards WHERE competition_id IN (SELECT id FROM competitions WHERE season = 1)').run();
          await dbHandle.prepare('DELETE FROM season_competition_results WHERE competition_id IN (SELECT id FROM competitions WHERE season = 1)').run();
          await dbHandle.prepare('DELETE FROM fixtures WHERE season = 1').run();
          await dbHandle.prepare('DELETE FROM competition_entries').run();
          await dbHandle.prepare('DELETE FROM competitions WHERE season = 1').run();
          await dbHandle.prepare('DELETE FROM club_finances').run();

          const allLeagues = await getAllLeagues(dbHandle);
          const clubsByLeague: Record<number, number[]> = {};
          const championsLeagueClubs: number[] = [];

          for (const league of allLeagues) {
            const leagueClubs = await getClubsByLeague(dbHandle, league.id);
            const sorted = [...leagueClubs].sort((a, b) => b.reputation - a.reputation);
            clubsByLeague[league.id] = leagueClubs.map((c) => c.id);
            for (const c of sorted.slice(0, 2)) {
              if (championsLeagueClubs.length < 8) {
                championsLeagueClubs.push(c.id);
              }
            }
          }

          if (championsLeagueClubs.length < 8) {
            const allIds = Object.values(clubsByLeague).flat();
            for (const id of allIds) {
              if (!championsLeagueClubs.includes(id) && championsLeagueClubs.length < 8) {
                championsLeagueClubs.push(id);
              }
            }
          }

          const calendar = generateSeasonCalendar({
            season: 1,
            leagues: allLeagues,
            clubsByLeague,
            championsLeagueClubs,
          });

          for (const comp of calendar.competitions) {
            await createCompetition(dbHandle, {
              id: comp.id,
              name: comp.name,
              type: comp.type,
              format: comp.format,
              season: 1,
              leagueId: comp.leagueId,
            });
          }

          for (const entry of calendar.entries) {
            await addCompetitionEntry(dbHandle, {
              competitionId: entry.competitionId,
              clubId: entry.clubId,
              groupName: entry.groupName,
              seed: entry.seed,
            });
          }

          // Batch insert dos ~6k fixtures num único multi-VALUES — inserts individuais demoram minutos na web.
          const escape = (v: string | null) => v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`;
          const values = calendar.fixtures.map(f =>
            `(${f.id}, ${f.competitionId}, 1, ${f.week}, ${escape(f.round !== null ? String(f.round) : null)}, ${f.homeClubId}, ${f.awayClubId}, 0)`
          ).join(',\n');
          await dbHandle.prepare(
            `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, played) VALUES ${values}`
          ).run();
        });
      } catch (err) {
        console.error('[NewGame] calendar generation failed (rolled back):', err);
      }
```

Notes:
- The bulk fixtures statement moves from `db!.execAsync(... ';')` to `dbHandle.prepare(...).run()` (no trailing `;` needed) so it joins the helper's transaction. `wrapExpoDb` runs it via `runAsync`, which accepts a single statement — and this is a single `INSERT ... VALUES (...),(...)` so it is valid as one prepared statement.
- The `db!` raw handle is no longer used in this block; `dbHandle` is already in scope (destructured at line 49). Leave `db` destructured if other code paths use it (verify with `tsc`; if `db` becomes unused, remove it from the line-49 destructure to keep `tsc`/lint clean).

- [ ] **Step 6: Type-check + commit both screens**

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add src/screens/EndOfSeasonScreen.tsx src/screens/NewGameScreen.tsx
git commit -m "fix(db): rollover de fim-de-temporada e novo-jogo atômicos (runInTransaction)"
```

---

### Task 5: Turn `foreign_keys = ON` in the test harness + fix surfaced violations

**Files:**
- Modify: `__tests__/database/test-helpers.ts` (`createTestDb`, lines 6-10)
- Modify: any test whose seed inserts a child row before its parent (only those that newly fail)

This is the highest-blast-radius task (23 callers of `createTestDb`). Run it **last** so each prior task's tests are already green, and any new failure is unambiguously a pre-existing masked integrity violation.

- [ ] **Step 1: Capture the current full-suite baseline**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: baseline green (62 suites / 536 tests + the suites added in Tasks 1-3). Record the numbers.

- [ ] **Step 2: Turn FK ON in `createTestDb`**

In `__tests__/database/test-helpers.ts`, change `createTestDb` (lines 6-10) to enable the pragma after table creation, matching runtime (`database-store.ts:65`):

```ts
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  createAllTables(db);
  db.pragma('foreign_keys = ON');
  return db;
}
```

- [ ] **Step 3: Run the full suite and triage**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:|✕|FOREIGN KEY|foreign key"`
Expected: most suites stay green. Any **new** failure is an integrity violation previously masked. For each:
- If a test seeds a **child before its parent** (e.g. inserts `player_stats` before its `competitions(id)`, or `match_events` before `fixtures`): **reorder the seed inserts** so parents come first. Do **not** disable FK to make it pass.
- The intentional FK-OFF block in `game-loop.test.ts:334` already wraps its invalid-ID inserts; that override stays and its surrounding `advanceGameWeek` call should keep passing.
- `seedTestDb` (`test-helpers.ts:48-135`) already inserts in dependency order (countries → leagues → clubs → players → player_attributes → staff → tactics), so suites using it should not regress.

Use `superpowers:systematic-debugging` for any non-obvious failure: find the failing INSERT, confirm the missing parent row, fix the seed ordering at the root — never silence with `foreign_keys = OFF`.

- [ ] **Step 4: Confirm green with FK ON**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green (baseline + new suites), now with FK enforced everywhere except the single intentional `game-loop.test.ts` override.

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add __tests__/database/test-helpers.ts
# plus any test files reordered in Step 3:
# git add __tests__/<reordered-test>.ts
git commit -m "test(db): foreign_keys=ON no harness igualando runtime + correção de ordem de seed"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full suite + type-check**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green (536 baseline + ~10 new: 5 transaction + 2 schema + 3 tactics).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Browser validation (Playwright MCP) — the two wrapped screens**

The transaction wraps touch two real user flows; validate both in the browser (per the project's web-dev-server notes: start `CI=1 npx expo start --web --port 19006` via the harness background, navigate `localhost:8082`; restart with `--clear` after edits since CI mode does not hot-reload):
- **New Game**: MainMenu → New Game → pick ambition/country/club → START GAME → lands on Home with a populated calendar (fixtures exist for season 1, week 1). A successful run proves the wrapped DELETE+generate+insert committed.
- **End of Season**: advance weeks to season end (or load a save at the rollover) → EndOfSeason screen → Continue → lands on Home of the new season with week 1 and a fresh calendar; squad ages by 1, youth players appear. Proves the rollover committed atomically.
- Confirm no console errors and no "rolled back" log lines on the happy path.

- [ ] **Step 3: Push (with user authorization)**

```bash
git push origin main
```

---

## Sequencing & dependencies

- **Order: 1 → 2 → 4, then 5 → 3, then 6.**
  - **Task 1** (`runInTransaction`) is the prerequisite for Tasks 3 and 4 (they import it). No FK dependency.
  - **Task 2** (indexes) is fully independent — can land any time after baseline; placed early as a low-risk win.
  - **Task 4** (wrap the two screens) depends only on Task 1.
  - **Task 5** (FK ON in harness) must precede **Task 3**'s test, because the `setTacticLineup` atomicity test relies on an FK violation (`tactic_lineup.player_id REFERENCES players(id)`) to force a mid-batch error. Task 5 is also the highest-blast-radius change (23 `createTestDb` callers), so running it after Tasks 1-2-4 keeps any new failure unambiguously attributable to masked integrity bugs. The `setTacticLineup` *implementation* (wrapping) does not need FK and may be committed earlier; only its atomicity *test* needs FK ON — so 5-before-3 for the test, but the code change in 3 is safe at any point.
- **Cross-epic (`save-isolation`)**: that epic adds `save_id` to world tables. When it lands, the indexes from Task 2 should be re-derived as composite `(save_id, …)` (e.g. `idx_players_club` → `(save_id, club_id)`). Both epics edit `SCHEMA_SQL` in the same file → **merge order matters**: recommend db-hardening lands first, save-isolation rebases the indexes to composite (one line each, composite wins). No separate migration framework is introduced here — both rely on the idempotent `SCHEMA_SQL` re-run at boot (`database-store.ts:67`).
- **Cross-epic (`db-hardening` enables others)**: turning FK ON (Task 5) may surface integrity bugs that `match-consequences` (suspensions) and `competitions-real` (knockout rounds) must respect. Shipping FK ON early gives every sibling a more honest harness.
- **Cross-epic (`testable-orchestration`)**: if that epic extracts the end-of-season rollover out of `EndOfSeasonScreen` into an engine module, apply the `runInTransaction` wrap at the new engine location instead of the screen — the helper takes a `DbHandle`, so it travels with the batch. No hard ordering, only a question of *where* the wrap sits.

## Definition of done

- `npx tsc --noEmit` exits 0.
- `npx jest --no-cache` green: 536 baseline + ~10 new tests, **with `foreign_keys = ON` in `createTestDb`** (the only FK-OFF being the intentional local override in `game-loop.test.ts:334`).
- All 10 indexes present (`idx_players_club`, `idx_fixtures_season_week`, `idx_fixtures_home`, `idx_fixtures_away`, `idx_finances_club_season`, `idx_match_events_fixture`, `idx_comp_entries_club`, `idx_player_stats_season`, `idx_transfer_offers_status`, `idx_transfer_offers_club`) and a query-plan assertion proves `idx_players_club` is used.
- `setTacticLineup`, end-of-season rollover, and new-game calendar generation each run inside a single transaction; a forced mid-batch failure leaves the DB at its prior state (unit-proven for the helper and `setTacticLineup`).
- Browser-validated: New Game and End-of-Season happy paths commit correctly (populated calendar, advanced season) with no rollback log lines.
- Each task committed separately with a `feat(db)`/`fix(db)`/`test(db)` message focused on the *why*.
