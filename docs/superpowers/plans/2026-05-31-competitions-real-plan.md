# Competitions Real — Knockouts, Promotion/Relegation, Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make cups and the Champions League progress round-by-round to a real champion (reputation-seeded byes + penalty shootouts), physically move clubs between divisions on promotion/relegation, eliminate calendar week collisions by moving every knockout to a dedicated post-league week band, and add a head-to-head league tiebreaker.

**Architecture:** Two new **pure** engine modules — `knockout.ts` (tie resolution + next-round generation + shootout) and `promotion.ts` (division swaps) — plus a shared standings comparator. A thin persistence hook `maybeGenerateNextKnockoutRound` in `game-loop.ts` drives knockout progression week by week after fixtures are simulated. `calendar.ts` reschedules all knockouts to weeks ≥ `KNOCKOUT_START_WEEK` so no club ever has two fixtures in one week. `season-archiver.ts` reads the persisted shootout winner. `EndOfSeasonScreen.tsx` applies the physical `UPDATE clubs SET league_id` swap before regenerating the new-season calendar. Engine modules import no React/Expo.

**Tech Stack:** TypeScript 5.9 (strict), Jest 29 + ts-jest, `better-sqlite3` real in-memory DB in tests (never mocked), Zustand, Expo/RN for the one UI task. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-05-31-competitions-real-design.md`

---

## File Structure

| File | Create/Modify | Why |
|---|---|---|
| `src/engine/competition/knockout.ts` | **Create** | Pure: `resolveKnockoutTie` (shootout via seeded RNG), `buildNextKnockoutRound`, `isKnockoutComplete`, `seedClChampionsKnockout`. |
| `src/engine/competition/promotion.ts` | **Create** | Pure: `computeDivisionSwaps` + `buildDivisionPairs`. |
| `src/engine/competition/standings.ts` | Modify | Add exported `compareStandings` comparator with head-to-head tiebreaker; reuse in `calculateStandings`. |
| `src/engine/competition/calendar.ts` | Modify | Reschedule knockouts to `KNOCKOUT_START_WEEK` band; fix bye math; CL group + knockout into post-league weeks. |
| `src/engine/competition/round-progression.ts` | **Create** | `maybeGenerateNextKnockoutRound(db, season, week, rng)` — persistence glue calling pure `knockout.ts`. |
| `src/engine/balance.ts` | Modify | `SEASON_END_WEEK` 46→58; add `KNOCKOUT_START_WEEK = 47`. |
| `src/engine/week-advance.ts` | Modify | Bump private `SEASON_LENGTH` 46→58 (legacy pure helper, keep in sync). |
| `src/engine/game-loop.ts` | Modify | Call `maybeGenerateNextKnockoutRound` after AI sim (line 556). |
| `src/engine/history/season-archiver.ts` | Modify | H2H comparator in private `computeStandings`; read `penalty_shootout` event for drawn final; write `season_promoted`. |
| `src/database/schema.ts` | Modify | Add `season_promoted` table + index; `'season_promoted'` to `TABLE_NAMES`. |
| `src/store/database-store.ts` | Modify | Idempotent `CREATE TABLE IF NOT EXISTS season_promoted` in `initialize`. |
| `src/types/match.ts` | Modify | Add `'penalty_shootout'` to `MatchEventType`. |
| `src/database/queries/season-promoted.ts` | **Create** | `insertPromotedIgnore`, `getPromotedForClub`. |
| `src/screens/EndOfSeasonScreen.tsx` | Modify | Apply division swaps + read `season_promoted` for `wasPromoted`, before calendar regen. |
| Tests (new) | **Create** | `__tests__/engine/competition/knockout.test.ts`, `promotion.test.ts`, `round-progression.test.ts`, `calendar-collisions.test.ts`, `__tests__/database/queries/season-promoted.test.ts`. |
| Tests (modify) | Modify | `calendar.test.ts`, `season-archiver.test.ts`, `standings.test.ts`, `game-loop.test.ts`, `week-advance.test.ts`. |

---

### Task 1: `season_promoted` schema + queries

**Files:**
- Modify: `src/database/schema.ts` (`TABLE_NAMES` line 1-30; `SCHEMA_SQL` after `season_relegated` at line 288; index block at line 359-365)
- Modify: `src/store/database-store.ts` (idempotent block near line 117-126)
- Create: `src/database/queries/season-promoted.ts`
- Test: `__tests__/database/queries/season-promoted.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/queries/season-promoted.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { insertPromotedIgnore, getPromotedForClub } from '@/database/queries/season-promoted';

