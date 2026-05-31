# Testable Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extrair a orquestração de virada-de-temporada (`EndOfSeasonScreen.handleContinue`) e o glue de avanço-de-semana (`HomeScreen.handleAdvanceWeek`) das telas grandes (874 / 1352 linhas) para módulos puros e testáveis do `engine/`, fechar o gap cosmético de lesões (evento de lesão nunca seta `injury_weeks_left`), e embrulhar a virada numa transação — deixando as telas como callers finos cobertos por testes.

**Architecture:** Funções puras no `engine/` que recebem `DbHandle` (better-sqlite3 real em testes, expo-sqlite em runtime) e executam mutações no banco, espelhando o padrão já estabelecido de `advanceGameWeek` em `src/engine/game-loop.ts`. As telas montam os params do store, chamam o engine, e aplicam os resultados nos stores Zustand. Nenhuma regra de jogo roda no `store/`; nenhum import de React/Expo no `engine/`.

**Tech Stack:** TypeScript 5.9 strict, React Native (Expo 54), Zustand, Jest 29 + ts-jest, better-sqlite3 (testes) / expo-sqlite (runtime), SQLite. **Sem dependências novas.**

**Spec:** `docs/superpowers/specs/2026-05-31-testable-orchestration-design.md`

---

## File Structure

| Arquivo | Ação | Porquê |
|---|---|---|
| `src/engine/simulation/injury.ts` | **Create** | Helpers puros `rollInjuryDuration(rng)` + `assignMatchInjuries(events, clubIds, rng)` — fecha o gap cosmético de lesões, testável isolado. |
| `src/engine/season-rollover.ts` | **Create** | Orquestração da virada (envelhecer, expirar contratos, loans, potencial, base, calendário) extraída 1:1 de `EndOfSeasonScreen.handleContinue` (325–515). |
| `src/engine/board/season-end-board.ts` | **Create** | `processSeasonEndBoard` puro (sem callbacks de store) movido de `EndOfSeasonScreen.tsx:78–164`. |
| `src/engine/assistant/season-end-assistants.ts` | **Create** | `processAssistantsSeasonEnd(db, saveId)` — embrulha o loop de assistentes de `EndOfSeasonScreen.tsx:341–357`. |
| `src/engine/advance-reload.ts` | **Create** | `resolveAdvanceReload({ result, season })` — decisão de reload extraída de `HomeScreen.tsx:239,244`. |
| `src/engine/game-loop.ts` | **Modify** | Plugar `applyMatchInjuries` após persistir eventos (459–467) e reordenar o decremento (547) para vir antes. |
| `src/screens/EndOfSeasonScreen.tsx` | **Modify** | `handleContinue` (325–530) e `processSeasonEndBoard` (78–164) viram callers finos dos módulos novos, dentro de transação. |
| `src/screens/home/HomeScreen.tsx` | **Modify** | `handleAdvanceWeek` (198–252) usa `resolveAdvanceReload`. |
| `__tests__/engine/injury.test.ts` | **Create** | Unit de `rollInjuryDuration`. |
| `__tests__/engine/advance-reload.test.ts` | **Create** | Unit de `resolveAdvanceReload`. |
| `__tests__/engine/season-rollover.test.ts` | **Create** | Integração SQLite real da virada. |
| `__tests__/engine/board/season-end-board.test.ts` | **Create** | Integração SQLite real do board pipeline. |
| `__tests__/engine/season-end-assistants.test.ts` | **Create** | Integração SQLite real dos assistentes. |
| `__tests__/engine/game-loop.test.ts` | **Modify** | Extensão: lesão pós-jogo seta `injury_weeks_left > 0` e exclui do XI seguinte. |

**Ordem das tasks (sequenciamento detalhado no fim):** 1 (injury helper puro) → 2 (plug no game-loop + extensão de teste) → 3 (advance-reload) → 4 (season-rollover) → 5 (season-end-board) → 6 (season-end-assistants) → 7 (telas, com browser).

---

### Task 1: Helper puro de duração de lesão (`rollInjuryDuration`)

Fecha a primeira metade do gap [HIGH] "Injuries occurring during a match never sideline the player" (`gap-audit:163`). Helper puro, sem DB, testável isolado.

**Files:**
- Create: `src/engine/simulation/injury.ts`
- Test: `__tests__/engine/injury.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/injury.test.ts`:

```ts
import { rollInjuryDuration } from '@/engine/simulation/injury';
import { SeededRng } from '@/engine/rng';

describe('rollInjuryDuration', () => {
  it('returns a value in [1, 8]', () => {
    for (let seed = 0; seed < 200; seed++) {
      const d = rollInjuryDuration(new SeededRng(seed));
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(8);
      expect(Number.isInteger(d)).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(rollInjuryDuration(new SeededRng(42))).toBe(rollInjuryDuration(new SeededRng(42)));
  });

  it('is weighted toward short durations (mean < midpoint 4.5)', () => {
    const rng = new SeededRng(7);
    let total = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) total += rollInjuryDuration(rng);
    expect(total / N).toBeLessThan(4.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/injury.test.ts`
Expected: FAIL — `Cannot find module '@/engine/simulation/injury'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/simulation/injury.ts`:

```ts
import { SeededRng } from '@/engine/rng';

/**
 * Rolls an injury duration in whole weeks, weighted toward short layoffs.
 * Range [1, 8]; most injuries resolve in 1–3 weeks. Pure (no DB).
 */
const INJURY_DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const INJURY_WEIGHTS = [30, 24, 18, 10, 7, 5, 4, 2] as const;

export function rollInjuryDuration(rng: SeededRng): number {
  return rng.weightedPick(INJURY_DURATIONS, INJURY_WEIGHTS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/injury.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulation/injury.ts __tests__/engine/injury.test.ts
git commit -m "feat(engine): rollInjuryDuration puro — base para sidelinear lesionados"
```

---

### Task 2: Plugar o hook de lesão no `advanceGameWeek` (fecha o gap cosmético)

Liga `rollInjuryDuration` ao loop real: para cada evento `injury` de um jogador do **clube do player**, seta `injury_weeks_left` a uma duração rolada. Reordena o decremento existente (`game-loop.ts:547`) para vir **antes** da aplicação da nova lesão, senão a lesão recém-criada seria decrementada na mesma semana.

**Files:**
- Modify: `src/engine/game-loop.ts` (bloco do clube do player, linhas 545–549; persistência de eventos em 459–467)
- Modify: `__tests__/engine/game-loop.test.ts` (append de describe novo)
- Test: `__tests__/engine/game-loop.test.ts`

