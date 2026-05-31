# Progression Wired Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make minutes, performance, training focus, staff, and morale actually drive player development, decline, retirement, and morale dynamics — by feeding real per-player data (from `player_stats`, `staff`, `clubs.training_focus`) into the already-correct progression/potential/staff/morale/retirement engine paths, and exposing a minimal morale-management surface.

**Architecture:** The engine stays **pure** (no React/Expo). All DB reads happen in the wiring layer (`game-loop.ts`, `EndOfSeasonScreen.tsx`, screens), which threads real values into pure functions. New pure pieces: a `staffTrainingBonus` slot in `ProgressionInput`; a `morale/morale-engine.ts` (match delta, weekly drift, clamp); a `morale/team-talk.ts` (tone delta); `detectOrdinaryRetirements` in the retirement engine. Fractional weekly gains (<0.5) are no longer rounded away each week: they accumulate in new `*_progress` REAL columns on `player_attributes`; whole points carry into the INTEGER attribute columns when `|progress| >= 1`. Training focus persists per club in `clubs.training_focus`.

**Tech Stack:** TypeScript 5.9 strict, React Native (Expo 54), Zustand, Jest 29 + ts-jest, SQLite (`expo-sqlite` runtime / `better-sqlite3` tests). **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-05-31-progression-wired-design.md`

---

## File Structure

| File | Action | Why |
|---|---|---|
| `src/engine/training/progression.ts` | Modify | Add `staffTrainingBonus` to `ProgressionInput`; `getTrainingFactor(level, staffBonus)`. |
| `src/engine/morale/morale-engine.ts` | Create | Pure `computeMatchMoraleDelta` / `computeWeeklyMoraleDrift` / `applyMoraleDelta`. |
| `src/engine/morale/team-talk.ts` | Create | Pure `computeTeamTalkDelta(tone, context)`. |
| `src/engine/retirement/retirement-engine.ts` | Modify | Add `detectOrdinaryRetirements(players, rng)`. |
| `src/engine/balance.ts` | Modify | Morale + ordinary-retirement + training constants. |
| `src/database/schema.ts` | Modify | `clubs.training_focus`; 18 `*_progress` REAL cols on `player_attributes`. |
| `src/store/database-store.ts` | Modify | Idempotent migrations (`addColumnIfMissing`) mirroring the schema additions. |
| `src/database/queries/clubs.ts` | Modify | `getClubTrainingFocus` / `setClubTrainingFocus` / `getClubCountryCode`; thread `training_focus` through `rowToClub`. |
| `src/database/queries/player-stats.ts` | Modify | `getRecentForm(db, playerId, season)`. |
| `src/types/club.ts` | Modify | `trainingFocus: TrainingFocus` field. |
| `src/store/training-store.ts` | Create | Zustand store + `setTrainingFocus` / `loadTrainingFocus`. |
| `src/engine/game-loop.ts` | Modify | Thread staff/focus/form into progression; fractional accumulation; post-match morale loop; weekly drift. |
| `src/screens/EndOfSeasonScreen.tsx` | Modify | Real `currentOverall`; staff-driven youth bonus + club country; `detectOrdinaryRetirements`. |
| `src/screens/tactics/TrainingScreen.tsx` | Modify | Persist/read focus via store+DB; i18n; theme tokens. |
| `src/screens/squad/PlayerDetailScreen.tsx` | Modify | Team-talk / praise / criticize buttons → `computeTeamTalkDelta` + `updatePlayerMorale`. |
| `src/i18n/pt.ts`, `src/i18n/en.ts` | Modify | `training.*` and `morale.*` keys (parity-tested). |
| `__tests__/engine/morale/*`, `__tests__/engine/retirement/*`, `__tests__/engine/training/*`, `__tests__/database/queries/*`, `__tests__/integration/*` | Create/Modify | TDD coverage with real `better-sqlite3`. |

**Migration note (verified):** `createAllTables` (schema.ts:372) runs only `SCHEMA_SQL`; it does **not** replay the `database-store.ts` migrations. So every new column must be added to **both** `SCHEMA_SQL` (so tests and fresh DBs have it) **and** the `addColumnIfMissing` block (so already-shipped DBs migrate). This plan does both.

---

### Task 1: `getRecentForm` query (real minutes/rating from `player_stats`)

**Files:**
- Modify: `src/database/queries/player-stats.ts` (append after `getPlayerStatsForPlayer`, ends line 111)
- Test: `__tests__/database/queries/recent-form.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/queries/recent-form.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { upsertPlayerStats, getRecentForm } from '@/database/queries/player-stats';

describe('getRecentForm', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('returns zeros for a player with no stats this season', async () => {
    const form = await getRecentForm(db, 999, 2026);
    expect(form).toEqual({ minutesPlayed: 0, totalPossibleMinutes: 0, avgRating: 0 });
  });

  it('aggregates minutes and minutes-weighted rating for the season', async () => {
    // two appearances in the same competition: 90' @ 7.0 then 90' @ 8.0
    await upsertPlayerStats(db, {
      playerId: 1, season: 2026, competitionId: 10,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 7.0, minutesPlayed: 90,
    });
    await upsertPlayerStats(db, {
      playerId: 1, season: 2026, competitionId: 10,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 8.0, minutesPlayed: 90,
    });
    const form = await getRecentForm(db, 1, 2026);
    expect(form.minutesPlayed).toBe(180);
    expect(form.totalPossibleMinutes).toBe(180); // 2 appearances * 90
    expect(form.avgRating).toBeCloseTo(7.5, 5);
  });

  it('sums across competitions and ignores other seasons', async () => {
    await upsertPlayerStats(db, {
      playerId: 2, season: 2026, competitionId: 10,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 6.0, minutesPlayed: 90,
    });
    await upsertPlayerStats(db, {
      playerId: 2, season: 2026, competitionId: 20,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 7.0, minutesPlayed: 45,
    });
    await upsertPlayerStats(db, {
      playerId: 2, season: 2025, competitionId: 10,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 9.0, minutesPlayed: 90,
    });
    const form = await getRecentForm(db, 2, 2026);
    expect(form.minutesPlayed).toBe(135);
    expect(form.totalPossibleMinutes).toBe(180); // (1+1) appearances * 90
    // minutes-weighted: (6.0*90 + 7.0*45) / 135
    expect(form.avgRating).toBeCloseTo((6.0 * 90 + 7.0 * 45) / 135, 5);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/database/queries/recent-form.test.ts`
Expected: FAIL — `getRecentForm is not a function` (export missing).

- [ ] **Step 3: Minimal implementation**

Append to `src/database/queries/player-stats.ts` (after line 111). `avg_rating` per row is already minutes-weighted within its `(player_id, season, competition_id)` group by `upsertPlayerStats`, so weighting each row's `avg_rating` by its own `minutes_played` keeps the aggregate correct across competitions. `totalPossibleMinutes` uses `appearances * 90` (the spec's per-appearance basis), not a fixed `38*90`.

```ts
export interface RecentForm {
  minutesPlayed: number;
  totalPossibleMinutes: number;
  avgRating: number;
}

export async function getRecentForm(
  db: DbHandle,
  playerId: number,
  season: number,
): Promise<RecentForm> {
  const rows = (await db
    .prepare(
      'SELECT appearances, avg_rating, minutes_played FROM player_stats WHERE player_id = ? AND season = ?',
    )
    .all(playerId, season)) as Array<{
      appearances: number;
      avg_rating: number;
      minutes_played: number;
    }>;

  let minutesPlayed = 0;
  let totalPossibleMinutes = 0;
  let weightedRatingSum = 0;
  for (const r of rows) {
    minutesPlayed += r.minutes_played;
    totalPossibleMinutes += r.appearances * 90;
    weightedRatingSum += r.avg_rating * r.minutes_played;
  }
  const avgRating = minutesPlayed > 0 ? weightedRatingSum / minutesPlayed : 0;
  return { minutesPlayed, totalPossibleMinutes, avgRating };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/database/queries/recent-form.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/queries/player-stats.ts __tests__/database/queries/recent-form.test.ts
git commit -m "feat(db): getRecentForm agrega minutos/rating reais por temporada"
```

---

### Task 2: `staffTrainingBonus` slot in `ProgressionInput` + `getTrainingFactor`

**Files:**
- Modify: `src/engine/training/progression.ts` (interface lines 5-14; `getTrainingFactor` lines 64-66; call site line 111)
- Test: `__tests__/engine/training/progression.test.ts` (extend; `makeInput` at lines 13-23)

- [ ] **Step 1: Write the failing tests** — append inside the `describe('calculateWeeklyProgression', ...)` block in `__tests__/engine/training/progression.test.ts`. (`makeInput` already exists; it needs the new field — that's why these fail until Step 3.)

```ts
  it('higher staffTrainingBonus yields monotonically larger gains for a developing player', () => {
    const low = calculateWeeklyProgression(
      makeInput({ age: 21, staffTrainingBonus: 0 }),
    ).attributeChanges.passing;
    const high = calculateWeeklyProgression(
      makeInput({ age: 21, staffTrainingBonus: 0.3 }),
    ).attributeChanges.passing;
    expect(high).toBeGreaterThan(low);
  });

  it('staffTrainingBonus of 0 keeps the previous (facility-only) behaviour', () => {
    // facilityLevel 3 → trainingFactor 1.18; bonus 0 must not change it
    const change = calculateWeeklyProgression(
      makeInput({ age: 21, staffTrainingBonus: 0 }),
    ).attributeChanges.passing;
    expect(change).toBeGreaterThan(0);
    expect(Number.isFinite(change)).toBe(true);
  });
```

Also update the shared `makeInput` factory (lines 13-23) to include the new field with a default:

```ts
const makeInput = (overrides: Partial<ProgressionInput> = {}): ProgressionInput => ({
  age: 22,
  attributes: { ...baseAttrs },
  effectivePotential: 85,
  minutesPlayedRecent: 360,
  totalPossibleMinutes: 540,
  avgRatingRecent: 7.0,
  trainingFocus: 'balanced',
  trainingFacilityLevel: 3,
  staffTrainingBonus: 0,
  ...overrides,
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/engine/training/progression.test.ts`
Expected: FAIL — TS error / `staffTrainingBonus` not in `ProgressionInput`, and the monotonic test failing.

- [ ] **Step 3: Minimal implementation** in `src/engine/training/progression.ts`.

Add the field to `ProgressionInput` (after line 13, `trainingFacilityLevel`):

```ts
  trainingFacilityLevel: number;  // 1-5
  staffTrainingBonus: number;     // 0..~0.3, from getStaffEffects().trainingBonus
}
```

Change `getTrainingFactor` (lines 64-66) to accept the bonus:

```ts
function getTrainingFactor(facilityLevel: number, staffTrainingBonus: number): number {
  return 1.0 + facilityLevel * 0.06 + staffTrainingBonus;
}
```

Destructure the new field (in the block at lines 84-93) and pass it at the call site (line 111):

```ts
    trainingFocus,
    trainingFacilityLevel,
    staffTrainingBonus,
  } = input;
```
```ts
  const trainingFactor = getTrainingFactor(trainingFacilityLevel, staffTrainingBonus);
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/engine/training/progression.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: tsc note** — the game-loop call site (game-loop.ts:483-492) now misses `staffTrainingBonus`. It is fixed in Task 8; for now confirm only this file/test compile via the targeted jest run above (full `tsc` is green again after Task 8).

- [ ] **Step 6: Commit**

```bash
git add src/engine/training/progression.ts __tests__/engine/training/progression.test.ts
git commit -m "feat(engine): ProgressionInput.staffTrainingBonus liga bônus de comissão ao ganho"
```

---

### Task 3: Morale engine (match delta, weekly drift, clamp)

**Files:**
- Modify: `src/engine/balance.ts` (append after line 38)
- Create: `src/engine/morale/morale-engine.ts`
- Test: `__tests__/engine/morale/morale-engine.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/morale/morale-engine.test.ts`:

```ts
import {
  computeMatchMoraleDelta,
  computeWeeklyMoraleDrift,
  applyMoraleDelta,
  MatchMoraleInput,
} from '@/engine/morale/morale-engine';
import { MORALE_DRIFT_TARGET } from '@/engine/balance';

const base: MatchMoraleInput = {
  result: 'win', played: true, minutesPlayed: 90, goalDiff: 1, benchStreakWeeks: 0,
};

describe('computeMatchMoraleDelta', () => {
  it('a win while playing is positive', () => {
    expect(computeMatchMoraleDelta({ ...base, result: 'win' })).toBeGreaterThan(0);
  });

  it('a loss while playing is negative', () => {
    expect(computeMatchMoraleDelta({ ...base, result: 'loss', goalDiff: -1 })).toBeLessThan(0);
  });

  it('a heavy defeat hurts more than a narrow one', () => {
    const narrow = computeMatchMoraleDelta({ ...base, result: 'loss', goalDiff: -1 });
    const heavy = computeMatchMoraleDelta({ ...base, result: 'loss', goalDiff: -4 });
    expect(heavy).toBeLessThan(narrow);
  });

  it('a prolonged bench streak is negative even on a team win', () => {
    const benched = computeMatchMoraleDelta({
      result: 'win', played: false, minutesPlayed: 0, goalDiff: 2, benchStreakWeeks: 4,
    });
    expect(benched).toBeLessThan(0);
  });

  it('a draw is near-neutral', () => {
    const d = computeMatchMoraleDelta({ ...base, result: 'draw', goalDiff: 0 });
    expect(Math.abs(d)).toBeLessThanOrEqual(1);
  });
});

describe('computeWeeklyMoraleDrift', () => {
  it('pulls a low morale upward toward the target', () => {
    const drift = computeWeeklyMoraleDrift(30);
    expect(drift).toBeGreaterThan(0);
    expect(30 + drift).toBeLessThanOrEqual(MORALE_DRIFT_TARGET);
  });

  it('pulls a high morale downward toward the target', () => {
    const drift = computeWeeklyMoraleDrift(80);
    expect(drift).toBeLessThan(0);
    expect(80 + drift).toBeGreaterThanOrEqual(MORALE_DRIFT_TARGET);
  });

  it('is zero at the target', () => {
    expect(computeWeeklyMoraleDrift(MORALE_DRIFT_TARGET)).toBe(0);
  });
});

describe('applyMoraleDelta', () => {
  it('clamps to [1,100]', () => {
    expect(applyMoraleDelta(99, +10)).toBe(100);
    expect(applyMoraleDelta(3, -10)).toBe(1);
  });
  it('rounds to an integer (morale column is INTEGER)', () => {
    expect(Number.isInteger(applyMoraleDelta(50, 2.6))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/engine/morale/morale-engine.test.ts`
Expected: FAIL — `Cannot find module '@/engine/morale/morale-engine'`.

- [ ] **Step 3: Minimal implementation**

Append to `src/engine/balance.ts`:

```ts
// Morale dynamics
export const MORALE_WIN_BONUS = 3;
export const MORALE_LOSS_PENALTY = -4;
export const MORALE_DRAW_DELTA = 0;
export const MORALE_BENCH_PENALTY = -2;          // per match while benched
export const MORALE_BENCH_STREAK_EXTRA = -0.5;   // additional per consecutive benched week
export const MORALE_HEAVY_DEFEAT_EXTRA = -1;     // applied when conceding by >=3
export const MORALE_DRIFT_TARGET = 50;
export const MORALE_DRIFT_RATE = 0.1;            // fraction of the gap closed per idle week

// Ordinary (age-based) retirement
export const ORDINARY_RETIREMENT_BASE_PROB = 0.05;   // at RETIREMENT_MIN_AGE (33)
export const ORDINARY_RETIREMENT_AGE_SLOPE = 0.07;   // added per year above the min age
```

Create `src/engine/morale/morale-engine.ts`:

```ts
import {
  MORALE_WIN_BONUS,
  MORALE_LOSS_PENALTY,
  MORALE_DRAW_DELTA,
  MORALE_BENCH_PENALTY,
  MORALE_BENCH_STREAK_EXTRA,
  MORALE_HEAVY_DEFEAT_EXTRA,
  MORALE_DRIFT_TARGET,
  MORALE_DRIFT_RATE,
} from '@/engine/balance';

export interface MatchMoraleInput {
  result: 'win' | 'draw' | 'loss';
  played: boolean;
  minutesPlayed: number;
  goalDiff: number;        // from this player's club POV (positive = won by N)
  benchStreakWeeks: number;
}

/** Pure: morale change from one matchday. */
export function computeMatchMoraleDelta(input: MatchMoraleInput): number {
  if (!input.played) {
    return MORALE_BENCH_PENALTY + input.benchStreakWeeks * MORALE_BENCH_STREAK_EXTRA;
  }
  let delta: number;
  if (input.result === 'win') delta = MORALE_WIN_BONUS;
  else if (input.result === 'loss') delta = MORALE_LOSS_PENALTY;
  else delta = MORALE_DRAW_DELTA;

  if (input.result === 'loss' && input.goalDiff <= -3) {
    delta += MORALE_HEAVY_DEFEAT_EXTRA;
  }
  return delta;
}