describe('season_promoted queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('returns null when a club was not promoted that season', async () => {
    expect(await getPromotedForClub(db, 1, 1)).toBeNull();
  });

  it('inserts and reads a promotion row', async () => {
    // club 21 belongs to a lower (Championship) league in seed data; promote into league 1.
    await insertPromotedIgnore(db, 1, 1, 21, 2);
    const row = await getPromotedForClub(db, 1, 21);
    expect(row).toEqual({ leagueId: 1, finalPosition: 2 });
  });

  it('is idempotent on (season, league_id, club_id)', async () => {
    await insertPromotedIgnore(db, 1, 1, 21, 2);
    await insertPromotedIgnore(db, 1, 1, 21, 2);
    const cnt = rawDb
      .prepare('SELECT COUNT(*) AS c FROM season_promoted WHERE season = 1 AND club_id = 21')
      .get() as { c: number };
    expect(cnt.c).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/database/queries/season-promoted.test.ts`
Expected: FAIL — `Cannot find module '@/database/queries/season-promoted'` (then `no such table: season_promoted` once the module resolves).

- [ ] **Step 3: Minimal implementation**

In `src/database/schema.ts`, add `'season_promoted'` to `TABLE_NAMES` (after `'season_relegated'` on line 22):

```ts
  'season_relegated',
  'season_promoted',
```

Add the table inside `SCHEMA_SQL` immediately after the `season_relegated` block (after line 288):

```sql
CREATE TABLE IF NOT EXISTS season_promoted (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  season         INTEGER NOT NULL,
  league_id      INTEGER NOT NULL REFERENCES leagues(id),
  club_id        INTEGER NOT NULL REFERENCES clubs(id),
  final_position INTEGER NOT NULL,
  UNIQUE(season, league_id, club_id)
);
```

Add the index next to `idx_relegated_season` (after line 362):

```sql
CREATE INDEX IF NOT EXISTS idx_promoted_season ON season_promoted(season);
```

In `src/store/database-store.ts`, add an idempotent migration right after the `season_relegated` block (around line 126):

```ts
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS season_promoted (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          season         INTEGER NOT NULL,
          league_id      INTEGER NOT NULL REFERENCES leagues(id),
          club_id        INTEGER NOT NULL REFERENCES clubs(id),
          final_position INTEGER NOT NULL,
          UNIQUE(season, league_id, club_id)
        );
      `);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_promoted_season ON season_promoted(season);`);
```

Create `src/database/queries/season-promoted.ts`:

```ts
import { DbHandle } from './players';

export async function insertPromotedIgnore(
  db: DbHandle,
  season: number,
  leagueId: number,
  clubId: number,
  finalPosition: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_promoted
         (season, league_id, club_id, final_position)
       VALUES (?, ?, ?, ?)`,
    )
    .run(season, leagueId, clubId, finalPosition);
}

export async function getPromotedForClub(
  db: DbHandle,
  season: number,
  clubId: number,
): Promise<{ leagueId: number; finalPosition: number } | null> {
  const row = (await db
    .prepare(
      'SELECT league_id, final_position FROM season_promoted WHERE season = ? AND club_id = ? LIMIT 1',
    )
    .get(season, clubId)) as { league_id: number; final_position: number } | undefined;
  return row ? { leagueId: row.league_id, finalPosition: row.final_position } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/database/queries/season-promoted.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/schema.ts src/store/database-store.ts src/database/queries/season-promoted.ts __tests__/database/queries/season-promoted.test.ts
git commit -m "feat(db): tabela season_promoted + queries (espelho de season_relegated)"
```

---

### Task 2: Head-to-head standings tiebreaker (shared comparator)

**Files:**
- Modify: `src/engine/competition/standings.ts` (whole file — extract comparator, line 38 sort)
- Test: `__tests__/engine/competition/standings.test.ts` (append cases)

- [ ] **Step 1: Write the failing test**

Append to `__tests__/engine/competition/standings.test.ts` (it already imports `calculateStandings`; add an import for the new comparator at the top — `import { calculateStandings, compareStandings } from '@/engine/competition/standings';`):

```ts
import { Fixture } from '@/types';

function fx(id: number, home: number, away: number, hg: number, ag: number): Fixture {
  return {
    id, competitionId: 1, season: 1, week: 1, round: null,
    homeClubId: home, awayClubId: away, homeGoals: hg, awayGoals: ag,
    played: true, attendance: null,
  };
}

describe('calculateStandings — head-to-head tiebreaker', () => {
  it('ranks the H2H winner above a club equal on pts/GD/GF', () => {
    // Clubs 1 and 2 each beat club 3 by the same margin, so pts/GD/GF are equal,
    // but club 1 beat club 2 head-to-head 1-0 (which also feeds GD/GF — so make
    // the non-H2H games asymmetric to neutralise GD/GF and isolate H2H).
    const fixtures: Fixture[] = [
      fx(1, 1, 2, 1, 0), // club 1 beats club 2 (H2H)
      fx(2, 1, 3, 0, 1), // club 1 loses to 3
      fx(3, 2, 3, 1, 0), // club 2 beats 3
    ];
    // Totals: club1 pts3 GF1 GA1 GD0; club2 pts3 GF1 GA1 GD0 → equal on pts/GD/GF.
    const table = calculateStandings(fixtures, [1, 2, 3]);
    const ids = table.map((e) => e.clubId);
    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2)); // H2H winner first
  });

  it('falls back to clubId for fully-equal clubs (deterministic)', () => {
    const table = calculateStandings([], [5, 2, 9]);
    expect(table.map((e) => e.clubId)).toEqual([2, 5, 9]);
  });

  it('compareStandings is a pure comparator usable standalone', () => {
    const a = { clubId: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 0, goalDifference: 3, points: 3 };
    const b = { clubId: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 3, goalDifference: -3, points: 0 };
    expect(compareStandings(a, b, [])).toBeLessThan(0); // a ranks first
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/engine/competition/standings.test.ts`
Expected: FAIL — `compareStandings` is not exported; the H2H ordering assertion fails (current sort has no H2H).

- [ ] **Step 3: Minimal implementation**

Replace the sort tail of `src/engine/competition/standings.ts` (lines 36-39) and add the comparator. The comparator takes the played fixtures so it can build an H2H mini-table among tied clubs:

```ts
/**
 * Comparator: points → GD → GF → head-to-head (points then GD among the tied set)
 * → clubId (deterministic final fallback). `fixtures` is the full set of played
 * fixtures, used only to resolve the H2H sub-table.
 */
export function compareStandings(
  a: StandingsEntry,
  b: StandingsEntry,
  fixtures: Fixture[],
): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

  // Head-to-head between exactly a and b.
  let aPts = 0, bPts = 0, aGd = 0, bGd = 0;
  for (const f of fixtures) {
    if (!f.played || f.homeGoals === null || f.awayGoals === null) continue;
    const isAB = f.homeClubId === a.clubId && f.awayClubId === b.clubId;
    const isBA = f.homeClubId === b.clubId && f.awayClubId === a.clubId;
    if (!isAB && !isBA) continue;
    const aGoals = isAB ? f.homeGoals : f.awayGoals;
    const bGoals = isAB ? f.awayGoals : f.homeGoals;
    aGd += aGoals - bGoals; bGd += bGoals - aGoals;
    if (aGoals > bGoals) aPts += 3;
    else if (bGoals > aGoals) bPts += 3;
    else { aPts += 1; bPts += 1; }
  }
  if (bPts !== aPts) return bPts - aPts;
  if (bGd !== aGd) return bGd - aGd;

  return a.clubId - b.clubId;
}
```

Replace line 38's sort with:

```ts
  entries.sort((a, b) => compareStandings(a, b, fixtures));
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/engine/competition/standings.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/engine/competition/standings.ts __tests__/engine/competition/standings.test.ts
git commit -m "feat(standings): tiebreaker head-to-head + comparador puro reutilizável"
```

---

### Task 3: Knockout engine — tie resolution, shootout, next-round generation (pure)

**Files:**
- Create: `src/engine/competition/knockout.ts`
- Test: `__tests__/engine/competition/knockout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/competition/knockout.test.ts`:

```ts
import { SeededRng } from '@/engine/rng';
import {
  resolveKnockoutTie,
  buildNextKnockoutRound,
  isKnockoutComplete,
  seedClChampionsKnockout,
  PlayedKnockoutFixture,
} from '@/engine/competition/knockout';

const tie = (home: number, away: number, hg: number, ag: number): PlayedKnockoutFixture => ({
  homeClubId: home, awayClubId: away, homeGoals: hg, awayGoals: ag, round: 1,
});

describe('resolveKnockoutTie', () => {
  it('home win advances home, no shootout', () => {
    const w = resolveKnockoutTie(tie(10, 20, 2, 1), new SeededRng(1));
    expect(w.winnerClubId).toBe(10);
    expect(w.loserClubId).toBe(20);
    expect(w.viaShootout).toBe(false);
    expect(w.shootoutScore).toBeNull();
  });

  it('away win advances away, no shootout', () => {
    const w = resolveKnockoutTie(tie(10, 20, 0, 3), new SeededRng(1));
    expect(w.winnerClubId).toBe(20);
    expect(w.viaShootout).toBe(false);
  });

  it('draw is resolved by a shootout returning one of the two clubs', () => {
    const w = resolveKnockoutTie(tie(10, 20, 1, 1), new SeededRng(99));
    expect([10, 20]).toContain(w.winnerClubId);
    expect(w.viaShootout).toBe(true);
    expect(w.shootoutScore).not.toBeNull();
    const [wp, lp] = w.shootoutScore!;
    expect(wp).toBeGreaterThan(lp); // winner scored more penalties
    expect(wp).toBeLessThanOrEqual(10); // best-of-5 + bounded sudden death
  });

  it('shootout is deterministic for the same seed', () => {
    const a = resolveKnockoutTie(tie(10, 20, 1, 1), new SeededRng(99));
    const b = resolveKnockoutTie(tie(10, 20, 1, 1), new SeededRng(99));
    expect(a.winnerClubId).toBe(b.winnerClubId);
    expect(a.shootoutScore).toEqual(b.shootoutScore);
  });
});

describe('buildNextKnockoutRound', () => {
  const repAll = new Map<number, number>();

  it('8 winners → 4 fixtures in round N+1, no bye', () => {
    const { fixtures, byeClubIds } = buildNextKnockoutRound({
      competitionId: 5, season: 1, completedRound: 1,
      winners: [1, 2, 3, 4, 5, 6, 7, 8], pendingByeClubIds: [],
      week: 49, reputationByClubId: repAll,
    });
    expect(fixtures).toHaveLength(4);
    expect(fixtures.every((f) => f.round === 2)).toBe(true);
    expect(fixtures.every((f) => f.week === 49)).toBe(true);
    expect(byeClubIds).toEqual([]);
  });

  it('includes pending byes as participants in the next round', () => {
    const { fixtures } = buildNextKnockoutRound({
      competitionId: 5, season: 1, completedRound: 1,
      winners: [1, 2], pendingByeClubIds: [3, 4],
      week: 49, reputationByClubId: repAll,
    });
    const ids = fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it('odd survivors → highest-reputation club gets the bye', () => {
    const rep = new Map<number, number>([[1, 50], [2, 90], [3, 60]]);
    const { fixtures, byeClubIds } = buildNextKnockoutRound({
      competitionId: 5, season: 1, completedRound: 1,
      winners: [1, 2, 3], pendingByeClubIds: [],
      week: 49, reputationByClubId: rep,
    });
    expect(byeClubIds).toEqual([2]); // highest rep
    expect(fixtures).toHaveLength(1);
    const ids = [fixtures[0].homeClubId, fixtures[0].awayClubId].sort((a, b) => a - b);
    expect(ids).toEqual([1, 3]);
  });

  it('2 survivors → 1 final fixture', () => {
    const { fixtures } = buildNextKnockoutRound({
      competitionId: 5, season: 1, completedRound: 2,
      winners: [1, 2], pendingByeClubIds: [],
      week: 51, reputationByClubId: repAll,
    });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].round).toBe(3);
  });
});

describe('isKnockoutComplete', () => {
  it('true when exactly one club remains', () => {
    expect(isKnockoutComplete([7], [])).toBe(true);
    expect(isKnockoutComplete([], [7])).toBe(true);
  });
  it('false when two or more remain', () => {
    expect(isKnockoutComplete([7, 8], [])).toBe(false);
    expect(isKnockoutComplete([7], [8])).toBe(false);
  });
});

describe('seedClChampionsKnockout', () => {
  it('pairs group winners vs the other group runners-up', () => {
    const fixtures = seedClChampionsKnockout({
      competitionId: 9, season: 1, week: 49,
      groups: { A: [11, 12], B: [21, 22] }, // each group ordered 1st..2nd
    });
    // winner A (11) vs runner-up B (22); winner B (21) vs runner-up A (12)
    expect(fixtures).toHaveLength(2);
    expect(fixtures.every((f) => f.round === 1)).toBe(true);
    const pairs = fixtures.map((f) => [f.homeClubId, f.awayClubId]);
    expect(pairs).toContainEqual([11, 22]);
    expect(pairs).toContainEqual([21, 12]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/engine/competition/knockout.test.ts`
Expected: FAIL — `Cannot find module '@/engine/competition/knockout'`.

- [ ] **Step 3: Minimal implementation**

Create `src/engine/competition/knockout.ts`. Reuses `FixtureInput` from `fixture-generator.ts` and `SeededRng` from `rng.ts`:

```ts
import { SeededRng } from '@/engine/rng';
import { FixtureInput } from './fixture-generator';

export interface PlayedKnockoutFixture {
  homeClubId: number;
  awayClubId: number;
  homeGoals: number;
  awayGoals: number;
  round: number;
}

export interface KnockoutWinner {
  winnerClubId: number;
  loserClubId: number;
  viaShootout: boolean;
  shootoutScore: [number, number] | null; // [winner pens scored, loser pens scored]
}

/** Best-of-5 then sudden death, deterministic given the seeded rng. */
function penaltyShootout(
  homeClubId: number,
  awayClubId: number,
  rng: SeededRng,
): KnockoutWinner {
  let home = 0;
  let away = 0;
  // 5 regulation kicks each (kick converts with p≈0.75).
  for (let i = 0; i < 5; i++) {
    if (rng.next() < 0.75) home++;
    if (rng.next() < 0.75) away++;
  }
  // Sudden death, bounded so the score stays ≤ 10 (terminates deterministically).
  let extra = 0;
  while (home === away && extra < 5) {
    const h = rng.next() < 0.75 ? 1 : 0;
    const a = rng.next() < 0.75 ? 1 : 0;
    home += h; away += a;
    extra++;
  }
  // Guaranteed decider: if still level after bounded sudden death, the higher
  // single next kick decides; if both equal, lower clubId converts (deterministic).
  if (home === away) {
    if (rng.next() < 0.5) home++;
    else away++;
  }
  if (home >= away) {
    return { winnerClubId: homeClubId, loserClubId: awayClubId, viaShootout: true, shootoutScore: [home, away] };
  }
  return { winnerClubId: awayClubId, loserClubId: homeClubId, viaShootout: true, shootoutScore: [away, home] };
}

export function resolveKnockoutTie(
  fixture: PlayedKnockoutFixture,
  rng: SeededRng,
): KnockoutWinner {
  if (fixture.homeGoals > fixture.awayGoals) {
    return { winnerClubId: fixture.homeClubId, loserClubId: fixture.awayClubId, viaShootout: false, shootoutScore: null };
  }
  if (fixture.awayGoals > fixture.homeGoals) {
    return { winnerClubId: fixture.awayClubId, loserClubId: fixture.homeClubId, viaShootout: false, shootoutScore: null };
  }
  return penaltyShootout(fixture.homeClubId, fixture.awayClubId, rng);
}

export interface NextRoundInput {
  competitionId: number;
  season: number;
  completedRound: number;
  winners: number[];
  pendingByeClubIds: number[];
  week: number;
  reputationByClubId: Map<number, number>;
}

export function buildNextKnockoutRound(input: NextRoundInput): {
  fixtures: FixtureInput[];
  byeClubIds: number[];
} {
  const survivors = [...input.pendingByeClubIds, ...input.winners];
  const nextRound = input.completedRound + 1;
  const byeClubIds: number[] = [];
  const pool = [...survivors];

  if (pool.length % 2 === 1) {
    // Highest-reputation club gets the bye (mirrors real seeding).
    let byeId = pool[0];
    let bestRep = input.reputationByClubId.get(byeId) ?? 0;
    for (const id of pool) {
      const rep = input.reputationByClubId.get(id) ?? 0;
      if (rep > bestRep) { bestRep = rep; byeId = id; }
    }
    byeClubIds.push(byeId);
    pool.splice(pool.indexOf(byeId), 1);
  }

  const fixtures: FixtureInput[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    fixtures.push({
      competitionId: input.competitionId,
      season: input.season,
      week: input.week,
      round: nextRound,
      homeClubId: pool[i],
      awayClubId: pool[i + 1],
    });
  }
  return { fixtures, byeClubIds };
}

export function isKnockoutComplete(winners: number[], byeClubIds: number[]): boolean {
  return winners.length + byeClubIds.length <= 1;
}

export interface ClKnockoutSeedInput {
  competitionId: number;
  season: number;
  week: number;
  groups: Record<string, number[]>; // group name → club ids ordered 1st..last
}

/** Group winners meet the *other* groups' runners-up (single-leg). 2 groups → 2 semis. */
export function seedClChampionsKnockout(input: ClKnockoutSeedInput): FixtureInput[] {
  const names = Object.keys(input.groups).sort();
  const winners = names.map((n) => input.groups[n][0]);
  const runnersUp = names.map((n) => input.groups[n][1]);
  const fixtures: FixtureInput[] = [];
  for (let i = 0; i < winners.length; i++) {
    const opp = runnersUp[(i + 1) % runnersUp.length]; // other group's runner-up
    fixtures.push({
      competitionId: input.competitionId,
      season: input.season,
      week: input.week,
      round: 1,
      homeClubId: winners[i],
      awayClubId: opp,
    });
  }
  return fixtures;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/engine/competition/knockout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/competition/knockout.ts __tests__/engine/competition/knockout.test.ts
git commit -m "feat(knockout): resolução de chave + shootout determinístico + próxima fase (puro)"
```

---

### Task 4: Promotion/relegation swaps (pure)

**Files:**
- Create: `src/engine/competition/promotion.ts`
- Test: `__tests__/engine/competition/promotion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/competition/promotion.test.ts`:

```ts
import { League } from '@/types';
import {
  buildDivisionPairs,
  computeDivisionSwaps,
  DivisionPair,
} from '@/engine/competition/promotion';

const lg = (id: number, countryId: number, level: number, promo: number, releg: number): League => ({
  id, name: `L${id}`, countryId, divisionLevel: level, numTeams: 20, promotionSpots: promo, relegationSpots: releg,
});

describe('buildDivisionPairs', () => {
  it('links division N to N+1 within the same country, using the lower league promotion spots', () => {
    const leagues = [
      lg(1, 1, 1, 0, 3), // top
      lg(2, 1, 2, 3, 4), // second
      lg(99, 2, 1, 0, 3), // other country, no lower → no pair
    ];
    const pairs = buildDivisionPairs(leagues);
    expect(pairs).toEqual([
      { higherLeagueId: 1, lowerLeagueId: 2, relegationSpots: 3, promotionSpots: 3 },
    ]);
  });
});

describe('computeDivisionSwaps', () => {
  const pairs: DivisionPair[] = [
    { higherLeagueId: 1, lowerLeagueId: 2, relegationSpots: 3, promotionSpots: 3 },
  ];

  it('swaps bottom-3 of higher with top-3 of lower', () => {
    const standings = new Map<number, number[]>([
      [1, [101, 102, 103, 104, 105]], // 105,104,103 are bottom 3
      [2, [201, 202, 203, 204, 205]], // 201,202,203 are top 3
    ]);
    const swaps = computeDivisionSwaps(pairs, standings);
    const down = swaps.filter((s) => s.fromLeagueId === 1).map((s) => s.clubId).sort();
    const up = swaps.filter((s) => s.fromLeagueId === 2).map((s) => s.clubId).sort();
    expect(down).toEqual([103, 104, 105]);
    expect(up).toEqual([201, 202, 203]);
    expect(swaps.filter((s) => s.fromLeagueId === 1).every((s) => s.toLeagueId === 2)).toBe(true);
    expect(swaps.filter((s) => s.fromLeagueId === 2).every((s) => s.toLeagueId === 1)).toBe(true);
  });

  it('reconciles to min(relegationSpots, promotionSpots) so sizes stay constant', () => {
    const mismatched: DivisionPair[] = [
      { higherLeagueId: 1, lowerLeagueId: 2, relegationSpots: 4, promotionSpots: 2 },
    ];
    const standings = new Map<number, number[]>([
      [1, [101, 102, 103, 104, 105]],
      [2, [201, 202, 203, 204, 205]],
    ]);
    const swaps = computeDivisionSwaps(mismatched, standings);
    expect(swaps.filter((s) => s.fromLeagueId === 1)).toHaveLength(2);
    expect(swaps.filter((s) => s.fromLeagueId === 2)).toHaveLength(2);
  });

  it('a top league (promotionSpots 0 on its lower link reconciled) never sends clubs up beyond the min', () => {
    const noPromo: DivisionPair[] = [
      { higherLeagueId: 1, lowerLeagueId: 2, relegationSpots: 3, promotionSpots: 0 },
    ];
    const standings = new Map<number, number[]>([
      [1, [101, 102, 103]],
      [2, [201, 202, 203]],
    ]);
    expect(computeDivisionSwaps(noPromo, standings)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/engine/competition/promotion.test.ts`
Expected: FAIL — `Cannot find module '@/engine/competition/promotion'`.

- [ ] **Step 3: Minimal implementation**

Create `src/engine/competition/promotion.ts`:

```ts
import { League } from '@/types';

export interface DivisionPair {
  higherLeagueId: number;
  lowerLeagueId: number;
  relegationSpots: number;
  promotionSpots: number;
}

export interface ClubSwap {
  clubId: number;
  fromLeagueId: number;
  toLeagueId: number;
}

/**
 * Links each league to the league one division below it in the SAME country.
 * relegationSpots is taken from the higher league, promotionSpots from the lower.
 */
export function buildDivisionPairs(leagues: League[]): DivisionPair[] {
  const byKey = new Map<string, League>();
  for (const l of leagues) byKey.set(`${l.countryId}:${l.divisionLevel}`, l);

  const pairs: DivisionPair[] = [];
  for (const higher of leagues) {
    const lower = byKey.get(`${higher.countryId}:${higher.divisionLevel + 1}`);
    if (!lower) continue;
    pairs.push({
      higherLeagueId: higher.id,
      lowerLeagueId: lower.id,
      relegationSpots: higher.relegationSpots,
      promotionSpots: lower.promotionSpots,
    });
  }
  return pairs;
}

/**
 * From each pair's final standings (1st..last), swap the bottom N of the higher
 * league with the top N of the lower, where N = min(relegationSpots, promotionSpots).
 */
export function computeDivisionSwaps(
  pairs: DivisionPair[],
  standingsByLeague: Map<number, number[]>,
): ClubSwap[] {
  const swaps: ClubSwap[] = [];
  for (const pair of pairs) {
    const higher = standingsByLeague.get(pair.higherLeagueId) ?? [];
    const lower = standingsByLeague.get(pair.lowerLeagueId) ?? [];
    const n = Math.min(pair.relegationSpots, pair.promotionSpots, higher.length, lower.length);
    if (n <= 0) continue;
    const relegated = higher.slice(higher.length - n); // bottom N
    const promoted = lower.slice(0, n); // top N
    for (const clubId of relegated) {
      swaps.push({ clubId, fromLeagueId: pair.higherLeagueId, toLeagueId: pair.lowerLeagueId });
    }
    for (const clubId of promoted) {
      swaps.push({ clubId, fromLeagueId: pair.lowerLeagueId, toLeagueId: pair.higherLeagueId });
    }
  }
  return swaps;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/engine/competition/promotion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/competition/promotion.ts __tests__/engine/competition/promotion.test.ts
git commit -m "feat(promotion): pares de divisão + swaps de promoção/rebaixamento (puro)"
```

---

### Task 5: Reschedule knockouts to a dedicated post-league week band (calendar)

**Files:**
- Modify: `src/engine/balance.ts` (line 26: `SEASON_END_WEEK`; add `KNOCKOUT_START_WEEK`)
- Modify: `src/engine/week-advance.ts` (line 46: `SEASON_LENGTH`)
- Modify: `src/engine/competition/calendar.ts` (cup block 74-107; CL block 109-143)
- Modify: `src/engine/competition/calendar.test.ts` (week-range assertions)
- Test (new): `__tests__/engine/competition/calendar-collisions.test.ts`

> **Why both constants:** `advanceGameWeek` (game-loop.ts:747) gates season end on `SEASON_END_WEEK` (balance.ts). `week-advance.ts` is a separate legacy pure helper with its own `SEASON_LENGTH = 46`. Both must rise so the knockout band (weeks 47-55) is played before rollover.

- [ ] **Step 1: Write the failing collision test**

Create `__tests__/engine/competition/calendar-collisions.test.ts`:

```ts
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { League } from '@/types';

const leagues: League[] = [
  { id: 1, name: 'Premier League', countryId: 1, divisionLevel: 1, numTeams: 20, promotionSpots: 0, relegationSpots: 3 },
  { id: 2, name: 'La Liga', countryId: 2, divisionLevel: 1, numTeams: 20, promotionSpots: 0, relegationSpots: 3 },
];
const clubsByLeague: Record<number, number[]> = {
  1: Array.from({ length: 20 }, (_, i) => i + 1),
  2: Array.from({ length: 20 }, (_, i) => i + 21),
};
// CL clubs are drawn from clubs that ALSO play league fixtures.
const championsLeagueClubs = [1, 2, 3, 4, 21, 22, 23, 24];

describe('calendar — no same-week double fixture', () => {
  it('no club has two fixtures in the same (season, week)', () => {
    const cal = generateSeasonCalendar({ season: 1, leagues, clubsByLeague, championsLeagueClubs });
    const seen = new Map<string, string>();
    for (const f of cal.fixtures) {
      for (const clubId of [f.homeClubId, f.awayClubId]) {
        const key = `${clubId}:${f.week}`;
        if (seen.has(key)) {
          throw new Error(`Club ${clubId} double-booked in week ${f.week}: ${seen.get(key)} and comp ${f.competitionId}`);
        }
        seen.set(key, `comp ${f.competitionId}`);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('all cup round-1 and CL group fixtures sit at or after the knockout band start', () => {
    const cal = generateSeasonCalendar({ season: 1, leagues, clubsByLeague, championsLeagueClubs });
    const nonLeague = cal.fixtures.filter((f) => {
      const comp = cal.competitions.find((c) => c.id === f.competitionId)!;
      return comp.type !== 'league';
    });
    for (const f of nonLeague) {
      expect(f.week).toBeGreaterThanOrEqual(47);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/engine/competition/calendar-collisions.test.ts`
Expected: FAIL — CL group (weeks 13-18) and cup round 1 (week 10) collide with league weeks 7-44, and several fixtures sit below week 47.

- [ ] **Step 3: Minimal implementation**

In `src/engine/balance.ts`, change line 26 and add the band start above it:

```ts
export const SEASON_END_WEEK = 58;
// First week of the post-league knockout band (cups + CL knockout). Keeps a
// 2-week buffer after the last league week (44) so no club is double-booked.
export const KNOCKOUT_START_WEEK = 47;
```

In `src/engine/week-advance.ts`, change line 46:

```ts
const SEASON_LENGTH = 58;
```

In `src/engine/competition/calendar.ts`, import the constant (add to existing imports at top):

```ts
import { KNOCKOUT_START_WEEK } from '@/engine/balance';
```

Replace the cup round-1 fixture week (line 102, `week: 10`) with the band start:

```ts
    if (firstRoundTeams.length >= 2) {
      const fixtures = generateKnockoutRound(firstRoundTeams, {
        competitionId,
        season,
        week: KNOCKOUT_START_WEEK,
        round: 1,
      });
      allFixtureInputs.push(...fixtures);
    }
```

Replace the CL group-stage `startWeek` (line 137-141, `startWeek: 13`) with a post-league start. Use `KNOCKOUT_START_WEEK` so the 6-round group stage (4 teams → 6 weeks) runs weeks 47-52, before the CL knockout that Task 6 will generate dynamically at week 53+:

```ts
    // Group stage fixtures: round-robin in the post-league band (no league collision)
    const fixtures = generateRoundRobin(groupClubs, {
      competitionId: clCompetitionId,
      season,
      startWeek: KNOCKOUT_START_WEEK,
    });
    allFixtureInputs.push(...fixtures);
```

In `__tests__/engine/competition/calendar.test.ts`, the test "generates cup fixtures (first round)" still holds. The "league fixtures fall within correct week range" test (weeks 7-44) is unchanged and still passes (league fixtures are untouched). No edits required there — but verify the suite stays green in Step 4.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/engine/competition/calendar-collisions.test.ts __tests__/engine/competition/calendar.test.ts`
Expected: PASS (collision test green; existing calendar tests unaffected).

- [ ] **Step 5: Fix the three week-46 tests**

Update the season-end week in:
- `__tests__/engine/week-advance.test.ts` line 78-86: change the test title/`week: 46` → `week: 58`, and the assertion comment.
- `__tests__/engine/game-loop.test.ts` lines 145-191: change both `week: 46` to `week: 58` and titles "wraps season at week 46" / "archives ... past week 46" → `58`.

Run: `npx jest __tests__/engine/week-advance.test.ts __tests__/engine/game-loop.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/balance.ts src/engine/week-advance.ts src/engine/competition/calendar.ts __tests__/engine/competition/calendar-collisions.test.ts __tests__/engine/week-advance.test.ts __tests__/engine/game-loop.test.ts
git commit -m "feat(calendar): mata-matas em banda pós-liga (sem colisão de semana) + SEASON_END_WEEK=58"
```

---

### Task 6: Round progression hook — generate next knockout rounds week by week

**Files:**
- Create: `src/engine/competition/round-progression.ts`
- Modify: `src/engine/game-loop.ts` (add call after AI sim, line 556; add `'penalty_shootout'` event persistence)
- Modify: `src/types/match.ts` (line 1: add `'penalty_shootout'`)
- Test: `__tests__/engine/competition/round-progression.test.ts`

- [ ] **Step 1: Add the event type (small, no separate commit)**

In `src/types/match.ts`, append `'penalty_shootout'` to the `MatchEventType` union (line 1):

```ts
export type MatchEventType = 'goal' | 'assist' | 'yellow' | 'red' | 'substitution' | 'injury' | 'penalty_scored' | 'penalty_missed' | 'free_kick_scored' | 'free_kick_missed' | 'shot_on_target' | 'shot_off_target' | 'save' | 'penalty_shootout';
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/engine/competition/round-progression.test.ts`. It seeds a real cup competition with 8 clubs, plays each round, drives progression, and asserts a multi-round bracket ending in one champion — including a shootout-decided tie.

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { maybeGenerateNextKnockoutRound } from '@/engine/competition/round-progression';

const KNOCKOUT_WEEK = 47;

function seedCup(rawDb: Database.Database, clubIds: number[]): void {
  rawDb.prepare(
    `INSERT INTO competitions (id, name, type, format, season, league_id)
     VALUES (500, 'Test Cup', 'cup', 'knockout', 1, 1)`,
  ).run();
  clubIds.forEach((c, i) => {
    rawDb.prepare(
      'INSERT INTO competition_entries (competition_id, club_id, group_name, seed) VALUES (500, ?, NULL, ?)',
    ).run(c, i + 1);
  });
  // Round 1: 4 ties among 8 clubs.
  let fid = 9000;
  for (let i = 0; i < clubIds.length; i += 2) {
    rawDb.prepare(
      `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, played)
       VALUES (?, 500, 1, ?, '1', ?, ?, 0)`,
    ).run(fid++, KNOCKOUT_WEEK, clubIds[i], clubIds[i + 1]);
  }
}

function playRound(rawDb: Database.Database, round: number, score: (h: number, a: number) => [number, number]): void {
  const rows = rawDb.prepare(
    "SELECT id, home_club_id, away_club_id FROM fixtures WHERE competition_id = 500 AND round = ? AND played = 0",
  ).all(String(round)) as Array<{ id: number; home_club_id: number; away_club_id: number }>;
  for (const r of rows) {
    const [h, a] = score(r.home_club_id, r.away_club_id);
    rawDb.prepare('UPDATE fixtures SET home_goals = ?, away_goals = ?, played = 1 WHERE id = ?').run(h, a, r.id);
  }
}

describe('maybeGenerateNextKnockoutRound', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const clubs = [1, 2, 3, 4, 5, 6, 7, 8];

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    seedCup(rawDb, clubs);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('is a no-op while the current round is unfinished', async () => {
    await maybeGenerateNextKnockoutRound(db, 1, KNOCKOUT_WEEK, new SeededRng(1));
    const r2 = rawDb.prepare("SELECT COUNT(*) AS c FROM fixtures WHERE competition_id = 500 AND round = '2'").get() as { c: number };
    expect(r2.c).toBe(0);
  });

  it('drives a cup to a single champion across rounds', async () => {
    // Round 1: home always wins → survivors 1,3,5,7.
    playRound(rawDb, 1, () => [2, 0]);
    await maybeGenerateNextKnockoutRound(db, 1, KNOCKOUT_WEEK, new SeededRng(1));
    let r2 = rawDb.prepare("SELECT id, home_club_id, away_club_id, week FROM fixtures WHERE competition_id = 500 AND round = '2'").all() as Array<{ id: number; home_club_id: number; away_club_id: number; week: number }>;
    expect(r2).toHaveLength(2);
    expect(r2.every((f) => f.week > KNOCKOUT_WEEK)).toBe(true);
    const r2Clubs = r2.flatMap((f) => [f.home_club_id, f.away_club_id]).sort((a, b) => a - b);
    expect(r2Clubs).toEqual([1, 3, 5, 7]);

    // Round 2: a draw → shootout decides; home win for the other.
    playRound(rawDb, 2, (h) => (h === r2[0].home_club_id ? [1, 1] : [3, 0]));
    await maybeGenerateNextKnockoutRound(db, 1, r2[0].week, new SeededRng(7));
    const r3 = rawDb.prepare("SELECT id, home_club_id, away_club_id FROM fixtures WHERE competition_id = 500 AND round = '3'").all() as Array<{ id: number; home_club_id: number; away_club_id: number }>;
    expect(r3).toHaveLength(1); // the final

    // A shootout event was persisted for the drawn round-2 tie.
    const shootout = rawDb.prepare(
      "SELECT COUNT(*) AS c FROM match_events WHERE type = 'penalty_shootout' AND fixture_id = ?",
    ).get(r2[0].id) as { c: number };
    expect(shootout.c).toBe(1);

    // Final played → no further round generated; isKnockoutComplete terminal.
    playRound(rawDb, 3, () => [2, 1]);
    const week3 = (rawDb.prepare("SELECT week FROM fixtures WHERE competition_id = 500 AND round = '3'").get() as { week: number }).week;
    await maybeGenerateNextKnockoutRound(db, 1, week3, new SeededRng(1));
    const r4 = rawDb.prepare("SELECT COUNT(*) AS c FROM fixtures WHERE competition_id = 500 AND round = '4'").get() as { c: number };
    expect(r4.c).toBe(0);
  });

  it('is idempotent — re-running on the same week does not duplicate the next round', async () => {
    playRound(rawDb, 1, () => [2, 0]);
    await maybeGenerateNextKnockoutRound(db, 1, KNOCKOUT_WEEK, new SeededRng(1));
    await maybeGenerateNextKnockoutRound(db, 1, KNOCKOUT_WEEK, new SeededRng(1));
    const r2 = rawDb.prepare("SELECT COUNT(*) AS c FROM fixtures WHERE competition_id = 500 AND round = '2'").get() as { c: number };
    expect(r2.c).toBe(2);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest __tests__/engine/competition/round-progression.test.ts`
Expected: FAIL — `Cannot find module '@/engine/competition/round-progression'`.

- [ ] **Step 4: Minimal implementation**

Create `src/engine/competition/round-progression.ts`. It only handles cup (`knockout`) and CL (`group_knockout`) competitions, generating the next round at the next free week after the current max round. The shootout winner is persisted via `addMatchEvent` with the sentinel encoding from §6 (`minute: 120`, `playerId = winnerClubId`, `secondaryPlayerId = loserClubId`):

```ts
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { createFixture, addMatchEvent } from '@/database/queries/fixtures';
import {
  resolveKnockoutTie,
  buildNextKnockoutRound,
  isKnockoutComplete,
  seedClChampionsKnockout,
  PlayedKnockoutFixture,
} from './knockout';

interface CompRow { id: number; type: string; format: string; }
interface FxRow {
  id: number; round: string | null; played: number;
  home_club_id: number; away_club_id: number;
  home_goals: number | null; away_goals: number | null;
}

async function nextFixtureId(db: DbHandle): Promise<number> {
  const row = (await db.prepare('SELECT MAX(id) AS m FROM fixtures').get()) as { m: number | null };
  return (row.m ?? 0) + 1;
}

async function reputationMap(db: DbHandle, clubIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  for (const id of clubIds) {
    const row = (await db.prepare('SELECT reputation FROM clubs WHERE id = ?').get(id)) as { reputation: number } | undefined;
    map.set(id, row?.reputation ?? 0);
  }
  return map;
}

/**
 * After a week is simulated, advance any knockout competition whose current max
 * round is fully played and which still has >1 club alive. Idempotent: only
 * generates a round number that does not yet exist.
 */
export async function maybeGenerateNextKnockoutRound(
  db: DbHandle,
  season: number,
  week: number,
  rng: SeededRng,
): Promise<void> {
  const comps = (await db
    .prepare(
      `SELECT id, type, format FROM competitions
       WHERE season = ? AND (type = 'cup' OR type = 'continental')`,
    )
    .all(season)) as CompRow[];

  for (const comp of comps) {
    const fixtures = (await db
      .prepare(
        `SELECT id, round, played, home_club_id, away_club_id, home_goals, away_goals
         FROM fixtures WHERE competition_id = ? AND season = ?`,
      )
      .all(comp.id, season)) as FxRow[];

    // Knockout rounds only: numeric round. CL group fixtures have round IS NULL.
    const ko = fixtures.filter((f) => f.round != null && !Number.isNaN(Number(f.round)));

    if (ko.length === 0) {
      // No knockout round yet. For a CL group_knockout, once the group stage is
      // fully played, seed round 1 of the knockout from the group standings.
      if (comp.format === 'group_knockout') {
        await maybeSeedClKnockout(db, comp.id, season, week, fixtures);
      }
      continue;
    }

    const maxRound = Math.max(...ko.map((f) => Number(f.round)));
    const currentRoundFixtures = ko.filter((f) => Number(f.round) === maxRound);
    if (currentRoundFixtures.some((f) => f.played !== 1)) continue; // round not finished

    // Resolve every tie in the current round (shootout on draws → persist event).
    const winners: number[] = [];
    for (const f of currentRoundFixtures) {
      const played: PlayedKnockoutFixture = {
        homeClubId: f.home_club_id, awayClubId: f.away_club_id,
        homeGoals: f.home_goals ?? 0, awayGoals: f.away_goals ?? 0, round: maxRound,
      };
      const result = resolveKnockoutTie(played, rng);
      winners.push(result.winnerClubId);
      if (result.viaShootout) {
        // Sentinel encoding (see spec §6): minute 120, playerId=winner, secondary=loser.
        await addMatchEvent(db, {
          fixtureId: f.id, minute: 120, type: 'penalty_shootout',
          playerId: result.winnerClubId, secondaryPlayerId: result.loserClubId,
        });
      }
    }

    // Pending byes: entries not present in any knockout fixture so far.
    const entries = (await db
      .prepare('SELECT club_id FROM competition_entries WHERE competition_id = ?')
      .all(comp.id)) as Array<{ club_id: number }>;
    const seenInKo = new Set(ko.flatMap((f) => [f.home_club_id, f.away_club_id]));
    const pendingByeClubIds = entries
      .map((e) => e.club_id)
      .filter((c) => !seenInKo.has(c));

    if (isKnockoutComplete(winners, pendingByeClubIds)) continue;

    const repMap = await reputationMap(db, [...winners, ...pendingByeClubIds]);
    const { fixtures: nextFixtures } = buildNextKnockoutRound({
      competitionId: comp.id, season, completedRound: maxRound,
      winners, pendingByeClubIds, week: week + 2, reputationByClubId: repMap,
    });

    let fid = await nextFixtureId(db);
    for (const nf of nextFixtures) {
      await createFixture(db, {
        id: fid++, competitionId: nf.competitionId, season,
        week: nf.week, round: String(nf.round),
        homeClubId: nf.homeClubId, awayClubId: nf.awayClubId,
      });
    }
  }
}

async function maybeSeedClKnockout(
  db: DbHandle,
  competitionId: number,
  season: number,
  week: number,
  fixtures: FxRow[],
): Promise<void> {
  const groupFixtures = fixtures.filter((f) => f.round == null);
  if (groupFixtures.length === 0 || groupFixtures.some((f) => f.played !== 1)) return;

  // Build per-group standings from group fixtures + entries.
  const entries = (await db
    .prepare('SELECT club_id, group_name FROM competition_entries WHERE competition_id = ? AND group_name IS NOT NULL')
    .all(competitionId)) as Array<{ club_id: number; group_name: string }>;
  if (entries.length === 0) return;

  const groups: Record<string, number[]> = {};
  const points = new Map<number, number>();
  const gd = new Map<number, number>();
  for (const e of entries) { points.set(e.club_id, 0); gd.set(e.club_id, 0); (groups[e.group_name] ??= []).push(e.club_id); }
  for (const f of groupFixtures) {
    if (f.home_goals == null || f.away_goals == null) continue;
    gd.set(f.home_club_id, (gd.get(f.home_club_id) ?? 0) + f.home_goals - f.away_goals);
    gd.set(f.away_club_id, (gd.get(f.away_club_id) ?? 0) + f.away_goals - f.home_goals);
    if (f.home_goals > f.away_goals) points.set(f.home_club_id, (points.get(f.home_club_id) ?? 0) + 3);
    else if (f.away_goals > f.home_goals) points.set(f.away_club_id, (points.get(f.away_club_id) ?? 0) + 3);
    else { points.set(f.home_club_id, (points.get(f.home_club_id) ?? 0) + 1); points.set(f.away_club_id, (points.get(f.away_club_id) ?? 0) + 1); }
  }
  for (const name of Object.keys(groups)) {
    groups[name].sort((a, b) => (points.get(b)! - points.get(a)!) || (gd.get(b)! - gd.get(a)!) || (a - b));
  }

  const koFixtures = seedClChampionsKnockout({ competitionId, season, week: week + 2, groups });
  let fid = await nextFixtureId(db);
  for (const nf of koFixtures) {
    await createFixture(db, {
      id: fid++, competitionId: nf.competitionId, season,
      week: nf.week, round: String(nf.round),
      homeClubId: nf.homeClubId, awayClubId: nf.awayClubId,
    });
  }
}
```

In `src/engine/game-loop.ts`, import the hook (add to the engine imports near line 30):

```ts
import { maybeGenerateNextKnockoutRound } from './competition/round-progression';
```

Call it right after the AI-vs-AI simulation loop closes (after line 556, before `// 3b. Process AI transfers`):

```ts
  // 3a. Advance any knockout competition whose current round just finished.
  await maybeGenerateNextKnockoutRound(db, season, week, rng);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest __tests__/engine/competition/round-progression.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/match.ts src/engine/competition/round-progression.ts src/engine/game-loop.ts __tests__/engine/competition/round-progression.test.ts
git commit -m "feat(knockout): geração dinâmica de fases por semana + shootout persistido + CL knockout"
```

---

### Task 7: Archiver reads the real shootout winner + writes promotions

**Files:**
- Modify: `src/engine/history/season-archiver.ts` (`computeStandings` 56-83; `archiveKnockout` 288-327; `archiveLeague` 329-357 → add promotions)
- Test: `__tests__/engine/history/season-archiver.test.ts` (append cases)

- [ ] **Step 1: Write the failing test**

Append to `__tests__/engine/history/season-archiver.test.ts` a describe block. It builds a 2-round cup, draws the final, persists a `penalty_shootout` event for the away club, and asserts the away club is archived champion (not home):

```ts
describe('archiveSeason — knockout shootout + promotions', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('archives the shootout winner on a drawn final, not the home club', async () => {
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (600, 'Cup', 'cup', 'knockout', 1, NULL)`,
    ).run();
    // Final (round 2): clubs 1 (home) vs 2 (away), drawn 1-1.
    rawDb.prepare(
      `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, home_goals, away_goals, played)
       VALUES (6001, 600, 1, 49, '2', 1, 2, 1, 1, 1)`,
    ).run();
    // Shootout event: away club 2 won (sentinel: player_id = winner clubId).
    rawDb.prepare(
      `INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id)
       VALUES (6001, 120, 'penalty_shootout', 2, 1)`,
    ).run();

    await archiveSeason(db, 1);

    const res = rawDb.prepare(
      'SELECT champion_club_id, runner_up_club_id FROM season_competition_results WHERE competition_id = 600 AND season = 1',
    ).get() as { champion_club_id: number; runner_up_club_id: number };
    expect(res.champion_club_id).toBe(2); // shootout winner, NOT home (1)
    expect(res.runner_up_club_id).toBe(1);
  });

  it('falls back to home on a drawn final with no shootout event (legacy)', async () => {
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (601, 'Cup', 'cup', 'knockout', 1, NULL)`,
    ).run();
    rawDb.prepare(
      `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, home_goals, away_goals, played)
       VALUES (6011, 601, 1, 49, '1', 3, 4, 0, 0, 1)`,
    ).run();
    await archiveSeason(db, 1);
    const res = rawDb.prepare(
      'SELECT champion_club_id FROM season_competition_results WHERE competition_id = 601 AND season = 1',
    ).get() as { champion_club_id: number };
    expect(res.champion_club_id).toBe(3); // deterministic home fallback
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/engine/history/season-archiver.test.ts`
Expected: FAIL — the first case archives champion 1 (current home fallback) instead of 2.

- [ ] **Step 3: Minimal implementation**

In `src/engine/history/season-archiver.ts`, replace the drawn-final branch (lines 318-323). Before, add a helper to read the shootout winner:

```ts
async function getShootoutWinner(
  db: DbHandle,
  fixtureId: number,
): Promise<{ winnerClubId: number; loserClubId: number } | null> {
  const row = (await db
    .prepare(
      "SELECT player_id, secondary_player_id FROM match_events WHERE fixture_id = ? AND type = 'penalty_shootout' LIMIT 1",
    )
    .get(fixtureId)) as { player_id: number; secondary_player_id: number | null } | undefined;
  if (!row || row.secondary_player_id == null) return null;
  return { winnerClubId: row.player_id, loserClubId: row.secondary_player_id };
}
```

Make `archiveKnockout` await it on a draw (the function is already `async`):

```ts
  } else {
    // Drawn final: read the persisted penalty_shootout winner. Guarded legacy
    // fallback (no event) keeps old saves deterministic on the home club.
    const shootout = await getShootoutWinner(db, final.id);
    if (shootout) {
      championClubId = shootout.winnerClubId;
      runnerUpClubId = shootout.loserClubId;
    } else {
      championClubId = final.home_club_id;
      runnerUpClubId = final.away_club_id;
    }
  }
```

In the same file, give the private `computeStandings` (lines 77-82) the head-to-head tiebreaker by reusing the new shared comparator. Replace the sort tail with an H2H-aware sort over the same `FixtureRow[]`. Since the archiver rows use `home_club_id`/`away_club_id` (snake_case) while `compareStandings` expects `Fixture`, compute the H2H inline to avoid a shape adapter:

```ts
  const list = [...table.values()];
  return list.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
    if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
    // Head-to-head between x and y.
    let xPts = 0, yPts = 0, xGd = 0, yGd = 0;
    for (const f of fixtures) {
      if (f.home_goals == null || f.away_goals == null) continue;
      const xy = f.home_club_id === x.clubId && f.away_club_id === y.clubId;
      const yx = f.home_club_id === y.clubId && f.away_club_id === x.clubId;
      if (!xy && !yx) continue;
      const xg = xy ? f.home_goals : f.away_goals;
      const yg = xy ? f.away_goals : f.home_goals;
      xGd += xg - yg; yGd += yg - xg;
      if (xg > yg) xPts += 3; else if (yg > xg) yPts += 3; else { xPts++; yPts++; }
    }
    if (yPts !== xPts) return yPts - xPts;
    if (yGd !== xGd) return yGd - xGd;
    return x.clubId - y.clubId;
  });
```

(The `computeStandings(fixtures: FixtureRow[])` signature already has `fixtures` in scope; only the return-sort changes.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/engine/history/season-archiver.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/engine/history/season-archiver.ts __tests__/engine/history/season-archiver.test.ts
git commit -m "feat(archiver): lê vencedor real do shootout + tiebreaker H2H nas standings"
```

---

### Task 8: Archiver writes `season_promoted` rows

**Files:**
- Modify: `src/engine/history/season-archiver.ts` (`archiveLeague` 329-357; `archiveSeason` 359-371 — needs lower-league standings)
- Test: `__tests__/engine/history/season-archiver.test.ts` (append)

> **Rationale:** `archiveLeague` already records relegated clubs per league. Promotions are symmetric but require knowing which higher league a lower league feeds. We compute pairs once in `archiveSeason` using `buildDivisionPairs` over `getAllLeagues`, then for each higher league write `season_promoted` for the top-N of its linked lower league. Physical `league_id` movement stays in the screen (Task 9); the archiver only records the outcome for the board's `wasPromoted` query.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/engine/history/season-archiver.test.ts`:

```ts
describe('archiveSeason — promotions recorded', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('writes season_promoted for the top clubs of a lower division', async () => {
    // Seed data has English league 1 (top) and league 2 (Championship, promotionSpots 3).
    // Create a league competition for league 2 and finish it so standings exist.
    const champClubs = rawDb.prepare('SELECT id FROM clubs WHERE league_id = 2 ORDER BY id LIMIT 4').all() as Array<{ id: number }>;
    const ids = champClubs.map((c) => c.id);
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (700, 'Championship', 'league', 'round_robin', 1, 2)`,
    ).run();
    // Round-robin among the 4: make ids[0] win everything → finishes 1st.
    let fid = 7000;
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        const [h, a] = ids[i] === ids[0] ? [3, 0] : ids[j] === ids[0] ? [0, 3] : [1, 1];
        rawDb.prepare(
          `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, home_goals, away_goals, played)
           VALUES (?, 700, 1, 7, NULL, ?, ?, ?, ?, 1)`,
        ).run(fid++, ids[i], ids[j], h, a);
      }
    }

    await archiveSeason(db, 1);

    const promoted = rawDb.prepare(
      'SELECT club_id, league_id, final_position FROM season_promoted WHERE season = 1 ORDER BY final_position',
    ).all() as Array<{ club_id: number; league_id: number; final_position: number }>;
    expect(promoted.length).toBeGreaterThan(0);
    // Top finisher (ids[0]) recorded as promoted into the higher league (1).
    expect(promoted[0].club_id).toBe(ids[0]);
    expect(promoted[0].league_id).toBe(1);
    expect(promoted[0].final_position).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/engine/history/season-archiver.test.ts -t "promotions recorded"`
Expected: FAIL — `no such ... season_promoted` rows (archiver does not write them yet).

- [ ] **Step 3: Minimal implementation**

In `src/engine/history/season-archiver.ts`:

Add imports near the top:

```ts
import { buildDivisionPairs } from '../competition/promotion';
import { getAllLeagues } from '../../database/queries/leagues';
import { insertPromotedIgnore } from '../../database/queries/season-promoted';
```

`archiveLeague` already computes `standings`. Make it also return the ordered club ids so `archiveSeason` can place promotions. Change `archiveLeague`'s signature to return `{ leagueId: number; orderedClubIds: number[] } | null` and the early-return paths to `return null`:

```ts
async function archiveLeague(
  db: DbHandle,
  competition: CompetitionRow,
  season: number,
): Promise<{ leagueId: number; orderedClubIds: number[] } | null> {
  if (competition.league_id == null) return null;
  const league = await getLeague(db, competition.league_id);
  if (!league) return null;

  const fixtures = await getPlayedFixtures(db, competition.id, season);
  if (fixtures.length === 0) return null;

  const standings = computeStandings(fixtures);
  if (standings.length === 0) return null;

  const champion = standings[0].clubId;
  const runnerUp = standings.length > 1 ? standings[1].clubId : null;
  await insertResultIgnore(db, season, competition.id, champion, runnerUp);
  await snapshotChampionSquad(db, season, competition.id, champion);

  const relegatedCount = league.relegation_spots ?? 0;
  if (relegatedCount > 0 && standings.length >= relegatedCount) {
    const relegated = standings.slice(-relegatedCount);
    for (let i = 0; i < relegated.length; i++) {
      const finalPosition = standings.length - relegated.length + i + 1;
      await insertRelegatedIgnore(db, season, league.id, relegated[i].clubId, finalPosition);
    }
  }
  return { leagueId: league.id, orderedClubIds: standings.map((s) => s.clubId) };
}
```

In `archiveSeason`, collect each league's ordered standings, then write promotions per division pair:

```ts
export async function archiveSeason(db: DbHandle, season: number): Promise<void> {
  const competitions = await getCompetitionsForSeason(db, season);
  const standingsByLeague = new Map<number, number[]>();

  for (const competition of competitions) {
    if (competition.type === 'league') {
      const res = await archiveLeague(db, competition, season);
      if (res) standingsByLeague.set(res.leagueId, res.orderedClubIds);
    } else if (competition.type === 'cup' || competition.type === 'continental') {
      await archiveKnockout(db, competition, season);
    }
    await archiveTopScorers(db, competition.id, season);
    await archiveTopAssisters(db, competition.id, season);
    await archiveMvpAndBreakthrough(db, competition, season);
  }

  // Record promotions: top-N of each lower league move up into its linked higher league.
  const leagues = await getAllLeagues(db);
  const pairs = buildDivisionPairs(leagues);
  for (const pair of pairs) {
    const lowerOrder = standingsByLeague.get(pair.lowerLeagueId);
    if (!lowerOrder) continue;
    const n = Math.min(pair.relegationSpots, pair.promotionSpots, lowerOrder.length);
    for (let i = 0; i < n; i++) {
      await insertPromotedIgnore(db, season, pair.higherLeagueId, lowerOrder[i], i + 1);
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/engine/history/season-archiver.test.ts`
Expected: PASS (all, including prior league/knockout tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/history/season-archiver.ts __tests__/engine/history/season-archiver.test.ts
git commit -m "feat(archiver): grava season_promoted via pares de divisão"
```

---

### Task 9: EndOfSeasonScreen — physically move clubs + wire `wasPromoted` (UI)

**Files:**
- Modify: `src/screens/EndOfSeasonScreen.tsx` (board `useEffect` 279-304 for `wasPromoted`; `handleContinue` before calendar regen at line 431)
- Test: `__tests__/engine/competition/division-swap-integration.test.ts` (engine-level integration of the swap logic the screen calls — the screen body itself is browser-validated)

> The screen calls `computeDivisionSwaps` + `buildDivisionPairs` and applies `UPDATE clubs SET league_id`. We test that pure-plus-DB pipeline directly (real DB), then browser-validate the screen.

- [ ] **Step 1: Write the failing integration test**

Create `__tests__/engine/competition/division-swap-integration.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { buildDivisionPairs, computeDivisionSwaps } from '@/engine/competition/promotion';

// Mirrors the swap the screen performs in handleContinue.
async function applySwaps(db: DbHandle, standingsByLeague: Map<number, number[]>): Promise<void> {
  const leagues = await getAllLeagues(db);
  const pairs = buildDivisionPairs(leagues);
  const swaps = computeDivisionSwaps(pairs, standingsByLeague);
  for (const s of swaps) {
    await db.prepare('UPDATE clubs SET league_id = ? WHERE id = ?').run(s.toLeagueId, s.clubId);
  }
}

describe('division swap (screen pipeline) on real DB', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('moves bottom of div1 down and top of div2 up, keeping sizes constant', async () => {
    const before1 = await getClubsByLeague(db, 1);
    const before2 = await getClubsByLeague(db, 2);
    const size1 = before1.length;
    const size2 = before2.length;

    // Final orders (1st..last) by id for determinism.
    const order1 = before1.map((c) => c.id).sort((a, b) => a - b);
    const order2 = before2.map((c) => c.id).sort((a, b) => a - b);
    const standings = new Map<number, number[]>([[1, order1], [2, order2]]);

    const relegatedExpected = order1.slice(order1.length - 3); // bottom 3 of div1
    const promotedExpected = order2.slice(0, 3); // top 3 of div2

    await applySwaps(db, standings);

    const after1 = (await getClubsByLeague(db, 1)).map((c) => c.id);
    const after2 = (await getClubsByLeague(db, 2)).map((c) => c.id);

    expect(after1).toHaveLength(size1);
    expect(after2).toHaveLength(size2);
    for (const c of relegatedExpected) expect(after2).toContain(c);
    for (const c of promotedExpected) expect(after1).toContain(c);
    for (const c of relegatedExpected) expect(after1).not.toContain(c);
    for (const c of promotedExpected) expect(after2).not.toContain(c);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/engine/competition/division-swap-integration.test.ts`
Expected: PASS already? No — `applySwaps` calls real exports from Task 4; this test is green if Task 4 is done. The point of this task is the SCREEN wiring, which has no unit test. Run it to confirm the pipeline works (expected PASS), then proceed to the screen edit.

> If the test passes immediately, that confirms the engine pipeline; the remaining work (screen) is browser-validated in Step 4.

- [ ] **Step 3: Wire the screen**

In `src/screens/EndOfSeasonScreen.tsx`:

Add imports (near line 26):

```ts
import { buildDivisionPairs, computeDivisionSwaps } from '@/engine/competition/promotion';
import { getPromotedForClub } from '@/database/queries/season-promoted';
```

In the board `useEffect`, replace the hardcoded `wasPromoted: false` (line 295). First query `season_promoted` next to the relegated query (line 281-283):

```ts
          const promotedRow = await getPromotedForClub(dbHandle, endedSeason, playerClubId);
```

Then pass it:

```ts
            wasPromoted: promotedRow != null,
```

In `handleContinue`, before the calendar generation (line 431, the `// Generate calendar for the new season` block), apply the physical swap. The screen already fetches `leagues` and `getClubsByLeague` below; insert the swap **before** building `clubsByLeague` so the new calendar uses post-swap divisions:

```ts
      // Apply promotion/relegation: physically move clubs between linked divisions
      // using each league's FINAL standings, BEFORE regenerating the new calendar.
      const swapLeagues = await getAllLeagues(dbHandle);
      const standingsByLeague = new Map<number, number[]>();
      const competitionsEnded = await getCompetitionsBySeason(dbHandle, endedSeason);
      for (const lg of swapLeagues) {
        const leagueComp = competitionsEnded.find((c) => c.leagueId === lg.id && c.type === 'league');
        if (!leagueComp) continue;
        const lgClubs = await getClubsByLeague(dbHandle, lg.id);
        const lgClubIds = lgClubs.map((c) => c.id);
        const fxSet = new Map<number, Fixture>();
        for (const cid of lgClubIds) {
          const cf = await getFixturesByClub(dbHandle, cid, endedSeason);
          for (const f of cf) {
            if (f.competitionId === leagueComp.id && f.played && !fxSet.has(f.id)) fxSet.set(f.id, f);
          }
        }
        const ordered = calculateStandings(Array.from(fxSet.values()), lgClubIds);
        standingsByLeague.set(lg.id, ordered.map((e) => e.clubId));
      }
      const pairs = buildDivisionPairs(swapLeagues);
      const swaps = computeDivisionSwaps(pairs, standingsByLeague);
      for (const s of swaps) {
        await dbHandle.prepare('UPDATE clubs SET league_id = ? WHERE id = ?').run(s.toLeagueId, s.clubId);
      }
```

The existing `const leagues = await getAllLeagues(dbHandle);` and the `clubsByLeague` loop that follow now read the **post-swap** `league_id`s automatically.

- [ ] **Step 4: Type-check + browser validation**

Run: `npx tsc --noEmit`
Expected: exit 0.

Browser (Playwright MCP, per project web-dev-server notes — harness background `CI=1 npx expo start --web --port 19006`, navigate `localhost:8082`):
- Start a new game; advance to season end (or use a save near week 58). On the End-of-Season screen, press CONTINUE.
- After continuing, open the league table / club overview and confirm the player's division roster reflects 3 clubs swapped (bottom-3 down, top-3 up) versus the previous season — no club appears in two leagues, each league keeps its team count.
- If the player's club was top of a lower division, the board evaluation card shows the promotion outcome (objective met), confirming `wasPromoted` flows through.

- [ ] **Step 5: Commit**

```bash
git add src/screens/EndOfSeasonScreen.tsx __tests__/engine/competition/division-swap-integration.test.ts
git commit -m "feat(end-of-season): move clubes entre divisões + wasPromoted real antes do novo calendário"
```

---

### Task 10: Full-season integration — cup to a champion through `advanceGameWeek`

**Files:**
- Test: `__tests__/engine/competition/cup-to-champion.e2e.test.ts`
- (No source changes — regression net proving Tasks 5+6+7 compose end-to-end through the real loop.)

- [ ] **Step 1: Write the failing/guarding test**

Create `__tests__/engine/competition/cup-to-champion.e2e.test.ts`. It seeds a full season calendar via `ensureSeasonFixtures`, then advances weeks through the knockout band, asserting the cup reaches round ≥3 and a champion is archived:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';
import { advanceGameWeek } from '@/engine/game-loop';
import { SEASON_END_WEEK, KNOCKOUT_START_WEEK } from '@/engine/balance';

describe('cup progresses to a real champion through the game loop', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await ensureSeasonFixtures(db, 1);
  });
  afterEach(() => rawDb.close());

  it('reaches a cup final and archives a champion', async () => {
    // Advance from the knockout band start to season end; AI sim resolves fixtures,
    // and maybeGenerateNextKnockoutRound creates each successive round.
    for (let week = KNOCKOUT_START_WEEK; week <= SEASON_END_WEEK; week++) {
      await advanceGameWeek({
        dbHandle: db, season: 1, week,
        playerClubId: 1, saveId: -1, rng: new SeededRng(week + 1),
      });
    }

    // A cup competition advanced beyond round 1.
    const cup = rawDb.prepare(
      "SELECT id FROM competitions WHERE season = 1 AND type = 'cup' AND league_id = 1",
    ).get() as { id: number };
    const maxRound = rawDb.prepare(
      "SELECT MAX(CAST(round AS INTEGER)) AS m FROM fixtures WHERE competition_id = ? AND round IS NOT NULL",
    ).get(cup.id) as { m: number };
    expect(maxRound.m).toBeGreaterThanOrEqual(3);

    // The archiver crowned a champion for that cup (run at SEASON_END_WEEK).
    const res = rawDb.prepare(
      'SELECT champion_club_id FROM season_competition_results WHERE season = 1 AND competition_id = ?',
    ).get(cup.id) as { champion_club_id: number } | undefined;
    expect(res?.champion_club_id).toBeDefined();
  });
});
```

> **Note on bracket depth:** 20 clubs → bracket 32 → 12 byes into round 2. Round 1 has 8 ties (16 clubs play); winners (8) + 12 byes = 20 survivors → round 2 has 10 ties → 10 → round 3 (5 ties → 1 bye + 2 ties → ...). The chain reaches round ≥3 well within weeks 47-58 (each round +2 weeks: 47, 49, 51, 53, 55). The `>=3` assertion is conservative and robust to the exact bye chain.

- [ ] **Step 2: Run**

Run: `npx jest __tests__/engine/competition/cup-to-champion.e2e.test.ts`
Expected: PASS (proves Tasks 5-8 compose). If the cup does not reach round 3, debug with superpowers:systematic-debugging — likely a band/`week+2` off-by-one in `round-progression.ts` or a bye-count edge in `buildNextKnockoutRound`.

- [ ] **Step 3: Commit**

```bash
git add __tests__/engine/competition/cup-to-champion.e2e.test.ts
git commit -m "test(e2e): copa avança até campeão real pelo game loop"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full suite + type-check**