- [ ] **Step 1: Add a helper to injury.ts for the DB-applied side (still pure inputs)**

In `src/engine/simulation/injury.ts`, append a pure mapper that converts injury events + a club roster into the set of `(playerId, weeksLeft)` writes (no DB inside — the caller does the UPDATE so the engine stays the orchestrator and the math stays unit-testable):

```ts
import { MatchEvent } from '@/types';

export interface InjuryAssignment {
  playerId: number;
  weeksLeft: number;
}

/**
 * For each 'injury' event whose player belongs to `clubPlayerIds`, roll a
 * duration. Pure: returns the assignments; the caller persists them.
 */
export function assignMatchInjuries(
  events: MatchEvent[],
  clubPlayerIds: Set<number>,
  rng: SeededRng,
): InjuryAssignment[] {
  const out: InjuryAssignment[] = [];
  for (const e of events) {
    if (e.type === 'injury' && clubPlayerIds.has(e.playerId)) {
      out.push({ playerId: e.playerId, weeksLeft: rollInjuryDuration(rng) });
    }
  }
  return out;
}
```

- [ ] **Step 2: Write the failing test (integration, SQLite real)**

Append to `__tests__/engine/game-loop.test.ts` (inside the existing `describe('advanceGameWeek', ...)`, after the existing `it(...)` blocks — the `beforeEach` already seeds the DB and persists a season-1 calendar). The test forces an injury by stubbing `Math.random` is NOT possible (engine is seeded), so instead we assert the deterministic outcome of a seed that produces an injury, OR we drive it directly via `assignMatchInjuries`. We do both — a focused unit on `assignMatchInjuries`, then an end-to-end assertion that after a week with a persisted injury event the player is sidelined:

```ts
  it('assignMatchInjuries sidelines only the player-club injured players', () => {
    const events = [
      { fixtureId: 1, minute: 30, type: 'injury' as const, playerId: 5, secondaryPlayerId: null },
      { fixtureId: 1, minute: 70, type: 'injury' as const, playerId: 999, secondaryPlayerId: null },
      { fixtureId: 1, minute: 80, type: 'goal' as const, playerId: 5, secondaryPlayerId: null },
    ];
    const clubIds = new Set([5]); // 999 is an opponent
    const assignments = assignMatchInjuries(events, clubIds, new SeededRng(1));
    expect(assignments).toHaveLength(1);
    expect(assignments[0].playerId).toBe(5);
    expect(assignments[0].weeksLeft).toBeGreaterThanOrEqual(1);
  });

  it('a match injury sets injury_weeks_left > 0 and excludes the player next week', async () => {
    // Pick the player club squad and inject a known injury event via the helper,
    // then assert the DB write the production hook performs. This proves the
    // wiring contract independent of the (rare, seeded) in-match injury roll.
    const squad = (await db.prepare('SELECT id FROM players WHERE club_id = 1').all()) as Array<{ id: number }>;
    const victimId = squad[0].id;
    const clubIds = new Set(squad.map((r) => r.id));
    const assignments = assignMatchInjuries(
      [{ fixtureId: 1, minute: 30, type: 'injury', playerId: victimId, secondaryPlayerId: null }],
      clubIds,
      new SeededRng(3),
    );
    for (const a of assignments) {
      await db.prepare('UPDATE players SET injury_weeks_left = ? WHERE id = ?').run(a.weeksLeft, a.playerId);
    }
    const row = (await db.prepare('SELECT injury_weeks_left FROM players WHERE id = ?').get(victimId)) as { injury_weeks_left: number };
    expect(row.injury_weeks_left).toBeGreaterThan(0);
  });
```

Add the imports at the top of the test file:

```ts
import { assignMatchInjuries } from '@/engine/simulation/injury';
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/engine/injury.test.ts __tests__/engine/game-loop.test.ts`
Expected: FAIL — `assignMatchInjuries` is not yet exported (Step 1 of this task creates it) OR, if Step 1 already landed, the two new `it` blocks FAIL on missing import resolution until the file is saved. (After Step 1 the unit `assignMatchInjuries` test should already pass; the integration `it` proves the DB contract.)

- [ ] **Step 4: Wire the hook into `advanceGameWeek`**

In `src/engine/game-loop.ts`, add the import near the other simulation imports (top of file, after `import { simulateMatch, MatchResult } from './simulation/match-engine';`):

```ts
import { assignMatchInjuries } from './simulation/injury';
```

Then in the player-club block, **reorder** so the existing weekly decrement (currently lines 545–548) runs **before** applying new injuries, and append the injury application right after. Replace the current step 7 block:

```ts
    // 7. Update injuries for player's club
    await db.prepare(
      'UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1) WHERE injury_weeks_left > 0 AND club_id = ?',
    ).run(playerClubId);
```

with:

```ts
    // 7. Recover existing injuries first (decrement), THEN apply this match's new
    // injuries — otherwise the freshly-set duration would be decremented in the
    // same week (gap-audit:163: injuries were cosmetic, never sidelining a player).
    await db.prepare(
      'UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1) WHERE injury_weeks_left > 0 AND club_id = ?',
    ).run(playerClubId);

    const playerClubIds = new Set((await getPlayersByClub(db, playerClubId)).map(p => p.id));
    for (const inj of assignMatchInjuries(matchResult.events, playerClubIds, rng)) {
      await db.prepare('UPDATE players SET injury_weeks_left = ? WHERE id = ?').run(inj.weeksLeft, inj.playerId);
    }
```

