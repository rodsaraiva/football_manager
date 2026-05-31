# Match Consequences (injuries, cards, home advantage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make matches have persistent consequences — home advantage and pressing actually alter outcomes, injuries and suspensions sideline players for the next rounds, average goals recalibrated to ~2.5/match, and the dead secondary-goal rating branch removed.

**Architecture:** The match engine stays **pure** (no React/Expo/DB). Consequence *policy* (injury duration sampling, suspension decisions) lives in a new pure module `src/engine/simulation/match-consequences.ts` that consumes `MatchEvent[]` + `SeededRng` and returns plain outcomes. All I/O (reading prior yellows, writing `injury_weeks_left`/`suspension_weeks_left`, decrement ordering, selection filters) is isolated in `src/engine/game-loop.ts` and two new typed queries in `src/database/queries/players.ts`. Sector-level home advantage and pressing modifiers go into `src/engine/simulation/team-strength.ts` (no signature change). Goal calibration is three constant edits in `src/engine/simulation/match-engine.ts`, driven by an average-goals test.

**Tech Stack:** TypeScript 5.9 (strict), Jest 29 + ts-jest, `better-sqlite3` (real in-memory DB in tests — never mocked), SQLite. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-05-31-match-consequences-design.md`
**Audit:** `docs/audit/2026-05-31-gap-audit.md` (section sim-match)

---

## File Structure

| File | Action | Why |
|---|---|---|
| `src/engine/balance.ts` | **modify** | Add consequence + tactic constants (`PRESSING_ATTACK_GAIN`, `RED_SUSPENSION_WEEKS`, `YELLOW_SUSPENSION_THRESHOLD`, `YELLOW_SUSPENSION_WEEKS`, `INJURY_DURATION_WEIGHTS`). |
| `src/engine/simulation/match-consequences.ts` | **create** | Pure module: `resolveMatchInjuries`, `resolveMatchSuspensions`. Gaps #2, #3. |
| `src/engine/simulation/team-strength.ts` | **modify** (`calculateTeamStrength` body, `:84-131`) | Apply `homeAdv` to attack/midfield/defense + pressing modifier on attack. Gaps #1, #4. |
| `src/engine/simulation/match-engine.ts` | **modify** (constants `:53-59`; `attackP` `:440-447`; header comment `:48`) | Recalibrate goal probabilities + inject pressing into `attackP`. Gaps #4, #5. |
| `src/engine/simulation/player-rating.ts` | **modify** (`:52-57`) | Remove dead secondary-goal branch. Gap #6. |
| `src/database/schema.ts` | **modify** (`players` table `:68-93`) | Add `suspension_weeks_left INTEGER NOT NULL DEFAULT 0`. |
| `src/database/queries/players.ts` | **modify** (`PlayerRow` `:11-36`, `rowToPlayer` `:60-87`, add 2 helpers) | `suspensionWeeksLeft` on `Player`; `setPlayerInjury`, `setPlayerSuspension`. |
| `src/types/player.ts` | **modify** (`Player` interface) | Add `suspensionWeeksLeft: number`. |
| `src/engine/game-loop.ts` | **modify** (`PlayerForPick` `:130-138`; `pickStartingEleven` `:154`; `buildSquadFromSavedIds` `:360,:366`; `buildBenchFromSavedIds` `:401`; benches `:409,:415`; `loadSquadWithAttributes` `:218-226`; post-match block `:459-549`; season rollover `:777-779`) | Orchestrate: decrement, apply injuries/suspensions, filter selection, reset on rollover. |
| `__tests__/engine/simulation/match-consequences.test.ts` | **create** | Unit tests for the pure module. |
| `__tests__/engine/simulation/team-strength.test.ts` | **modify** | Home + pressing sector tests. |
| `__tests__/engine/simulation/player-rating.test.ts` | **modify** | Lock removal of dead branch. |
| `__tests__/engine/simulation/match-engine.test.ts` | **modify** | Goal-average calibration, home win rate, attendance. |
| `__tests__/database/queries/players.test.ts` | **modify** | `setPlayerInjury`/`setPlayerSuspension` + schema default. |
| `__tests__/engine/game-loop.test.ts` | **modify** | Integration: injury/suspension persistence, decrement ordering, suspended player benched next week. |

---

### Task 1: Schema column + `Player` type + typed queries (`suspension_weeks_left`)

This is the foundation siblings depend on; do it first so the column exists for every later test.

**Files:**
- Modify: `src/database/schema.ts` (`players` table, after line 92 `will_retire_at_season_end ... DEFAULT 0`)
- Modify: `src/types/player.ts` (`Player` interface — add `suspensionWeeksLeft`)
- Modify: `src/database/queries/players.ts` (`PlayerRow` interface `:11-36`; `rowToPlayer` `:60-87`; append two helpers)
- Test: `__tests__/database/queries/players.test.ts`

**Schema changes (owned coordination):** This epic adds `suspension_weeks_left INTEGER NOT NULL DEFAULT 0` to the `CREATE TABLE players` block. Per spec §5/§8, the idempotent `ALTER TABLE players ADD COLUMN suspension_weeks_left INTEGER NOT NULL DEFAULT 0` for existing persisted DBs is **owned by `save-isolation`/`db-hardening`**; this epic only declares the column and relies on `CREATE TABLE` for fresh/in-memory DBs. Do **not** invent a separate migration mechanism.

- [ ] **Step 1: Write failing tests.**

`__tests__/database/queries/players.test.ts` already imports `createTestDb, seedTestDb, createTestDbHandle` from `'../test-helpers'` and `getPlayerById` (+ others) from `@/database/queries/players`, and already sets up `rawDb`/`db` in a `beforeEach`. **Add** `setPlayerInjury, setPlayerSuspension` to that existing `@/database/queries/players` import (do not re-import the helpers). Then append a new top-level `describe` block — it has its own `rawDb`/`db` so it is independent of the file's outer setup:

```ts
// (add setPlayerInjury, setPlayerSuspension to the existing players import at the top)

