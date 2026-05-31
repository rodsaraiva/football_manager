# Board Stakes — Job Security & Meetable Objectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the board a real stake — cup/promotion objectives that can actually be met, a firing game-over flow that ends the save, reputation driven by real squad strength, mechanically-effective assistants, and a corrected top-division projection label.

**Architecture:** Keep `engine/board/*`, `engine/staff/*`, `engine/training/*`, `engine/reports/*` **pure** (no React, no DB). The engine already consumes `wonCup`/`wasPromoted`/`squadAverageOverall` correctly; the work is (a) implementing the three inert pure helpers (`squadStrengthDelta`, `assistantAbilityFromStars`, the `isManagerDismissed` predicate, a `staffTrainingBonus` term in progression, a `divisionLevel`-aware projection status) with tests, and (b) feeding **real** DB-derived inputs into them at the screen/loop edge plus a new game-over route. All DB reads stay in screens/loop; all decisions stay in tested pure functions.

**Tech Stack:** TypeScript 5.9 (strict), React Native (Expo 54), React Navigation v7, Zustand, Jest 29 + ts-jest, better-sqlite3 (tests, real in-memory DB — never mocked), expo-sqlite (runtime). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-31-board-stakes-design.md`
**Audit:** `docs/audit/2026-05-31-gap-audit.md`

---

## File Structure

| File | Action | Why |
|---|---|---|
| `src/engine/balance.ts` | Modify | Add `REPUTATION_SQUAD_*` constants (curve + thresholds). |
| `src/engine/board/reputation-engine.ts` | Modify (L61) | Replace `const squadDelta = 0` with `squadStrengthDelta(squadAverageOverall)`; export the pure helper. |
| `src/engine/board/season-outcome.ts` | Create | Pure `isManagerDismissed(consequence)` predicate — centralizes the fired check for screens. |
| `src/engine/staff/staff-effects.ts` | Modify | Add pure `assistantAbilityFromStars(qualityStars)` (1-5 stars → 4-20 ability). |
| `src/engine/training/progression.ts` | Modify | Add optional `staffTrainingBonus?: number` to `ProgressionInput`, applied as a growth multiplier. |
| `src/engine/reports/classification-projection.ts` | Modify | Add `divisionLevel` input + `'continental'` status; top-N is `continental` in div 1, `promotion` below. |
| `src/database/schema.ts` | Modify (L268) | Add `ended INTEGER NOT NULL DEFAULT 0` to `save_games` CREATE. |
| `src/store/database-store.ts` | Modify (~L157) | Idempotent migration `addColumnIfMissing(db, 'save_games', 'ended', ...)`. |
| `src/database/queries/save.ts` | Create or Modify | `markSaveEnded(db, saveId)` / `isSaveEnded(db, saveId)` typed queries. |
| `src/navigation/types.ts` | Modify (L7) | Add `GameOver: { reason; trust; objectiveDescription }` to `RootStackParamList`. |
| `src/navigation/RootNavigator.tsx` | Modify (~L49) | Register `<Stack.Screen name="GameOver" ... />`. |
| `src/screens/GameOverScreen.tsx` | Create | Dismissal screen: reason + final trust + objective; CTA "Voltar ao menu" → `clearGame()` + `MainMenu`. |
| `src/screens/EndOfSeasonScreen.tsx` | Modify (L93, L295-296, L325-329) | Feed real `wonCup`/`wasPromoted`/`squadAverageOverall`; in `handleContinue`, route to `GameOver` when dismissed instead of rolling over. |
| `src/screens/reports/ReportsProjectionScreen.tsx` | Modify (L98-103, L272-279) | Pass real `divisionLevel`; render the new `continental` status. |

**Test files created:** `__tests__/engine/board/season-outcome.test.ts`, `__tests__/engine/reports/classification-projection.test.ts`, `__tests__/database/queries/save.test.ts`, `__tests__/screens/end-of-season-board.test.ts`.
**Test files extended:** `__tests__/engine/board/reputation-engine.test.ts`, `__tests__/engine/staff/staff-effects.test.ts`, `__tests__/engine/training/progression.test.ts`.

---

### Task 1: Squad-strength reputation delta (pure)

**Files:**
- Modify: `src/engine/balance.ts` (after L15, the `REPUTATION_*` block)
- Modify: `src/engine/board/reputation-engine.ts` (L61 `const squadDelta = 0`)
- Test: `__tests__/engine/board/reputation-engine.test.ts` (extend; `base` already has `squadAverageOverall: 70`)

- [ ] **Step 1: Write the failing tests** — append to `__tests__/engine/board/reputation-engine.test.ts` inside the `describe('computeReputationDelta', ...)` block (the file already imports `computeReputationDelta, ReputationDeltaInput` and defines `base`):

```ts
  it('adds a strong-squad bonus when squad overall is high', () => {
    const result = computeReputationDelta({ ...base, squadAverageOverall: 85 });
    expect(result.breakdown.squadDelta).toBe(3);
    expect(result.newReputation).toBeGreaterThan(base.currentReputation);
  });

  it('adds a small bonus for a good squad', () => {
    const result = computeReputationDelta({ ...base, squadAverageOverall: 72 });
    expect(result.breakdown.squadDelta).toBe(1);
  });

  it('applies a penalty for a weak squad', () => {
    const result = computeReputationDelta({ ...base, squadAverageOverall: 45 });
    expect(result.breakdown.squadDelta).toBe(-2);
  });

  it('is neutral for a median squad', () => {
    const result = computeReputationDelta({ ...base, squadAverageOverall: 60 });
    expect(result.breakdown.squadDelta).toBe(0);
  });
```

Also add a unit test for the exported helper (new `describe` at the end of the same file):

```ts
import { squadStrengthDelta } from '@/engine/board/reputation-engine';