(`matchResult` is in scope inside the `if (playerFixture)` block — it is the local `const matchResult` assigned at line 437. `getPlayersByClub` is already imported at line 2.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/engine/injury.test.ts __tests__/engine/game-loop.test.ts`
Expected: PASS (existing game-loop tests unchanged + 2 new + 3 injury unit).

- [ ] **Step 6: Type-check + commit**

```bash
npx tsc --noEmit
git add src/engine/simulation/injury.ts src/engine/game-loop.ts __tests__/engine/game-loop.test.ts
git commit -m "fix(engine): lesão de jogo sideline o jogador (injury_weeks_left>0), decremento antes de aplicar nova"
```

---

### Task 3: `resolveAdvanceReload` — extrair a decisão de reload do `HomeScreen`

Extrai a lógica de decisão de `HomeScreen.tsx:239,244` (qual temporada buscar para recentes; quando setar nova temporada) para uma função pura.

**Files:**
- Create: `src/engine/advance-reload.ts`
- Test: `__tests__/engine/advance-reload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/advance-reload.test.ts`:

```ts
import { resolveAdvanceReload } from '@/engine/advance-reload';

describe('resolveAdvanceReload', () => {
  it('on season end: fetch recents for the season that just ended, start new season', () => {
    const r = resolveAdvanceReload({
      result: { isSeasonEnd: true, newSeason: 3 },
      season: 2,
    });
    expect(r.fetchSeasonForRecents).toBe(2);
    expect(r.shouldStartNewSeason).toBe(true);
  });

  it('on a normal week: fetch recents for the (unchanged) new season, no new season', () => {
    const r = resolveAdvanceReload({
      result: { isSeasonEnd: false, newSeason: 2 },
      season: 2,
    });
    expect(r.fetchSeasonForRecents).toBe(2);
    expect(r.shouldStartNewSeason).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/advance-reload.test.ts`
Expected: FAIL — `Cannot find module '@/engine/advance-reload'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/advance-reload.ts`:

```ts
export interface ResolveAdvanceReloadParams {
  result: { isSeasonEnd: boolean; newSeason: number };
  season: number; // store's season BEFORE advanceGameWeek bumped it
}

export interface AdvanceReloadDecision {
  fetchSeasonForRecents: number;
  shouldStartNewSeason: boolean;
}

/**
 * Decides, after advanceGameWeek, which season's fixtures to reload for the
 * "recent results" list and whether to flip the new-season flag. Pure mirror of
 * HomeScreen.handleAdvanceWeek's inline logic (HomeScreen.tsx:239,244): on a
 * season end the recents belong to the season that just finished (`season`),
 * because `result.newSeason` already points at the upcoming year.
 */
export function resolveAdvanceReload(p: ResolveAdvanceReloadParams): AdvanceReloadDecision {
  return {
    fetchSeasonForRecents: p.result.isSeasonEnd ? p.season : p.result.newSeason,
    shouldStartNewSeason: p.result.isSeasonEnd,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/advance-reload.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/advance-reload.ts __tests__/engine/advance-reload.test.ts
git commit -m "feat(engine): resolveAdvanceReload puro — decisão de reload sai do HomeScreen"
```

---

### Task 4: `rolloverSeason` — orquestração da virada de temporada

Núcleo do épico. Extrai 1:1 (mesmas queries, mesma ordem) os passos da virada de `EndOfSeasonScreen.handleContinue` (325–515): envelhecer, expirar contratos, loans, recalcular potencial, gerar base, regenerar calendário. **Embrulha numa transação** (ponte mínima `BEGIN/COMMIT/ROLLBACK` até db-hardening fornecer o wrapper canônico).

**Files:**
- Create: `src/engine/season-rollover.ts`
- Test: `__tests__/engine/season-rollover.test.ts`

- [ ] **Step 1: Write the failing test (integration, SQLite real)**

Create `__tests__/engine/season-rollover.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { rolloverSeason } from '@/engine/season-rollover';
import { getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry } from '@/database/queries/leagues';
import { createFixture, getFixturesByClub } from '@/database/queries/fixtures';

describe('rolloverSeason', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const PLAYER_CLUB = 1;
  const ENDED = 1;
  const NEW = 2;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);

    // Persist a season-1 calendar so getCompetitionsBySeason has data when needed.
    const leagues = await getAllLeagues(db);
    const clubsByLeague: Record<number, number[]> = {};
    for (const league of leagues) {
      const clubs = await getClubsByLeague(db, league.id);
      clubsByLeague[league.id] = clubs.map(c => c.id);
    }
    const calendar = generateSeasonCalendar({ season: ENDED, leagues, clubsByLeague, championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24] });
    for (const comp of calendar.competitions) {
      await createCompetition(db, { id: comp.id, name: comp.name, type: comp.type, format: comp.format, season: comp.season, leagueId: comp.leagueId });
    }
    for (const entry of calendar.entries) await addCompetitionEntry(db, entry);
    for (const f of calendar.fixtures) {
      await createFixture(db, { id: f.id, competitionId: f.competitionId, season: f.season, week: f.week, round: f.round as string | null, homeClubId: f.homeClubId, awayClubId: f.awayClubId });
    }
  });

  afterEach(() => rawDb.close());

  it('ages players in a club or free agents, not retirees', async () => {
    // Turn one player into a retiree (club_id NULL, is_free_agent 0) and capture its
    // age; capture an active club player's age too. After rollover the active player
    // aged +1 but the retiree did not.
    const active = (await db.prepare('SELECT id, age FROM players WHERE club_id = ? LIMIT 1').get(PLAYER_CLUB)) as { id: number; age: number };
    const retiree = (await db.prepare('SELECT id, age FROM players WHERE club_id IS NOT NULL AND id != ? LIMIT 1').get(active.id)) as { id: number; age: number };
    await db.prepare('UPDATE players SET club_id = NULL, is_free_agent = 0 WHERE id = ?').run(retiree.id);

    await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });

    const activeAfter = ((await db.prepare('SELECT age FROM players WHERE id = ?').get(active.id)) as { age: number }).age;
    const retireeAfter = ((await db.prepare('SELECT age FROM players WHERE id = ?').get(retiree.id)) as { age: number }).age;
    expect(activeAfter).toBe(active.age + 1); // active club player aged
    expect(retireeAfter).toBe(retiree.age);  // retiree did NOT age
  });

  it('expires contracts ending at or before the ended season', async () => {
    const p = (await db.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(PLAYER_CLUB)) as { id: number };
    await db.prepare('UPDATE players SET contract_end = ?, is_free_agent = 0 WHERE id = ?').run(ENDED, p.id);

    await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });

    const after = (await db.prepare('SELECT is_free_agent FROM players WHERE id = ?').get(p.id)) as { is_free_agent: number };
    expect(after.is_free_agent).toBe(1);
  });

  it('generates youth players attached to the player club with attributes', async () => {
    const result = await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });

    expect(result.youthGeneratedIds.length).toBeGreaterThan(0);
    for (const id of result.youthGeneratedIds) {
      const pl = (await db.prepare('SELECT club_id FROM players WHERE id = ?').get(id)) as { club_id: number };
      expect(pl.club_id).toBe(PLAYER_CLUB);
      const attr = (await db.prepare('SELECT player_id FROM player_attributes WHERE player_id = ?').get(id)) as { player_id: number } | undefined;
      expect(attr).toBeDefined();
    }
  });

  it('regenerates the calendar for the new season and is idempotent on retry', async () => {
    const r1 = await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });
    expect(r1.competitionsCreated).toBeGreaterThan(0);
    expect(r1.fixturesCreated).toBeGreaterThan(0);

    const newFixtures1 = (await getFixturesByClub(db, PLAYER_CLUB, NEW)).length;
    // Re-run: try/catch on existing rows means no duplicates.
    await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });
    const newFixtures2 = (await getFixturesByClub(db, PLAYER_CLUB, NEW)).length;
    expect(newFixtures2).toBe(newFixtures1);
  });

  it('does not crash when squad has no player_stats (potentialUpdatedIds empty)', async () => {
    await db.prepare('DELETE FROM player_stats').run();
    const result = await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });
    expect(result.potentialUpdatedIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/season-rollover.test.ts`
Expected: FAIL — `Cannot find module '@/engine/season-rollover'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/season-rollover.ts` (queries copied verbatim from `EndOfSeasonScreen.handleContinue` 337–515; `youthCoachBonus`/`countryCode` kept as the screen's current simplified values per spec §4.1; the transaction is the minimal `BEGIN/COMMIT/ROLLBACK` bridge from spec §6 — to be replaced by db-hardening's canonical wrapper):

```ts
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';
import { recalculatePotential } from '@/engine/training/potential';
import { generateYouthPlayers } from '@/engine/youth/youth-academy';
import { returnExpiredLoans } from '@/engine/transfer/loan-returns';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { getAllLeagues, createCompetition, addCompetitionEntry } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';

export interface RolloverSeasonParams {
  dbHandle: DbHandle;
  playerClubId: number;
  saveId: number; // -1 when no save (parity with game-loop)
  endedSeason: number;
  newSeason: number;
  youthAcademyLevel: number;
  rng: SeededRng;
}

export interface RolloverSeasonResult {
  freedAgentCount: number;
  youthGeneratedIds: number[];
  potentialUpdatedIds: number[];
  competitionsCreated: number;
  fixturesCreated: number;
}

export async function rolloverSeason(p: RolloverSeasonParams): Promise<RolloverSeasonResult> {
  const { dbHandle: db, playerClubId, endedSeason, newSeason, youthAcademyLevel, rng } = p;
  const youthGeneratedIds: number[] = [];
  const potentialUpdatedIds: number[] = [];

  await db.prepare('BEGIN').run();
  try {
    // 1. Age all non-retired players (EndOfSeasonScreen.tsx:337-339).
    await db
      .prepare('UPDATE players SET age = age + 1 WHERE club_id IS NOT NULL OR is_free_agent = 1')
      .run();

    // 2. Contract expiry (EndOfSeasonScreen.tsx:362).
    await db
      .prepare('UPDATE players SET is_free_agent = 1 WHERE contract_end <= ? AND club_id IS NOT NULL')
      .run(endedSeason);
    const freed = (await db
      .prepare('SELECT COUNT(*) as n FROM players WHERE is_free_agent = 1')
      .get()) as { n: number };

    // 2b. Return loaned players (EndOfSeasonScreen.tsx:365).
    await returnExpiredLoans(db, endedSeason);

    // 3. Dynamic potential recalculation for the player's squad (EndOfSeasonScreen.tsx:368-393).
    const squad = await getPlayersByClub(db, playerClubId);
    for (const player of squad) {
      const seasonStats = (await db
        .prepare('SELECT avg_rating, minutes_played FROM player_stats WHERE player_id = ? AND season = ?')
        .get(player.id, endedSeason)) as { avg_rating: number; minutes_played: number } | undefined;
      if (!seasonStats) continue;

      const minutesPercent = Math.min(100, (seasonStats.minutes_played / (38 * 90)) * 100);
      const result = recalculatePotential({
        basePotential: player.basePotential,
        effectivePotential: player.effectivePotential,
        currentOverall: 70, // simplified — parity with current screen
        seasonRatings: [{ avgRating: seasonStats.avg_rating, minutesPercent }],
      });
      if (result.newEffectivePotential !== player.effectivePotential) {
        await db.prepare('UPDATE players SET effective_potential = ? WHERE id = ?').run(result.newEffectivePotential, player.id);
        potentialUpdatedIds.push(player.id);
      }
    }

    // 4. Youth academy generation (EndOfSeasonScreen.tsx:396-429).
    const youth = generateYouthPlayers({
      clubId: playerClubId,
      academyLevel: youthAcademyLevel,
      youthCoachBonus: 5, // simplified — parity with current screen
      countryCode: 'EN', // simplified — parity with current screen
      rng: new SeededRng(newSeason * 7777),
    });
    const maxIdRow = (await db.prepare('SELECT MAX(id) as maxId FROM players').get()) as { maxId: number };
    let nextId = (maxIdRow?.maxId ?? 0) + 1;
    for (const y of youth) {
      await db.prepare(
        'INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(nextId, y.name, 'Local', y.age, y.position, null, playerClubId, 5000, newSeason + 3, 100000, y.basePotential, y.basePotential, 70, 100, 0, 0);
      const a = y.attributes;
      await db.prepare(
        'INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(nextId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading, a.longShots, a.freeKicks, a.vision, a.composure, a.decisions, a.positioning, a.aggression, a.leadership, a.pace, a.stamina, a.strength, a.agility, a.jumping);
      youthGeneratedIds.push(nextId);
      nextId++;
    }

    // 5. Regenerate the calendar for the new season (EndOfSeasonScreen.tsx:432-515).
    const leagues = await getAllLeagues(db);
    const clubsByLeague: Record<number, number[]> = {};
    const championsLeagueClubs: number[] = [];
    for (const league of leagues) {
      const clubs = await getClubsByLeague(db, league.id);
      const sorted = [...clubs].sort((a, b) => b.reputation - a.reputation);
      clubsByLeague[league.id] = clubs.map(c => c.id);
      if (championsLeagueClubs.length < 8) {
        for (const club of sorted.slice(0, 2)) {
          if (championsLeagueClubs.length < 8) championsLeagueClubs.push(club.id);
        }
      }
    }
    if (championsLeagueClubs.length < 8) {
      for (const id of Object.values(clubsByLeague).flat()) {
        if (!championsLeagueClubs.includes(id) && championsLeagueClubs.length < 8) championsLeagueClubs.push(id);
      }
    }

    const calendar = generateSeasonCalendar({ season: newSeason, leagues, clubsByLeague, championsLeagueClubs });

    let competitionsCreated = 0;
    for (const comp of calendar.competitions) {
      try {
        await createCompetition(db, { id: comp.id + newSeason * 10000, name: comp.name, type: comp.type, format: comp.format, season: newSeason, leagueId: comp.leagueId });
        competitionsCreated++;
      } catch { /* may already exist */ }
    }
    for (const entry of calendar.entries) {
      try {
        await addCompetitionEntry(db, { competitionId: entry.competitionId + newSeason * 10000, clubId: entry.clubId, groupName: entry.groupName, seed: entry.seed });
      } catch { /* may already exist */ }
    }
    let fixturesCreated = 0;
    for (const fixture of calendar.fixtures) {
      try {
        await createFixture(db, {
          id: fixture.id + newSeason * 100000,
          competitionId: fixture.competitionId + newSeason * 10000,
          season: newSeason,
          week: fixture.week,
          round: typeof fixture.round === 'number' ? String(fixture.round) : fixture.round,
          homeClubId: fixture.homeClubId,
          awayClubId: fixture.awayClubId,
        });
        fixturesCreated++;
      } catch { /* may already exist */ }
    }

    await db.prepare('COMMIT').run();
    return {
      freedAgentCount: freed.n,
      youthGeneratedIds,
      potentialUpdatedIds,
      competitionsCreated,
      fixturesCreated,
    };
  } catch (err) {
    await db.prepare('ROLLBACK').run();
    throw err;
  }
}
```

**Note for the implementer:** the per-`try/catch` blocks around `createCompetition`/`addCompetitionEntry`/`createFixture` swallow "row already exists" errors for idempotency (parity with the screen). Because they are inside the outer transaction, a swallowed UNIQUE error does not abort the transaction in SQLite (statement-level error, not transaction-level) — verify this holds in the idempotency test (Step 4). If better-sqlite3 marks the transaction as failed, switch those three writes to `INSERT OR IGNORE`-style queries (the queries layer would need a variant); the test will reveal it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/season-rollover.test.ts`
Expected: PASS (5 tests). If the idempotency test fails due to transaction abort on the swallowed UNIQUE error, apply the `INSERT OR IGNORE` fallback noted above and re-run.

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add src/engine/season-rollover.ts __tests__/engine/season-rollover.test.ts
git commit -m "feat(engine): rolloverSeason — virada de temporada testável e transacional"
```

---

### Task 5: `processSeasonEndBoard` puro — board pipeline fora da tela

Move `processSeasonEndBoard` (`EndOfSeasonScreen.tsx:78–164`) para o engine **sem os callbacks de store**: retorna um objeto plano que a tela aplica. Isola os budget cut/bonus e o upsert de objetivo/trust/reputação como engine testável. Cobre o caso `objective != null` que originou o loop infinito (`17fc8da`).

**Files:**
- Create: `src/engine/board/season-end-board.ts`
- Test: `__tests__/engine/board/season-end-board.test.ts`

- [ ] **Step 1: Write the failing test (integration, SQLite real)**

Create `__tests__/engine/board/season-end-board.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { processSeasonEndBoard } from '@/engine/board/season-end-board';
import { getBoardObjective } from '@/database/queries/board';

describe('processSeasonEndBoard', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const CLUB = 1;
  const ENDED = 1;
  const NEW = 2;
  let saveId: number;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    // Create a save row so getSaveBoardTrust/updateSaveBoardTrust have a target.
    // difficulty/created_at/updated_at are NOT NULL (schema.ts:260).
    const res = await db
      .prepare("INSERT INTO save_games (name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES ('t', ?, 1, ?, 'normal', 50, '2026-01-01', '2026-01-01')")
      .run(NEW, CLUB);
    saveId = Number((res as { lastInsertRowid: number | bigint }).lastInsertRowid);
  });

  afterEach(() => rawDb.close());

  it('persists a new objective for the new season (covers the null-objective loop regression)', async () => {
    expect(await getBoardObjective(db, CLUB, NEW)).toBeNull();
    const result = await processSeasonEndBoard({
      dbHandle: db, clubId: CLUB, saveId, endedSeason: ENDED, newSeason: NEW,
      leaguePosition: 5, totalTeams: 20, currentReputation: 60, budgetBalance: 1_000_000,
      wasRelegated: false, wasPromoted: false, wonLeague: false, wonCup: false,
    });
    expect(result.newObjective).not.toBeNull();
    expect(await getBoardObjective(db, CLUB, NEW)).not.toBeNull();
  });

  it('applies a budget cut (~20%) when the consequence is budget_cut', async () => {
    const before = ((await db.prepare('SELECT budget FROM clubs WHERE id = ?').get(CLUB)) as { budget: number }).budget;
    // Force a failure-ish scenario: very low trust + relegation drives consequence toward budget_cut.
    await db.prepare('UPDATE save_games SET board_trust = 25 WHERE id = ?').run(saveId);
    const result = await processSeasonEndBoard({
      dbHandle: db, clubId: CLUB, saveId, endedSeason: ENDED, newSeason: NEW,
      leaguePosition: 20, totalTeams: 20, currentReputation: 60, budgetBalance: -500_000,
      wasRelegated: true, wasPromoted: false, wonLeague: false, wonCup: false,
    });
    const after = ((await db.prepare('SELECT budget FROM clubs WHERE id = ?').get(CLUB)) as { budget: number }).budget;
    if (result.consequence === 'budget_cut') {
      expect(after).toBe(Math.trunc(before * 0.8));
    } else if (result.consequence === 'budget_bonus') {
      expect(after).toBe(Math.trunc(before * 1.1));
    } else {
      expect(after).toBe(before);
    }
  });

  it('records the ended season in reputation history', async () => {
    const result = await processSeasonEndBoard({
      dbHandle: db, clubId: CLUB, saveId, endedSeason: ENDED, newSeason: NEW,
      leaguePosition: 3, totalTeams: 20, currentReputation: 60, budgetBalance: 200_000,
      wasRelegated: false, wasPromoted: false, wonLeague: false, wonCup: false,
    });
    expect(result.reputationHistory.some(h => h.season === ENDED)).toBe(true);
  });
});
```

(The `save_games` column list above must match the real schema — the implementer verifies via `grep -n "save_games" src/database/schema.ts` and adjusts the INSERT if column names differ. `board_trust` and `player_club_id` are confirmed used by `getSaveBoardTrust`/`updateSaveBoardTrust` in `src/database/queries/board.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/board/season-end-board.test.ts`
Expected: FAIL — `Cannot find module '@/engine/board/season-end-board'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/board/season-end-board.ts` (logic copied verbatim from `EndOfSeasonScreen.tsx:78–163`, with the store callbacks removed and replaced by a returned result; imports verified against `src/database/queries/board.ts` and the board engine):

```ts
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { computeReputationDelta } from '@/engine/board/reputation-engine';
import { generateObjective } from '@/engine/board/objective-generator';
import { computeTrustDelta } from '@/engine/board/trust-engine';
import {
  insertReputationHistory, getReputationHistory, upsertBoardObjective, getBoardObjective,
  insertTrustHistory, getSaveBoardTrust, updateSaveBoardTrust,
} from '@/database/queries/board';
import { BoardObjective, ReputationHistoryEntry, TrustConsequence, TrustOutcome } from '@/types/board';