describe('suspension_weeks_left column + helpers', () => {
  let rawDb: ReturnType<typeof createTestDb>;
  let db: ReturnType<typeof createTestDbHandle>;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('seeded players default to suspension_weeks_left = 0 and expose suspensionWeeksLeft', async () => {
    const p = await getPlayerById(db, 1);
    expect(p).not.toBeNull();
    expect(p!.suspensionWeeksLeft).toBe(0);
    const row = rawDb.prepare('SELECT suspension_weeks_left AS s FROM players WHERE id = 1').get() as { s: number };
    expect(row.s).toBe(0);
  });

  it('setPlayerInjury overwrites injury_weeks_left', async () => {
    await setPlayerInjury(db, 1, 3);
    expect((await getPlayerById(db, 1))!.injuryWeeksLeft).toBe(3);
    await setPlayerInjury(db, 1, 1); // a new injury overwrites, not accumulates
    expect((await getPlayerById(db, 1))!.injuryWeeksLeft).toBe(1);
  });

  it('setPlayerSuspension accumulates suspension_weeks_left', async () => {
    await setPlayerSuspension(db, 1, 1);
    await setPlayerSuspension(db, 1, 2);
    const row = rawDb.prepare('SELECT suspension_weeks_left AS s FROM players WHERE id = 1').get() as { s: number };
    expect(row.s).toBe(3);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**
  `npx jest __tests__/database/queries/players.test.ts` → fails: `setPlayerInjury`/`setPlayerSuspension` are not exported and `suspension_weeks_left` column does not exist yet.

- [ ] **Step 3: Add the column.** In `src/database/schema.ts`, change the last line of the `players` table from:
```sql
  will_retire_at_season_end    INTEGER NOT NULL DEFAULT 0
);
```
to:
```sql
  will_retire_at_season_end    INTEGER NOT NULL DEFAULT 0,
  suspension_weeks_left        INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 4: Extend the type.** In `src/types/player.ts`, add to the `Player` interface (next to `injuryWeeksLeft`):
```ts
  suspensionWeeksLeft: number;
```

- [ ] **Step 5: Map the row.** In `src/database/queries/players.ts`, add to `PlayerRow` (after `injury_weeks_left: number;`):
```ts
  suspension_weeks_left: number;
```
and in `rowToPlayer`, after `injuryWeeksLeft: row.injury_weeks_left,`:
```ts
    suspensionWeeksLeft: row.suspension_weeks_left ?? 0,
```

- [ ] **Step 6: Add the two helpers** at the end of `src/database/queries/players.ts`:
```ts
// A new injury overwrites the remaining duration (the latest knock defines it).
export async function setPlayerInjury(db: DbHandle, playerId: number, weeks: number): Promise<void> {
  await db.prepare('UPDATE players SET injury_weeks_left = ? WHERE id = ?').run(weeks, playerId);
}

// Suspensions accumulate (a red while already banned extends the ban).
export async function setPlayerSuspension(db: DbHandle, playerId: number, weeks: number): Promise<void> {
  await db
    .prepare('UPDATE players SET suspension_weeks_left = suspension_weeks_left + ? WHERE id = ?')
    .run(weeks, playerId);
}
```

- [ ] **Step 7: Run it — expect PASS.** `npx jest __tests__/database/queries/players.test.ts`.

- [ ] **Step 8: Verify no other construction of `Player` breaks.** `npx tsc --noEmit`. If any object literal builds a `Player` without `suspensionWeeksLeft`, add it (search: `grep -rn "willRetireAtSeasonEnd:" src` and patch each literal with `suspensionWeeksLeft: 0,` or the row value). Re-run `npx tsc --noEmit` until clean.

- [ ] **Step 9: Commit.**
```
git add src/database/schema.ts src/types/player.ts src/database/queries/players.ts __tests__/database/queries/players.test.ts
git commit -m "feat: add suspension_weeks_left column + setPlayerInjury/setPlayerSuspension queries"
```

---

### Task 2: Balance constants for consequences + tactics

**Files:**
- Modify: `src/engine/balance.ts` (append a new section)
- Test: covered indirectly by Tasks 3, 4, 5 (constants have no behavior alone). No standalone test — they are exercised by the pure-module and engine tests. (Skip TDD ceremony: this is a pure constants addition with no logic, per CLAUDE.md "trivial" carve-out, but it must land before Tasks 3–5.)

- [ ] **Step 1: Append constants** to `src/engine/balance.ts`:
```ts
// ─── Match consequences (injuries, suspensions) ──────────────────────────────
// Weighted injury duration in weeks. Index 0 → 1 week, biased toward short knocks.
// Weights sum is arbitrary; sampling is proportional. 1-2w ~60%, 3-5w ~30%, 6-8w ~10%.
export const INJURY_DURATION_WEIGHTS: readonly number[] = [35, 25, 14, 9, 7, 4, 3, 3];
//                                                          1w  2w  3w 4w 5w 6w 7w 8w
export const RED_SUSPENSION_WEEKS = 1;
export const YELLOW_SUSPENSION_THRESHOLD = 5; // every 5 yellows in a season ⇒ 1-week ban
export const YELLOW_SUSPENSION_WEEKS = 1;

// ─── Tactics → match outcome ─────────────────────────────────────────────────
// Pressing modifier on attack, centred on medium (pressFactor 0.5).
// high(0.8) ⇒ +3.6% attack, low(0.3) ⇒ -2.4% attack.
export const PRESSING_ATTACK_GAIN = 0.12;
```

- [ ] **Step 2: Type-check.** `npx tsc --noEmit` (expect clean).

- [ ] **Step 3: Commit.**
```
git add src/engine/balance.ts
git commit -m "feat: add injury/suspension/pressing balance constants"
```

---

### Task 3: Pure consequence module (`match-consequences.ts`) — gaps #2, #3

**Files:**
- Create: `src/engine/simulation/match-consequences.ts`
- Test: `__tests__/engine/simulation/match-consequences.test.ts`

Grounded facts: `MatchEvent` is `{ fixtureId; minute; type; playerId; secondaryPlayerId }` (`src/types/match.ts:17-23`); `MatchEventType` includes `'injury' | 'yellow' | 'red'` (`src/types/match.ts:1`). `SeededRng.weightedPick(items, weights)` and `.nextInt(min,max)` exist (`src/engine/rng.ts:45,21`). Second-yellow path emits **two** events same minute: `'yellow'` then `'red'` (`match-engine.ts:562-571`); direct red emits one `'red'` (`:604`).

- [ ] **Step 1: Write failing tests.** Create `__tests__/engine/simulation/match-consequences.test.ts`:
```ts
import { resolveMatchInjuries, resolveMatchSuspensions } from '@/engine/simulation/match-consequences';
import { MatchEvent } from '@/types';
import { SeededRng } from '@/engine/rng';

const ev = (type: MatchEvent['type'], playerId: number, minute = 30): MatchEvent => ({
  fixtureId: 1, minute, type, playerId, secondaryPlayerId: null,
});

describe('resolveMatchInjuries', () => {
  it('returns no outcomes when there are no injury events', () => {
    expect(resolveMatchInjuries([ev('goal', 7)], new SeededRng(1))).toEqual([]);
  });

  it('samples a 1..8 week duration per injury event', () => {
    const out = resolveMatchInjuries([ev('injury', 7)], new SeededRng(1));
    expect(out).toHaveLength(1);
    expect(out[0].playerId).toBe(7);
    expect(out[0].weeks).toBeGreaterThanOrEqual(1);
    expect(out[0].weeks).toBeLessThanOrEqual(8);
  });

  it('is deterministic for the same seed', () => {
    const a = resolveMatchInjuries([ev('injury', 7), ev('injury', 9)], new SeededRng(123));
    const b = resolveMatchInjuries([ev('injury', 7), ev('injury', 9)], new SeededRng(123));
    expect(a).toEqual(b);
  });
});

describe('resolveMatchSuspensions', () => {
  it('returns no outcomes when there are no cards', () => {
    expect(resolveMatchSuspensions([ev('goal', 7)], new Map(), new SeededRng(1))).toEqual([]);
  });

  it('a red card bans the player for 1 week', () => {
    const out = resolveMatchSuspensions([ev('red', 7)], new Map(), new SeededRng(1));
    expect(out).toEqual([{ playerId: 7, weeks: 1, reason: 'red' }]);
  });

  it('crossing the 5-yellow threshold bans for 1 week (prior 4, +1 = 5)', () => {
    const out = resolveMatchSuspensions([ev('yellow', 7)], new Map([[7, 4]]), new SeededRng(1));
    expect(out).toEqual([{ playerId: 7, weeks: 1, reason: 'yellow_accumulation' }]);
  });

  it('does not re-ban inside the same multiple (prior 5, +1 = 6 ⇒ no ban)', () => {
    const out = resolveMatchSuspensions([ev('yellow', 7)], new Map([[7, 5]]), new SeededRng(1));
    expect(out).toEqual([]);
  });

  it('crosses exactly one multiple even with two yellows in one match (prior 4, +2 = 6 ⇒ 1 ban)', () => {
    const out = resolveMatchSuspensions(
      [ev('yellow', 7), ev('yellow', 7)], new Map([[7, 4]]), new SeededRng(1),
    );
    expect(out.filter(o => o.reason === 'yellow_accumulation')).toHaveLength(1);
  });

  it('second-yellow pair: counts the yellow toward accumulation AND the red as a ban', () => {
    // minute 50: a 'yellow' then a 'red' for the same player (second-yellow sending-off)
    const events = [ev('yellow', 7, 50), ev('red', 7, 50)];
    const out = resolveMatchSuspensions(events, new Map([[7, 4]]), new SeededRng(1));
    expect(out.some(o => o.reason === 'red' && o.weeks === 1)).toBe(true);
    expect(out.some(o => o.reason === 'yellow_accumulation')).toBe(true); // prior 4 + 1 = 5 crosses
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `npx jest __tests__/engine/simulation/match-consequences.test.ts` → fails: module does not exist.

- [ ] **Step 3: Implement the module.** Create `src/engine/simulation/match-consequences.ts`:
```ts
import { MatchEvent } from '@/types';
import { SeededRng } from '@/engine/rng';
import {
  INJURY_DURATION_WEIGHTS,
  RED_SUSPENSION_WEEKS,
  YELLOW_SUSPENSION_THRESHOLD,
  YELLOW_SUSPENSION_WEEKS,
} from '@/engine/balance';

export interface InjuryOutcome {
  playerId: number;
  weeks: number;
}

export interface SuspensionOutcome {
  playerId: number;
  weeks: number;
  reason: 'red' | 'yellow_accumulation';
}

const WEEK_INDEXES = INJURY_DURATION_WEIGHTS.map((_, i) => i + 1);

/** Samples a duration (weeks, 1..8) for each 'injury' event in this match. */
export function resolveMatchInjuries(events: MatchEvent[], rng: SeededRng): InjuryOutcome[] {
  const out: InjuryOutcome[] = [];
  for (const e of events) {
    if (e.type !== 'injury') continue;
    const weeks = rng.weightedPick(WEEK_INDEXES, INJURY_DURATION_WEIGHTS);
    out.push({ playerId: e.playerId, weeks });
  }
  return out;
}

/**
 * Suspensions generated by THIS match only:
 *  - each 'red' (direct or second-yellow) ⇒ RED_SUSPENSION_WEEKS.
 *  - yellow accumulation: cross a multiple of YELLOW_SUSPENSION_THRESHOLD ⇒
 *    YELLOW_SUSPENSION_WEEKS, using priorYellowsBySeason (yellows accrued BEFORE
 *    this match). Fires iff floor((prior+gained)/T) > floor(prior/T).
 * `rng` is accepted for signature symmetry/future variance; not consumed here.
 */
export function resolveMatchSuspensions(
  events: MatchEvent[],
  priorYellowsBySeason: Map<number, number>,
  rng: SeededRng,
): SuspensionOutcome[] {
  void rng;
  const out: SuspensionOutcome[] = [];

  // 1. Reds → fixed ban.
  for (const e of events) {
    if (e.type === 'red') {
      out.push({ playerId: e.playerId, weeks: RED_SUSPENSION_WEEKS, reason: 'red' });
    }
  }

  // 2. Yellow accumulation per player.
  const gainedByPlayer = new Map<number, number>();
  for (const e of events) {
    if (e.type === 'yellow') {
      gainedByPlayer.set(e.playerId, (gainedByPlayer.get(e.playerId) ?? 0) + 1);
    }
  }
  for (const [playerId, gained] of gainedByPlayer) {
    const prior = priorYellowsBySeason.get(playerId) ?? 0;
    const before = Math.floor(prior / YELLOW_SUSPENSION_THRESHOLD);
    const after = Math.floor((prior + gained) / YELLOW_SUSPENSION_THRESHOLD);
    if (after > before) {
      out.push({ playerId, weeks: YELLOW_SUSPENSION_WEEKS, reason: 'yellow_accumulation' });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run it — expect PASS.** `npx jest __tests__/engine/simulation/match-consequences.test.ts`.

- [ ] **Step 5: Type-check.** `npx tsc --noEmit`.

- [ ] **Step 6: Commit.**
```
git add src/engine/simulation/match-consequences.ts __tests__/engine/simulation/match-consequences.test.ts
git commit -m "feat: pure match-consequences module (injury durations + suspensions)"
```

---

### Task 4: Sector-level home advantage + pressing in `team-strength.ts` — gaps #1, #4

**Files:**
- Modify: `src/engine/simulation/team-strength.ts` (`calculateTeamStrength` body, `:84-131`)
- Test: `__tests__/engine/simulation/team-strength.test.ts`

Grounded facts: `homeAdvantageMult` is passed in (`team-strength.ts:18,86`) and currently applied **only** to `overall` (`:111-113`). `PRESSING_MOD` maps `low:0.3, medium:0.5, high:0.8` (`:46-50`). The existing test `'home advantage adds bonus'` (`:46-51`) only checks `overall` and must keep passing.

- [ ] **Step 1: Write failing tests.** Append to `__tests__/engine/simulation/team-strength.test.ts` (reuse the file's `makePlayer`/`defaultTactic`):
```ts
describe('home advantage applies to every sector (gap #1)', () => {
  it('isHome:true raises attack, midfield AND defense vs isHome:false', () => {
    const players = [
      makePlayer(1, 'GK', 70), makePlayer(2, 'CB', 70), makePlayer(3, 'CB', 70),
      makePlayer(4, 'LB', 70), makePlayer(5, 'RB', 70), makePlayer(6, 'CM', 70),
      makePlayer(7, 'CM', 70), makePlayer(8, 'LM', 70), makePlayer(9, 'RM', 70),
      makePlayer(10, 'ST', 70), makePlayer(11, 'ST', 70),
    ];
    const home = calculateTeamStrength({ players, tactic: defaultTactic, isHome: true });
    const away = calculateTeamStrength({ players, tactic: defaultTactic, isHome: false });
    expect(home.attack).toBeGreaterThan(away.attack);
    expect(home.midfield).toBeGreaterThan(away.midfield);
    expect(home.defense).toBeGreaterThan(away.defense);
  });
});

describe('pressing modifies attack (gap #4)', () => {
  const players = [
    makePlayer(1, 'GK', 70), makePlayer(2, 'CB', 70), makePlayer(3, 'CB', 70),
    makePlayer(4, 'LB', 70), makePlayer(5, 'RB', 70), makePlayer(6, 'CM', 70),
    makePlayer(7, 'CM', 70), makePlayer(8, 'LM', 70), makePlayer(9, 'RM', 70),
    makePlayer(10, 'ST', 70), makePlayer(11, 'ST', 70),
  ];
  it('high > medium > low pressing for the same squad', () => {
    const low = calculateTeamStrength({ players, tactic: { ...defaultTactic, pressing: 'low' }, isHome: false });
    const med = calculateTeamStrength({ players, tactic: { ...defaultTactic, pressing: 'medium' }, isHome: false });
    const high = calculateTeamStrength({ players, tactic: { ...defaultTactic, pressing: 'high' }, isHome: false });
    expect(high.attack).toBeGreaterThan(med.attack);
    expect(med.attack).toBeGreaterThan(low.attack);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `npx jest __tests__/engine/simulation/team-strength.test.ts` → new tests fail (home only changes `overall`; pressing does not touch `attack`).

- [ ] **Step 3: Implement.** In `src/engine/simulation/team-strength.ts`:
  - Add the import at the top: `import { PRESSING_ATTACK_GAIN } from '@/engine/balance';`
  - Replace the block from `const mentalityMod = MENTALITY_MOD[tactic.mentality];` (`:103`) through `if (isHome) { overall *= homeAdv; }` (`:111-113`) with:
```ts
  const mentalityMod = MENTALITY_MOD[tactic.mentality];
  const homeFactor = isHome ? homeAdv : 1;
  const pressFactor = PRESSING_MOD[tactic.pressing]; // 0.3 | 0.5 | 0.8, centred at 0.5
  const pressAttackMod = 1 + (pressFactor - 0.5) * PRESSING_ATTACK_GAIN;

  let defense = average(defenseRatings) * (1 + mentalityMod.defense) * homeFactor;
  let midfield = average(midfieldRatings) * homeFactor;
  let attack = average(attackRatings) * (1 + mentalityMod.attack) * homeFactor * pressAttackMod;

  const sectors = [defense, midfield, attack].filter((v) => v > 0);
  let overall = average(sectors); // already reflects homeFactor via the sectors
```
  Leave the missing-player penalty block (`:115-119`) and the `return { ... }` (`:121-130`) untouched.

- [ ] **Step 4: Run it — expect PASS.** `npx jest __tests__/engine/simulation/team-strength.test.ts` (new tests pass; the original `'home advantage adds bonus'` still passes because `overall` is the average of home-scaled sectors).

- [ ] **Step 5: Type-check + commit.**
```
npx tsc --noEmit
git add src/engine/simulation/team-strength.ts __tests__/engine/simulation/team-strength.test.ts
git commit -m "feat: apply home advantage to all sectors + pressing to attack in team-strength"
```

---

### Task 5: Goal calibration to ~2.5 + pressing in `attackP` — gaps #4, #5

**Files:**
- Modify: `src/engine/simulation/match-engine.ts` (constants `:53-59`; `attackP` `:440-447`; header `:48`)
- Test: `__tests__/engine/simulation/match-engine.test.ts`

Grounded facts: `attackP` reads `team.strength.attack` (already pressing-boosted after Task 4) but not `team.strength.pressing` directly. Goal paths: open-play `GOAL_BASE_PROB*6` (`:441`), corner `CORNER_GOAL_PROB` (`:510`), penalty `PENALTY_PROB` (`:537`), plus card follow-ups. The header comment says "~2.5 goals/match" (`:48`). `makeInput`/`makeSquad`/`defaultTactic` already exist in the test file (`:14-52`).

- [ ] **Step 1: Write failing calibration tests.** Append to `__tests__/engine/simulation/match-engine.test.ts`:
```ts
describe('goal calibration & home/attendance effects', () => {
  it('averages ~2.5 goals/match over 2000 balanced matches (gap #5)', () => {
    let total = 0;
    const N = 2000;
    for (let seed = 0; seed < N; seed++) {
      const input = makeInput(70, 70);
      input.rng = new SeededRng(seed);
      const r = simulateMatch(input);
      total += r.homeGoals + r.awayGoals;
    }
    const avg = total / N;
    expect(avg).toBeGreaterThanOrEqual(2.35);
    expect(avg).toBeLessThanOrEqual(2.65);
  });

  it('home side wins more than the away side over 2000 equal-squad matches (gap #1)', () => {
    let homeWins = 0, awayWins = 0;
    const N = 2000;
    for (let seed = 0; seed < N; seed++) {
      const input = makeInput(70, 70);
      input.rng = new SeededRng(seed);
      const r = simulateMatch(input);
      if (r.homeGoals > r.awayGoals) homeWins++;
      else if (r.awayGoals > r.homeGoals) awayWins++;
    }
    expect(homeWins).toBeGreaterThan(awayWins);
    const homeWinRate = homeWins / N;
    expect(homeWinRate).toBeGreaterThanOrEqual(0.40);
    expect(homeWinRate).toBeLessThanOrEqual(0.55);
  });

  it('higher attendance yields more home goals on average (gap #1 attendance)', () => {
    const N = 1500;
    let bigHomeGoals = 0, smallHomeGoals = 0;
    for (let seed = 0; seed < N; seed++) {
      const big = makeInput(70, 70); big.rng = new SeededRng(seed); big.attendance = 60000;
      const small = makeInput(70, 70); small.rng = new SeededRng(seed); small.attendance = 1000;
      bigHomeGoals += simulateMatch(big).homeGoals;
      smallHomeGoals += simulateMatch(small).homeGoals;
    }
    expect(bigHomeGoals).toBeGreaterThan(smallHomeGoals);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `npx jest __tests__/engine/simulation/match-engine.test.ts -t "goal calibration"` → the average test fails high (~3.17 per audit); attendance test likely fails because `attackP` does not yet read attendance-driven home advantage beyond what team-strength gives (Task 4 already routes `homeAdv` into `attack`, so attendance now matters — but confirm empirically; if it already passes, keep it as a regression guard).

- [ ] **Step 3: Implement.** In `src/engine/simulation/match-engine.ts`:
  - Recalibrate three constants (start at the spec's proposed values, then iterate to pass the average test):
```ts
const GOAL_BASE_PROB = 0.013;     // was 0.016 — recalibrated to ~2.5 goals/match
const PENALTY_PROB = 0.0025;      // was 0.003
const CORNER_GOAL_PROB = 0.04;    // was 0.05
```
  - Inject the team's pressing factor into `attackP` so high pressing creates marginally more chances (centred on medium = 0.5). Replace the `attackP` expression (`:440-447`):
```ts
  const pressingChanceMod = 1 + (team.strength.pressing - 0.5) * 0.10;
  const attackP =
    GOAL_BASE_PROB * 6 *
    tempo *
    (team.strength.attack / Math.max(opp.strength.defense, 1)) *
    focus.openPlayGoalMult *
    form.attackMult *
    momentumAttackMult *
    pressingChanceMod /
    Math.max(0.5, oppForm.defenseMult);
```
  - Update the header comment (`:48`) to reflect the new constants:
```ts
// ─── Constants (tuned for 30 blocks × 3 min, ~2.5 goals/match; recalibrated 2026-05-31) ──
```

- [ ] **Step 4: Iterate to PASS.** Run `npx jest __tests__/engine/simulation/match-engine.test.ts -t "goal calibration"`. If `avg` is still above 2.65, nudge `GOAL_BASE_PROB` down by 0.0005 and/or `CORNER_GOAL_PROB` down by 0.005 and re-run; if below 2.35, nudge up. The test is the oracle — do not guess past it. Keep `pressingChanceMod` factor small (0.10) so high-vs-low pressing differs ~±5% without dominating.

- [ ] **Step 5: Run the FULL match-engine suite — expect PASS.** `npx jest __tests__/engine/simulation/match-engine.test.ts`. The existing `'stronger team wins more often'` (`:82-`) and any goal-count assertions must still hold; if a pre-existing test hard-codes a goal threshold that the recalibration breaks, adjust that assertion's bound (not the calibration) and note it in the commit.

- [ ] **Step 6: Type-check + commit.**
```
npx tsc --noEmit
git add src/engine/simulation/match-engine.ts __tests__/engine/simulation/match-engine.test.ts
git commit -m "feat: recalibrate goals to ~2.5 and route pressing into chance creation"
```

---

### Task 6: Remove dead secondary-goal rating branch — gap #6

**Files:**
- Modify: `src/engine/simulation/player-rating.ts` (`:52-57`)
- Test: `__tests__/engine/simulation/player-rating.test.ts`

Grounded facts: `'goal'` events always carry `secondaryPlayerId: null` (`match-engine.ts:483,525,545`); assists are separate `'assist'` events (`:486,527`). The dead loop (`player-rating.ts:52-57`) adds +0.5 to any player whose id appears as `secondaryPlayerId` on a `'goal'` — which never happens in real matches, so it is double-counting that can only fire on a synthetic event.

- [ ] **Step 1: Write a failing test** (locks the removal: a synthetic `'goal'` with a non-null `secondaryPlayerId` must NOT give the secondary a bonus). The file **already imports** `calculatePlayerRatings, PlayerMatchInput` (`:1`), `SeededRng` (`:2`), and `MatchEvent` (`:3`) — do **not** re-import them (duplicate imports are a TS error). Append only the new `describe` block to `__tests__/engine/simulation/player-rating.test.ts`:
```ts
describe('secondary-goal branch is removed (gap #6)', () => {
  const players: PlayerMatchInput[] = [
    { id: 1, overall: 70, position: 'ST' },
    { id: 2, overall: 70, position: 'CM' },
  ];

  it('a goal with a non-null secondaryPlayerId does NOT bonus the secondary player', () => {
    // Synthetic: scorer=1, secondary=2 on a 'goal' (never produced by the engine,
    // but proves the dead branch is gone). Player 2 has no own events.
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 10, type: 'goal', playerId: 1, secondaryPlayerId: 2 },
    ];
    const withSecondary = calculatePlayerRatings(players, events, false, 0, new SeededRng(7));
    const noSecondary = calculatePlayerRatings(
      players,
      [{ fixtureId: 1, minute: 10, type: 'goal', playerId: 1, secondaryPlayerId: null }],
      false, 0, new SeededRng(7),
    );
    const p2A = withSecondary.find(r => r.playerId === 2)!.rating;
    const p2B = noSecondary.find(r => r.playerId === 2)!.rating;
    expect(p2A).toBe(p2B); // secondary on a goal must not change player 2's rating
  });

  it('an assist event still gives +0.5 exactly once', () => {
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 10, type: 'goal', playerId: 1, secondaryPlayerId: null },
      { fixtureId: 1, minute: 10, type: 'assist', playerId: 2, secondaryPlayerId: 1 },
    ];
    const noAssist = calculatePlayerRatings(players, [], false, 0, new SeededRng(7));
    const withAssist = calculatePlayerRatings(players, events, false, 0, new SeededRng(7));
    const p2NoAssist = noAssist.find(r => r.playerId === 2)!.rating;
    const p2WithAssist = withAssist.find(r => r.playerId === 2)!.rating;
    expect(Math.round((p2WithAssist - p2NoAssist) * 10) / 10).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `npx jest __tests__/engine/simulation/player-rating.test.ts -t "secondary-goal branch"` → the first test fails because the dead branch still adds +0.5 to player 2.

- [ ] **Step 3: Implement — delete the dead branch.** In `src/engine/simulation/player-rating.ts`, remove lines `:52-57`:
```ts
    // Check secondary (assists via secondaryPlayerId on goals)
    for (const e of events) {
      if (e.secondaryPlayerId === player.id && e.type === 'goal') {
        rating += 0.5;
      }
    }
```
Leave everything else (the `'assist'` case at `:38`, win/clean-sheet bonuses, clamp) intact.

- [ ] **Step 4: Run it — expect PASS.** `npx jest __tests__/engine/simulation/player-rating.test.ts` (full file; existing tests unaffected — they never set `secondaryPlayerId` on a `'goal'`).

- [ ] **Step 5: Type-check + commit.**
```
npx tsc --noEmit
git add src/engine/simulation/player-rating.ts __tests__/engine/simulation/player-rating.test.ts
git commit -m "fix: remove dead secondary-goal rating branch (double-counted assists)"
```

---

### Task 7: Wire consequences + selection filters into `game-loop.ts` — gaps #2, #3 (I/O)

This is the integration task. It depends on Tasks 1, 3 (and benefits from 2). Order inside the `if (playerFixture)` block per spec §3.4: **decrement current week first**, then apply new injuries, then new suspensions.

**Files:**
- Modify: `src/engine/game-loop.ts`
  - imports (`:1-42`): add `setPlayerInjury`, `setPlayerSuspension`; `resolveMatchInjuries`, `resolveMatchSuspensions`
  - `PlayerForPick` (`:130-138`): add `suspensionWeeksLeft`
  - `pickStartingEleven` candidate filter (`:154`): add `&& p.suspensionWeeksLeft === 0`
  - `buildSquadFromSavedIds` (`:360`, `:366`): add suspension check
  - `buildBenchFromSavedIds` (`:401`) + non-lineup benches (`:409`, `:415`): add suspension check
  - `loadSquadWithAttributes` map (`:218-226`): read `suspensionWeeksLeft`
  - post-match block: replace the injury-decrement (`:545-548`) with the ordered decrement+apply sequence
  - season rollover (`:777-779`): also zero `suspension_weeks_left` and `injury_weeks_left`
- Test: `__tests__/engine/game-loop.test.ts`

Grounded facts: `rng` flows through `advanceGameWeek` params (`:324`). `playerSquadRaw` is the player's club squad (`:475-476`). The current weekly injury decrement is `UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1) WHERE injury_weeks_left > 0 AND club_id = ?` (`:546-548`). `persistMatchStats` upserts `player_stats` (`:472`) — prior yellows must be summed **before** that upsert so this match's yellows are not double-counted in the threshold check. `fixture.season`/`fixture.competitionId` are available on `playerFixture` (`Fixture` type).

- [ ] **Step 1: Write failing integration tests.** Append to `__tests__/engine/game-loop.test.ts`. These seed a deterministic match for club 1 and assert persistence. Because events are RNG-driven, the tests **inject** a guaranteed injury/red by writing the column directly via the helper path the loop uses; but to test the *loop wiring* we drive a real match and scan many seeds for one producing the needed event, then assert the post-state. Use a helper that finds a seed yielding the target event for club 1:
```ts
import { getPlayerById, setPlayerInjury } from '@/database/queries/players';
import { resolveMatchInjuries } from '@/engine/simulation/match-consequences';

// Within the existing describe('advanceGameWeek', ...) block:

it('an injury event for a player-club player sets injury_weeks_left > 0 after the week', async () => {
  // Find a seed whose week-7 match emits an 'injury' for a club-1 player.
  let chosenSeed = -1;
  let injuredId = -1;
  for (let seed = 0; seed < 400 && chosenSeed < 0; seed++) {
    const probe = createTestDb();
    seedTestDb(probe);
    const probeDb = createTestDbHandle(probe);
    // Rebuild fixtures for this probe DB (mirror beforeEach minimally via shared calendar):
    // Simpler: reuse the main db by snapshotting is heavy; instead simulate via advanceGameWeek
    // on a throwaway DB built the same way as beforeEach.
    // (Implementation note: factor the beforeEach calendar build into a local helper
    //  `await buildCalendar(probeDb)` so it can run per-probe.)
    await buildCalendar(probeDb);
    const res = await advanceGameWeek({
      dbHandle: probeDb, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(seed),
    });
    const events = res.playerMatchResult?.events ?? [];
    // club-1 player ids:
    const club1Ids = new Set(
      (probe.prepare('SELECT id FROM players WHERE club_id = 1').all() as { id: number }[]).map(r => r.id),
    );
    const inj = events.find(e => e.type === 'injury' && club1Ids.has(e.playerId));
    if (inj) {
      const after = probe.prepare('SELECT injury_weeks_left AS w FROM players WHERE id = ?').get(inj.playerId) as { w: number };
      if (after.w > 0) { chosenSeed = seed; injuredId = inj.playerId; }
    }
    probe.close();
  }
  expect(chosenSeed).toBeGreaterThanOrEqual(0); // a seed with a persisted club-1 injury exists
  expect(injuredId).toBeGreaterThan(0);
});

it('decrements existing injuries first, so a fresh same-week injury is not zeroed', async () => {
  // Pre-injure a club-1 player who is NOT in the lineup for 2 weeks, advance, expect 1.
  const benchPlayer = rawDb.prepare(
    'SELECT id FROM players WHERE club_id = 1 ORDER BY id DESC LIMIT 1',
  ).get() as { id: number };
  await setPlayerInjury(db, benchPlayer.id, 2);
  await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(42) });
  const after = (await getPlayerById(db, benchPlayer.id))!.injuryWeeksLeft;
  expect(after).toBe(1); // 2 → 1 (decrement ran), not 0 and not re-bumped
});

it('a suspended player is not selected in the XI the following week', async () => {
  // Suspend the highest-overall club-1 outfield player, then advance; that player
  // must not appear in this week's player-club ratings (sat out).
  const candidate = rawDb.prepare(
    "SELECT id FROM players WHERE club_id = 1 AND position != 'GK' ORDER BY id ASC LIMIT 1",
  ).get() as { id: number };
  rawDb.prepare('UPDATE players SET suspension_weeks_left = 1 WHERE id = ?').run(candidate.id);

  const res = await advanceGameWeek({
    dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(42),
  });
  const fixtureRow = rawDb.prepare(
    'SELECT home_club_id FROM fixtures WHERE season = 1 AND week = 7 AND (home_club_id = 1 OR away_club_id = 1)',
  ).get() as { home_club_id: number };
  const ratings = fixtureRow.home_club_id === 1 ? res.playerMatchResult!.homeRatings : res.playerMatchResult!.awayRatings;
  const ratedIds = new Set(ratings.map(r => r.playerId));
  expect(ratedIds.has(candidate.id)).toBe(false);
});
```
Refactor note for Step 1: extract the `beforeEach` calendar-building body into a module-local `async function buildCalendar(db: DbHandle)` so the probe loop in the first test can reuse it; the existing `beforeEach` then calls `await buildCalendar(db)`.

- [ ] **Step 2: Run it — expect FAIL.** `npx jest __tests__/engine/game-loop.test.ts` → suspension test fails (suspended player still picked); injury-persistence test fails (no code writes `injury_weeks_left` from events).

- [ ] **Step 3: Implement — imports.** In `src/engine/game-loop.ts`:
  - Extend the players import (`:1-2`):
```ts
import { DbHandle } from '@/database/queries/players';
import {
  getPlayersByClub, getPlayerById, retirePlayer,
  setPlayerInjury, setPlayerSuspension,
} from '@/database/queries/players';
```
  (Merge with the existing `retirePlayer` import at `:31`; keep a single import block — remove the now-duplicate `import { retirePlayer } ...`.)
  - Add after the `simulateMatch` import (`:22`):
```ts
import { resolveMatchInjuries, resolveMatchSuspensions } from './simulation/match-consequences';
```

- [ ] **Step 4: Implement — `PlayerForPick` + filters.**
  - `PlayerForPick` (`:130-138`): add `suspensionWeeksLeft: number;`.
  - `loadSquadWithAttributes` push (`:218-226`): add `suspensionWeeksLeft: full.suspensionWeeksLeft,`.
  - `pickStartingEleven` candidate filter (`:154`):
```ts
      .filter(p => !selected.has(p.id) && p.fitness > 30 && p.injuryWeeksLeft === 0 && p.suspensionWeeksLeft === 0)
```
  - `buildSquadFromSavedIds` saved-slot check (`:360`):
```ts
        if (p && p.injuryWeeksLeft === 0 && p.suspensionWeeksLeft === 0 && p.fitness > 30 && !usedIds.has(p.id)) {
```
  - `buildSquadFromSavedIds` fallback filter (`:366`):
```ts
            .filter(q => !usedIds.has(q.id) && q.injuryWeeksLeft === 0 && q.suspensionWeeksLeft === 0 && q.fitness > 30)
```
  - `buildBenchFromSavedIds` filter (`:401`):
```ts
        .filter((p): p is PlayerForPick => p != null && !startIds.has(p.id) && p.injuryWeeksLeft === 0 && p.suspensionWeeksLeft === 0 && p.fitness > 30)
```
  - Non-lineup home bench filter (`:409`) and away bench filter (`:415`): add `&& p.suspensionWeeksLeft === 0` after each `p.injuryWeeksLeft === 0`.

- [ ] **Step 5: Implement — ordered decrement + apply.** Replace the current injury-decrement block (`:545-548`):
```ts
    // 7. Update injuries for player's club
    await db.prepare(
      'UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1) WHERE injury_weeks_left > 0 AND club_id = ?',
    ).run(playerClubId);
```
with:
```ts
    // 7. Tick down current injuries/suspensions FIRST (the current week "passes"),
    //    so a fresh injury/ban created below counts from next week (spec §3.4).
    await db.prepare(
      'UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1) WHERE injury_weeks_left > 0 AND club_id = ?',
    ).run(playerClubId);
    await db.prepare(
      'UPDATE players SET suspension_weeks_left = MAX(0, suspension_weeks_left - 1) WHERE suspension_weeks_left > 0 AND club_id = ?',
    ).run(playerClubId);

    // 7a. Apply NEW injuries from this match (player club only).
    const playerClubIdSet = new Set(playerSquadRaw.map(p => p.id));
    const injuries = resolveMatchInjuries(matchResult.events, rng);
    for (const inj of injuries) {
      if (playerClubIdSet.has(inj.playerId)) {
        await setPlayerInjury(db, inj.playerId, inj.weeks);
      }
    }

    // 7b. Apply NEW suspensions. priorYellows = season-to-date yellows BEFORE this
    //     match (persistMatchStats already ran, so subtract this match's yellows).
    const priorYellowsBySeason = new Map<number, number>();
    for (const pid of playerClubIdSet) {
      const row = await db.prepare(
        'SELECT COALESCE(SUM(yellow_cards), 0) AS y FROM player_stats WHERE player_id = ? AND season = ?',
      ).get(pid, playerFixture.season) as { y: number };
      const thisMatchYellows = matchResult.events.filter(
        e => e.type === 'yellow' && e.playerId === pid,
      ).length;
      priorYellowsBySeason.set(pid, Math.max(0, row.y - thisMatchYellows));
    }
    const suspensions = resolveMatchSuspensions(matchResult.events, priorYellowsBySeason, rng);
    for (const s of suspensions) {
      if (playerClubIdSet.has(s.playerId)) {
        await setPlayerSuspension(db, s.playerId, s.weeks);
      }
    }
```
Note: `playerSquadRaw` is defined at `:475-476`, **before** the fitness loop. The new block sits after the fitness loop (`:531-542`) but inside the `if (playerFixture)` block, so `playerSquadRaw` and `matchResult` are in scope. Keep `persistMatchStats` (`:472`) before this block — confirmed by the subtraction of `thisMatchYellows`.

- [ ] **Step 6: Implement — season rollover reset.** In the rollover `UPDATE` (`:777-779`), extend to clear both columns for remaining squad players:
```ts
    await db.prepare(
      'UPDATE players SET will_retire_at_season_end = 0, consecutive_low_morale_weeks = 0, suspension_weeks_left = 0, injury_weeks_left = 0 WHERE club_id IS NOT NULL',
    ).run();
```

- [ ] **Step 7: Run it — expect PASS.** `npx jest __tests__/engine/game-loop.test.ts`. All new tests and all 18 pre-existing tests in the file must pass.

- [ ] **Step 8: Type-check + commit.**
```
npx tsc --noEmit
git add src/engine/game-loop.ts __tests__/engine/game-loop.test.ts
git commit -m "feat: persist match injuries/suspensions, decrement-first ordering, bench suspended players"
```

---

### Task 8: Full-suite regression + verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite.** `npm test`. Expected: 63 suites green (62 baseline + `match-consequences.test.ts`), all `5xx` tests pass. Pay attention to:
  - `__tests__/database/seed.test.ts` / `__tests__/database/schema.test.ts` — the new column must not break seeding (seed INSERTs omit it; `DEFAULT 0` covers it — grounded: `src/database/seed.ts:24,73` list explicit columns without `suspension_weeks_left`).
  - `__tests__/e2e/full-season.e2e.test.ts` and `week-advance` — verify season-long advancement with the new decrement+rollover still archives and wraps correctly.
- [ ] **Step 2: Type-check.** `npx tsc --noEmit` (clean).
- [ ] **Step 3: If any pre-existing test fails**, use `superpowers:systematic-debugging` to find the root cause (likely a hard-coded goal-count bound made stale by recalibration, or a `Player` literal missing `suspensionWeeksLeft`). Fix the cause, not the symptom; re-run.
- [ ] **Step 4: No browser validation required** — this epic changes engine/DB only, no screen or component (spec §7). If a later screen consumes `suspension_weeks_left`, that is a separate epic.
- [ ] **Step 5: Final commit** if any debugging fixes were needed:
```
git add -A
git commit -m "test: stabilize suite after goals recalibration + suspension column"
```

---

## Sequencing & dependencies

- **Order:** Task 1 (schema/type/queries) → Task 2 (constants) → Task 3 (pure module) → Task 4 (team-strength) → Task 5 (calibration) → Task 6 (rating cleanup) → Task 7 (game-loop wiring, depends on 1+3) → Task 8 (regression). Tasks 3, 4, 5, 6 are independent of each other and could be parallelized, but 7 needs 1+3 landed.
- **Cross-epic (spec §8):**
  - `save-isolation` / `db-hardening` own the **idempotent migration** that adds `suspension_weeks_left` to *existing persisted* DBs (`ALTER TABLE players ADD COLUMN suspension_weeks_left INTEGER NOT NULL DEFAULT 0`). This epic only adds the column to `CREATE TABLE` (covers fresh + in-memory test DBs) and **declares** the migration need — it does not build a parallel migration framework. `ADD COLUMN ... DEFAULT 0` is idempotent-friendly, so landing order is safe either way.
  - `world-sim` will later route AI×AI matches through `simulateMatch` and can reuse `resolveMatchInjuries`/`resolveMatchSuspensions` per club for free — this epic keeps those helpers pure and club-agnostic precisely to enable that, but does **not** implement the AI path (out of scope, spec §9). Until then, consequences affect only the human club.
  - No dependency on `competitions-real`, `progression-wired`, or `match-injuries-screen`.

## Definition of done

- `npx tsc --noEmit` clean.
- `npm test` green: all pre-existing suites + the new `match-consequences.test.ts`; calibration test asserts mean goals ∈ [2.35, 2.65]; home-win-rate test asserts home > away; suspension/injury persistence + decrement-ordering integration tests pass.
- Every audit gap in this epic has a covering task: #1 home advantage (Task 4 + Task 5 home-win test), #2 injuries sideline players (Tasks 3, 7), #3 red/yellow suspensions (Tasks 3, 7), #4 pressing affects chances (Tasks 4, 5), #5 ~2.5 goals (Task 5), #6 dead rating branch (Task 6).
- No browser validation needed (engine/DB only, no UI change).
- Commits are small and per-context (one per task), each explaining the *why*.

---

## Plan self-review

- **Spec coverage:** all six gaps mapped to tasks (see Definition of done). The "non-gap" AI×AI coin-flip is explicitly left out (Task 7 only writes for `playerClubId`; helpers kept pure for `world-sim`).
- **Placeholder scan:** no TBD. Calibration constants have concrete starting values (`GOAL_BASE_PROB=0.013`, `PENALTY_PROB=0.0025`, `CORNER_GOAL_PROB=0.04`) and an explicit test-driven iteration loop (Task 5 Step 4) — the test is the oracle, declared, not a placeholder.
- **Type/signature consistency:** `setPlayerInjury(db, playerId, weeks)` / `setPlayerSuspension(db, playerId, weeks)` match spec §3.5; `resolveMatchInjuries(events, rng): InjuryOutcome[]` and `resolveMatchSuspensions(events, priorYellowsBySeason, rng): SuspensionOutcome[]` match spec §3.1; `DbHandle`/`MatchEvent`/`SeededRng` signatures verified against `players.ts:3-9`, `match.ts:17-23`, `rng.ts:21-45`. `calculateTeamStrength` signature unchanged (body-only edit). `PlayerForStrength` and `PlayerForPick` field lists grounded in `team-strength.ts:5-12` and `game-loop.ts:130-138`.
- **Decrement-before-apply** ordering identical across Task 7 Step 5 and spec §3.4/§4 — a fresh injury/ban survives the same-week decrement.
- **Pure-engine invariant:** `match-consequences.ts` imports only `MatchEvent` (type), `SeededRng`, and balance constants — no React/Expo/DB. I/O confined to `game-loop.ts` + `players.ts`.