/** Pure: idle-week regression toward MORALE_DRIFT_TARGET. */
export function computeWeeklyMoraleDrift(currentMorale: number): number {
  return (MORALE_DRIFT_TARGET - currentMorale) * MORALE_DRIFT_RATE;
}

/** Pure: apply a delta, round to int, clamp to the schema's [1,100] CHECK. */
export function applyMoraleDelta(current: number, delta: number): number {
  return Math.max(1, Math.min(100, Math.round(current + delta)));
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/engine/morale/morale-engine.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/engine/balance.ts src/engine/morale/morale-engine.ts __tests__/engine/morale/morale-engine.test.ts
git commit -m "feat(engine): morale-engine puro (delta de jogo, drift semanal, clamp)"
```

---

### Task 4: Team-talk engine (praise / criticize / motivate)

**Files:**
- Create: `src/engine/morale/team-talk.ts`
- Test: `__tests__/engine/morale/team-talk.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/morale/team-talk.test.ts`:

```ts
import { computeTeamTalkDelta, TeamTalkInput } from '@/engine/morale/team-talk';

describe('computeTeamTalkDelta', () => {
  it('praising a player in poor form helps', () => {
    const d = computeTeamTalkDelta({ tone: 'praise', recentAvgRating: 5.5 });
    expect(d).toBeGreaterThan(0);
  });

  it('praising a player already in great form helps little or nothing', () => {
    const poor = computeTeamTalkDelta({ tone: 'praise', recentAvgRating: 5.5 });
    const great = computeTeamTalkDelta({ tone: 'praise', recentAvgRating: 8.0 });
    expect(great).toBeLessThan(poor);
  });

  it('criticizing a player in great form can backfire (negative)', () => {
    const d = computeTeamTalkDelta({ tone: 'criticize', recentAvgRating: 8.0 });
    expect(d).toBeLessThan(0);
  });

  it('criticizing a player in poor form can sting them into a small lift or neutral', () => {
    const d = computeTeamTalkDelta({ tone: 'criticize', recentAvgRating: 4.5 });
    expect(d).toBeGreaterThanOrEqual(0);
  });

  it('motivate is a small positive regardless of form', () => {
    expect(computeTeamTalkDelta({ tone: 'motivate', recentAvgRating: 6.0 })).toBeGreaterThan(0);
    expect(computeTeamTalkDelta({ tone: 'motivate', recentAvgRating: 8.0 })).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/engine/morale/team-talk.test.ts`
Expected: FAIL — `Cannot find module '@/engine/morale/team-talk'`.

- [ ] **Step 3: Minimal implementation**

Create `src/engine/morale/team-talk.ts`:

```ts
export type TeamTalkTone = 'praise' | 'criticize' | 'motivate';

export interface TeamTalkInput {
  tone: TeamTalkTone;
  recentAvgRating: number; // 0 if no recent games
}

/**
 * Pure: morale delta from a one-off manager interaction.
 * Praise rewards more when form is poor (recognition matters less when already flying).
 * Criticism backfires on in-form players but can sting an out-of-form one without hurting.
 * Motivate is a flat small lift.
 */
export function computeTeamTalkDelta(input: TeamTalkInput): number {
  const r = input.recentAvgRating;
  switch (input.tone) {
    case 'praise':
      return r >= 7.0 ? 1 : 3;
    case 'criticize':
      // in great form → resentment; poor form → neutral wake-up
      return r >= 7.0 ? -3 : 0;
    case 'motivate':
      return 2;
  }
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/engine/morale/team-talk.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/morale/team-talk.ts __tests__/engine/morale/team-talk.test.ts
git commit -m "feat(engine): team-talk puro (elogiar/criticar/motivar)"
```

---

### Task 5: `detectOrdinaryRetirements` (age-based, deterministic)

**Files:**
- Modify: `src/engine/retirement/retirement-engine.ts` (append after line 58; imports at lines 2-11)
- Test: `__tests__/engine/retirement/ordinary-retirement.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/retirement/ordinary-retirement.test.ts`:

```ts
import { detectOrdinaryRetirements, OrdinaryInput } from '@/engine/retirement/retirement-engine';
import { SeededRng } from '@/engine/rng';
import { RETIREMENT_MIN_AGE, MAX_PLAYER_AGE } from '@/engine/balance';

const mk = (over: Partial<OrdinaryInput>): OrdinaryInput => ({
  id: 1, name: 'P', age: 35, isFreeAgent: false, willRetireAtSeasonEnd: false, ...over,
});

describe('detectOrdinaryRetirements', () => {
  it('never retires a player below RETIREMENT_MIN_AGE', () => {
    const players = Array.from({ length: 50 }, (_, i) =>
      mk({ id: i, age: RETIREMENT_MIN_AGE - 1 }),
    );
    const out = detectOrdinaryRetirements(players, new SeededRng(1));
    expect(out).toHaveLength(0);
  });

  it('never re-picks a player at/above MAX_PLAYER_AGE (compulsory owns those)', () => {
    const players = [mk({ id: 1, age: MAX_PLAYER_AGE })];
    const out = detectOrdinaryRetirements(players, new SeededRng(1));
    expect(out).toHaveLength(0);
  });

  it('skips players already announced (will_retire_at_season_end)', () => {
    const players = [mk({ id: 1, age: 40, willRetireAtSeasonEnd: true })];
    const out = detectOrdinaryRetirements(players, new SeededRng(1));
    expect(out).toHaveLength(0);
  });

  it('skips free agents', () => {
    const players = [mk({ id: 1, age: 40, isFreeAgent: true })];
    const out = detectOrdinaryRetirements(players, new SeededRng(1));
    expect(out).toHaveLength(0);
  });

  it('retirement probability increases with age (more 40yos retire than 33yos)', () => {
    const young = Array.from({ length: 200 }, (_, i) => mk({ id: i, age: 33 }));
    const old = Array.from({ length: 200 }, (_, i) => mk({ id: 1000 + i, age: 40 }));
    const youngOut = detectOrdinaryRetirements(young, new SeededRng(7)).length;
    const oldOut = detectOrdinaryRetirements(old, new SeededRng(7)).length;
    expect(oldOut).toBeGreaterThan(youngOut);
  });

  it('is deterministic for the same seed', () => {
    const players = Array.from({ length: 100 }, (_, i) => mk({ id: i, age: 37 }));
    const a = detectOrdinaryRetirements(players, new SeededRng(42)).map((d) => d.playerId);
    const b = detectOrdinaryRetirements(players, new SeededRng(42)).map((d) => d.playerId);
    expect(a).toEqual(b);
  });

  it('tags the reason as max_age (effective retirement, same handling)', () => {
    const players = Array.from({ length: 200 }, (_, i) => mk({ id: i, age: 40 }));
    const out = detectOrdinaryRetirements(players, new SeededRng(3));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((d) => d.reason === 'max_age')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/engine/retirement/ordinary-retirement.test.ts`
Expected: FAIL — `detectOrdinaryRetirements is not a function`.

- [ ] **Step 3: Minimal implementation** in `src/engine/retirement/retirement-engine.ts`.

Add the two new balance constants to the existing `import { ... } from '@/engine/balance'` block (lines 2-11):

```ts
  SEASON_END_WEEK,
  ORDINARY_RETIREMENT_BASE_PROB,
  ORDINARY_RETIREMENT_AGE_SLOPE,
} from '@/engine/balance';
```

Append after `nextMoraleStreak` (line 58). `RetirementDecision.reason` is `'low_morale' | 'max_age'` (line 16); reuse `'max_age'` so callers treat the effective retirement identically. Eligible band is `[RETIREMENT_MIN_AGE, MAX_PLAYER_AGE)` — the `>= MAX_PLAYER_AGE` cohort stays with `detectCompulsoryRetirements`.

```ts
export interface OrdinaryInput {
  id: number;
  name: string;
  age: number;
  isFreeAgent: boolean;
  willRetireAtSeasonEnd: boolean;
}

/**
 * Aposentadoria ordinária por idade na faixa [RETIREMENT_MIN_AGE, MAX_PLAYER_AGE).
 * Probabilidade cresce com a idade; independe de moral. Determinística via rng.
 * Não pega quem já foi anunciado (moral) nem free agents; ≥ MAX_PLAYER_AGE é da compulsória.
 */
export function detectOrdinaryRetirements(
  players: OrdinaryInput[],
  rng: SeededRng,
): RetirementDecision[] {
  const out: RetirementDecision[] = [];
  for (const p of players) {
    if (p.isFreeAgent || p.willRetireAtSeasonEnd) continue;
    if (p.age < RETIREMENT_MIN_AGE || p.age >= MAX_PLAYER_AGE) continue;
    const prob =
      ORDINARY_RETIREMENT_BASE_PROB +
      (p.age - RETIREMENT_MIN_AGE) * ORDINARY_RETIREMENT_AGE_SLOPE;
    if (rng.next() < prob) {
      out.push({ playerId: p.id, playerName: p.name, age: p.age, reason: 'max_age' });
    }
  }
  return out;
}
```

Add the `SeededRng` import at the top of the file (the file currently imports only types/balance):

```ts
import { SeededRng } from '@/engine/rng';
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/engine/retirement/ordinary-retirement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/retirement/retirement-engine.ts src/engine/balance.ts __tests__/engine/retirement/ordinary-retirement.test.ts
git commit -m "feat(engine): detectOrdinaryRetirements (idade, determinístico)"
```

---

### Task 6: Schema + migrations — `clubs.training_focus` and `*_progress` columns

**Files:**
- Modify: `src/database/schema.ts` (clubs table lines 50-66; player_attributes lines 95-115)
- Modify: `src/store/database-store.ts` (migration block; add near lines 86-97)
- Test: `__tests__/database/schema-progression.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/schema-progression.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb } from './test-helpers';

describe('progression schema columns', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => db.close());

  it('clubs has training_focus defaulting to balanced', () => {
    const cols = db.prepare("PRAGMA table_info(clubs)").all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('training_focus');
    db.prepare(
      `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget,
        wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy,
        medical_department, primary_color, secondary_color)
       VALUES (1,'C','C',1,1,50,0,0,'S',1000,3,3,3,'#000','#fff')`,
    ).run();
    const row = db.prepare('SELECT training_focus FROM clubs WHERE id = 1').get() as { training_focus: string };
    expect(row.training_focus).toBe('balanced');
  });

  it('player_attributes has all 18 *_progress REAL columns defaulting to 0', () => {
    const cols = db.prepare("PRAGMA table_info(player_attributes)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    const progressCols = [
      'finishing_progress','passing_progress','crossing_progress','dribbling_progress',
      'heading_progress','long_shots_progress','free_kicks_progress','vision_progress',
      'composure_progress','decisions_progress','positioning_progress','aggression_progress',
      'leadership_progress','pace_progress','stamina_progress','strength_progress',
      'agility_progress','jumping_progress',
    ];
    for (const c of progressCols) expect(names).toContain(c);

    // insert a player + attributes row and confirm defaults are 0
    db.prepare(
      `INSERT INTO players (id,name,nationality,age,position,club_id,wage,contract_end,
        market_value,base_potential,effective_potential,morale,fitness)
       VALUES (1,'P','BR',30,'ST',NULL,0,0,0,80,80,70,100)`,
    ).run();
    db.prepare(
      `INSERT INTO player_attributes (player_id,finishing,passing,crossing,dribbling,heading,
        long_shots,free_kicks,vision,composure,decisions,positioning,aggression,leadership,
        pace,stamina,strength,agility,jumping)
       VALUES (1,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70)`,
    ).run();
    const row = db.prepare('SELECT passing_progress FROM player_attributes WHERE player_id = 1').get() as { passing_progress: number };
    expect(row.passing_progress).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/database/schema-progression.test.ts`
Expected: FAIL — `training_focus` missing / `no such column: passing_progress`.

- [ ] **Step 3: Minimal implementation**

In `src/database/schema.ts`, add the column to the `clubs` table (after line 65 `secondary_color`, keeping it the last column — add a comma to the prior line):

```sql
  primary_color       TEXT    NOT NULL,
  secondary_color     TEXT    NOT NULL,
  training_focus      TEXT    NOT NULL DEFAULT 'balanced'
);
```

In the `player_attributes` table (after line 114 `jumping`), append the 18 progress columns (note `jumping` gains a trailing comma):

```sql
  agility     INTEGER NOT NULL,
  jumping     INTEGER NOT NULL,
  finishing_progress   REAL NOT NULL DEFAULT 0,
  passing_progress     REAL NOT NULL DEFAULT 0,
  crossing_progress    REAL NOT NULL DEFAULT 0,
  dribbling_progress   REAL NOT NULL DEFAULT 0,
  heading_progress     REAL NOT NULL DEFAULT 0,
  long_shots_progress  REAL NOT NULL DEFAULT 0,
  free_kicks_progress  REAL NOT NULL DEFAULT 0,
  vision_progress      REAL NOT NULL DEFAULT 0,
  composure_progress   REAL NOT NULL DEFAULT 0,
  decisions_progress   REAL NOT NULL DEFAULT 0,
  positioning_progress REAL NOT NULL DEFAULT 0,
  aggression_progress  REAL NOT NULL DEFAULT 0,
  leadership_progress  REAL NOT NULL DEFAULT 0,
  pace_progress        REAL NOT NULL DEFAULT 0,
  stamina_progress     REAL NOT NULL DEFAULT 0,
  strength_progress    REAL NOT NULL DEFAULT 0,
  agility_progress     REAL NOT NULL DEFAULT 0,
  jumping_progress     REAL NOT NULL DEFAULT 0
);
```

In `src/store/database-store.ts`, add idempotent migrations near the existing player/tactics ones (after line 97). The column DB names match the schema:

```ts
      // Progression wiring: club-wide training focus + fractional attribute accumulators
      await addColumnIfMissing(db, 'clubs', 'training_focus', "TEXT NOT NULL DEFAULT 'balanced'");
      for (const c of [
        'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'long_shots',
        'free_kicks', 'vision', 'composure', 'decisions', 'positioning', 'aggression',
        'leadership', 'pace', 'stamina', 'strength', 'agility', 'jumping',
      ]) {
        await addColumnIfMissing(db, 'player_attributes', `${c}_progress`, 'REAL NOT NULL DEFAULT 0');
      }
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/database/schema-progression.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full DB/seed suite to catch column-count regressions**

Run: `npx jest __tests__/database`
Expected: PASS (seed INSERTs name columns explicitly, so the new defaulted columns do not break inserts).

- [ ] **Step 6: Commit**

```bash
git add src/database/schema.ts src/store/database-store.ts __tests__/database/schema-progression.test.ts
git commit -m "feat(db): clubs.training_focus + 18 colunas *_progress (acúmulo fracionário)"
```

---

### Task 7: Club queries — training focus + country code; `Club.trainingFocus`

**Files:**
- Modify: `src/types/club.ts` (interface; add field)
- Modify: `src/database/queries/clubs.ts` (`ClubRow` line 4-20, `rowToClub` line 22-40; append helpers)
- Test: `__tests__/database/queries/club-training-focus.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/queries/club-training-focus.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getClubTrainingFocus,
  setClubTrainingFocus,
  getClubCountryCode,
  getClubById,
} from '@/database/queries/clubs';

function seedClub(db: Database.Database, id: number, countryId: number) {
  db.prepare(
    `INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)`,
  ).run(countryId, 'Brazil', 'BR', 'South America');
  db.prepare(
    `INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 'Serie A', countryId, 1, 20, 0, 4);
  db.prepare(
    `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget,
      wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy,
      medical_department, primary_color, secondary_color)
     VALUES (?, 'C','C', ?, 1, 50, 0, 0, 'S', 1000, 3, 3, 3, '#000', '#fff')`,
  ).run(id, countryId);
}

describe('club training focus + country code', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedClub(rawDb, 1, 100);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('defaults to balanced for a fresh club', async () => {
    expect(await getClubTrainingFocus(db, 1)).toBe('balanced');
  });

  it('sets and reads a focus', async () => {
    await setClubTrainingFocus(db, 1, 'physical');
    expect(await getClubTrainingFocus(db, 1)).toBe('physical');
  });

  it('falls back to balanced for an unknown club id', async () => {
    expect(await getClubTrainingFocus(db, 999)).toBe('balanced');
  });

  it('exposes training_focus on the Club object', async () => {
    await setClubTrainingFocus(db, 1, 'technical');
    const club = await getClubById(db, 1);
    expect(club?.trainingFocus).toBe('technical');
  });

  it('derives the club country code via its league', async () => {
    expect(await getClubCountryCode(db, 1)).toBe('BR');
  });

  it('returns null country code for an unknown club', async () => {
    expect(await getClubCountryCode(db, 999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/database/queries/club-training-focus.test.ts`
Expected: FAIL — those exports don't exist / `trainingFocus` not on `Club`.

- [ ] **Step 3: Minimal implementation**

In `src/types/club.ts`, import the focus type and add the field (place the import at top; add the field after `secondaryColor`):

```ts
import { TrainingFocus } from '@/engine/training/progression';
```
```ts
  primaryColor: string;
  secondaryColor: string;
  trainingFocus: TrainingFocus;
}
```

In `src/database/queries/clubs.ts`, add `training_focus` to `ClubRow` (after line 19 `secondary_color`) and to `rowToClub` (after line 37 `secondaryColor`):

```ts
  secondary_color: string;
  training_focus: string;
}
```
```ts
    secondaryColor: row.secondary_color,
    trainingFocus: (row.training_focus as TrainingFocus) ?? 'balanced',
  };
}
```

Add the import at the top of `clubs.ts`:

```ts
import { TrainingFocus } from '@/engine/training/progression';
```

Append the helpers at the end of `clubs.ts`:

```ts
const VALID_FOCI: TrainingFocus[] = ['technical', 'tactical', 'physical', 'balanced'];

export async function getClubTrainingFocus(db: DbHandle, clubId: number): Promise<TrainingFocus> {
  const row = (await db
    .prepare('SELECT training_focus FROM clubs WHERE id = ?')
    .get(clubId)) as { training_focus: string } | undefined;
  const focus = row?.training_focus as TrainingFocus | undefined;
  return focus && VALID_FOCI.includes(focus) ? focus : 'balanced';
}

export async function setClubTrainingFocus(
  db: DbHandle,
  clubId: number,
  focus: TrainingFocus,
): Promise<void> {
  await db.prepare('UPDATE clubs SET training_focus = ? WHERE id = ?').run(focus, clubId);
}

export async function getClubCountryCode(db: DbHandle, clubId: number): Promise<string | null> {
  const row = (await db
    .prepare(
      `SELECT countries.code AS code
         FROM clubs
         JOIN leagues ON clubs.league_id = leagues.id
         JOIN countries ON leagues.country_id = countries.id
        WHERE clubs.id = ?`,
    )
    .get(clubId)) as { code: string } | undefined;
  return row?.code ?? null;
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/database/queries/club-training-focus.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc note** — adding `trainingFocus` to `Club` makes any object-literal `Club` construction (e.g. seed builders) require it; the DB-backed `rowToClub` already supplies it. Run `npx tsc --noEmit` and fix any literal `Club` constructions by adding `trainingFocus: 'balanced'` (search: `grep -rn "shortName:" src | grep -i club`). Keep this commit green.

- [ ] **Step 6: Commit**

```bash
git add src/types/club.ts src/database/queries/clubs.ts __tests__/database/queries/club-training-focus.test.ts
git commit -m "feat(db): get/setClubTrainingFocus + getClubCountryCode + Club.trainingFocus"
```

---

### Task 8: Wire real progression into the weekly loop (staff, focus, form, fractional accumulation)

**Files:**
- Modify: `src/engine/game-loop.ts` (imports lines 1-42; progression block lines 474-525)
- Test: `__tests__/integration/progression-wiring.test.ts` (create)

This is the core CRITICAL gap. The integration test drives `advanceGameWeek` end-to-end on a real in-memory DB.

- [ ] **Step 1: Write the failing test**

Create `__tests__/integration/progression-wiring.test.ts`. It seeds the full world via `seedTestDb`, picks the player's club, writes `player_stats` so two players have divergent form, runs one `advanceGameWeek`, and asserts the high-form player gains more than the benched one and that fractional progress is recorded.

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';
import { setClubTrainingFocus } from '@/database/queries/clubs';
import { upsertPlayerStats } from '@/database/queries/player-stats';

describe('progression wiring (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const club = rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number };
    clubId = club.id;
  });
  afterEach(() => rawDb.close());

  it('high-minutes/high-rating player gains more than a zero-minutes one', async () => {
    const squad = await getPlayersByClub(db, clubId);
    const [starter, reserve] = squad.slice(0, 2);
    // make both young so age doesn't early-exit, and equalize starting attributes
    rawDb.prepare('UPDATE players SET age = 21 WHERE id IN (?, ?)').run(starter.id, reserve.id);
    rawDb.prepare('UPDATE player_attributes SET passing = 60 WHERE player_id IN (?, ?)').run(starter.id, reserve.id);

    // starter: full minutes, 8.0 rating; reserve: no stats at all (0 minutes)
    await upsertPlayerStats(db, {
      playerId: starter.id, season: 2026, competitionId: 1,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 8.0, minutesPlayed: 90,
    });

    const before = rawDb.prepare(
      'SELECT player_id, passing, passing_progress FROM player_attributes WHERE player_id IN (?, ?)',
    ).all(starter.id, reserve.id) as Array<{ player_id: number; passing: number; passing_progress: number }>;

    await advanceGameWeek({ dbHandle: db, season: 2026, week: 1, playerClubId: clubId, saveId: -1, rng: new SeededRng(1) });

    const after = rawDb.prepare(
      'SELECT player_id, passing, passing_progress FROM player_attributes WHERE player_id IN (?, ?)',
    ).all(starter.id, reserve.id) as Array<{ player_id: number; passing: number; passing_progress: number }>;

    const gainOf = (pid: number) => {
      const b = before.find((r) => r.player_id === pid)!;
      const a = after.find((r) => r.player_id === pid)!;
      return (a.passing + a.passing_progress) - (b.passing + b.passing_progress);
    };
    expect(gainOf(starter.id)).toBeGreaterThan(gainOf(reserve.id));
  });

  it("'physical' focus skews gains toward physical attributes vs technical", async () => {
    const squad = await getPlayersByClub(db, clubId);
    const p = squad[0];
    rawDb.prepare('UPDATE players SET age = 21 WHERE id = ?').run(p.id);
    rawDb.prepare('UPDATE player_attributes SET passing = 60, pace = 60 WHERE player_id = ?').run(p.id);
    await setClubTrainingFocus(db, clubId, 'physical');
    await upsertPlayerStats(db, {
      playerId: p.id, season: 2026, competitionId: 1,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 7.5, minutesPlayed: 90,
    });

    const before = rawDb.prepare('SELECT passing, passing_progress, pace, pace_progress FROM player_attributes WHERE player_id = ?').get(p.id) as { passing: number; passing_progress: number; pace: number; pace_progress: number };
    await advanceGameWeek({ dbHandle: db, season: 2026, week: 1, playerClubId: clubId, saveId: -1, rng: new SeededRng(2) });
    const after = rawDb.prepare('SELECT passing, passing_progress, pace, pace_progress FROM player_attributes WHERE player_id = ?').get(p.id) as { passing: number; passing_progress: number; pace: number; pace_progress: number };

    const paceGain = (after.pace + after.pace_progress) - (before.pace + before.pace_progress);
    const passGain = (after.passing + after.passing_progress) - (before.passing + before.passing_progress);
    expect(paceGain).toBeGreaterThan(passGain);
  });

  it('fractional weekly gains accumulate in *_progress instead of vanishing', async () => {
    const squad = await getPlayersByClub(db, clubId);
    const p = squad[0];
    rawDb.prepare('UPDATE players SET age = 21 WHERE id = ?').run(p.id);
    await upsertPlayerStats(db, {
      playerId: p.id, season: 2026, competitionId: 1,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 7.0, minutesPlayed: 90,
    });
    await advanceGameWeek({ dbHandle: db, season: 2026, week: 1, playerClubId: clubId, saveId: -1, rng: new SeededRng(3) });
    const row = rawDb.prepare(
      `SELECT finishing_progress, passing_progress, pace_progress FROM player_attributes WHERE player_id = ?`,
    ).get(p.id) as Record<string, number>;
    // at least one attribute carries a non-zero fractional residue
    const anyFractional = Object.values(row).some((v) => v !== 0 && Math.abs(v) < 1);
    expect(anyFractional).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/integration/progression-wiring.test.ts`
Expected: FAIL — gains identical (hardcoded inputs) and `passing_progress` not populated.

- [ ] **Step 3: Minimal implementation** in `src/engine/game-loop.ts`.

Add imports (extend the existing import lines 16, 20, and add new ones):

```ts
import { getClubById, updateClubBudget, getClubTrainingFocus } from '@/database/queries/clubs';
import { getStaffByClub } from '@/database/queries/staff';
import { getRecentForm } from '@/database/queries/player-stats';
import { getStaffEffects } from '@/engine/staff/staff-effects';
```

(`getStaffByClub` is already imported on line 20 — do not double-import; only add `getRecentForm` and `getStaffEffects`, and extend the `clubs` import with `getClubTrainingFocus`.)

Replace the progression block (lines 477-525). Compute staff effects + focus once per club, recent form per player, pass real values, and accumulate fractionally. The 18-attr write now updates both the INTEGER column and its `*_progress` accumulator:

```ts
    const playerClubData = await getClubById(db, playerClubId);
    const trainingFacilityLevel = playerClubData?.trainingFacilities ?? 3;

    // Staff training bonus (dead-code getStaffEffects now wired in)
    const staff = await getStaffByClub(db, playerClubId);
    const abilityByRole = (role: string) =>
      staff.find((s) => s.role === role)?.ability ?? 0;
    const staffEffects = getStaffEffects({
      fitnessCoachAbility: abilityByRole('fitness_coach'),
      physioAbility: abilityByRole('physio'),
      scoutAbility: abilityByRole('scout'),
      youthCoachAbility: abilityByRole('youth_coach'),
      assistantAbility: abilityByRole('assistant'),
    });

    const trainingFocus = await getClubTrainingFocus(db, playerClubId);

    const playerClubPlayers = await getPlayersByClub(db, playerClubId);

    // attribute key → (camelCase change key, db column, db progress column)
    const ATTR_MAP: Array<{ change: keyof PlayerAttributes; col: string; prog: string }> = [
      { change: 'finishing', col: 'finishing', prog: 'finishing_progress' },
      { change: 'passing', col: 'passing', prog: 'passing_progress' },
      { change: 'crossing', col: 'crossing', prog: 'crossing_progress' },
      { change: 'dribbling', col: 'dribbling', prog: 'dribbling_progress' },
      { change: 'heading', col: 'heading', prog: 'heading_progress' },
      { change: 'longShots', col: 'long_shots', prog: 'long_shots_progress' },
      { change: 'freeKicks', col: 'free_kicks', prog: 'free_kicks_progress' },
      { change: 'vision', col: 'vision', prog: 'vision_progress' },
      { change: 'composure', col: 'composure', prog: 'composure_progress' },
      { change: 'decisions', col: 'decisions', prog: 'decisions_progress' },
      { change: 'positioning', col: 'positioning', prog: 'positioning_progress' },
      { change: 'aggression', col: 'aggression', prog: 'aggression_progress' },
      { change: 'leadership', col: 'leadership', prog: 'leadership_progress' },
      { change: 'pace', col: 'pace', prog: 'pace_progress' },
      { change: 'stamina', col: 'stamina', prog: 'stamina_progress' },
      { change: 'strength', col: 'strength', prog: 'strength_progress' },
      { change: 'agility', col: 'agility', prog: 'agility_progress' },
      { change: 'jumping', col: 'jumping', prog: 'jumping_progress' },
    ];

    for (const p of playerSquadRaw) {
      const fullPlayer = playerClubPlayers.find((pl) => pl.id === p.id);
      const form = await getRecentForm(db, p.id, season);
      const progression = calculateWeeklyProgression({
        age: fullPlayer?.age ?? 25,
        attributes: p.attributes,
        effectivePotential: fullPlayer?.effectivePotential ?? 60,
        minutesPlayedRecent: form.minutesPlayed,
        totalPossibleMinutes: form.totalPossibleMinutes,
        avgRatingRecent: form.avgRating,
        trainingFocus,
        trainingFacilityLevel,
        staffTrainingBonus: staffEffects.trainingBonus,
      });

      // Read current fractional accumulators
      const progRow = (await db
        .prepare(
          `SELECT ${ATTR_MAP.map((m) => m.prog).join(', ')} FROM player_attributes WHERE player_id = ?`,
        )
        .get(p.id)) as Record<string, number> | undefined;

      const changes = progression.attributeChanges;
      const attrs = p.attributes as Record<keyof PlayerAttributes, number>;

      const newInts: number[] = [];
      const newProgs: number[] = [];
      for (const m of ATTR_MAP) {
        const delta = changes[m.change] ?? 0;
        const acc = (progRow?.[m.prog] ?? 0) + delta;
        // carry whole points into the integer column; keep the fractional residue
        const whole = Math.trunc(acc);
        const residue = acc - whole;
        const nextInt = Math.min(99, Math.max(1, attrs[m.change] + whole));
        // if clamped, drop the residue that would push past the bound
        const clampedAtTop = attrs[m.change] + whole >= 99 && residue > 0;
        const clampedAtBottom = attrs[m.change] + whole <= 1 && residue < 0;
        newInts.push(nextInt);
        newProgs.push(clampedAtTop || clampedAtBottom ? 0 : residue);
      }

      const setClause = ATTR_MAP.map((m) => `${m.col} = ?`).join(', ') + ', ' +
        ATTR_MAP.map((m) => `${m.prog} = ?`).join(', ');
      await db
        .prepare(`UPDATE player_attributes SET ${setClause} WHERE player_id = ?`)
        .run(...newInts, ...newProgs, p.id);
    }
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/integration/progression-wiring.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check + full suite**

Run: `npx tsc --noEmit && npx jest __tests__/engine/game-loop* __tests__/engine/training`
Expected: tsc exit 0; existing game-loop/training tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/engine/game-loop.ts __tests__/integration/progression-wiring.test.ts
git commit -m "feat(engine): progressão semanal usa minutos/rating/foco/staff reais + acúmulo fracionário"
```

---

### Task 9: Post-match morale loop + weekly drift in the game loop

**Files:**
- Modify: `src/engine/game-loop.ts` (after `persistMatchStats` call line 472; fitness loop lines 527-542 supplies who played)
- Test: `__tests__/integration/morale-wiring.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/integration/morale-wiring.test.ts`. It drives several losing weeks and asserts morale of the player's squad drops, and that an age-eligible low-morale veteran gets `will_retire_at_season_end = 1` once the streak + announce window line up — closing the previously-unreachable chain.

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';

describe('morale wiring (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    clubId = (rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number }).id;
  });
  afterEach(() => rawDb.close());

  it('one matchweek changes squad morale away from the seeded value', async () => {
    const before = await getPlayersByClub(db, clubId);
    const beforeAvg = before.reduce((s, p) => s + p.morale, 0) / before.length;
    await advanceGameWeek({ dbHandle: db, season: 2026, week: 1, playerClubId: clubId, saveId: -1, rng: new SeededRng(5) });
    const after = await getPlayersByClub(db, clubId);
    const afterAvg = after.reduce((s, p) => s + p.morale, 0) / after.length;
    expect(afterAvg).not.toBe(beforeAvg);
  });

  it('sustained low morale in the announce window flags an eligible veteran to retire', async () => {
    // Force a veteran with already-low morale and a long streak; advance inside the window.
    const squad = await getPlayersByClub(db, clubId);
    const vet = squad[0];
    rawDb.prepare(
      'UPDATE players SET age = 35, morale = 10, consecutive_low_morale_weeks = 2, will_retire_at_season_end = 0 WHERE id = ?',
    ).run(vet.id);
    // Window is weeks [26..36] (SEASON_END 46, offsets 20/10). Advance week 30.
    await advanceGameWeek({ dbHandle: db, season: 2026, week: 30, playerClubId: clubId, saveId: -1, rng: new SeededRng(6) });
    const row = rawDb.prepare('SELECT will_retire_at_season_end, consecutive_low_morale_weeks, morale FROM players WHERE id = ?').get(vet.id) as { will_retire_at_season_end: number; consecutive_low_morale_weeks: number; morale: number };
    // streak crossed threshold (>=3) and announce fired
    expect(row.consecutive_low_morale_weeks).toBeGreaterThanOrEqual(3);
    expect(row.will_retire_at_season_end).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/integration/morale-wiring.test.ts`
Expected: FAIL — morale unchanged (no caller of `updatePlayerMorale`); veteran not flagged (streak never reaches 3 because morale stayed high in seed and nothing lowers it).

- [ ] **Step 3: Minimal implementation** in `src/engine/game-loop.ts`.

Add imports:

```ts
import { updatePlayerMorale } from '@/database/queries/players';
import {
  computeMatchMoraleDelta,
  computeWeeklyMoraleDrift,
  applyMoraleDelta,
} from '@/engine/morale/morale-engine';
```

(`getPlayersByClub` and `updatePlayerMorale` live in the same module already imported on lines 1-2; extend that import rather than re-import.)

Insert a morale block right after `persistMatchStats(db, playerFixture, matchResult)` (line 472), where `playerMatchResult` and the squad are known. It derives the player-club result/goalDiff and the per-player played flag (reusing the starting-eleven id set built for fitness, so compute it here too):

```ts
    // 5a. Post-match morale for the player's squad
    const isHome = playerFixture.homeClubId === playerClubId;
    const myGoals = isHome ? matchResult.homeGoals : matchResult.awayGoals;
    const oppGoals = isHome ? matchResult.awayGoals : matchResult.homeGoals;
    const goalDiff = myGoals - oppGoals;
    const result: 'win' | 'draw' | 'loss' =
      goalDiff > 0 ? 'win' : goalDiff < 0 ? 'loss' : 'draw';

    const startedIds = new Set((isHome ? homeSquad : awaySquad).map((p) => p.id));
    const moraleSquad = await getPlayersByClub(db, playerClubId);
    for (const mp of moraleSquad) {
      const played = startedIds.has(mp.id);
      const benchStreak = played ? 0 : (mp.consecutiveLowMoraleWeeks ?? 0);
      const delta = computeMatchMoraleDelta({
        result,
        played,
        minutesPlayed: played ? 90 : 0,
        goalDiff,
        benchStreakWeeks: benchStreak,
      });
      const newMorale = applyMoraleDelta(mp.morale, delta);
      if (newMorale !== mp.morale) {
        await updatePlayerMorale(db, mp.id, newMorale);
      }
    }
```

`Player.consecutiveLowMoraleWeeks` already exists on the type (player.ts:52) and is already mapped in `rowToPlayer` (players.ts:25, `consecutiveLowMoraleWeeks: row.consecutive_low_morale_weeks ?? 0`), so `mp.consecutiveLowMoraleWeeks` is available directly — no `players.ts` edit needed for this read.

For weeks where the player's club has **no fixture** (`playerFixture` is null), apply weekly drift. Add after the existing low-morale-streak SQL (after line 712), guarded on no match:

```ts
  // 7b-bis. Idle-week morale drift when the player's club did not play this week.
  if (!playerFixture) {
    const idleSquad = await getPlayersByClub(db, playerClubId);
    for (const sp of idleSquad) {
      const drift = computeWeeklyMoraleDrift(sp.morale);
      const newMorale = applyMoraleDelta(sp.morale, drift);
      if (newMorale !== sp.morale) {
        await updatePlayerMorale(db, sp.id, newMorale);
      }
    }
  }
```

The existing streak-update SQL at lines 705-712 then runs on the freshly-lowered morale, so a losing run pushes `consecutive_low_morale_weeks` up and the announce trigger at lines 714-744 fires — exactly the chain the test asserts.

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/integration/morale-wiring.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check + regression**

Run: `npx tsc --noEmit && npx jest __tests__/engine/game-loop* __tests__/engine/retirement`
Expected: tsc exit 0; existing game-loop/retirement tests green.

- [ ] **Step 6: Commit**

```bash
git add src/engine/game-loop.ts __tests__/integration/morale-wiring.test.ts
git commit -m "feat(engine): moral pós-jogo + drift semanal destravam streak/aposentadoria por moral"
```

---

### Task 10: End-of-season — real `currentOverall`, staff-driven youth, club country, ordinary retirement

**Files:**
- Modify: `src/screens/EndOfSeasonScreen.tsx` (potential block lines 367-393; youth block lines 395-429; imports lines 27-29)
- Test: `__tests__/integration/end-of-season-progression.test.ts` (create)

Because `EndOfSeasonScreen` runs its logic inline in a component, the test extracts and exercises the three pure-DB operations via small exported helpers. **Step 3 refactors the inline blocks into three exported async functions** in a new `src/engine/season/end-of-season-ops.ts` and calls them from the screen — keeping the engine-pure rule (these are DB-ops, not React) and making them testable with real SQLite.

- [ ] **Step 1: Write the failing test**

Create `__tests__/integration/end-of-season-progression.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import {
  recalcSquadPotential,
  generateClubYouth,
  applyOrdinaryRetirements,
} from '@/engine/season/end-of-season-ops';
import { getStaffEffects } from '@/engine/staff/staff-effects';
import { upsertPlayerStats } from '@/database/queries/player-stats';
import { getPlayersByClub } from '@/database/queries/players';

describe('end-of-season progression ops', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    clubId = (rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number }).id;
  });
  afterEach(() => rawDb.close());

  it('recalc uses each player real overall (a star and a weak player get different expectedRating)', async () => {
    const squad = await getPlayersByClub(db, clubId);
    const star = squad[0];
    const weak = squad[1];
    // star: strong attributes + high rating; weak: low attributes + same rating
    rawDb.prepare('UPDATE player_attributes SET finishing=90,passing=90,vision=90,composure=90,positioning=90,pace=90,stamina=90,strength=90 WHERE player_id=?').run(star.id);
    rawDb.prepare('UPDATE player_attributes SET finishing=45,passing=45,vision=45,composure=45,positioning=45,pace=45,stamina=45,strength=45 WHERE player_id=?').run(weak.id);
    rawDb.prepare('UPDATE players SET base_potential=90, effective_potential=80 WHERE id=?').run(star.id);
    rawDb.prepare('UPDATE players SET base_potential=70, effective_potential=60 WHERE id=?').run(weak.id);
    for (const id of [star.id, weak.id]) {
      await upsertPlayerStats(db, {
        playerId: id, season: 2026, competitionId: 1,
        appearances: 30, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
        rating: 7.0, minutesPlayed: 30 * 90,
      });
    }
    await recalcSquadPotential(db, clubId, 2026);
    // weak player overperformed his (low) expected rating far more than the star → his
    // effective potential should not be pinned to a flat 70 floor; it can rise above 60.
    const weakAfter = rawDb.prepare('SELECT effective_potential FROM players WHERE id=?').get(weak.id) as { effective_potential: number };
    // With currentOverall ~45, minCap = max(basePotential-20, 45) = 50, so a rise is possible and not floored at 70.
    expect(weakAfter.effective_potential).toBeLessThan(70);
  });

  it('youth quality scales with youthCoachBonus and nationality comes from club country', async () => {
    // give the club a strong youth coach
    rawDb.prepare(
      `INSERT INTO staff (id, name, role, club_id, ability, wage, contract_end)
       VALUES (9001, 'Coach', 'youth_coach', ?, 20, 1000, 2030)`,
    ).run(clubId);
    const effects = getStaffEffects({
      fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: 0,
      youthCoachAbility: 20, assistantAbility: 0,
    });
    expect(effects.youthQualityBonus).toBe(10);

    const before = (rawDb.prepare('SELECT COUNT(*) c FROM players WHERE club_id=?').get(clubId) as { c: number }).c;
    await generateClubYouth(db, clubId, 2027, new SeededRng(7777));
    const youth = rawDb.prepare('SELECT nationality, age FROM players WHERE club_id=? ORDER BY id DESC LIMIT 5').all(clubId) as Array<{ nationality: string; age: number }>;
    const after = (rawDb.prepare('SELECT COUNT(*) c FROM players WHERE club_id=?').get(clubId) as { c: number }).c;
    expect(after).toBeGreaterThan(before);
    expect(youth.every((y) => y.age >= 16 && y.age <= 18)).toBe(true);
    // nationality must not be the old hardcoded 'Local'
    expect(youth.every((y) => y.nationality !== 'Local')).toBe(true);
  });

  it('ordinary retirement retires some 38-40yo across all clubs, deterministically', async () => {
    rawDb.prepare('UPDATE players SET age = 39 WHERE id IN (SELECT id FROM players WHERE club_id IS NOT NULL LIMIT 40)').run();
    const before = (rawDb.prepare('SELECT COUNT(*) c FROM players WHERE club_id IS NOT NULL AND age=39').get() as { c: number }).c;
    const retired = await applyOrdinaryRetirements(db, new SeededRng(99));
    const after = (rawDb.prepare('SELECT COUNT(*) c FROM players WHERE club_id IS NOT NULL AND age=39').get() as { c: number }).c;
    expect(retired.length).toBeGreaterThan(0);
    expect(after).toBe(before - retired.length);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/integration/end-of-season-progression.test.ts`
Expected: FAIL — `Cannot find module '@/engine/season/end-of-season-ops'`.

- [ ] **Step 3: Minimal implementation**

Create `src/engine/season/end-of-season-ops.ts` (DB-ops module — imports query layer + pure engine, no React):

```ts
import { DbHandle } from '@/database/queries/players';
import {
  getPlayersWithAttributesByClub,
  getPlayersByClub,
  retirePlayer,
} from '@/database/queries/players';
import { getClubById, getClubCountryCode } from '@/database/queries/clubs';
import { getStaffByClub } from '@/database/queries/staff';
import { getStaffEffects } from '@/engine/staff/staff-effects';
import { calculateOverall } from '@/utils/overall';
import { recalculatePotential } from '@/engine/training/potential';
import { generateYouthPlayers } from '@/engine/youth/youth-academy';
import { detectOrdinaryRetirements, RetirementDecision } from '@/engine/retirement/retirement-engine';
import { SeededRng } from '@/engine/rng';

// Country code → display nationality for youth players.
const COUNTRY_NAME: Record<string, string> = {
  EN: 'English', ES: 'Spanish', DE: 'German', BR: 'Brazilian', FR: 'French',
};

/** Recompute effective potential for the club squad using each player's REAL overall. */
export async function recalcSquadPotential(
  db: DbHandle,
  clubId: number,
  endedSeason: number,
): Promise<void> {
  const squad = await getPlayersWithAttributesByClub(db, clubId);
  for (const player of squad) {
    const seasonStats = (await db
      .prepare('SELECT avg_rating, minutes_played FROM player_stats WHERE player_id = ? AND season = ?')
      .get(player.id, endedSeason)) as { avg_rating: number; minutes_played: number } | undefined;
    if (!seasonStats) continue;

    const minutesPercent = Math.min(100, (seasonStats.minutes_played / (38 * 90)) * 100);
    const currentOverall = calculateOverall(player.attributes, player.position);

    const result = recalculatePotential({
      basePotential: player.basePotential,
      effectivePotential: player.effectivePotential,
      currentOverall,
      seasonRatings: [{ avgRating: seasonStats.avg_rating, minutesPercent }],
    });

    if (result.newEffectivePotential !== player.effectivePotential) {
      await db.prepare('UPDATE players SET effective_potential = ? WHERE id = ?')
        .run(result.newEffectivePotential, player.id);
    }
  }
}

/** Generate youth using real staff youth bonus + club country code. */
export async function generateClubYouth(
  db: DbHandle,
  clubId: number,
  newSeason: number,
  rng: SeededRng,
): Promise<void> {
  const club = await getClubById(db, clubId);
  const staff = await getStaffByClub(db, clubId);
  const youthCoachAbility = staff.find((s) => s.role === 'youth_coach')?.ability ?? 0;
  const youthCoachBonus = getStaffEffects({
    fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: 0,
    youthCoachAbility, assistantAbility: 0,
  }).youthQualityBonus;
  const countryCode = (await getClubCountryCode(db, clubId)) ?? 'EN';
  const nationality = COUNTRY_NAME[countryCode] ?? countryCode;

  const youth = generateYouthPlayers({
    clubId,
    academyLevel: club?.youthAcademy ?? 3,
    youthCoachBonus,
    countryCode,
    rng,
  });

  const maxIdRow = (await db.prepare('SELECT MAX(id) as maxId FROM players').get()) as { maxId: number };
  let nextId = (maxIdRow?.maxId ?? 0) + 1;

  for (const y of youth) {
    await db.prepare(
      'INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      nextId, y.name, nationality, y.age, y.position, null,
      clubId, 5000, newSeason + 3, 100000,
      y.basePotential, y.basePotential, 70, 100, 0, 0,
    );
    const a = y.attributes;
    await db.prepare(
      'INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      nextId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading,
      a.longShots, a.freeKicks, a.vision, a.composure, a.decisions,
      a.positioning, a.aggression, a.leadership, a.pace, a.stamina,
      a.strength, a.agility, a.jumping,
    );
    nextId++;
  }
}

/** Age-based ordinary retirement across every club (incl. AI). */
export async function applyOrdinaryRetirements(
  db: DbHandle,
  rng: SeededRng,
): Promise<RetirementDecision[]> {
  const rows = (await db
    .prepare(
      'SELECT id, name, age, is_free_agent, will_retire_at_season_end FROM players WHERE club_id IS NOT NULL',
    )
    .all()) as Array<{ id: number; name: string; age: number; is_free_agent: number; will_retire_at_season_end: number }>;
  const decisions = detectOrdinaryRetirements(
    rows.map((r) => ({
      id: r.id, name: r.name, age: r.age,
      isFreeAgent: r.is_free_agent === 1,
      willRetireAtSeasonEnd: r.will_retire_at_season_end === 1,
    })),
    rng,
  );
  for (const d of decisions) await retirePlayer(db, d.playerId);
  return decisions;
}
```

Then in `src/screens/EndOfSeasonScreen.tsx`, replace the inline potential block (lines 367-393) with a call to `recalcSquadPotential(dbHandle, playerClubId, endedSeason)`, the inline youth block (lines 395-429) with `generateClubYouth(dbHandle, playerClubId, newSeason, new SeededRng(newSeason * 7777))`, and add `await applyOrdinaryRetirements(dbHandle, new SeededRng(newSeason * 1313))` right after youth generation. Add the import:

```ts
import { recalcSquadPotential, generateClubYouth, applyOrdinaryRetirements } from '@/engine/season/end-of-season-ops';
```

Remove the now-unused `recalculatePotential`, `generateYouthPlayers`, and `getPlayersByClub` imports from the screen if no longer referenced (tsc will flag them).

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/integration/end-of-season-progression.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check + regression**

Run: `npx tsc --noEmit && npx jest __tests__/engine __tests__/integration`
Expected: tsc exit 0; suites green.

- [ ] **Step 6: Commit**

```bash
git add src/engine/season/end-of-season-ops.ts src/screens/EndOfSeasonScreen.tsx __tests__/integration/end-of-season-progression.test.ts
git commit -m "feat(season): overall real no potencial, youth por staff/país, aposentadoria ordinária"
```

---

### Task 11: Training-focus store + persistence

**Files:**
- Create: `src/store/training-store.ts`
- Test: `__tests__/store/training-store.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `__tests__/store/training-store.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getClubTrainingFocus } from '@/database/queries/clubs';
import { useTrainingStore, setTrainingFocus, loadTrainingFocus } from '@/store/training-store';

function seedClub(db: Database.Database) {
  db.prepare(`INSERT INTO countries (id,name,code,continent) VALUES (1,'Brazil','BR','SA')`).run();
  db.prepare(`INSERT INTO leagues (id,name,country_id,division_level,num_teams,promotion_spots,relegation_spots) VALUES (1,'A',1,1,20,0,4)`).run();
  db.prepare(
    `INSERT INTO clubs (id,name,short_name,country_id,league_id,reputation,budget,wage_budget,stadium_name,stadium_capacity,training_facilities,youth_academy,medical_department,primary_color,secondary_color)
     VALUES (1,'C','C',1,1,50,0,0,'S',1000,3,3,3,'#000','#fff')`,
  ).run();
}

describe('training store', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedClub(rawDb);
    db = createTestDbHandle(rawDb);
    useTrainingStore.setState({ focus: 'balanced' });
  });
  afterEach(() => rawDb.close());

  it('setTrainingFocus updates the store and persists to the club', async () => {
    await setTrainingFocus(db, 1, 'physical');
    expect(useTrainingStore.getState().focus).toBe('physical');
    expect(await getClubTrainingFocus(db, 1)).toBe('physical');
  });

  it('loadTrainingFocus reads the persisted value into the store', async () => {
    await setTrainingFocus(db, 1, 'technical');
    useTrainingStore.setState({ focus: 'balanced' });
    await loadTrainingFocus(db, 1);
    expect(useTrainingStore.getState().focus).toBe('technical');
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npx jest __tests__/store/training-store.test.ts`
Expected: FAIL — `Cannot find module '@/store/training-store'`.

- [ ] **Step 3: Minimal implementation**

Create `src/store/training-store.ts`:

```ts
import { create } from 'zustand';
import { DbHandle } from '@/database/queries/players';
import { TrainingFocus } from '@/engine/training/progression';
import { getClubTrainingFocus, setClubTrainingFocus } from '@/database/queries/clubs';

interface TrainingState {
  focus: TrainingFocus;
  setFocus: (focus: TrainingFocus) => void;
}

export const useTrainingStore = create<TrainingState>((set) => ({
  focus: 'balanced',
  setFocus: (focus) => set({ focus }),
}));

export async function setTrainingFocus(
  db: DbHandle,
  clubId: number,
  focus: TrainingFocus,
): Promise<void> {
  useTrainingStore.getState().setFocus(focus);
  await setClubTrainingFocus(db, clubId, focus);
}

export async function loadTrainingFocus(db: DbHandle, clubId: number): Promise<void> {
  const focus = await getClubTrainingFocus(db, clubId);
  useTrainingStore.getState().setFocus(focus);
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx jest __tests__/store/training-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/training-store.ts __tests__/store/training-store.test.ts
git commit -m "feat(store): training-store (foco persistido por clube)"
```

---

### Task 12: TrainingScreen — functional, i18n, theme tokens

**Files:**
- Modify: `src/screens/tactics/TrainingScreen.tsx` (full rewrite of the body; lines 1-141)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (add `training.*` keys)
- Test: parity (`__tests__/i18n/parity.test.ts`) + browser

- [ ] **Step 1: Add i18n keys**

In **both** `src/i18n/pt.ts` and `src/i18n/en.ts` add (pt = Portuguese, en = English), keeping keys identical for parity:

pt.ts:
```ts
  'training.title': 'Foco de Treino',
  'training.subtitle': 'Escolha o foco do time nas sessões de treino',
  'training.focus_technical': 'Técnico',
  'training.focus_tactical': 'Tático',
  'training.focus_physical': 'Físico',
  'training.focus_balanced': 'Equilibrado',
  'training.desc_technical': 'Melhora finalização, passe, drible',
  'training.desc_tactical': 'Melhora posicionamento, visão, decisões',
  'training.desc_physical': 'Melhora velocidade, resistência, força',
  'training.desc_balanced': 'Evolução uniforme em todas as áreas',
  'training.active': 'Ativo',
```

en.ts:
```ts
  'training.title': 'Training Focus',
  'training.subtitle': 'Choose what your team focuses on during training sessions',
  'training.focus_technical': 'Technical',
  'training.focus_tactical': 'Tactical',
  'training.focus_physical': 'Physical',
  'training.focus_balanced': 'Balanced',
  'training.desc_technical': 'Improves finishing, passing, dribbling',
  'training.desc_tactical': 'Improves positioning, vision, decisions',
  'training.desc_physical': 'Improves pace, stamina, strength',
  'training.desc_balanced': 'Even improvement across all areas',
  'training.active': 'Active',
```

- [ ] **Step 2: Rewrite the screen** — use the store, persist on tap, theme tokens. Replace the whole component body and styles. `TrainingFocus` from the engine is the canonical type (`'technical' | 'tactical' | 'physical' | 'balanced'`).

```tsx
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, commonStyles, fontSize, spacing } from '@/theme';
import { useTranslation } from '@/i18n';
import { TrainingFocus } from '@/engine/training/progression';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { useTrainingStore, setTrainingFocus, loadTrainingFocus } from '@/store/training-store';
import type { TKey } from '@/i18n';

interface TrainingCard {
  focus: TrainingFocus;
  icon: string;
  labelKey: TKey;
  descKey: TKey;
}

const TRAINING_CARDS: TrainingCard[] = [
  { focus: 'technical', icon: '⚽', labelKey: 'training.focus_technical', descKey: 'training.desc_technical' },
  { focus: 'tactical', icon: '🧠', labelKey: 'training.focus_tactical', descKey: 'training.desc_tactical' },
  { focus: 'physical', icon: '💪', labelKey: 'training.focus_physical', descKey: 'training.desc_physical' },
  { focus: 'balanced', icon: '⚖️', labelKey: 'training.focus_balanced', descKey: 'training.desc_balanced' },
];

export function TrainingScreen() {
  const { t } = useTranslation();
  const { dbHandle } = useDatabaseStore();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const selectedFocus = useTrainingStore((s) => s.focus);

  useEffect(() => {
    if (dbHandle && playerClubId) loadTrainingFocus(dbHandle, playerClubId);
  }, [dbHandle, playerClubId]);

  function handleSelect(focus: TrainingFocus) {
    if (dbHandle && playerClubId) setTrainingFocus(dbHandle, playerClubId, focus);
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.pageTitle}>{t('training.title')}</Text>
      <Text style={styles.pageSubtitle}>{t('training.subtitle')}</Text>

      <View style={styles.grid}>
        {TRAINING_CARDS.map(({ focus, icon, labelKey, descKey }) => {
          const isSelected = selectedFocus === focus;
          return (
            <Pressable
              key={focus}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => handleSelect(focus)}
            >
              <Text style={styles.cardIcon}>{icon}</Text>
              <Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>
                {t(labelKey)}
              </Text>
              <Text style={styles.cardDescription}>{t(descKey)}</Text>
              {isSelected && (
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeText}>{t('training.active')}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
```

Theme grounding (verified): `src/theme/index.ts` exports `spacing` (line 34) and `fontSize = { xs:10, sm:12, md:14, lg:16, xl:20, xxl:28, title:34 }` (line 35) but does **not** export a `borderRadius` token (radii are inline `12`/`8` literals). So: (a) add `export const borderRadius = { sm: 6, md: 12, lg: 16 };` to `src/theme/index.ts` and ensure it's part of the theme barrel; (b) import `borderRadius` in this screen and replace the hardcoded `borderRadius: 12` (lines 96, 132) with `borderRadius.md`; (c) replace `fontSize: 36` (line 111) with `fontSize.xxl` (28 — the closest existing token; no exact 36 token exists, and 28 is the intended large-icon size). The rest of the `StyleSheet` is unchanged except those token swaps. Commit the `src/theme/index.ts` token addition together with this task.

- [ ] **Step 3: Parity + type-check**

Run: `npx jest __tests__/i18n/parity.test.ts && npx tsc --noEmit`
Expected: PASS + tsc exit 0.

- [ ] **Step 4: Wire the route (TrainingScreen is currently unreachable)**

Grounding (verified): `TrainingScreen` is **not registered** in `src/navigation/RootNavigator.tsx` or `TabNavigator.tsx` — it has no route, so it cannot be opened in the app today. To browser-validate, register it. Add a `Training` route to `RootStackParamList` in `src/navigation/types.ts` (`Training: undefined;`), import and add `<Stack.Screen name="Training" component={TrainingScreen} options={{ title: 'Training' }} />` in `RootNavigator.tsx` (alongside the other `Club*` stack screens, ~line 52), and add a navigation entry point — e.g. a row in `TacticsScreen` (or the Club overview) that `navigation.navigate('Training')`. Keep this minimal: one button/link is enough to reach the screen. Run `npx tsc --noEmit` (exit 0) after wiring.

- [ ] **Step 5: Browser validation (Playwright MCP)** — REQUIRED before marking done.

Start the web server per the project's web-dev-server note (harness background: `CI=1 npx expo start --web --port 19006`; navigate `localhost:8082`). Then:
- Open the Training screen via the new entry point. Tap each focus card → the **Active** badge moves; selection sticks.
- Reload the page → the previously selected focus is still highlighted (persisted to `clubs.training_focus`).
- Toggle EN/PT on the MainMenu, return to Training → labels/descriptions are translated.

- [ ] **Step 6: Commit**

```bash
git add src/screens/tactics/TrainingScreen.tsx src/screens/tactics/TacticsScreen.tsx src/navigation/RootNavigator.tsx src/navigation/types.ts src/theme/index.ts src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(ui): TrainingScreen funcional — foco persistido, i18n, rota, tokens de tema"
```

---

### Task 13: PlayerDetail — minimal morale surface (praise / criticize / motivate)

**Files:**
- Modify: `src/screens/squad/PlayerDetailScreen.tsx` (component body around lines 78-120; imports lines 17-21)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (add `morale.*` keys)
- Test: `__tests__/engine/morale/team-talk.test.ts` already covers the engine; this task is UI wiring → browser-validated.

- [ ] **Step 1: Add i18n keys** (both files, parity-safe)

pt.ts:
```ts
  'morale.section_title': 'Conversa',
  'morale.praise': 'Elogiar',
  'morale.criticize': 'Criticar',
  'morale.motivate': 'Motivar',
  'morale.label': 'Moral',
```
en.ts:
```ts
  'morale.section_title': 'Team Talk',
  'morale.praise': 'Praise',
  'morale.criticize': 'Criticize',
  'morale.motivate': 'Motivate',
  'morale.label': 'Morale',
```

- [ ] **Step 2: Wire the buttons** in `PlayerDetailScreen.tsx`. Add imports:

```ts
import { useTranslation } from '@/i18n';
import { updatePlayerMorale } from '@/database/queries/players';
import { getRecentForm } from '@/database/queries/player-stats';
import { computeTeamTalkDelta, TeamTalkTone } from '@/engine/morale/team-talk';
import { applyMoraleDelta } from '@/engine/morale/morale-engine';
import { useGameStore } from '@/store/game-store'; // already imported — extend if so
```

Inside the component (it already has `const { dbHandle } = useDatabaseStore();` at line 79), add local morale state seeded from the player and a handler. Use the current season from `useGameStore`:

```ts
  const { t } = useTranslation();
  const season = useGameStore((s) => s.season);
  const [morale, setMorale] = useState<number>(player?.morale ?? 50);

  useEffect(() => { setMorale(player?.morale ?? 50); }, [player?.id]);

  async function handleTeamTalk(tone: TeamTalkTone) {
    if (!dbHandle || !player) return;
    const form = await getRecentForm(dbHandle, player.id, season);
    const delta = computeTeamTalkDelta({ tone, recentAvgRating: form.avgRating });
    const next = applyMoraleDelta(morale, delta);
    setMorale(next);
    await updatePlayerMorale(dbHandle, player.id, next);
  }
```

Render a compact section (place it near the existing transfer-listing controls, reusing theme tokens; one `Pressable` per tone):

```tsx
      <View style={styles.teamTalkSection}>
        <Text style={styles.sectionTitle}>{t('morale.section_title')}</Text>
        <Text style={styles.moraleValue}>{t('morale.label')}: {morale}</Text>
        <View style={styles.teamTalkRow}>
          {(['praise', 'motivate', 'criticize'] as const).map((tone) => (
            <Pressable key={tone} style={styles.teamTalkButton} onPress={() => handleTeamTalk(tone)}>
              <Text style={styles.teamTalkButtonText}>{t(`morale.${tone}` as TKey)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
```

Add `teamTalkSection` / `teamTalkRow` / `teamTalkButton` / `teamTalkButtonText` / `moraleValue` styles using `colors`, `spacing`, `fontSize`, `borderRadius` tokens (mirror existing button styles in the file — no hardcoded colors or radii). Import `TKey` from `@/i18n`.

- [ ] **Step 3: Parity + type-check**

Run: `npx jest __tests__/i18n/parity.test.ts && npx tsc --noEmit`
Expected: PASS + tsc exit 0.

- [ ] **Step 4: Browser validation (Playwright MCP)** — REQUIRED.

Open a player's detail screen. Tap **Praise/Motivate/Criticize** → the displayed Morale value changes (up for praise/motivate; for criticize it depends on form). Navigate away and back → the new morale persists (read from DB). Toggle PT/EN → labels translate.

- [ ] **Step 5: Commit**

```bash
git add src/screens/squad/PlayerDetailScreen.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(ui): superfície mínima de moral (elogiar/criticar/motivar) no PlayerDetail"
```

---

### Task 14: Final verification

- [ ] **Step 1: Full suite + type-check**

Run: `npx jest 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green (baseline 536 + new ~30 = ~566). No suite failures.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Browser smoke (Playwright MCP)**

Start the web server (`CI=1 npx expo start --web --port 19006` in background; navigate `localhost:8082`). Walk: New Game → advance several weeks → open a couple of player detail screens (morale moved after matches) → Training screen (focus persists) → advance to end-of-season → confirm youth appear with non-`Local` nationalities and that some old players retired. No raw i18n keys, no crashes in the console.

- [ ] **Step 3: Push (with user authorization)**

```bash
git push origin main
```

---

## Sequencing & dependencies

**Order:** 1 → 2 → 3 → 4 → 5 (engine + query primitives, mostly independent) → 6 → 7 (schema then club queries; 7 needs the column from 6) → 8 (needs 1, 2, 6, 7) → 9 (needs 3; shares game-loop with 8 — land 8 first to avoid edit conflicts) → 10 (needs 5, 7) → 11 (needs 7) → 12 (needs 11) → 13 (needs 4, 1) → 14.

Tasks 2, 3, 4, 5 are independent and can be parallelized. Tasks 8 and 9 both edit `game-loop.ts`; do 8 before 9.

**Cross-epic dependencies (honest):**
- **`save-isolation`** owns the `save_id` world-table migration and the idempotent `addColumnIfMissing` mechanism this plan reuses (`database-store.ts:25`). The columns added here (`training_focus`, `*_progress`) are plain columns on `clubs`/`player_attributes`; once `save-isolation` adds `save_id` to those tables, these become per-save for free. Land this epic's migrations **after or with** save-isolation's to keep migration-block ordering clean. No separate migration framework is introduced.
- **`db-hardening`** owns indexes / transaction wrapping / FK-on in tests. `getRecentForm` and the post-match morale loop benefit from an index on `player_stats(player_id, season)` and `players(club_id)` that db-hardening should provide; without it they still work (table scan), just slower. The per-week multi-row attribute/morale writes also benefit from db-hardening's transaction wrapping but are correct without it.
- **`ai-world-alive`** owns real AI×AI simulation (today `simulateAiMatch`, game-loop.ts:187-208, is a reputation coin-flip producing no `player_stats`). Therefore this epic applies post-match **morale and progression to the player's club only** (where real stats exist). **Ordinary age-based retirement** (`applyOrdinaryRetirements`) needs no stats and already runs for **all clubs incl. AI** in this epic. When `ai-world-alive` lands real AI stats, the same morale/progression wiring can be extended to AI clubs with no engine change.
- **`board-stakes`** can reuse `applyMoraleDelta` to fold board-driven morale deltas in; interface-only, no hard dependency.
- **`match-consequences`** writes player suspensions in the same post-match window; morale writes here and suspension writes there target `players` independently (different columns), no logical conflict — coordinate only on transaction boundaries owned by db-hardening.

## Definition of done

- `npx tsc --noEmit` exits 0.
- `npx jest` fully green (baseline 536 + ~30 new, no regressions).
- New engine code is pure (no React/Expo imports in `engine/`); all DB-touching tests use real `better-sqlite3` in-memory (no mocks).
- UI tasks (12, 13) browser-validated via Playwright MCP: training focus persists across reload and is translated; morale buttons move a player's morale and persist; end-of-season produces nationality-correct youth and age-based retirements.
- Every spec gap is covered: hardcoded weekly inputs (Task 8), dead `getStaffEffects` (Tasks 8 & 10), non-functional Training Focus (Tasks 6, 7, 11, 12), `currentOverall 70` (Task 10), veteran decline / sub-0.5 rounding (Tasks 6 & 8 fractional accumulation), youth hardcoded bonus/country + ordinary retirement (Tasks 5 & 10), morale never changes + no management surface (Tasks 3, 4, 9, 13).