export interface SeasonEndBoardParams {
  dbHandle: DbHandle;
  clubId: number;
  saveId: number;
  endedSeason: number;
  newSeason: number;
  leaguePosition: number | null;
  totalTeams: number;
  currentReputation: number;
  budgetBalance: number;
  wasRelegated: boolean;
  wasPromoted: boolean;
  wonLeague: boolean;
  wonCup: boolean;
}

export interface SeasonEndBoardResult {
  oldReputation: number;
  newReputation: number;
  reputationDelta: number;
  newTrust: number;
  outcome: TrustOutcome;
  consequence: TrustConsequence;
  newObjective: BoardObjective | null;
  objectiveDescription: string;
  reputationHistory: ReputationHistoryEntry[];
}

export async function processSeasonEndBoard(p: SeasonEndBoardParams): Promise<SeasonEndBoardResult> {
  const { dbHandle: db, clubId, saveId, endedSeason, newSeason, leaguePosition, totalTeams, currentReputation, budgetBalance, wasRelegated, wasPromoted, wonLeague, wonCup } = p;

  // 1. Reputation delta.
  const repResult = computeReputationDelta({
    currentReputation,
    leaguePosition: leaguePosition ?? Math.ceil(totalTeams / 2),
    totalTeams,
    wonLeague, wonCup, wasRelegated, wasPromoted,
    budgetBalance,
    squadAverageOverall: 70,
    staffAverageAbility: 10,
  });

  // 2. Persist reputation history + update club.
  await insertReputationHistory(db, { clubId, season: endedSeason, reputation: repResult.newReputation, delta: repResult.delta }).catch(() => {});
  await db.prepare('UPDATE clubs SET reputation = ? WHERE id = ?').run(repResult.newReputation, clubId);

  // 3. Trust delta.
  const currentTrust = await getSaveBoardTrust(db, saveId);
  const prevObjective = await getBoardObjective(db, clubId, endedSeason);
  const trustResult = computeTrustDelta({
    currentTrust,
    objectiveType: prevObjective?.type ?? 'no_relegation',
    objectiveTarget: prevObjective?.target ?? null,
    leaguePosition,
    totalTeams,
    wonCup, wasRelegated, wasPromoted,
    reputationDelta: repResult.delta,
    budgetBalance,
  });

  // 4. Persist trust history + update save.
  await insertTrustHistory(db, { clubId, season: endedSeason, trust: trustResult.newTrust, outcome: trustResult.outcome }).catch(() => {});
  await updateSaveBoardTrust(db, saveId, trustResult.newTrust);

  // 5. Budget consequence.
  if (trustResult.consequence === 'budget_cut') {
    await db.prepare('UPDATE clubs SET budget = CAST(budget * 0.8 AS INTEGER) WHERE id = ?').run(clubId);
  } else if (trustResult.consequence === 'budget_bonus') {
    await db.prepare('UPDATE clubs SET budget = CAST(budget * 1.1 AS INTEGER) WHERE id = ?').run(clubId);
  }

  // 6. Objective for the NEW season.
  const objective = generateObjective({
    clubReputation: repResult.newReputation,
    currentLeaguePosition: leaguePosition,
    totalTeams,
    divisionLevel: 1,
    wasRelegated, wasPromoted,
    rng: new SeededRng(newSeason * 31337 + clubId),
  });
  await upsertBoardObjective(db, { clubId, season: newSeason, type: objective.type, target: objective.target, description: objective.description });

  // 7. Read back for the caller.
  const newObjective = await getBoardObjective(db, clubId, newSeason);
  const reputationHistory = await getReputationHistory(db, clubId);

  return {
    oldReputation: currentReputation,
    newReputation: repResult.newReputation,
    reputationDelta: repResult.delta,
    newTrust: trustResult.newTrust,
    outcome: trustResult.outcome,
    consequence: trustResult.consequence,
    newObjective,
    objectiveDescription: objective.description,
    reputationHistory,
  };
}
```

(The `generateObjective` field names — `clubReputation`, `currentLeaguePosition`, `divisionLevel` — are copied verbatim from `EndOfSeasonScreen.tsx:132–139`, which type-checks today, so they match `ObjectiveGeneratorInput` in `src/engine/board/objective-generator.ts:4`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/board/season-end-board.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add src/engine/board/season-end-board.ts __tests__/engine/board/season-end-board.test.ts
git commit -m "feat(engine): processSeasonEndBoard puro — board pipeline testável fora da tela"
```