describe('squadStrengthDelta', () => {
  it('maps overall to the documented curve', () => {
    expect(squadStrengthDelta(80)).toBe(3);
    expect(squadStrengthDelta(70)).toBe(1);
    expect(squadStrengthDelta(69)).toBe(0);
    expect(squadStrengthDelta(50)).toBe(-2);
    expect(squadStrengthDelta(51)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/engine/board/reputation-engine.test.ts`
Expected: FAIL — `squadStrengthDelta` is not exported (`is not a function`) and `breakdown.squadDelta` is `0` for all (it's hardcoded).

- [ ] **Step 3: Minimal implementation**

In `src/engine/balance.ts`, add after the `REPUTATION_BUDGET_DEFICIT_PENALTY` line (L15):

```ts
export const REPUTATION_SQUAD_STRONG_BONUS = 3;
export const REPUTATION_SQUAD_GOOD_BONUS = 1;
export const REPUTATION_SQUAD_WEAK_PENALTY = -2;
export const REPUTATION_SQUAD_STRONG_THRESHOLD = 80;
export const REPUTATION_SQUAD_GOOD_THRESHOLD = 70;
export const REPUTATION_SQUAD_WEAK_THRESHOLD = 50;
```

In `src/engine/board/reputation-engine.ts`, add to the import block (L1-10):

```ts
  REPUTATION_SQUAD_STRONG_BONUS,
  REPUTATION_SQUAD_GOOD_BONUS,
  REPUTATION_SQUAD_WEAK_PENALTY,
  REPUTATION_SQUAD_STRONG_THRESHOLD,
  REPUTATION_SQUAD_GOOD_THRESHOLD,
  REPUTATION_SQUAD_WEAK_THRESHOLD,
```

Add the pure helper (above `computeReputationDelta`):

```ts
/** Reputation contribution from squad strength. Pure; thresholds in balance.ts. */
export function squadStrengthDelta(squadAverageOverall: number): number {
  if (squadAverageOverall >= REPUTATION_SQUAD_STRONG_THRESHOLD) return REPUTATION_SQUAD_STRONG_BONUS;
  if (squadAverageOverall >= REPUTATION_SQUAD_GOOD_THRESHOLD) return REPUTATION_SQUAD_GOOD_BONUS;
  if (squadAverageOverall <= REPUTATION_SQUAD_WEAK_THRESHOLD) return REPUTATION_SQUAD_WEAK_PENALTY;
  return 0;
}
```

Replace L61 `const squadDelta = 0;` with:

```ts
  const squadDelta = squadStrengthDelta(input.squadAverageOverall);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/engine/board/reputation-engine.test.ts`
Expected: PASS (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/engine/balance.ts src/engine/board/reputation-engine.ts __tests__/engine/board/reputation-engine.test.ts
git commit -m "feat(board): reputação reflete força real do elenco (squadStrengthDelta)"
```

---

### Task 2: `isManagerDismissed` predicate (pure)

**Files:**
- Create: `src/engine/board/season-outcome.ts`
- Test: `__tests__/engine/board/season-outcome.test.ts`

- [ ] **Step 1: Write the failing test** — create `__tests__/engine/board/season-outcome.test.ts`:

```ts
import { isManagerDismissed } from '@/engine/board/season-outcome';
import { TrustConsequence } from '@/types/board';

describe('isManagerDismissed', () => {
  it('is true only when fired', () => {
    expect(isManagerDismissed('fired')).toBe(true);
  });

  it('is false for every non-fired consequence', () => {
    const others: TrustConsequence[] = ['none', 'budget_cut', 'budget_bonus'];
    for (const c of others) {
      expect(isManagerDismissed(c)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/board/season-outcome.test.ts`
Expected: FAIL — `Cannot find module '@/engine/board/season-outcome'`.

- [ ] **Step 3: Minimal implementation** — create `src/engine/board/season-outcome.ts`:

```ts
import { TrustConsequence } from '@/types/board';

/** True when the season-end trust consequence ends the manager's tenure (game over). */
export function isManagerDismissed(consequence: TrustConsequence): boolean {
  return consequence === 'fired';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/board/season-outcome.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/board/season-outcome.ts __tests__/engine/board/season-outcome.test.ts
git commit -m "feat(board): predicado puro isManagerDismissed pra centralizar o gate de demissão"
```

---

### Task 3: Assistant ability from quality stars (pure)

**Files:**
- Modify: `src/engine/staff/staff-effects.ts` (after `getStaffEffects`, ends L25)
- Test: `__tests__/engine/staff/staff-effects.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** — append to `__tests__/engine/staff/staff-effects.test.ts` (file already imports `getStaffEffects, StaffEffectsInput`):

```ts
import { assistantAbilityFromStars } from '@/engine/staff/staff-effects';

describe('assistantAbilityFromStars', () => {
  it('maps 1-5 stars onto the 1-20 ability scale (stars*4)', () => {
    expect(assistantAbilityFromStars(1)).toBe(4);
    expect(assistantAbilityFromStars(3)).toBe(12);
    expect(assistantAbilityFromStars(5)).toBe(20);
  });

  it('feeds tacticBonus and trainingBonus when used as assistantAbility', () => {
    const ability = assistantAbilityFromStars(5);
    const effects = getStaffEffects({
      fitnessCoachAbility: ability, physioAbility: 0, scoutAbility: 0,
      youthCoachAbility: 0, assistantAbility: ability,
    });
    expect(effects.tacticBonus).toBeCloseTo(0.10, 5);
    expect(effects.trainingBonus).toBeCloseTo(0.30, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/engine/staff/staff-effects.test.ts`
Expected: FAIL — `assistantAbilityFromStars` is not a function.

- [ ] **Step 3: Minimal implementation** — append to `src/engine/staff/staff-effects.ts`:

```ts
/** Converts an assistant's 1-5 quality stars into the 1-20 ability scale getStaffEffects expects. */
export function assistantAbilityFromStars(qualityStars: number): number {
  return Math.max(1, Math.min(20, Math.round(qualityStars) * 4));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/engine/staff/staff-effects.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/engine/staff/staff-effects.ts __tests__/engine/staff/staff-effects.test.ts
git commit -m "feat(staff): assistantAbilityFromStars converte estrelas na escala de ability"
```

---

### Task 4: `staffTrainingBonus` in weekly progression (pure)

**Files:**
- Modify: `src/engine/training/progression.ts` (`ProgressionInput` L5-14; growth calc inside `calculateWeeklyProgression`)
- Test: `__tests__/engine/training/progression.test.ts` (extend)

**Coordination:** if `progression-wired` already added `staffTrainingBonus` (or `trainingFocus` persistence) to `ProgressionInput`, **reuse** the field; do not duplicate. This task only adds the optional field if absent.

- [ ] **Step 1: Write the failing test** — append to `__tests__/engine/training/progression.test.ts` a case that isolates the bonus by using a growing profile (young, high minutes/rating, headroom to potential). Use a full `PlayerAttributes` literal at ~40 so `potentialFactor > 0`:

```ts
import { calculateWeeklyProgression, ProgressionInput } from '@/engine/training/progression';
import { PlayerAttributes } from '@/types';

const attrs40: PlayerAttributes = {
  finishing: 40, passing: 40, crossing: 40, dribbling: 40, heading: 40,
  longShots: 40, freeKicks: 40, vision: 40, composure: 40, decisions: 40,
  positioning: 40, aggression: 40, leadership: 40, pace: 40, stamina: 40,
  strength: 40, agility: 40, jumping: 40,
};

const growing: ProgressionInput = {
  age: 19,
  attributes: attrs40,
  effectivePotential: 85,
  minutesPlayedRecent: 90,
  totalPossibleMinutes: 90,
  avgRatingRecent: 7.5,
  trainingFocus: 'balanced',
  trainingFacilityLevel: 3,
};

describe('calculateWeeklyProgression staffTrainingBonus', () => {
  it('a positive staffTrainingBonus increases growth vs none', () => {
    const without = calculateWeeklyProgression({ ...growing });
    const withBonus = calculateWeeklyProgression({ ...growing, staffTrainingBonus: 0.3 });
    expect(withBonus.attributeChanges.passing).toBeGreaterThan(without.attributeChanges.passing);
  });

  it('defaults to no change in behaviour when bonus is omitted (back-compat)', () => {
    const omitted = calculateWeeklyProgression({ ...growing });
    const zero = calculateWeeklyProgression({ ...growing, staffTrainingBonus: 0 });
    expect(zero.attributeChanges.passing).toBeCloseTo(omitted.attributeChanges.passing, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/training/progression.test.ts`
Expected: FAIL — `staffTrainingBonus` is not a known property of `ProgressionInput` (tsc/jest type error), and the values are identical (no effect implemented).

- [ ] **Step 3: Minimal implementation**

In `src/engine/training/progression.ts`, add the optional field to `ProgressionInput` (after `trainingFacilityLevel`):

```ts
  staffTrainingBonus?: number; // 0..~0.3 fractional growth boost from the assistant; default 0
```

Destructure it with a default inside `calculateWeeklyProgression` (extend the existing `const { ... } = input;` block):

```ts
    staffTrainingBonus = 0,
```

Apply it as a growth multiplier on the `trainingFactor` (which already gates all growth at L111 / L174). Replace `const trainingFactor = getTrainingFactor(trainingFacilityLevel);` (L111) with:

```ts
  const trainingFactor = getTrainingFactor(trainingFacilityLevel) * (1 + staffTrainingBonus);
```

Because every positive `change` multiplies by `trainingFactor`, a positive `staffTrainingBonus` strictly increases gains and `0` is a no-op. (The veteran-decline branch multiplies the negative base by the same factor, so a bonus does not *worsen* decline beyond the existing facility scaling — acceptable; vets in the test profile are excluded by `age: 19`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/training/progression.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/engine/training/progression.ts __tests__/engine/training/progression.test.ts
git commit -m "feat(training): staffTrainingBonus opcional acelera progressão (assistente)"
```

---

### Task 5: `divisionLevel`-aware classification projection (pure)

**Files:**
- Modify: `src/engine/reports/classification-projection.ts` (status type L19, options L44-49, status block L96-105)
- Test: `__tests__/engine/reports/classification-projection.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `__tests__/engine/reports/classification-projection.test.ts`. Build 8 clubs with descending real points (all fixtures played → empty `remainingFixtures` keeps the order deterministic). `StandingsEntry` fields used by the function: `clubId`, `points`, `goalDifference`.

```ts
import { projectClassification } from '@/engine/reports/classification-projection';
import { StandingsEntry } from '@/engine/competition/standings';

function entry(clubId: number, points: number): StandingsEntry {
  return {
    clubId, played: 10, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points,
  };
}

const standings: StandingsEntry[] = [
  entry(1, 30), entry(2, 27), entry(3, 24), entry(4, 21),
  entry(5, 18), entry(6, 15), entry(7, 12), entry(8, 9),
];

describe('projectClassification divisionLevel', () => {
  it('top division marks top-N as continental, not promotion', () => {
    const proj = projectClassification({
      currentStandings: standings, remainingFixtures: [],
      overallByClub: new Map(), leagueSize: 8, divisionLevel: 1,
    });
    expect(proj[0].status).toBe('title');           // pos 1
    expect(proj[1].status).toBe('continental');      // pos 2 (top 25%)
    expect(proj.some((p) => p.status === 'promotion')).toBe(false);
  });

  it('lower division keeps top-N as promotion', () => {
    const proj = projectClassification({
      currentStandings: standings, remainingFixtures: [],
      overallByClub: new Map(), leagueSize: 8, divisionLevel: 2,
    });
    expect(proj[1].status).toBe('promotion');        // pos 2
    expect(proj.some((p) => p.status === 'continental')).toBe(false);
  });

  it('defaults to division 1 (continental) when divisionLevel is omitted', () => {
    const proj = projectClassification({
      currentStandings: standings, remainingFixtures: [],
      overallByClub: new Map(), leagueSize: 8,
    });
    expect(proj[1].status).toBe('continental');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/reports/classification-projection.test.ts`
Expected: FAIL — `divisionLevel` is not a known option and `status` is `'promotion'` (no `'continental'` value exists).

- [ ] **Step 3: Minimal implementation** — in `src/engine/reports/classification-projection.ts`:

Widen the status union (L19):

```ts
  status: 'title' | 'promotion' | 'continental' | 'safe' | 'relegation';
```

Add `divisionLevel` to the options object (the `projectClassification(options: {...})` signature, L44-49) and destructure it with a default (L50):

```ts
  leagueSize: number;
  divisionLevel?: number;
```
```ts
  const { currentStandings, remainingFixtures, overallByClub, leagueSize, divisionLevel = 1 } = options;
```

Replace the status assignment in the final `.map` (L96-105) so top-N is `continental` in the top flight, `promotion` below:

```ts
  return projected.map((p, i) => {
    const pos = i + 1;
    let status: ProjectedStanding['status'];
    if (pos === 1) status = 'title';
    else if (pos <= Math.ceil(n * 0.25)) status = divisionLevel > 1 ? 'promotion' : 'continental';
    else if (pos > n - relegationZone) status = 'relegation';
    else status = 'safe';

    return { ...p, projectedPosition: pos, status };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/reports/classification-projection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/reports/classification-projection.ts __tests__/engine/reports/classification-projection.test.ts
git commit -m "fix(reports): projeção marca top-N como continental na 1ª divisão (não promoção)"
```

---

### Task 6: `save_games.ended` schema + migration + queries

**Files:**
- Modify: `src/database/schema.ts` (`save_games` CREATE, L260-270)
- Modify: `src/store/database-store.ts` (migration block, after L157 `board_trust` migration)
- Create: `src/database/queries/save.ts`
- Test: `__tests__/database/queries/save.test.ts`

**Coordination:** uses the existing idempotent migration mechanism (`addColumnIfMissing` in `database-store.ts:26`, the same helper that added `board_trust`). Does **not** invent a new framework. If `save-isolation` lands first and adds `save_id` to world tables, the queries here are unaffected (they key on `save_games.id`).

- [ ] **Step 1: Write the failing test** — create `__tests__/database/queries/save.test.ts`. `createTestDb` builds the schema from `SCHEMA_SQL`, so once the column is in `schema.ts` the test DB has it directly (no runtime migration needed in tests).

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { markSaveEnded, isSaveEnded } from '@/database/queries/save';

describe('save ended queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const SAVE_ID = 1;
  const CLUB_ID = 1;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    rawDb.prepare(
      `INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, created_at, updated_at)
       VALUES (?, 'Test', 1, 1, ?, 'normal', '2026-01-01', '2026-01-01')`,
    ).run(SAVE_ID, CLUB_ID);
  });
  afterEach(() => rawDb.close());

  it('defaults to not ended', async () => {
    expect(await isSaveEnded(db, SAVE_ID)).toBe(false);
  });

  it('marks a save ended and reads it back', async () => {
    await markSaveEnded(db, SAVE_ID);
    expect(await isSaveEnded(db, SAVE_ID)).toBe(true);
  });

  it('returns false for an unknown save', async () => {
    expect(await isSaveEnded(db, 999)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/database/queries/save.test.ts`
Expected: FAIL — `Cannot find module '@/database/queries/save'` (then, once created, `no such column: ended` until schema.ts is updated).

- [ ] **Step 3: Minimal implementation**

In `src/database/schema.ts`, add the column to the `save_games` CREATE (after `board_trust INTEGER NOT NULL DEFAULT 50,`):

```sql
  ended           INTEGER NOT NULL DEFAULT 0,
```

In `src/store/database-store.ts`, add the runtime migration next to the `board_trust` one (after L157):

```ts
      await addColumnIfMissing(db, 'save_games', 'ended', 'INTEGER NOT NULL DEFAULT 0');
```

Create `src/database/queries/save.ts`:

```ts
import { DbHandle } from './players';

export async function markSaveEnded(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('UPDATE save_games SET ended = 1 WHERE id = ?').run(saveId);
}

export async function isSaveEnded(db: DbHandle, saveId: number): Promise<boolean> {
  const row = (await db
    .prepare('SELECT ended FROM save_games WHERE id = ?')
    .get(saveId)) as { ended: number } | undefined;
  return row?.ended === 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/database/queries/save.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/schema.ts src/store/database-store.ts src/database/queries/save.ts __tests__/database/queries/save.test.ts
git commit -m "feat(db): coluna save_games.ended + queries markSaveEnded/isSaveEnded (game-over)"
```

---

### Task 7: GameOver route + screen

**Files:**
- Modify: `src/navigation/types.ts` (after `EndOfSeason: undefined;` L7)
- Modify: `src/navigation/RootNavigator.tsx` (import + `<Stack.Screen>` after L49)
- Create: `src/screens/GameOverScreen.tsx`

No unit test (pure UI/navigation). Verified by `tsc` and the browser (Task 9).

- [ ] **Step 1: Add the route param type** — in `src/navigation/types.ts`, after `EndOfSeason: undefined;`:

```ts
  GameOver: { reason: string; trust: number; objectiveDescription: string };
```

- [ ] **Step 2: Create `src/screens/GameOverScreen.tsx`** — colors/spacing only via `@/theme`; user-facing strings via `@/i18n` (`t(...)`). Reads params; "Voltar ao menu" resets via `clearGame()` then navigates to `MainMenu` (resetting the stack so the dead save can't be re-entered):

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useTranslation } from '@/i18n';
import { RootStackParamList } from '@/navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'GameOver'>;
type GameOverRoute = RouteProp<RootStackParamList, 'GameOver'>;

export function GameOverScreen() {
  const navigation = useNavigation<NavProp>();
  const { reason, trust, objectiveDescription } = useRoute<GameOverRoute>().params;
  const clearGame = useGameStore((s) => s.clearGame);
  const { t } = useTranslation();

  function handleBackToMenu() {
    clearGame();
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'MainMenu' }] }),
    );
  }

  return (
    <View style={[commonStyles.screen, styles.container]}>
      <View style={styles.card}>
        <Text style={styles.heading}>{t('gameover.title')}</Text>
        <Text style={styles.subtitle}>{t('gameover.dismissed')}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>{t('gameover.reason_label')}</Text>
        <Text style={styles.reason}>{reason}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>{t('gameover.objective_label')}</Text>
        <Text style={styles.reason}>{objectiveDescription}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>{t('gameover.final_trust')}</Text>
        <Text style={styles.trust}>{trust}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleBackToMenu} activeOpacity={0.8}>
        <Text style={styles.buttonText}>{t('gameover.back_to_menu')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.surface, borderRadius: 12, padding: spacing.xl,
    width: '100%', borderWidth: 1, borderColor: colors.danger, marginBottom: spacing.xl,
  },
  heading: {
    color: colors.danger, fontSize: fontSize.title, fontWeight: 'bold',
    textAlign: 'center', marginBottom: spacing.xs,
  },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  label: {
    color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.xs,
  },
  reason: { color: colors.text, fontSize: fontSize.md },
  trust: { color: colors.danger, fontSize: fontSize.xxl, fontWeight: 'bold' },
  button: {
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16,
    paddingHorizontal: spacing.xl, alignItems: 'center', width: '100%',
  },
  buttonText: { color: colors.text, fontSize: fontSize.lg, fontWeight: 'bold', letterSpacing: 1 },
});
```

- [ ] **Step 3: Add the i18n keys** — append to **both** `src/i18n/pt.ts` and `src/i18n/en.ts` (keys must match the parity test). pt:

```ts
  'gameover.title': 'FIM DE JOGO',
  'gameover.dismissed': 'Você foi demitido pela diretoria.',
  'gameover.reason_label': 'Motivo',
  'gameover.objective_label': 'Objetivo da temporada',
  'gameover.final_trust': 'Confiança final',
  'gameover.back_to_menu': 'Voltar ao menu',
```

en:

```ts
  'gameover.title': 'GAME OVER',
  'gameover.dismissed': 'You have been dismissed by the board.',
  'gameover.reason_label': 'Reason',
  'gameover.objective_label': 'Season objective',
  'gameover.final_trust': 'Final trust',
  'gameover.back_to_menu': 'Back to menu',
```

- [ ] **Step 4: Register the route** — in `src/navigation/RootNavigator.tsx`, add the import (near the other screen imports, L6):

```ts
import { GameOverScreen } from '@/screens/GameOverScreen';
```

and the `<Stack.Screen>` right after the `EndOfSeason` screen (L49):

```tsx
      <Stack.Screen name="GameOver" component={GameOverScreen} options={{ headerShown: false }} />
```

- [ ] **Step 5: Type-check + parity**

Run: `npx tsc --noEmit && npx jest __tests__/i18n/parity.test.ts`
Expected: tsc exit 0; parity PASS. (If `@/i18n` does not yet exist because the i18n epic hasn't landed, fall back to literal strings in the screen and skip the parity run — note this in the commit.)

- [ ] **Step 6: Commit**

```bash
git add src/navigation/types.ts src/navigation/RootNavigator.tsx src/screens/GameOverScreen.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(nav): rota+tela GameOver pra fechar o loop de demissão"
```

---

### Task 8: Feed real inputs + route to GameOver in EndOfSeasonScreen

This is the integration task that wires the pure engine to real DB data and the new route. Tested with a real in-memory DB driving the **same** `processSeasonEndBoard` logic the screen calls, plus the dismissal decision.

**Files:**
- Modify: `src/screens/EndOfSeasonScreen.tsx` (`ProcessBoardArgs` L53-76 already carries `wonCup`/`wasPromoted`/`squadAverageOverall` indirectly; the literals are at L93, L295-296; `handleContinue` L325-329)
- Test: `__tests__/screens/end-of-season-board.test.ts` (create — exercises the extracted helpers, not React)

**Refactor note (do this first, no behaviour change):** to make the wiring testable without React, the screen currently inlines `processSeasonEndBoard`. Keep it in the screen but add `squadAverageOverall` as an explicit field of `ProcessBoardArgs` (replacing the hardcoded `70` at L93). The cup/promotion/squad reads happen in the `useEffect` (around L279-303) where `dbHandle`/`playerClubId`/`endedSeason` are in scope. The test below verifies the **reusable query helpers** + engine path, which is where the real logic lives.

- [ ] **Step 1: Write the failing integration test** — create `__tests__/screens/end-of-season-board.test.ts`. It seeds a real save + club + objective + a cup result, then drives `computeReputationDelta`/`computeTrustDelta`/`isManagerDismissed` exactly as the screen does, asserting the previously-impossible outcomes.

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { computeReputationDelta, squadStrengthDelta } from '@/engine/board/reputation-engine';
import { computeTrustDelta } from '@/engine/board/trust-engine';
import { isManagerDismissed } from '@/engine/board/season-outcome';
import { markSaveEnded, isSaveEnded } from '@/database/queries/save';
import { getCompetitionsBySeason } from '@/database/queries/leagues';

const SAVE_ID = 1;
const CLUB_ID = 1;
const SEASON = 1;

describe('end-of-season board wiring', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    rawDb.prepare(
      `INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, created_at, updated_at)
       VALUES (?, 'Test', 1, 1, ?, 'normal', '2026-01-01', '2026-01-01')`,
    ).run(SAVE_ID, CLUB_ID);
    // A domestic cup the player's club won this season.
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (5000, 'National Cup', 'cup', 'knockout', ?, NULL)`,
    ).run(SEASON);
    rawDb.prepare(
      `INSERT INTO season_competition_results (season, competition_id, champion_club_id, runner_up_club_id)
       VALUES (?, 5000, ?, NULL)`,
    ).run(SEASON, CLUB_ID);
  });
  afterEach(() => rawDb.close());

  // mirrors the screen's wonCup derivation: any won 'cup' (excluding 'continental')
  async function deriveWonCup(): Promise<boolean> {
    const comps = await getCompetitionsBySeason(db, SEASON);
    const domesticCups = comps.filter((c) => c.type === 'cup');
    for (const c of domesticCups) {
      const row = rawDb
        .prepare('SELECT champion_club_id AS champ FROM season_competition_results WHERE season = ? AND competition_id = ?')
        .get(SEASON, c.id) as { champ: number } | undefined;
      if (row?.champ === CLUB_ID) return true;
    }
    return false;
  }

  it('detects a won domestic cup from season_competition_results', async () => {
    expect(await deriveWonCup()).toBe(true);
  });

  it('a won cup meets a cup_win objective and raises trust', async () => {
    const wonCup = await deriveWonCup();
    const rep = computeReputationDelta({
      currentReputation: 50, leaguePosition: 6, totalTeams: 20,
      wonLeague: false, wonCup, wasRelegated: false, wasPromoted: false,
      budgetBalance: 0, squadAverageOverall: 70, staffAverageAbility: 10,
    });
    const trust = computeTrustDelta({
      currentTrust: 50, objectiveType: 'cup_win', objectiveTarget: null,
      leaguePosition: 6, totalTeams: 20, wonCup, wasRelegated: false, wasPromoted: false,
      reputationDelta: rep.delta, budgetBalance: 0,
    });
    expect(trust.outcome).toBe('objective_met');
    expect(trust.newTrust).toBeGreaterThan(50);
    expect(isManagerDismissed(trust.consequence)).toBe(false);
  });

  it('a failed cup objective with low trust fires the manager', async () => {
    // No cup win this run: simulate a different club as champion.
    rawDb.prepare('UPDATE season_competition_results SET champion_club_id = 999 WHERE competition_id = 5000').run();
    const wonCup = await deriveWonCup();
    expect(wonCup).toBe(false);
    const trust = computeTrustDelta({
      currentTrust: 30, objectiveType: 'cup_win', objectiveTarget: null,
      leaguePosition: 18, totalTeams: 20, wonCup, wasRelegated: false, wasPromoted: false,
      reputationDelta: -4, budgetBalance: -1000,
    });
    expect(trust.outcome).toBe('objective_failed');
    expect(trust.newTrust).toBeLessThan(20);
    expect(isManagerDismissed(trust.consequence)).toBe(true);
  });

  it('marking a save ended persists and is read back (no rollover)', async () => {
    await markSaveEnded(db, SAVE_ID);
    expect(await isSaveEnded(db, SAVE_ID)).toBe(true);
  });

  it('squad strength raises reputation more than a median squad', async () => {
    expect(squadStrengthDelta(82)).toBeGreaterThan(squadStrengthDelta(70));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/screens/end-of-season-board.test.ts`
Expected: FAIL — imports for `squadStrengthDelta`, `isManagerDismissed`, `markSaveEnded`/`isSaveEnded` resolve only after Tasks 1/2/6 (run those first per Sequencing); if those are merged, this fails only on the seed `competitions`/`season_competition_results` insert mismatches until the assertions match the real engine output. Confirm a red run before wiring the screen.

- [ ] **Step 3: Wire the screen**

In `src/screens/EndOfSeasonScreen.tsx`:

1. Add imports (top, with the other `@/engine`/`@/database` imports):

```ts
import { isManagerDismissed } from '@/engine/board/season-outcome';
import { markSaveEnded } from '@/database/queries/save';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { getLeagueById } from '@/database/queries/leagues';
```

2. Add `squadAverageOverall: number;` to `ProcessBoardArgs` (after `budgetBalance` L62) and destructure it (L79-84). Replace the hardcoded `squadAverageOverall: 70` at L93 with `args.squadAverageOverall`.

3. In the `useEffect`, inside the `if (currentSave && !boardProcessed)` block (after the `relegatedRow` lookup, L281-283), derive the real inputs before calling `processSeasonEndBoard`:

```ts
          // Real cup detection: any won domestic cup (exclude continental).
          const seasonComps = await getCompetitionsBySeason(dbHandle, endedSeason);
          let wonCup = false;
          for (const comp of seasonComps.filter((c) => c.type === 'cup')) {
            const champ = await dbHandle
              .prepare('SELECT champion_club_id AS champ FROM season_competition_results WHERE season = ? AND competition_id = ?')
              .get(endedSeason, comp.id) as { champ: number } | undefined;
            if (champ?.champ === playerClubId) { wonCup = true; break; }
          }

          // Real promotion detection (owned by competitions-real). Falls back to false gracefully.
          const promotedRow = await dbHandle
            .prepare('SELECT id FROM season_promoted WHERE season = ? AND club_id = ? LIMIT 1')
            .get(endedSeason, playerClubId)
            .catch(() => undefined) as { id: number } | undefined;
          const wasPromoted = promotedRow != null;

          // Real squad strength.
          const squadWithAttrs = await getPlayersWithAttributesByClub(dbHandle, playerClubId);
          const overalls = squadWithAttrs.map((p) => calculateOverall(p.attributes, p.position));
          const squadAverageOverall = overalls.length
            ? overalls.reduce((s, v) => s + v, 0) / overalls.length
            : 70;
```

   > **Note on `season_promoted`:** that table is **owned by `competitions-real`** (Schema changes, spec §5). If it has not landed, the `.catch(() => undefined)` keeps `wasPromoted` false without crashing. Do NOT create the table in this epic.

4. Pass the real values into `processSeasonEndBoard` — replace `wasPromoted: false,` (L295) with `wasPromoted,`, `wonCup: false,` (L297) with `wonCup,`, and add `squadAverageOverall,` to the args object.

5. In `handleContinue`, **before** any rollover mutation (immediately after `setStarting(true);` L327, before the player-aging UPDATE at L337), short-circuit when dismissed:

```ts
      if (currentSave && isManagerDismissed(boardEval?.consequence ?? 'none')) {
        await markSaveEnded(dbHandle, currentSave.id);
        setStarting(false);
        navigation.navigate('GameOver', {
          reason: boardEval?.outcome === 'objective_failed'
            ? 'Objetivo da temporada não cumprido.'
            : 'Confiança da diretoria esgotada.',
          trust: boardEval?.trust ?? 0,
          objectiveDescription: boardEval?.objectiveDescription ?? '',
        });
        return;
      }
```

   This returns before aging players, processing assistants, recalculating potential, generating youth, and building the next calendar — so a dismissed save performs **zero** rollover. `boardEval` already carries `consequence`/`outcome`/`trust`/`objectiveDescription` (set by `processSeasonEndBoard`, L155-163). The existing `finally { navigation.navigate('Game'); }` is NOT reached because we returned early.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/screens/end-of-season-board.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Full suite + type-check**

Run: `npx tsc --noEmit && npx jest __tests__/engine/board __tests__/engine/staff __tests__/engine/training __tests__/engine/reports __tests__/database/queries/save.test.ts __tests__/screens/end-of-season-board.test.ts`
Expected: tsc exit 0; all green.

- [ ] **Step 6: Commit**

```bash
git add src/screens/EndOfSeasonScreen.tsx __tests__/screens/end-of-season-board.test.ts
git commit -m "feat(board): EndOfSeason alimenta cup/promotion/squad reais e roteia demissão pro GameOver"
```

---

### Task 9: Wire assistant effects into progression + apply `divisionLevel` in ReportsProjectionScreen

**Files:**
- Modify: `src/engine/game-loop.ts` (progression call ~L483, `calculateWeeklyProgression({...})`)
- Modify: `src/screens/reports/ReportsProjectionScreen.tsx` (status label/color L266+, L272-279; `projectClassification` call L98-103)
- Test: covered by Task 4 (progression) + Task 5 (projection) pure tests; this task adds one game-loop integration assertion.
- Test: `__tests__/engine/game-loop-assistant.test.ts` (create) — only if a `game-loop` test harness already seeds a full match; otherwise assert via the helper composition below.

- [ ] **Step 1: Write the failing test** — create `__tests__/engine/game-loop-assistant.test.ts` proving the assistant→progression composition the loop will use (pure, no match seeding needed):

```ts
import { calculateWeeklyProgression } from '@/engine/training/progression';
import { getStaffEffects, assistantAbilityFromStars } from '@/engine/staff/staff-effects';
import { PlayerAttributes } from '@/types';

const attrs40: PlayerAttributes = {
  finishing: 40, passing: 40, crossing: 40, dribbling: 40, heading: 40,
  longShots: 40, freeKicks: 40, vision: 40, composure: 40, decisions: 40,
  positioning: 40, aggression: 40, leadership: 40, pace: 40, stamina: 40,
  strength: 40, agility: 40, jumping: 40,
};

it('a 5-star assistant boosts weekly growth via getStaffEffects.trainingBonus', () => {
  const ability = assistantAbilityFromStars(5);          // 20
  const bonus = getStaffEffects({
    fitnessCoachAbility: ability, physioAbility: 0, scoutAbility: 0,
    youthCoachAbility: 0, assistantAbility: ability,
  }).trainingBonus;                                       // 0.30
  const baseInput = {
    age: 19, attributes: attrs40, effectivePotential: 85,
    minutesPlayedRecent: 90, totalPossibleMinutes: 90,
    avgRatingRecent: 7.5, trainingFocus: 'balanced' as const, trainingFacilityLevel: 3,
  };
  const without = calculateWeeklyProgression(baseInput);
  const withAssistant = calculateWeeklyProgression({ ...baseInput, staffTrainingBonus: bonus });
  expect(withAssistant.attributeChanges.passing).toBeGreaterThan(without.attributeChanges.passing);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/game-loop-assistant.test.ts`
Expected: FAIL only if Tasks 3/4 are not yet merged (`assistantAbilityFromStars`/`staffTrainingBonus` missing). After Tasks 3/4 this passes — keep it as a regression guard that the loop wiring is correct.

- [ ] **Step 3: Wire the game loop** — in `src/engine/game-loop.ts`, before the player-progression loop (the `for (const p of playerSquadRaw)` at L480), fetch the squad assistant and derive the training bonus once:

```ts
    let staffTrainingBonus = 0;
    if (saveId >= 0) {
      const squadAssistant = await getAssistantByRole(db, saveId, 'squad');
      if (squadAssistant) {
        const ability = assistantAbilityFromStars(squadAssistant.qualityStars);
        staffTrainingBonus = getStaffEffects({
          fitnessCoachAbility: ability, physioAbility: 0, scoutAbility: 0,
          youthCoachAbility: 0, assistantAbility: ability,
        }).trainingBonus;
      }
    }
```

Add imports at the top of `game-loop.ts` (with the other `@/engine`/`@/database` imports):

```ts
import { getAssistantByRole } from '@/database/queries/assistants';
import { getStaffEffects, assistantAbilityFromStars } from '@/engine/staff/staff-effects';
```

Then add `staffTrainingBonus,` to the `calculateWeeklyProgression({...})` argument object (L483-491), after `trainingFacilityLevel,`. (`saveId` is destructured from `params` in `advanceGameWeek` at `game-loop.ts:324` and the codebase guards it with `saveId >= 0`, e.g. L662/L686/L787 — match that convention, used above.)

- [ ] **Step 4: Wire the projection screen** — in `src/screens/reports/ReportsProjectionScreen.tsx`:

Look up the player's division level before the `projectClassification` call (L98). `playerClub.leagueId` is already in scope; fetch the league:

```ts
      const league = await getLeagueById(dbHandle, playerClub.leagueId);
      const divisionLevel = league?.divisionLevel ?? 1;
```

Add `getLeagueById` to the existing `@/database/queries/leagues` import. Pass `divisionLevel` into the call (L98-103):

```ts
      const proj = projectClassification({
        currentStandings,
        remainingFixtures,
        overallByClub,
        leagueSize: clubIds.length,
        divisionLevel,
      });
```

Handle the new `'continental'` status in the two helpers (L263-279):

```ts
function statusColor(status: ProjectedStanding['status']): string {
  switch (status) {
    case 'title': return colors.gold;
    case 'promotion': return colors.success;
    case 'continental': return colors.success;
    case 'relegation': return colors.danger;
    default: return colors.textSecondary;
  }
}

function statusLabel(status: ProjectedStanding['status']): string {
  switch (status) {
    case 'title': return 'Zona de Título';
    case 'promotion': return 'Zona de Acesso';
    case 'continental': return 'Vaga Continental';
    case 'relegation': return 'Zona de Rebaixamento';
    default: return 'Zona Segura';
  }
}
```

Also extend the inline `tone` ternary at L182 to treat `continental` like `promotion` (success):

```tsx
                  tone={myEntry.status === 'title' ? 'warning' : myEntry.status === 'promotion' || myEntry.status === 'continental' ? 'success' : myEntry.status === 'relegation' ? 'danger' : 'neutral'}
```

- [ ] **Step 5: Run test + type-check**

Run: `npx jest __tests__/engine/game-loop-assistant.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exit 0 (the new `'continental'` status is exhaustively handled in both screen helpers and the `tone` ternary).

- [ ] **Step 6: Commit**

```bash
git add src/engine/game-loop.ts src/screens/reports/ReportsProjectionScreen.tsx __tests__/engine/game-loop-assistant.test.ts
git commit -m "feat(staff): assistente 'squad' acelera progressão no loop; projeção usa divisionLevel real"
```

---

### Task 10: Full verification + browser validation

- [ ] **Step 1: Full suite + type-check**

Run: `npx tsc --noEmit && npx jest 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: tsc exit 0; all suites green (baseline 62 suites / 536 tests + new suites: season-outcome, classification-projection, save queries, end-of-season-board, game-loop-assistant + extended reputation/staff/progression).

- [ ] **Step 2: Browser validation (Playwright MCP)** — start the web server per the project's web-dev-server notes (harness background `CI=1 npx expo start --web --port 19006`, navigate `localhost:8082`). Validate:
  - **Projection fix:** open a top-division save → Reports → Projeção de Classificação → the player's status card shows **"Vaga Continental"** (or "Zona de Título" at pos 1), NOT "Zona de Acesso".
  - **Cup objective met:** with a save whose objective is `cup_win` and a won domestic cup, finish the season → EndOfSeason "BOARD EVALUATION" shows objective outcome **MET** and trust rises.
  - **Fired → GameOver:** force a failed objective + low trust (e.g. finish last) → press **CONTINUE** → the app navigates to the **GameOver** screen (FIM DE JOGO), NOT into the next season. Tap **"Voltar ao menu"** → MainMenu; the just-ended save does not roll into a new season (no new fixtures generated) and re-loading it does not resume play.
  - Confirm no missing-i18n-key raw strings (`gameover.*`) render.

- [ ] **Step 3: Push (com autorização do usuário)**

```bash
git push origin main
```

---

## Sequencing & dependencies

**Internal order (strict):** Task 1 (squadStrengthDelta) → Task 2 (isManagerDismissed) → Task 3 (assistantAbilityFromStars) → Task 4 (staffTrainingBonus) → Task 5 (projection divisionLevel) → Task 6 (save_games.ended) are independent pure/DB units and can be done in any order, but **all must precede Task 8** (wires them into the screen) and **Tasks 7+8 precede Task 9's browser checks**. Task 7 (GameOver route/screen) must precede Task 8 (which navigates to it). Task 9 depends on Tasks 3/4 (progression) and Task 5 (projection). Task 10 is last.

**Cross-epic dependencies (do not redesign — reference only):**
- **`competitions-real`** owns the `season_promoted` table and real cup knockout rounds. This epic *consumes* both: `wasPromoted` reads `season_promoted` with a `.catch(() => undefined)` fallback to `false` if the table is absent; `wonCup` reads `season_competition_results` (which **already exists** — written by `season-archiver.ts` `archiveSeason`, called from `game-loop.ts:781`), so cup detection works today even before `competitions-real` lands. Do NOT create `season_promoted` here.
- **`save-isolation` / `db-hardening`** own `save_id` on world tables and the migration mechanism. This epic uses the **existing** `addColumnIfMissing` helper (`database-store.ts:26`) for `save_games.ended` — no new migration framework. If `save_id` is added to board/competition tables, the cup/promotion WHEREs here should include it (coordinate; do not redesign).
- **`progression-wired`** may add `staffTrainingBonus` / `trainingFocus` persistence to `ProgressionInput`. Task 4 adds `staffTrainingBonus` as an **optional** field — if `progression-wired` already added it, reuse and skip Task 4's type change.
- **`economy-depth`** may add a debt-driven firing trigger; it reuses the **same** `GameOverScreen` + the same `isManagerDismissed`/`markSaveEnded` branch in `handleContinue` (just a different `reason`). No conflict.
- **i18n epic:** `GameOverScreen` uses `t('gameover.*')` keys added to `pt.ts`/`en.ts`. If `@/i18n` has not landed, fall back to literal pt-BR strings in Task 7 and the parity test step is skipped (noted in commit).

## Definition of done

- `npx tsc --noEmit` exits 0 (strict; `'continental'` status exhaustively handled).
- `npx jest` fully green: baseline 62 suites / 536 tests **plus** the new/extended suites (season-outcome, classification-projection, save queries, end-of-season-board, game-loop-assistant, and extended reputation/staff/progression cases). Engine/DB tests use real `better-sqlite3` in-memory DBs — never mocked.
- Browser-validated (Playwright MCP): projection shows "Vaga Continental" in div 1; a won cup meets the `cup_win` objective; a failed objective + low trust routes CONTINUE → GameOver with zero season rollover, and "Voltar ao menu" returns to MainMenu without resuming the dead save.
- Every epic gap covered: squadDelta (T1), fired predicate (T2) + game-over flow (T6/T7/T8), assistant mechanically effective (T3/T4/T9), projection top-4 bug (T5/T9), cup/promotion objectives meetable (T8). Commits are small and per-unit.