Run: `npx jest 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green (62 prior suites + 6 new = 68; 536 prior tests + new cases).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Grep for stranded references to the old constant**

Run: `grep -rn "week 46\|=== 46\|week: 46\|>= 46" __tests__ src | grep -v node_modules`
Expected: no matches (all moved to 58) — except unrelated numbers; eyeball any hit.

- [ ] **Step 3: Browser validation recap (if not already done in Task 9)**

Confirm in the browser: advancing through a full season crowns cup/CL champions (visible once a future bracket-UI epic renders them; for now confirm via no crash + season rollover), and division swaps persist across the rollover.

- [ ] **Step 4: Push (with user authorization)**

```bash
git push origin main
```

---

## Sequencing & dependencies

**Internal order (strict):**
1. Task 1 (`season_promoted` schema/queries) — foundation for Tasks 8, 9.
2. Task 2 (standings comparator) — independent; do early so Task 7's archiver H2H reuses the pattern.
3. Tasks 3, 4 (pure `knockout.ts`, `promotion.ts`) — independent of each other; Task 6 depends on Task 3; Tasks 8, 9 depend on Task 4.
4. Task 5 (calendar band + constants) — required before Task 6/10 so knockouts have free weeks; touches the three week-46 tests.
5. Task 6 (round-progression hook) — depends on Tasks 3, 5.
6. Task 7 (archiver shootout read + H2H) — depends on Tasks 2, 6 (shootout events).
7. Task 8 (archiver promotions) — depends on Tasks 1, 4.
8. Task 9 (screen wiring) — depends on Tasks 1, 4, 8.
9. Task 10 (e2e) — depends on Tasks 5, 6, 7, 8.
10. Task 11 — last.

**Cross-epic dependencies (do NOT redesign — reference only):**
- **`save-isolation`** owns `save_id` on world tables + the idempotent migration mechanism in `database-store.ts`. This epic appends `season_promoted` to `SCHEMA_SQL` and the idempotent block (Task 1) using that existing mechanism (`CREATE TABLE IF NOT EXISTS`). If save-isolation lands first, add `save_id` to `season_promoted` and pass it through `createFixture`/`createCompetition`/`insertPromotedIgnore`; otherwise save-isolation adds it uniformly. No separate migration framework introduced.
- **`db-hardening`** owns indexes, transaction wrapping, FK-on in tests. The per-week round generation (`round-progression.ts`) benefits from an index on `fixtures(competition_id, round, played)` — **requested from db-hardening**, not defined here. The division-swap `UPDATE clubs` batch and round-insert loop should run inside db-hardening's transaction wrapper for the rollover/week-advance once available.
- **`ai-world-alive`** (parallel): AI knockout ties currently resolve via `simulateAiMatch` (reputation coin-flip in `game-loop.ts`), which is sufficient because `resolveKnockoutTie` only needs goals + a draw flag. No ordering dependency.
- **`match-consequences`** (parallel): the `'penalty_shootout'` event type is additive; the shootout uses the seeded RNG without conflicting with suspension/injury tracking. `persistMatchStats` (game-loop.ts:53-85) ignores unknown event types, so the sentinel event does not corrupt player stats.

## Definition of done

- `npx tsc --noEmit` exits 0.
- `npx jest` fully green (existing 62 suites still pass — including the now-`week:58` `game-loop.test.ts`/`week-advance.test.ts`; plus 6 new suites).
- Every epic gap is covered: cup/CL advance round-by-round (Tasks 3, 5, 6, 10); promotion/relegation physically move clubs (Tasks 1, 4, 8, 9); no same-week double fixture (Task 5 collision test); bye math correct, no stranded teams (Tasks 3, 6, 10); shootouts resolve draws + archiver reads the real winner (Tasks 3, 6, 7); H2H tiebreaker in both standings paths (Tasks 2, 7).
- The End-of-Season screen is browser-validated: division swaps persist across rollover and `wasPromoted` reaches the board (Task 9).
- No placeholders: every cited path, signature, and line range was verified against the source before writing.

---

## Plan self-review

- **Spec coverage:** all six findings mapped to tasks (see Definition of done). The "dedicated knockout week band" alternative (not multi-fixture-per-week) is implemented in Task 5; the collision test is the regression net for finding #3.
- **Signature consistency:** `FixtureInput` (`fixture-generator.ts:1-8`) reused by `knockout.ts`/`seedClChampionsKnockout`; `SeededRng` (`rng.ts`) and its `.next()` used for the shootout; `createFixture`/`addMatchEvent` signatures (`fixtures.ts:53-118`) match the `round: String(number)` and sentinel-event usage; `League` shape (`@/types`, fields `countryId`/`divisionLevel`/`promotionSpots`/`relegationSpots`) matches `promotion.ts`; `MatchEventType` union extended in `match.ts` so `addMatchEvent({type:'penalty_shootout'})` type-checks. `archiveLeague`'s new return type is threaded through `archiveSeason`.
- **Constant change reconciled:** `SEASON_END_WEEK` (balance.ts, used by `advanceGameWeek`) AND `SEASON_LENGTH` (week-advance.ts, legacy pure helper) both 46→58; the three hardcoded-46 tests (`week-advance.test.ts`, `game-loop.test.ts` ×2) updated in Task 5. `RETIREMENT_ANNOUNCE_WINDOW_*` offsets are relative to `SEASON_END_WEEK`, so the retirement window shifts automatically (no test breakage expected; `retirement-streak.test.ts` reads the constant, not 46).
- **Placeholder scan:** no TBD/`...`/"similar to Task N"; each task repeats full code grounded in the read source.
- **Engine purity:** `knockout.ts`, `promotion.ts`, `standings.ts` import no React/Expo. Persistence/screen wiring isolated to `round-progression.ts`, `game-loop.ts`, `season-archiver.ts`, `EndOfSeasonScreen.tsx`.