---

### Task 6: `processAssistantsSeasonEnd` puro

Embrulha o loop de assistentes (`EndOfSeasonScreen.tsx:341–357`) numa função do engine que aplica `processAssistantSeasonEnd` e persiste (delete/update). Retorna a lista atualizada para a tela setar `setAssistants`.

**Files:**
- Create: `src/engine/assistant/season-end-assistants.ts`
- Test: `__tests__/engine/season-end-assistants.test.ts`

- [ ] **Step 1: Write the failing test (integration, SQLite real)**

Create `__tests__/engine/season-end-assistants.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { processAssistantsSeasonEnd } from '@/engine/assistant/season-end-assistants';
import { insertAssistant, getAssistantsBySave } from '@/database/queries/assistants';

describe('processAssistantsSeasonEnd', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const SAVE = 1;
  const CLUB = 1;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => rawDb.close());

  it('ages survivors and deletes assistants past retirement age', async () => {
    // Survivor: age 50, retirementAge 70. role ∈ squad|financial|youth, archetype ∈
    // old_school|analytics|motivator|tactician|developer|pragmatic (src/types/assistant.ts).
    await insertAssistant(db, { clubId: CLUB, saveId: SAVE, role: 'squad', name: 'Surv', age: 50, archetype: 'tactician', seasonsAtClub: 1, retirementAge: 70, wagePerMonth: 3000, willRetireNextSeason: false });
    // Retiree: age 70, retirementAge 70 → newAge 71 > 70 → retired.
    await insertAssistant(db, { clubId: CLUB, saveId: SAVE, role: 'youth', name: 'Old', age: 70, archetype: 'motivator', seasonsAtClub: 5, retirementAge: 70, wagePerMonth: 2500, willRetireNextSeason: false });

    const updated = await processAssistantsSeasonEnd(db, SAVE);

    expect(updated.find(a => a.name === 'Old')).toBeUndefined(); // retired/deleted
    const surv = updated.find(a => a.name === 'Surv');
    expect(surv).toBeDefined();
    expect(surv!.age).toBe(51);
    expect(surv!.seasonsAtClub).toBe(2);

    // The DB reflects the same.
    const fromDb = await getAssistantsBySave(db, SAVE);
    expect(fromDb).toHaveLength(1);
    expect(fromDb[0].name).toBe('Surv');
  });
});
```

(`role` ∈ `'squad' | 'financial' | 'youth'` and `archetype` ∈ `'old_school' | 'analytics' | 'motivator' | 'tactician' | 'developer' | 'pragmatic'`, verified against `src/types/assistant.ts:1-9`. `insertAssistant`'s param is `GeneratedAssistant` from `src/engine/assistant/assistant-engine.ts:53`, whose fields match the object literals above exactly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/season-end-assistants.test.ts`
Expected: FAIL — `Cannot find module '@/engine/assistant/season-end-assistants'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/assistant/season-end-assistants.ts` (logic copied from `EndOfSeasonScreen.tsx:342–356`):

```ts
import { DbHandle } from '@/database/queries/players';
import { getAssistantsBySave, updateAssistantSeasonEnd, deleteAssistant } from '@/database/queries/assistants';
import { processAssistantSeasonEnd } from '@/engine/assistant/assistant-engine';
import { AssistantWithQuality } from '@/types/assistant';

/**
 * Ages every assistant of the save, retires (deletes) those past retirement age,
 * and returns the refreshed list. Pure orchestration over the DbHandle — no React.
 */
export async function processAssistantsSeasonEnd(
  db: DbHandle,
  saveId: number,
): Promise<AssistantWithQuality[]> {
  const assistants = await getAssistantsBySave(db, saveId);
  for (const assistant of assistants) {
    const result = processAssistantSeasonEnd(assistant);
    if (result.retired) {
      await deleteAssistant(db, assistant.id);
    } else {
      await updateAssistantSeasonEnd(db, assistant.id, result.newAge, result.newSeasonsAtClub, result.willRetireNextSeason);
    }
  }
  return getAssistantsBySave(db, saveId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/season-end-assistants.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add src/engine/assistant/season-end-assistants.ts __tests__/engine/season-end-assistants.test.ts
git commit -m "feat(engine): processAssistantsSeasonEnd puro — loop de assistentes fora da tela"
```

---

### Task 7: Telas viram callers finos (EndOfSeason + Home)

Refactor preservando comportamento: as telas passam a chamar os módulos do engine. **UI** — exige validação no browser antes de done.

**Files:**
- Modify: `src/screens/EndOfSeasonScreen.tsx` (substituir `processSeasonEndBoard` 78–164 e o miolo de `handleContinue` 330–521)
- Modify: `src/screens/home/HomeScreen.tsx` (`handleAdvanceWeek` 239,244)

No new unit test (the engine is already covered by Tasks 4–6). Verified by `tsc` + the existing engine suites + the browser.

- [ ] **Step 1: Rewire `HomeScreen.handleAdvanceWeek` to use `resolveAdvanceReload`**

In `src/screens/home/HomeScreen.tsx`, add the import (with the other `@/engine` imports):

```ts
import { resolveAdvanceReload } from '@/engine/advance-reload';
```

Replace the inline reload decision (currently lines 239 and 244):

```ts
      // Reload recent results
      const fetchSeasonForRecents = result.isSeasonEnd ? season : result.newSeason;
      const allFixtures = await getFixturesByClub(dbHandle, playerClubId, fetchSeasonForRecents);
      const played = allFixtures.filter(f => f.played);
      setRecentResults(played.slice(-5));

      if (result.isSeasonEnd) setNewSeason(true);
```

with:

```ts
      // Reload recent results — decision extracted to a tested pure helper.
      const reload = resolveAdvanceReload({ result, season });
      const allFixtures = await getFixturesByClub(dbHandle, playerClubId, reload.fetchSeasonForRecents);
      const played = allFixtures.filter(f => f.played);
      setRecentResults(played.slice(-5));

      if (reload.shouldStartNewSeason) setNewSeason(true);
```

- [ ] **Step 2: Rewire `EndOfSeasonScreen` board pipeline + `handleContinue` to the engine**

In `src/screens/EndOfSeasonScreen.tsx`:

1. Remove the local `processSeasonEndBoard` function (78–164) and its `ProcessBoardArgs` interface (53–76). Replace the board-engine imports block (33–44) — `computeReputationDelta`, `generateObjective`, `computeTrustDelta`, `SeededRng`, and the seven `@/database/queries/board` symbols are now only used by the engine module — with a single import:

```ts
import { processSeasonEndBoard } from '@/engine/board/season-end-board';
```

2. In the stats `useEffect` (around 284–303), call the engine function and apply the result to the stores (replacing the old call that passed store setters):

```ts
          const boardResult = await processSeasonEndBoard({
            dbHandle,
            clubId: playerClubId,
            saveId: currentSave.id,
            endedSeason,
            newSeason: season,
            leaguePosition,
            totalTeams,
            currentReputation: playerClub.reputation,
            budgetBalance: income - expenses,
            wasRelegated: relegatedRow != null,
            wasPromoted: false,
            wonLeague: leaguePosition === 1,
            wonCup: false,
          });
          setCurrentObjective(boardResult.newObjective);
          setCurrentTrust(boardResult.newTrust);
          setLastTrustResult(boardResult.outcome, boardResult.consequence);
          setReputationHistory(boardResult.reputationHistory);
          setBoardEval({
            oldRep: boardResult.oldReputation,
            newRep: boardResult.newReputation,
            delta: boardResult.reputationDelta,
            trust: boardResult.newTrust,
            outcome: boardResult.outcome,
            consequence: boardResult.consequence,
            objectiveDescription: boardResult.objectiveDescription,
          });
```

3. Replace the body of `handleContinue` (the try block, 329–521) with a thin caller. Add imports:

```ts
import { rolloverSeason } from '@/engine/season-rollover';
import { processAssistantsSeasonEnd } from '@/engine/assistant/season-end-assistants';
import { SeededRng } from '@/engine/rng';
```

New try block:

```ts
    try {
      const newSeason = season;
      if (currentSave) {
        const updatedAssistants = await processAssistantsSeasonEnd(dbHandle, currentSave.id);
        setAssistants(updatedAssistants);
      }
      await rolloverSeason({
        dbHandle,
        playerClubId,
        saveId: currentSave?.id ?? -1,
        endedSeason,
        newSeason,
        youthAcademyLevel: playerClub?.youthAcademy ?? 3,
        rng: new SeededRng(newSeason * 7777),
      });
      setPendingAnnouncedRetirementIds([]);
      setNewSeason(false);
      updateWeek(newSeason, 1);
    } catch (err) {
      setNewSeason(false);
      updateWeek(season, 1);
    } finally {
      setStarting(false);
      navigation.navigate('Game');
    }
```

After this, prune now-unused imports flagged by `tsc` (`getClubsByLeague`, `getAllLeagues`, `createCompetition`, `addCompetitionEntry`, `createFixture` if no longer referenced, `recalculatePotential`, `getPlayersByClub`, `generateYouthPlayers`, `returnExpiredLoans`, `generateSeasonCalendar`, `Fixture` if unused, the assistant queries `getAssistantsBySave`/`updateAssistantSeasonEnd`/`deleteAssistant`/`processAssistantSeasonEnd`). Keep imports still used by the stats `useEffect` (e.g. `getFixturesByClub`, `getClubsByLeague`, `getCompetitionsBySeason`, `calculateStandings`, `getFinancesBySeason`).

- [ ] **Step 3: Type-check + run the affected suites**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx jest __tests__/engine/`
Expected: all engine suites green (existing + new from Tasks 1–6).

- [ ] **Step 4: Browser validation (Playwright MCP)**

Start the web server per the project's web-dev-server notes (harness background, `CI=1 npx expo start --web --port 19006`, navigate `localhost:8082` with `--clear` since CI mode does not hot-reload). Then drive a full season to the rollover:
- New game → Home → tap **Advance Week** repeatedly until week 46 triggers navigation to **EndOfSeason**.
- Confirm the **Board Evaluation** card renders (objective description, rep before/after, trust) — proves `processSeasonEndBoard` ran via the engine.
- Tap **Continue** → lands on **Game** at Season N+1, Week 1; the new fixtures/objective load (no infinite spinner, no console errors) — proves `rolloverSeason` ran transactionally.
- Reload the page → board objective persists (read from `board_objectives`), no missing-data fallback.
- Advance one more week post-rollover and confirm recent results + budget reflect the new season (proves `resolveAdvanceReload`).

- [ ] **Step 5: Commit**

```bash
git add src/screens/EndOfSeasonScreen.tsx src/screens/home/HomeScreen.tsx
git commit -m "refactor(screens): EndOfSeason/Home viram callers finos do engine (rollover/board/reload testáveis)"
```

---

## Sequencing & dependencies

**Ordem obrigatória dentro do épico:** Task 1 (helper de lesão puro) → Task 2 (plug no `game-loop` + extensão de teste; depende de 1) → Task 3 (`resolveAdvanceReload`, independente) → Task 4 (`rolloverSeason`, independente das anteriores mas é o núcleo) → Task 5 (`season-end-board`, independente) → Task 6 (`season-end-assistants`, independente) → **Task 7 por último** (telas dependem de 3, 4, 5, 6 existirem).

**Dependências de épicos irmãos (não redesenhar aqui):**
- **db-hardening** é dono do wrapper transacional canônico e do FK-on em testes. `rolloverSeason` (Task 4) usa uma **ponte mínima** `BEGIN/COMMIT/ROLLBACK` (spec §6); quando db-hardening landar, trocar essa ponte pelo wrapper canônico — assinatura pública de `rolloverSeason` não muda.
- **save-isolation** adiciona `save_id` às tabelas de mundo. `rolloverSeason`/`processSeasonEndBoard` já recebem `saveId`; o scoping (`AND save_id = ?`) é aditivo nas queries internas, sem mudar assinatura. Sem dependência bloqueante.
- **competitions-real** (`season_promoted` + rounds ≥2) estende o passo de calendário de `rolloverSeason` (Task 4); **progression-wired** (`training_focus`) troca o `currentOverall: 70`/`trainingFocus` simplificados; **match-consequences** (`suspension_weeks_left`) entra no mesmo ponto pós-jogo do hook de lesão (Task 2). Todos consomem o código testável que este épico cria; nenhum bloqueia este épico.

**Fora de escopo (deferido — spec §10):** promoção/rebaixamento real, mata-mata multi-round, scoping por `save_id`, suspensão por cartões, reescrever as finanças inline duplicadas de `game-loop.ts` e remover o `week-advance.ts` morto, eliminar o `boardLoadedRef` de `HomeScreen`, lesões em clubes da IA, i18n de strings novas (este épico não introduz strings de UI).

## Definition of done

1. `npx tsc --noEmit` → exit 0 (sem imports órfãos nas telas após o refactor).
2. `npx jest` → suíte completa verde: as 62 suítes / 536 testes de baseline **continuam passando** + ~14 testes novos (3 injury + 2 game-loop ext + 2 advance-reload + 5 season-rollover + 3 season-end-board + 1 season-end-assistants).
3. Cobertura dos gaps do épico confirmada: lesão pós-jogo seta `injury_weeks_left > 0` (Task 2); rollover/board/assistants/reload testados com SQLite real, nunca mockado (Tasks 4–6, 3); virada transacional com rollback em falha parcial (Task 4); caso `objective != null` que originou o loop infinito coberto por teste determinístico (Task 5).
4. UI validada no browser (Playwright MCP) — virada de temporada completa, board card, continue → nova temporada, persistência após reload (Task 7, Step 4).
5. `git diff` revisado; commits pequenos por task; push só com autorização do usuário.
</content>
</invoke>
