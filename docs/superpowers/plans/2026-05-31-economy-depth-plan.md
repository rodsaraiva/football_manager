# Economy Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tornar a economia viva e com stakes: valor de mercado recalculado no rollover, contratos que de fato expiram (liberam o jogador) e podem ser renovados, salário de empréstimo correto com restauração, premiação/bilheteria escalada por competição, e piso orçamentário que produz o sinal `debt_weeks` para `board-stakes`. Cobre os 7 gaps do epic `economy-depth` na auditoria `docs/audit/2026-05-31-gap-audit.md`.

**Architecture:** Tudo em `src/engine/` é **puro** (sem React/Expo/SQL) — cálculos retornam números/decisões; a persistência fica nas queries (`src/database/queries/`), no loop (`src/engine/game-loop.ts` — já não-puro, faz SQL) e nos screens. Três passes idempotentes acoplados ao rollover de fim de temporada (`EndOfSeasonScreen.handleContinue`): (1) expiry real de contrato, (2) recálculo de `market_value` de todos os jogadores em clube, (3) distribuição de premiação. Duas mudanças no loop semanal: bilheteria por competição e rastreio de `debt_weeks`. Duas colunas novas (`players.loan_wage`, `clubs.debt_weeks`) via o mecanismo idempotente `addColumnIfMissing` já existente em `src/store/database-store.ts`. Renovação de contrato: engine puro `evaluateRenewal` + modal mínimo no detalhe do jogador.

**Tech Stack:** TypeScript 5.9 strict, React Native (Expo 54), Zustand, Jest 29 + ts-jest, `better-sqlite3` em memória nos testes (nunca mock), SQLite. i18n via `src/i18n` (`t()`/`useTranslation`, chaves em `pt.ts`/`en.ts`). **Sem dependências novas.**

**Spec:** `docs/superpowers/specs/2026-05-31-economy-depth-design.md`

---

## File Structure

| Arquivo | Ação | Porquê |
|---|---|---|
| `src/engine/finance/affordability.ts` | **Create** | Gates puros `canAffordTransfer` / `canAffordWage` reusados por compra/assinatura/renovação (gaps 2, 7). |
| `src/engine/finance/prize-money.ts` | **Create** | Premiação por posição/título e multiplicador de bilheteria por competição (gap 6). |
| `src/engine/transfer/contract-renewal.ts` | **Create** | `evaluateRenewal` puro: aceitar/recusar/contrapropor renovação (gap 4). |
| `src/types/finance.ts` | **Modify** | Adiciona `'prize'` ao union `FinanceType` (gap 6). |
| `src/engine/transfer/offer-processor.ts` | **Modify** | Loan grava `loan_wage` em vez de sobrescrever `wage`; gate de acessibilidade da fee (gaps 2, 5). |
| `src/engine/transfer/loan-returns.ts` | **Modify** | Ao retornar, limpa `loan_wage = NULL` (gap 5). |
| `src/engine/transfer/free-agent-signing.ts` | **Modify** | Gate `canAffordWage` contra `wage_budget` (gap 7). |
| `src/engine/finance/finance-engine.ts` | **Modify** | `calculateWeeklyIncome` aceita `competitionType` e escala ticket (gap 6). |
| `src/engine/history/season-archiver.ts` | **Modify** | `archiveSeason` retorna `PrizeAward[]` calculado via `prize-money.ts` (gap 6). |
| `src/database/queries/players.ts` | **Modify** | `getPlayersByClub` filtra free agents; expõe `loanWage`; novo `updatePlayerContract` + `getPlayerContractInfo` (gaps 3, 4, 5). |
| `src/database/queries/finances.ts` | **Modify** (opcional) | Sem mudança de assinatura — `addFinanceEntry` já aceita qualquer `FinanceType`. |
| `src/store/database-store.ts` | **Modify** | Migração idempotente: `players.loan_wage`, `clubs.debt_weeks` (coord. `save-isolation`). |
| `src/database/schema.ts` | **Modify** | Colunas `loan_wage` / `debt_weeks` no DDL canônico (DBs novos). |
| `src/engine/game-loop.ts` | **Modify** | Soma `loan_wage ?? wage`; passa `competitionType` ao income; rastreia `debt_weeks` (gaps 2, 5, 6). |
| `src/screens/EndOfSeasonScreen.tsx` | **Modify** | Expiry real (`club_id=NULL, wage=0`); recálculo de valor; distribuição de prêmio (gaps 1, 3, 6). |
| `src/screens/squad/PlayerDetailScreen.tsx` (ou irmão) | **Modify/Create** | Botão + modal "Renovar contrato" → `evaluateRenewal` → `updatePlayerContract` (gap 4). |
| `src/i18n/pt.ts`, `src/i18n/en.ts` | **Modify** | Chaves do modal de renovação. |

**Schema changes (coord. `save-isolation`/`db-hardening`):**

| Tabela | Coluna | Tipo | Default |
|---|---|---|---|
| `players` | `loan_wage` | `INTEGER` | `NULL` |
| `clubs` | `debt_weeks` | `INTEGER NOT NULL` | `0` |

Ambas entram no mesmo passe de migração que `save-isolation`/`db-hardening` (`addColumnIfMissing` em `src/store/database-store.ts`). Ordem de `ALTER` irrelevante. `'prize'` em `FinanceType` é mudança de tipo TS, não de schema (`club_finances.type` é `TEXT` livre).

---

### Task 1: Gates de acessibilidade (engine puro)

**Files:**
- Create: `src/engine/finance/affordability.ts`
- Test: `__tests__/engine/finance/affordability.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/finance/affordability.test.ts`:

```ts
import { canAffordTransfer, canAffordWage } from '@/engine/finance/affordability';

describe('canAffordTransfer', () => {
  it('rejects when the fee exceeds the budget', () => {
    expect(canAffordTransfer(100, 150)).toBe(false);
  });
  it('accepts when the budget covers the fee', () => {
    expect(canAffordTransfer(150, 100)).toBe(true);
  });
  it('accepts an exact-match fee', () => {
    expect(canAffordTransfer(100, 100)).toBe(true);
  });
  it('honours an optional floor that must remain after the fee', () => {
    // budget 100, fee 80, floor 50 → leaves 20 < 50 → reject
    expect(canAffordTransfer(100, 80, 50)).toBe(false);
    // budget 100, fee 40, floor 50 → leaves 60 >= 50 → accept
    expect(canAffordTransfer(100, 40, 50)).toBe(true);
  });
  it('treats a zero fee as always affordable', () => {
    expect(canAffordTransfer(-1000, 0)).toBe(true);
  });
});

describe('canAffordWage', () => {
  it('accepts when current bill + added wage stays within the budget', () => {
    expect(canAffordWage(800, 1000, 100)).toBe(true);
  });
  it('accepts at the exact cap', () => {
    expect(canAffordWage(900, 1000, 100)).toBe(true);
  });
  it('rejects when current bill + added wage exceeds the budget', () => {
    expect(canAffordWage(950, 1000, 100)).toBe(false);
  });
  it('treats wageBudget <= 0 as "no cap" (legacy saves)', () => {
    expect(canAffordWage(999999, 0, 100)).toBe(true);
    expect(canAffordWage(999999, -5, 100)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/finance/affordability.test.ts`
Expected: FAIL — `Cannot find module '@/engine/finance/affordability'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/finance/affordability.ts`:

```ts
/** Can the buyer pay `fee` and still keep at least `minFloor` in the budget?
 *  A zero fee is always affordable. Default floor is 0 (budget may not go negative). */
export function canAffordTransfer(buyerBudget: number, fee: number, minFloor = 0): boolean {
  if (fee <= 0) return true;
  return buyerBudget - fee >= minFloor;
}

/** Does the added weekly wage fit under the wage budget given the current bill?
 *  A wageBudget <= 0 is treated as "no cap" so legacy saves aren't blocked. */
export function canAffordWage(currentWageBill: number, wageBudget: number, addedWage: number): boolean {
  if (wageBudget <= 0) return true;
  return currentWageBill + addedWage <= wageBudget;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/finance/affordability.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/finance/affordability.ts __tests__/engine/finance/affordability.test.ts
git commit -m "feat(finance): gates puros canAffordTransfer/canAffordWage"
```

---

### Task 2: Premiação e bilheteria por competição (engine puro)

**Files:**
- Create: `src/engine/finance/prize-money.ts`
- Test: `__tests__/engine/finance/prize-money.test.ts`

Note: o schema usa `competitions.type` ∈ `'league' | 'cup' | 'continental'` (`src/database/schema.ts:154`, `season-archiver.ts:5`). O tipo do multiplicador usa essa mesma união (não `'champions_league'`) para casar com o dado real; `'continental'` é a Champions/CL.

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/finance/prize-money.test.ts`:

```ts
import {
  calculateLeaguePrize,
  calculateCupPrize,
  gateReceiptMultiplier,
} from '@/engine/finance/prize-money';

describe('calculateLeaguePrize', () => {
  const base = { divisionLevel: 1, finalPosition: 1, numTeams: 20 };
  it('champion earns more than mid-table', () => {
    expect(calculateLeaguePrize(base)).toBeGreaterThan(
      calculateLeaguePrize({ ...base, finalPosition: 10 }),
    );
  });
  it('mid-table earns more than last place', () => {
    expect(calculateLeaguePrize({ ...base, finalPosition: 10 })).toBeGreaterThan(
      calculateLeaguePrize({ ...base, finalPosition: 20 }),
    );
  });
  it('a higher division pays more for the same position', () => {
    expect(calculateLeaguePrize({ ...base, divisionLevel: 1 })).toBeGreaterThan(
      calculateLeaguePrize({ ...base, divisionLevel: 3 }),
    );
  });
  it('never returns a negative prize', () => {
    expect(calculateLeaguePrize({ ...base, finalPosition: 20 })).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateCupPrize', () => {
  it('champion earns more than runner-up', () => {
    expect(calculateCupPrize({ competitionType: 'cup', result: 'champion' })).toBeGreaterThan(
      calculateCupPrize({ competitionType: 'cup', result: 'runner_up' }),
    );
  });
  it('runner-up earns more than a plain participant', () => {
    expect(calculateCupPrize({ competitionType: 'cup', result: 'runner_up' })).toBeGreaterThan(
      calculateCupPrize({ competitionType: 'cup', result: 'participant' }),
    );
  });
  it('a continental (CL) title pays more than a domestic cup title', () => {
    expect(calculateCupPrize({ competitionType: 'continental', result: 'champion' })).toBeGreaterThan(
      calculateCupPrize({ competitionType: 'cup', result: 'champion' }),
    );
  });
});

describe('gateReceiptMultiplier', () => {
  it('continental matches draw bigger crowds than league matches', () => {
    expect(gateReceiptMultiplier('continental')).toBeGreaterThan(gateReceiptMultiplier('league'));
  });
  it('cup matches draw at least as much as league matches', () => {
    expect(gateReceiptMultiplier('cup')).toBeGreaterThanOrEqual(gateReceiptMultiplier('league'));
  });
  it('league is the 1.0 baseline', () => {
    expect(gateReceiptMultiplier('league')).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/finance/prize-money.test.ts`
Expected: FAIL — `Cannot find module '@/engine/finance/prize-money'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/finance/prize-money.ts`:

```ts
export type CompetitionType = 'league' | 'cup' | 'continental';

export interface PrizeAward {
  clubId: number;
  amount: number;
  description: string;
}

/** League prize: scales with division (higher tier = more money) and final
 *  position (1st earns the most, falling linearly to a small floor for last). */
export function calculateLeaguePrize(input: {
  divisionLevel: number;
  finalPosition: number;
  numTeams: number;
}): number {
  const { divisionLevel, finalPosition, numTeams } = input;
  // Division 1 is the richest; each lower tier scales the pot down.
  const divisionPot = 40_000_000 / Math.max(1, divisionLevel);
  // Linear share: 1st gets the full pot, last gets ~5%.
  const teams = Math.max(1, numTeams);
  const pos = Math.min(Math.max(1, finalPosition), teams);
  const share = 1 - ((pos - 1) / teams) * 0.95;
  return Math.round((divisionPot * share) / 100_000) * 100_000;
}

/** Cup / continental prize by outcome. Continental (CL) pays a premium. */
export function calculateCupPrize(input: {
  competitionType: 'cup' | 'continental';
  result: 'champion' | 'runner_up' | 'participant';
}): number {
  const base: Record<'champion' | 'runner_up' | 'participant', number> = {
    champion: 15_000_000,
    runner_up: 7_000_000,
    participant: 1_000_000,
  };
  const multiplier = input.competitionType === 'continental' ? 3 : 1;
  return base[input.result] * multiplier;
}

/** Per-home-match gate receipt multiplier. League = 1.0 baseline. */
export function gateReceiptMultiplier(competitionType: CompetitionType): number {
  switch (competitionType) {
    case 'continental':
      return 1.6;
    case 'cup':
      return 1.2;
    case 'league':
    default:
      return 1.0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/finance/prize-money.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/finance/prize-money.ts __tests__/engine/finance/prize-money.test.ts
git commit -m "feat(finance): premiação por posição/título + multiplicador de bilheteria"
```

---

### Task 3: Negociação de renovação de contrato (engine puro)

**Files:**
- Create: `src/engine/transfer/contract-renewal.ts`
- Test: `__tests__/engine/transfer/contract-renewal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/transfer/contract-renewal.test.ts`:

```ts
import { evaluateRenewal, RenewalInput } from '@/engine/transfer/contract-renewal';

describe('evaluateRenewal', () => {
  const base: RenewalInput = {
    playerAge: 26,
    playerOverall: 78,
    effectivePotential: 82,
    currentWage: 50_000,
    offeredWage: 55_000,
    offeredYears: 3,
    contractYearsLeft: 1,
    clubReputation: 70,
  };

  it('accepts a fair raise', () => {
    expect(evaluateRenewal(base).decision).toBe('accept');
  });

  it('rejects a wage well below expectation', () => {
    const res = evaluateRenewal({ ...base, offeredWage: 20_000 });
    expect(res.decision).toBe('reject');
  });

  it('counters with a higher wage when the offer is close but light', () => {
    const res = evaluateRenewal({ ...base, offeredWage: 45_000 });
    expect(res.decision).toBe('counter');
    expect(res.counterWage).toBeGreaterThan(45_000);
    expect(res.counterYears).toBeGreaterThanOrEqual(1);
  });

  it('a young high-potential player demands more than a journeyman', () => {
    const youngCounter = evaluateRenewal({
      ...base, playerAge: 19, playerOverall: 70, effectivePotential: 90, offeredWage: 40_000,
    });
    const oldAccept = evaluateRenewal({
      ...base, playerAge: 33, playerOverall: 70, effectivePotential: 70, offeredWage: 40_000,
    });
    // Same offered wage: the prospect counters (wants more), the veteran accepts.
    expect(youngCounter.decision).not.toBe('accept');
    expect(oldAccept.decision).toBe('accept');
  });

  it('is deterministic (pure)', () => {
    expect(evaluateRenewal(base)).toEqual(evaluateRenewal(base));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/transfer/contract-renewal.test.ts`
Expected: FAIL — `Cannot find module '@/engine/transfer/contract-renewal'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/transfer/contract-renewal.ts`:

```ts
export interface RenewalInput {
  playerAge: number;
  playerOverall: number;
  effectivePotential: number;
  currentWage: number;
  offeredWage: number;
  offeredYears: number;
  contractYearsLeft: number;
  clubReputation: number;
}

export interface RenewalResult {
  decision: 'accept' | 'reject' | 'counter';
  counterWage?: number;
  counterYears?: number;
}

/**
 * Pure: the player's expected wage scales with overall and (for prospects)
 * potential. Accept if the offer meets the expectation; reject if it's far
 * below; otherwise counter with the expected wage.
 */
export function evaluateRenewal(input: RenewalInput): RenewalResult {
  const {
    playerOverall,
    effectivePotential,
    currentWage,
    offeredWage,
    offeredYears,
    clubReputation,
  } = input;

  // Expectation: a baseline from overall, boosted by unrealised potential and
  // a small reputation tug (bigger clubs are expected to pay more).
  const potentialGap = Math.max(0, effectivePotential - playerOverall);
  const overallFactor = Math.pow((playerOverall - 40) / 10, 2) * 2000;
  const potentialBoost = 1 + potentialGap * 0.04;
  const repBoost = 1 + (clubReputation / 100) * 0.2;
  const expected = Math.max(2000, Math.round((overallFactor * potentialBoost * repBoost) / 500) * 500);

  // Never expect less than a small bump over the current wage.
  const floor = Math.max(expected, Math.round(currentWage * 1.05));

  if (offeredWage >= floor) {
    return { decision: 'accept' };
  }
  // Far below expectation → walk away.
  if (offeredWage < floor * 0.7) {
    return { decision: 'reject' };
  }
  // Close → counter with the expected wage and at least the offered length.
  return {
    decision: 'counter',
    counterWage: floor,
    counterYears: Math.max(1, offeredYears),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/transfer/contract-renewal.test.ts`
Expected: PASS (5 tests). If the young-prospect/veteran assertion fails, adjust the `overallFactor`/`potentialBoost` constants until the prospect counters and the veteran accepts at offeredWage 40_000 — the test is the contract, not the magic numbers.

- [ ] **Step 5: Commit**

```bash
git add src/engine/transfer/contract-renewal.ts __tests__/engine/transfer/contract-renewal.test.ts
git commit -m "feat(transfer): evaluateRenewal puro (accept/reject/counter)"
```

---

### Task 4: Schema + queries de contrato/loan-wage

**Files:**
- Modify: `src/database/schema.ts` (DDL de `players`/`clubs`), `src/store/database-store.ts` (migração idempotente, junto às demais em `initialize`)
- Modify: `src/database/queries/players.ts` — `PlayerRow`/`rowToPlayer` expõe `loanWage`; `getPlayersByClub` filtra free agents; novos `updatePlayerContract` e `getPlayerContractInfo`
- Modify: `src/types/player.ts` — adiciona `loanWage: number | null` à interface `Player`
- Test: `__tests__/database/queries/contract-queries.test.ts`

**Coordenação com `save-isolation`/`db-hardening`:** se o passe de migração já estiver adicionando colunas a `players`/`clubs`, estas duas (`loan_wage`, `debt_weeks`) entram no mesmo bloco `addColumnIfMissing`. Não criar framework próprio.

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/queries/contract-queries.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import {
  DbHandle,
  getPlayersByClub,
  getFreeAgents,
  updatePlayerContract,
  getPlayerContractInfo,
} from '@/database/queries/players';

describe('contract & loan-wage queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let playerId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const club = rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number };
    clubId = club.id;
    const player = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(clubId) as { id: number };
    playerId = player.id;
  });
  afterEach(() => rawDb.close());

  it('getPlayersByClub excludes free agents still pointing at the club', async () => {
    // Simulate the buggy state the expiry fix prevents: free agent flag set but club_id intact.
    rawDb.prepare('UPDATE players SET is_free_agent = 1 WHERE id = ?').run(playerId);
    const squad = await getPlayersByClub(db, clubId);
    expect(squad.some((p) => p.id === playerId)).toBe(false);
  });

  it('exposes loanWage from the row (NULL when not on loan)', async () => {
    const squad = await getPlayersByClub(db, clubId);
    const p = squad.find((x) => x.id === playerId)!;
    expect(p.loanWage).toBeNull();
    rawDb.prepare('UPDATE players SET loan_wage = 400 WHERE id = ?').run(playerId);
    const squad2 = await getPlayersByClub(db, clubId);
    expect(squad2.find((x) => x.id === playerId)!.loanWage).toBe(400);
  });

  it('updatePlayerContract sets wage and contract_end', async () => {
    await updatePlayerContract(db, playerId, 77_000, 2030);
    const info = await getPlayerContractInfo(db, playerId);
    expect(info).toEqual({ wage: 77_000, contractEnd: 2030, clubId });
  });

  it('getPlayerContractInfo returns null for a missing player', async () => {
    expect(await getPlayerContractInfo(db, 9_999_999)).toBeNull();
  });

  it('a freed player (club_id NULL) appears in free agents, not in the squad', async () => {
    rawDb.prepare('UPDATE players SET is_free_agent = 1, club_id = NULL, wage = 0 WHERE id = ?').run(playerId);
    expect((await getPlayersByClub(db, clubId)).some((p) => p.id === playerId)).toBe(false);
    expect((await getFreeAgents(db)).some((p) => p.id === playerId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/database/queries/contract-queries.test.ts`
Expected: FAIL — `updatePlayerContract`/`getPlayerContractInfo` are not exported (and `no such column: loan_wage` until the schema is updated).

- [ ] **Step 3: Write minimal implementation**

In `src/database/schema.ts`, add `loan_wage` to the `players` DDL (after `loan_wage_share REAL,` at line 90):

```sql
  loan_wage          INTEGER,
```

And add `debt_weeks` to the `clubs` DDL (after `medical_department ...` near line 63, before `primary_color`):

```sql
  debt_weeks          INTEGER NOT NULL DEFAULT 0,
```

In `src/store/database-store.ts`, add to the idempotent migration block in `initialize` (alongside the other `addColumnIfMissing` calls, ~line 93–97):

```ts
      // Economy depth: preserve parent wage during loans; track consecutive debt weeks.
      await addColumnIfMissing(db, 'players', 'loan_wage', 'INTEGER');
      await addColumnIfMissing(db, 'clubs', 'debt_weeks', 'INTEGER NOT NULL DEFAULT 0');
```

In `src/types/player.ts`, add to the `Player` interface (next to `loanWageShare`):

```ts
  loanWage: number | null;
```

In `src/database/queries/players.ts`:
- Add to `PlayerRow` (after `loan_wage_share: number | null;`, line 33):
  ```ts
    loan_wage: number | null;
  ```
- Add to `rowToPlayer` return (after `loanWageShare: ...`, line 83):
  ```ts
    loanWage: row.loan_wage ?? null,
  ```
- Change `getPlayersByClub` (lines 112–117) to exclude free agents:
  ```ts
  export async function getPlayersByClub(db: DbHandle, clubId: number): Promise<Player[]> {
    const rows = await db
      .prepare('SELECT * FROM players WHERE club_id = ? AND is_free_agent = 0')
      .all(clubId) as PlayerRow[];
    return rows.map(rowToPlayer);
  }
  ```
- Append two new exports at the end of the file:
  ```ts
  export async function updatePlayerContract(
    db: DbHandle,
    playerId: number,
    wage: number,
    contractEnd: number,
  ): Promise<void> {
    await db
      .prepare('UPDATE players SET wage = ?, contract_end = ? WHERE id = ?')
      .run(wage, contractEnd, playerId);
  }

  export async function getPlayerContractInfo(
    db: DbHandle,
    playerId: number,
  ): Promise<{ wage: number; contractEnd: number; clubId: number | null } | null> {
    const row = (await db
      .prepare('SELECT wage, contract_end, club_id FROM players WHERE id = ?')
      .get(playerId)) as { wage: number; contract_end: number; club_id: number | null } | undefined;
    if (!row) return null;
    return { wage: row.wage, contractEnd: row.contract_end, clubId: row.club_id == null ? null : Number(row.club_id) };
  }
  ```

Note: `getPlayersWithAttributesByClub` (line 119) and `getPlayersAboutToRetire` (line 257) intentionally keep `WHERE club_id = ?` without the free-agent filter — they are squad-view/retirement helpers where the freed-state is impossible by construction (a freed player has `club_id = NULL`). Only `getPlayersByClub` needs the defensive guard for the wage-bleed regression.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/database/queries/contract-queries.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (Adding `loanWage` to `Player` may surface a missing field anywhere `Player` objects are constructed by hand — search `marketValue:` literals in `__tests__`/`scripts` and add `loanWage: null` if tsc complains.)

- [ ] **Step 6: Commit**

```bash
git add src/database/schema.ts src/store/database-store.ts src/types/player.ts src/database/queries/players.ts __tests__/database/queries/contract-queries.test.ts
git commit -m "feat(db): coluna loan_wage/debt_weeks + updatePlayerContract + guarda free-agent em getPlayersByClub"
```

---

### Task 5: Empréstimo grava loan_wage e restaura na volta

**Files:**
- Modify: `src/engine/transfer/offer-processor.ts` — `executeAcceptedTransfer` (lines 44–47): loan grava `loan_wage`, preserva `wage`
- Modify: `src/engine/transfer/loan-returns.ts` — `returnExpiredLoans` (lines 49–57): limpa `loan_wage = NULL`
- Test: `__tests__/engine/transfer/loan-wage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/transfer/loan-wage.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { executeAcceptedTransfer } from '@/engine/transfer/offer-processor';
import { returnExpiredLoans } from '@/engine/transfer/loan-returns';

describe('loan wage split + restore', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let parentClub: number;
  let borrowClub: number;
  let playerId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const clubs = rawDb.prepare('SELECT id FROM clubs LIMIT 2').all() as { id: number }[];
    parentClub = clubs[0].id;
    borrowClub = clubs[1].id;
    const player = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(parentClub) as { id: number };
    playerId = player.id;
    rawDb.prepare('UPDATE players SET wage = 1000 WHERE id = ?').run(playerId);
    // An offer row must exist for updateOfferStatus to target.
    rawDb.prepare(
      `INSERT INTO transfer_offers (id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type, loan_end)
       VALUES (1, ?, ?, ?, 0, 400, 'pending', 'loan', 2026)`,
    ).run(playerId, borrowClub, parentClub);
  });
  afterEach(() => rawDb.close());

  it('a loan stores loan_wage and preserves the parent wage; return restores it', async () => {
    await executeAcceptedTransfer(db, {
      offerId: 1,
      playerId,
      fromClubId: parentClub,
      toClubId: borrowClub,
      fee: 0,
      wageOffered: 400,
      season: 2025,
      week: 10,
      offerType: 'loan',
      loanEnd: 2026,
    });

    let p = rawDb.prepare('SELECT club_id, wage, loan_wage FROM players WHERE id = ?').get(playerId) as
      { club_id: number; wage: number; loan_wage: number | null };
    expect(p.club_id).toBe(borrowClub);
    expect(p.wage).toBe(1000);       // parent wage preserved, NOT overwritten with 400
    expect(p.loan_wage).toBe(400);   // borrowing club pays the loan share

    // Loan ends at season 2026 → return moves him home and clears loan_wage.
    const returned = await returnExpiredLoans(db, 2026);
    expect(returned).toBe(1);

    p = rawDb.prepare('SELECT club_id, wage, loan_wage FROM players WHERE id = ?').get(playerId) as
      { club_id: number; wage: number; loan_wage: number | null };
    expect(p.club_id).toBe(parentClub);
    expect(p.wage).toBe(1000);
    expect(p.loan_wage).toBeNull();
  });

  it('a permanent transfer still overwrites wage and leaves loan_wage NULL', async () => {
    rawDb.prepare("UPDATE transfer_offers SET offer_type = 'transfer', wage_offered = 1200, loan_end = NULL WHERE id = 1").run();
    await executeAcceptedTransfer(db, {
      offerId: 1,
      playerId,
      fromClubId: parentClub,
      toClubId: borrowClub,
      fee: 5_000_000,
      wageOffered: 1200,
      season: 2025,
      week: 10,
      offerType: 'transfer',
      loanEnd: null,
    });
    const p = rawDb.prepare('SELECT wage, loan_wage FROM players WHERE id = ?').get(playerId) as
      { wage: number; loan_wage: number | null };
    expect(p.wage).toBe(1200);
    expect(p.loan_wage).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/transfer/loan-wage.test.ts`
Expected: FAIL — the loan path currently runs `UPDATE players SET wage = 400` so `p.wage` is `400` not `1000`, and `loan_wage` stays NULL.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/transfer/offer-processor.ts`, replace the player-move block (lines 44–47):

```ts
  // Move player to the buying/borrowing club.
  if (offerType === 'loan') {
    // Loan: preserve the parent club's wage on `wage`; the borrowing club pays
    // the agreed share, stored in `loan_wage`. This is restored on return.
    await db
      .prepare('UPDATE players SET club_id = ?, loan_wage = ?, is_free_agent = 0 WHERE id = ?')
      .run(toClubId, wageOffered, playerId);
  } else {
    // Permanent: the buying club becomes responsible for the full wage.
    await db
      .prepare('UPDATE players SET club_id = ?, wage = ?, loan_wage = NULL, is_free_agent = 0 WHERE id = ?')
      .run(toClubId, wageOffered, playerId);
  }
```

In `src/engine/transfer/loan-returns.ts`, change the move-back block (lines 49–52) to also clear `loan_wage`:

```ts
    // Move back to parent club and clear the loan-wage override so the parent
    // resumes paying the preserved `wage`.
    await db
      .prepare('UPDATE players SET club_id = ?, loan_wage = NULL WHERE id = ?')
      .run(loan.from_club_id, loan.player_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/transfer/loan-wage.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run existing loan tests for regressions**

Run: `npx jest __tests__/engine/transfer/`
Expected: PASS (all transfer suites green).

- [ ] **Step 6: Commit**

```bash
git add src/engine/transfer/offer-processor.ts src/engine/transfer/loan-returns.ts __tests__/engine/transfer/loan-wage.test.ts
git commit -m "fix(transfer): empréstimo grava loan_wage e preserva wage do clube-pai (restaura na volta)"
```

---

### Task 6: Gate de acessibilidade da fee no caminho AI-vendedor-aceita

**Files:**
- Modify: `src/engine/transfer/offer-processor.ts` — `processPendingOffers`, ramo `result.decision === 'accept'` (lines 241–254)
- Test: `__tests__/engine/transfer/afford-gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/transfer/afford-gate.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { processPendingOffers } from '@/engine/transfer/offer-processor';

describe('afford gate on AI-accepts-human-bid', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let buyerClub: number;   // the human/poor buyer
  let sellerClub: number;  // AI seller
  let playerId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const clubs = rawDb.prepare('SELECT id FROM clubs LIMIT 2').all() as { id: number }[];
    buyerClub = clubs[0].id;
    sellerClub = clubs[1].id;
    const player = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(sellerClub) as { id: number };
    playerId = player.id;
    // Make this an easy accept: low market value, plenty of teammates at the position,
    // and a fee well above value so evaluateOffer would return 'accept'.
    rawDb.prepare('UPDATE players SET market_value = 1000000 WHERE id = ?').run(playerId);
    // Give the seller a same-position teammate so clubHasReplacement is true.
    const pos = (rawDb.prepare('SELECT position FROM players WHERE id = ?').get(playerId) as { position: string }).position;
    rawDb.prepare('UPDATE players SET position = ? WHERE club_id = ? AND id != ? LIMIT 1').run(pos, sellerClub, playerId);
    // Poor buyer.
    rawDb.prepare('UPDATE clubs SET budget = 50000 WHERE id = ?').run(buyerClub);
    const sellerBudgetBefore = (rawDb.prepare('SELECT budget FROM clubs WHERE id = ?').get(sellerClub) as { budget: number }).budget;
    (globalThis as Record<string, unknown>).__sellerBudgetBefore = sellerBudgetBefore;
    // Pending offer: buyer bids 2,000,000 (> its 50k budget) for the player.
    rawDb.prepare(
      `INSERT INTO transfer_offers (id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type, loan_end)
       VALUES (1, ?, ?, ?, 2000000, 5000, 'pending', 'transfer', NULL)`,
    ).run(playerId, buyerClub, sellerClub);
  });
  afterEach(() => rawDb.close());

  it('rejects the offer and moves no money/player when the buyer cannot afford the fee', async () => {
    // playerClubId is the SELLER's id here is wrong — we want the AI to process
    // this offer (buyer is not the user). Pass a different/none club so the offer
    // is NOT skipped as user-seller.
    await processPendingOffers(db, 2025, 10, 999999);

    const offer = rawDb.prepare('SELECT status FROM transfer_offers WHERE id = 1').get() as { status: string };
    expect(offer.status).toBe('rejected');

    const player = rawDb.prepare('SELECT club_id FROM players WHERE id = ?').get(playerId) as { club_id: number };
    expect(player.club_id).toBe(sellerClub); // did not move

    const buyer = rawDb.prepare('SELECT budget FROM clubs WHERE id = ?').get(buyerClub) as { budget: number };
    expect(buyer.budget).toBe(50000); // unchanged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/transfer/afford-gate.test.ts`
Expected: FAIL — without the gate, `evaluateOffer` returns `accept`, `executeAcceptedTransfer` runs, the player moves and the buyer budget goes to `50000 - 2000000 = -1950000`.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/transfer/offer-processor.ts`, add the import at the top (after line 9):

```ts
import { canAffordTransfer } from '@/engine/finance/affordability';
```

In the `result.decision === 'accept'` branch (lines 241–254), guard the execution with a budget lookup:

```ts
    if (result.decision === 'accept') {
      // Gate: the offering club must actually be able to pay the fee. Without
      // this, AI sellers happily accept bids the human/AI buyer cannot fund and
      // the buyer budget goes arbitrarily negative.
      const buyer = (await db
        .prepare('SELECT budget FROM clubs WHERE id = ?')
        .get(offer.offeringClubId)) as { budget: number } | undefined;
      if (!buyer || !canAffordTransfer(buyer.budget, offer.feeOffered)) {
        await updateOfferStatus(db, offer.id, 'rejected', week);
        await blockClubFromPlayer(db, offer.playerId, offer.offeringClubId, season, week);
        continue;
      }
      // Execute immediately
      await executeAcceptedTransfer(db, {
        offerId: offer.id,
        playerId: offer.playerId,
        fromClubId: player.club_id,
        toClubId: offer.offeringClubId,
        fee: offer.feeOffered,
        wageOffered: offer.wageOffered,
        season,
        week,
        offerType: offer.offerType,
        loanEnd: offer.loanEnd,
      });
    } else if (...) // unchanged
```

(`getPendingOffers` already exposes `offeringClubId`, `feeOffered`, etc. — confirm against `src/database/queries/transfers.ts` before writing; the `pending` loop at line 172 already destructures these fields.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/transfer/afford-gate.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run existing offer-processor tests for regressions**

Run: `npx jest __tests__/engine/transfer/`
Expected: PASS (all green — the counter path at lines 143–151 already checks affordability, so no behaviour change there).

- [ ] **Step 6: Commit**

```bash
git add src/engine/transfer/offer-processor.ts __tests__/engine/transfer/afford-gate.test.ts
git commit -m "fix(transfer): bloqueia compra inacessível no caminho AI-vendedor-aceita"
```

---

### Task 7: Wage budget enforcement no signFreeAgent

**Files:**
- Modify: `src/engine/transfer/free-agent-signing.ts` — após o budget check (line 61), gate `canAffordWage`
- Test: `__tests__/engine/transfer/free-agent-wage-budget.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/transfer/free-agent-wage-budget.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { signFreeAgent } from '@/engine/transfer/free-agent-signing';

describe('signFreeAgent wage-budget enforcement', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let faId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const club = rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number };
    clubId = club.id;
    // Make one of the club's players a free agent to sign back; give a healthy budget.
    const p = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(clubId) as { id: number };
    faId = p.id;
    rawDb.prepare('UPDATE players SET is_free_agent = 1, club_id = NULL, wage = 0 WHERE id = ?').run(faId);
    rawDb.prepare('UPDATE clubs SET budget = 100000000 WHERE id = ?').run(clubId);
  });
  afterEach(() => rawDb.close());

  it('rejects a signing that would push the wage bill over wage_budget', async () => {
    // Current wage bill of remaining squad + a tiny wage_budget headroom.
    const bill = (rawDb.prepare('SELECT COALESCE(SUM(wage),0) AS b FROM players WHERE club_id = ? AND is_free_agent = 0').get(clubId) as { b: number }).b;
    rawDb.prepare('UPDATE clubs SET wage_budget = ? WHERE id = ?').run(bill + 1000, clubId);

    const res = await signFreeAgent(db, {
      playerId: faId, clubId, wageOffered: 50000, contractYears: 2,
      playerOverall: 60, season: 2025, week: 1,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/wage budget/i);

    const p = rawDb.prepare('SELECT club_id FROM players WHERE id = ?').get(faId) as { club_id: number | null };
    expect(p.club_id).toBeNull(); // not signed
  });

  it('allows a signing that fits under wage_budget', async () => {
    const bill = (rawDb.prepare('SELECT COALESCE(SUM(wage),0) AS b FROM players WHERE club_id = ? AND is_free_agent = 0').get(clubId) as { b: number }).b;
    rawDb.prepare('UPDATE clubs SET wage_budget = ? WHERE id = ?').run(bill + 100000, clubId);

    const res = await signFreeAgent(db, {
      playerId: faId, clubId, wageOffered: 20000, contractYears: 2,
      playerOverall: 60, season: 2025, week: 1,
    });
    expect(res.success).toBe(true);
    const p = rawDb.prepare('SELECT club_id FROM players WHERE id = ?').get(faId) as { club_id: number | null };
    expect(p.club_id).toBe(clubId);
  });

  it('treats wage_budget = 0 as "no cap" (legacy)', async () => {
    rawDb.prepare('UPDATE clubs SET wage_budget = 0 WHERE id = ?').run(clubId);
    const res = await signFreeAgent(db, {
      playerId: faId, clubId, wageOffered: 20000, contractYears: 2,
      playerOverall: 60, season: 2025, week: 1,
    });
    expect(res.success).toBe(true);
  });
});
```

Note: `freeAgentExpectedWage(60) ≈ 33500`, so `wageOffered: 50000` clears the expectation in test 1 (the rejection must come from the wage-budget gate, not the expectation), and `wageOffered: 20000` is below expectation — adjust to `playerOverall: 50` (expected ~4000) if needed so the success tests pass the expectation check. Verify against `freeAgentExpectedWage` before finalizing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/transfer/free-agent-wage-budget.test.ts`
Expected: FAIL — no wage-budget gate exists, so test 1 succeeds (wrong) and signs the player.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/transfer/free-agent-signing.ts`, add the import (after line 3):

```ts
import { canAffordWage } from '@/engine/finance/affordability';
```

After the budget check (line 63, the `club.budget < wageOffered * 4` block) and before computing `expected` (line 65), add:

```ts
  // Wage-budget gate: the club's existing wage bill plus this wage must fit
  // under wage_budget. A wage_budget of 0 (legacy) means "no cap".
  const wbRow = (await db
    .prepare('SELECT wage_budget FROM clubs WHERE id = ?')
    .get(clubId)) as { wage_budget: number } | undefined;
  const billRow = (await db
    .prepare('SELECT COALESCE(SUM(wage), 0) AS bill FROM players WHERE club_id = ? AND is_free_agent = 0')
    .get(clubId)) as { bill: number };
  if (wbRow && !canAffordWage(billRow.bill, wbRow.wage_budget, wageOffered)) {
    return { success: false, reason: 'Wage budget exceeded for this signing.' };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/transfer/free-agent-wage-budget.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/transfer/free-agent-signing.ts __tests__/engine/transfer/free-agent-wage-budget.test.ts
git commit -m "feat(transfer): enforce wage_budget no signFreeAgent (canAffordWage)"
```

---

### Task 8: Bilheteria por competição + rastreio de dívida no loop semanal

**Files:**
- Modify: `src/engine/finance/finance-engine.ts` — `WeeklyIncomeInput` ganha `competitionType?`; `calculateWeeklyIncome` escala ticket
- Modify: `src/engine/game-loop.ts` — lê o tipo da competição do `playerFixture`, passa ao income; após `updateClubBudget` (line 681), rastreia `debt_weeks`
- Test: `__tests__/engine/finance/finance-engine.test.ts` (estende o existente), `__tests__/engine/finance/debt-weeks.test.ts`

#### 8a — bilheteria por competição (unit, no `finance-engine.test.ts` existente)

- [ ] **Step 1: Write the failing test**

Append to `__tests__/engine/finance/finance-engine.test.ts`:

```ts
import { calculateWeeklyIncome } from '@/engine/finance/finance-engine';

describe('calculateWeeklyIncome — competition gate receipts', () => {
  const base = {
    clubReputation: 70,
    stadiumCapacity: 40000,
    hasHomeMatch: true,
    leaguePosition: 1,
    season: 2025,
    week: 5,
    actualAttendance: 30000,
  };
  it('a continental home match earns more ticket revenue than a league match', () => {
    const league = calculateWeeklyIncome({ ...base, competitionType: 'league' });
    const cl = calculateWeeklyIncome({ ...base, competitionType: 'continental' });
    expect(cl.ticket).toBeGreaterThan(league.ticket);
  });
  it('defaults to the league (1.0) multiplier when competitionType is omitted', () => {
    const omitted = calculateWeeklyIncome(base);
    const league = calculateWeeklyIncome({ ...base, competitionType: 'league' });
    expect(omitted.ticket).toBe(league.ticket);
  });
  it('does not change tv/sponsor (only ticket scales)', () => {
    const league = calculateWeeklyIncome({ ...base, competitionType: 'league' });
    const cup = calculateWeeklyIncome({ ...base, competitionType: 'cup' });
    expect(cup.tv).toBe(league.tv);
    expect(cup.sponsor).toBe(league.sponsor);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/finance/finance-engine.test.ts`
Expected: FAIL — `competitionType` is not a property of `WeeklyIncomeInput` (tsc error) / ticket does not scale.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/finance/finance-engine.ts`, import the multiplier and type at the top:

```ts
import { gateReceiptMultiplier, CompetitionType } from './prize-money';
```

Add to `WeeklyIncomeInput` (after `actualAttendance` field, line 11):

```ts
  /** Competition of the home fixture; scales gate receipts. Defaults to 'league' (1.0). */
  competitionType?: CompetitionType;
```

In `calculateWeeklyIncome`, multiply the ticket figure by the gate multiplier. Replace the `ticket` computation block (lines 43–53) so the multiplier wraps both branches:

```ts
  const avgTicketPrice = 30 + (input.clubReputation / 100) * 40;
  const gateMult = gateReceiptMultiplier(input.competitionType ?? 'league');
  let ticket = 0;
  if (input.hasHomeMatch) {
    if (input.actualAttendance != null) {
      ticket = Math.round(input.actualAttendance * avgTicketPrice * gateMult);
    } else {
      const occupancy = Math.min(0.95, 0.4 + (input.clubReputation / 100) * 0.55);
      ticket = Math.round(input.stadiumCapacity * occupancy * avgTicketPrice * gateMult);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/finance/finance-engine.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/engine/finance/finance-engine.ts __tests__/engine/finance/finance-engine.test.ts
git commit -m "feat(finance): bilheteria escalada por competição (gateReceiptMultiplier)"
```

#### 8b — wire competitionType + debt_weeks no game-loop

- [ ] **Step 6: Write the failing integration test**

Create `__tests__/engine/finance/debt-weeks.test.ts`. The loop entry point is `advanceGameWeek(params: AdvanceWeekParams)` — a **single object** argument (verified `src/engine/game-loop.ts:105–112`): `{ dbHandle, season, week, playerClubId, saveId, rng }` where `rng` is a `SeededRng`. This test drives a club already in the red and asserts `debt_weeks` increments, then resets when positive:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';

describe('debt_weeks tracking', () => {
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

  it('increments debt_weeks when the budget stays negative after a week', async () => {
    // Force a negative budget so weekly income cannot lift it positive.
    rawDb.prepare('UPDATE clubs SET budget = -500000000 WHERE id = ?').run(clubId);
    await advanceGameWeek({ dbHandle: db, saveId: -1, playerClubId: clubId, season: 2025, week: 3, rng: new SeededRng(1) });
    const c1 = rawDb.prepare('SELECT debt_weeks, budget FROM clubs WHERE id = ?').get(clubId) as { debt_weeks: number; budget: number };
    expect(c1.budget).toBeLessThan(0);
    expect(c1.debt_weeks).toBe(1);

    await advanceGameWeek({ dbHandle: db, saveId: -1, playerClubId: clubId, season: 2025, week: 4, rng: new SeededRng(1) });
    const c2 = rawDb.prepare('SELECT debt_weeks FROM clubs WHERE id = ?').get(clubId) as { debt_weeks: number };
    expect(c2.debt_weeks).toBe(2);
  });

  it('resets debt_weeks to 0 once the budget is non-negative', async () => {
    rawDb.prepare('UPDATE clubs SET budget = 0, debt_weeks = 5 WHERE id = ?').run(clubId);
    await advanceGameWeek({ dbHandle: db, saveId: -1, playerClubId: clubId, season: 2025, week: 3, rng: new SeededRng(1) });
    const c = rawDb.prepare('SELECT debt_weeks, budget FROM clubs WHERE id = ?').get(clubId) as { debt_weeks: number; budget: number };
    expect(c.budget).toBeGreaterThanOrEqual(0);
    expect(c.debt_weeks).toBe(0);
  });
});
```

Note: `week: 3` is mid-season so `isSeasonEnd` is false and the finance/debt pass runs without needing a played playoff fixture. If the loop requires a fixture row for the week, the finance + debt-tracking block (game-loop.ts:577–682) runs inside `if (playerClub)` regardless of whether `playerFixture` exists, so `debt_weeks` is updated even with no fixture this week. `SeededRng` is imported from `@/engine/rng` (see `src/engine/game-loop.ts:1`).

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest __tests__/engine/finance/debt-weeks.test.ts`
Expected: FAIL — `debt_weeks` never updated (stays at seed default / the column read returns 0 with no increment logic).

- [ ] **Step 8: Write minimal implementation**

In `src/engine/game-loop.ts`:

(a) Resolve the competition type of the home fixture and pass it to `calculateWeeklyIncome`. Before the `calculateWeeklyIncome` call (line 589), add a lookup using `playerFixture.competitionId`:

```ts
    let competitionType: 'league' | 'cup' | 'continental' = 'league';
    if (hasHomeMatch && playerFixture) {
      const compRow = (await db
        .prepare('SELECT type FROM competitions WHERE id = ?')
        .get(playerFixture.competitionId)) as { type: string } | undefined;
      if (compRow?.type === 'cup' || compRow?.type === 'continental') {
        competitionType = compRow.type;
      }
    }
```

Then add `competitionType,` to the `calculateWeeklyIncome({ ... })` argument object (line 589–597).

(b) After `await updateClubBudget(db, playerClubId, updatedBudget);` (line 681), track debt:

```ts
    // Debt signal for board-stakes: consecutive weeks in the red.
    const prevDebt = (await db
      .prepare('SELECT debt_weeks FROM clubs WHERE id = ?')
      .get(playerClubId)) as { debt_weeks: number } | undefined;
    const newDebtWeeks = updatedBudget < 0 ? (prevDebt?.debt_weeks ?? 0) + 1 : 0;
    await db
      .prepare('UPDATE clubs SET debt_weeks = ? WHERE id = ?')
      .run(newDebtWeeks, playerClubId);
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest __tests__/engine/finance/debt-weeks.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Run the full game-loop suite for regressions**

Run: `npx jest __tests__/engine/game-loop`
Expected: PASS (all green).

- [ ] **Step 11: Commit**

```bash
git add src/engine/game-loop.ts __tests__/engine/finance/debt-weeks.test.ts
git commit -m "feat(finance): competitionType na bilheteria + rastreio de debt_weeks no loop"
```

---

### Task 9: archiveSeason retorna premiação (engine puro)

**Files:**
- Modify: `src/engine/history/season-archiver.ts` — `archiveLeague`/`archiveKnockout`/`archiveSeason` retornam `PrizeAward[]` calculado via `prize-money.ts` (escrita continua no caller, Task 10)
- Test: `__tests__/engine/history/season-archiver-prizes.test.ts`

The archiver stays pure for the prize *calculation*: it computes `PrizeAward[]` (no `addFinanceEntry`/`updateClubBudget` here — those are persistence and belong to the rollover caller). The existing INSERTs into `season_competition_results` etc. stay; only the **return value** is added.

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/history/season-archiver-prizes.test.ts`. Read `__tests__/engine/history/` for an existing archiver test to copy the exact fixture/competition seeding shape, then assert on the returned awards:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { archiveSeason } from '@/engine/history/season-archiver';

describe('archiveSeason prize awards', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('returns league prizes ranked by final position (champion > relegated)', async () => {
    // Build a minimal played league season. Reuse the helper that an existing
    // archiver test uses (see __tests__/engine/history/*archiver*). For two clubs
    // A and B in a league competition, play a round-robin where A wins.
    // ... seed a league competition + clubs + played fixtures where A finishes 1st ...
    const awards = await archiveSeason(db, 2025);

    expect(Array.isArray(awards)).toBe(true);
    // At least the champion has a positive prize.
    expect(awards.length).toBeGreaterThan(0);
    const sorted = [...awards].sort((a, b) => b.amount - a.amount);
    expect(sorted[0].amount).toBeGreaterThan(0);
    expect(sorted[0].description).toMatch(/prize/i);
    // Champion's prize > the lowest-placed club's prize.
    expect(sorted[0].amount).toBeGreaterThan(sorted[sorted.length - 1].amount);
  });
});
```

IMPORTANT: read an existing test under `__tests__/engine/history/` that exercises `archiveSeason`/`archiveLeague` to copy the precise competition + fixtures seeding (the seed from `seedTestDb` does not create played fixtures). Ground the fixture/standings setup in that real helper rather than inventing column names.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/history/season-archiver-prizes.test.ts`
Expected: FAIL — `archiveSeason` currently returns `Promise<void>` (no awards array).

- [ ] **Step 3: Write minimal implementation**

In `src/engine/history/season-archiver.ts`:
- Import the prize helpers + type at the top:
  ```ts
  import { calculateLeaguePrize, calculateCupPrize, PrizeAward } from '@/engine/finance/prize-money';
  ```
- Change `archiveLeague` to return `Promise<PrizeAward[]>`. After computing `standings` and `champion`/`relegated`, build awards from the full standings:
  ```ts
  async function archiveLeague(
    db: DbHandle,
    competition: CompetitionRow,
    season: number,
  ): Promise<PrizeAward[]> {
    if (competition.league_id == null) return [];
    const league = await getLeague(db, competition.league_id);
    if (!league) return [];
    const fixtures = await getPlayedFixtures(db, competition.id, season);
    if (fixtures.length === 0) return [];
    const standings = computeStandings(fixtures);
    if (standings.length === 0) return [];

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

    // Need divisionLevel for prize scaling.
    const lvlRow = (await db
      .prepare('SELECT division_level FROM leagues WHERE id = ?')
      .get(league.id)) as { division_level: number } | undefined;
    const divisionLevel = lvlRow?.division_level ?? 1;
    const numTeams = standings.length;
    const awards: PrizeAward[] = standings.map((s, idx) => ({
      clubId: s.clubId,
      amount: calculateLeaguePrize({ divisionLevel, finalPosition: idx + 1, numTeams }),
      description: `League prize (pos ${idx + 1})`,
    }));
    return awards;
  }
  ```
- Change `archiveKnockout` to return `Promise<PrizeAward[]>`. After resolving `championClubId`/`runnerUpClubId`, map the comp type (`'cup'` or `'continental'`) and emit champion + runner-up awards:
  ```ts
  async function archiveKnockout(
    db: DbHandle,
    competition: CompetitionRow,
    season: number,
  ): Promise<PrizeAward[]> {
    // ... existing body up to insertResultIgnore + snapshotChampionSquad ...
    // (keep all the existing logic; only add the return)
    await insertResultIgnore(db, season, competition.id, championClubId, runnerUpClubId);
    await snapshotChampionSquad(db, season, competition.id, championClubId);

    const compType: 'cup' | 'continental' = competition.type === 'continental' ? 'continental' : 'cup';
    const awards: PrizeAward[] = [
      { clubId: championClubId, amount: calculateCupPrize({ competitionType: compType, result: 'champion' }), description: 'Cup prize (champion)' },
    ];
    if (runnerUpClubId != null) {
      awards.push({ clubId: runnerUpClubId, amount: calculateCupPrize({ competitionType: compType, result: 'runner_up' }), description: 'Cup prize (runner-up)' });
    }
    return awards;
  }
  ```
  (Keep every early `return;` in the existing body as `return [];`.)
- Change `archiveSeason` to aggregate and return:
  ```ts
  export async function archiveSeason(db: DbHandle, season: number): Promise<PrizeAward[]> {
    const competitions = await getCompetitionsForSeason(db, season);
    const allAwards: PrizeAward[] = [];
    for (const competition of competitions) {
      if (competition.type === 'league') {
        allAwards.push(...(await archiveLeague(db, competition, season)));
      } else if (competition.type === 'cup' || competition.type === 'continental') {
        allAwards.push(...(await archiveKnockout(db, competition, season)));
      }
      await archiveTopScorers(db, competition.id, season);
      await archiveTopAssisters(db, competition.id, season);
      await archiveMvpAndBreakthrough(db, competition, season);
    }
    return allAwards;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/history/season-archiver-prizes.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing archiver suite + tsc (return-type change is breaking for callers)**

Run: `npx jest __tests__/engine/history/ && npx tsc --noEmit`
Expected: archiver tests PASS. tsc may flag the EndOfSeasonScreen caller of `archiveSeason` if it relies on `void` — that caller is updated in Task 10 (which lands together). If running standalone, temporarily ignore the unused return; Task 10 consumes it.

- [ ] **Step 6: Commit**

```bash
git add src/engine/history/season-archiver.ts __tests__/engine/history/season-archiver-prizes.test.ts
git commit -m "feat(history): archiveSeason retorna PrizeAward[] (cálculo puro de premiação)"
```

---

### Task 10: Rollover — expiry real, recálculo de valor, distribuição de prêmio

**Files:**
- Modify: `src/types/finance.ts` — adiciona `'prize'` ao `FinanceType`
- Modify: `src/engine/game-loop.ts` — `advanceGameWeek`, season-end block (line 781): consome o retorno de `archiveSeason` e chama `distributePrizeMoney`
- Modify: `src/screens/EndOfSeasonScreen.tsx` — `handleContinue` (lines 359–393): expiry com `club_id=NULL, wage=0`; recálculo de `market_value`
- Test (integração): `__tests__/engine/economy/rollover-economy.test.ts` — exercita os passes via funções reutilizáveis, **não** via o componente React

**Where each pass runs (grounded):** `archiveSeason` is called inside `advanceGameWeek` at the `isSeasonEnd` block (`src/engine/game-loop.ts:781`), NOT in the screen (`grep archiveSeason src/screens` returns nothing). So **prize distribution** is wired at that game-loop callsite. The screen's `handleContinue` runs the *other* rollover passes (age++ already there at line 337, expiry, value recalc). Extract the three DB passes into a testable engine module `src/engine/finance/rollover-economy.ts`; the game-loop calls `distributePrizeMoney`, the screen calls `expireContracts` + `recalculateMarketValues`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/economy/rollover-economy.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle, getPlayersByClub, getFreeAgents } from '@/database/queries/players';
import {
  expireContracts,
  recalculateMarketValues,
  distributePrizeMoney,
} from '@/engine/finance/rollover-economy';
import { PrizeAward } from '@/engine/finance/prize-money';

describe('rollover economy passes', () => {
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

  it('expireContracts frees a player whose contract ended: club_id NULL, wage 0, is_free_agent 1', async () => {
    const p = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(clubId) as { id: number };
    rawDb.prepare('UPDATE players SET contract_end = 2025, wage = 1000 WHERE id = ?').run(p.id);

    const billBefore = (rawDb.prepare('SELECT COALESCE(SUM(wage),0) AS b FROM players WHERE club_id = ?').get(clubId) as { b: number }).b;
    await expireContracts(db, 2025);
    const row = rawDb.prepare('SELECT club_id, wage, is_free_agent FROM players WHERE id = ?').get(p.id) as
      { club_id: number | null; wage: number; is_free_agent: number };
    expect(row.club_id).toBeNull();
    expect(row.wage).toBe(0);
    expect(row.is_free_agent).toBe(1);

    // Two-state regression: not in squad, yes in free agents, wage bill dropped.
    expect((await getPlayersByClub(db, clubId)).some((x) => x.id === p.id)).toBe(false);
    expect((await getFreeAgents(db)).some((x) => x.id === p.id)).toBe(true);
    const billAfter = (rawDb.prepare('SELECT COALESCE(SUM(wage),0) AS b FROM players WHERE club_id = ?').get(clubId) as { b: number }).b;
    expect(billAfter).toBeLessThan(billBefore);
  });

  it('recalculateMarketValues moves a young prospect value up vs an aging short-contract player', async () => {
    const young = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(clubId) as { id: number };
    rawDb.prepare('UPDATE players SET age = 19, effective_potential = 90, contract_end = 2030 WHERE id = ?').run(young.id);
    const before = (rawDb.prepare('SELECT market_value FROM players WHERE id = ?').get(young.id) as { market_value: number }).market_value;

    await recalculateMarketValues(db, 2026); // newSeason

    const after = (rawDb.prepare('SELECT market_value FROM players WHERE id = ?').get(young.id) as { market_value: number }).market_value;
    expect(after).toBeGreaterThan(0);
    // A 19yo with a big potential gap and long contract should be worth a lot.
    expect(after).not.toBe(before); // value actually moved (was frozen before)
  });

  it('distributePrizeMoney credits budgets and writes a prize finance row', async () => {
    const budgetBefore = (rawDb.prepare('SELECT budget FROM clubs WHERE id = ?').get(clubId) as { budget: number }).budget;
    const awards: PrizeAward[] = [{ clubId, amount: 5_000_000, description: 'League prize (pos 1)' }];
    await distributePrizeMoney(db, awards, 2025, 38);
    const budgetAfter = (rawDb.prepare('SELECT budget FROM clubs WHERE id = ?').get(clubId) as { budget: number }).budget;
    expect(budgetAfter).toBe(budgetBefore + 5_000_000);
    const fin = rawDb.prepare("SELECT type, amount FROM club_finances WHERE club_id = ? AND type = 'prize'").get(clubId) as
      { type: string; amount: number } | undefined;
    expect(fin?.type).toBe('prize');
    expect(fin?.amount).toBe(5_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/economy/rollover-economy.test.ts`
Expected: FAIL — `Cannot find module '@/engine/finance/rollover-economy'`.

- [ ] **Step 3: Write minimal implementation**

First, in `src/types/finance.ts`, add `'prize'`:

```ts
export type FinanceType = 'ticket' | 'tv' | 'sponsor' | 'transfer_in' | 'transfer_out' | 'wages' | 'maintenance' | 'bonus' | 'upgrade' | 'assistant_wage' | 'prize';
```

Create `src/engine/finance/rollover-economy.ts`:

```ts
import { DbHandle } from '@/database/queries/players';
import { addFinanceEntry } from '@/database/queries/finances';
import { updateClubBudget, getClubById } from '@/database/queries/clubs';
import { calculateMarketValue } from '@/engine/transfer/market-value';
import { calculateOverall } from '@/utils/overall';
import { Position, PlayerAttributes } from '@/types';
import { PrizeAward } from './prize-money';

/** Contract expiry: a player whose contract_end <= endedSeason is released —
 *  club_id NULL, wage 0, is_free_agent 1. Fixes the two-state bug where the
 *  player was flagged free but still attached to (and paid by) the club. */
export async function expireContracts(db: DbHandle, endedSeason: number): Promise<void> {
  await db
    .prepare(
      'UPDATE players SET is_free_agent = 1, club_id = NULL, wage = 0 WHERE contract_end <= ? AND club_id IS NOT NULL',
    )
    .run(endedSeason);
}

/** Recompute market_value for every player attached to a club (or a free agent),
 *  using fresh overall/age/potential/contract. Runs once per season at rollover. */
export async function recalculateMarketValues(db: DbHandle, currentSeason: number): Promise<void> {
  const players = (await db
    .prepare(
      `SELECT p.id, p.age, p.effective_potential, p.contract_end, p.position
       FROM players p WHERE p.club_id IS NOT NULL OR p.is_free_agent = 1`,
    )
    .all()) as Array<{ id: number; age: number; effective_potential: number; contract_end: number; position: string }>;

  for (const p of players) {
    const attr = (await db
      .prepare('SELECT * FROM player_attributes WHERE player_id = ?')
      .get(p.id)) as (PlayerAttributes & { player_id: number }) | undefined;
    if (!attr) continue;
    const overall = calculateOverall(attr as PlayerAttributes, p.position as Position);
    const value = calculateMarketValue({
      overall,
      effectivePotential: p.effective_potential,
      age: p.age,
      contractYearsLeft: Math.max(0, p.contract_end - currentSeason),
    });
    await db.prepare('UPDATE players SET market_value = ? WHERE id = ?').run(value, p.id);
  }
}

/** Credit prize money to each club's budget and write a 'prize' finance row.
 *  Single call point per season (rollover) → idempotent by construction. */
export async function distributePrizeMoney(
  db: DbHandle,
  awards: PrizeAward[],
  season: number,
  week: number,
): Promise<void> {
  for (const a of awards) {
    if (a.amount <= 0) continue;
    const club = await getClubById(db, a.clubId);
    if (!club) continue;
    await updateClubBudget(db, a.clubId, club.budget + a.amount);
    await addFinanceEntry(db, {
      clubId: a.clubId,
      season,
      week,
      type: 'prize',
      amount: a.amount,
      description: a.description,
    });
  }
}
```

Note on `calculateOverall(attr as PlayerAttributes, ...)`: the row from `player_attributes` has snake_case columns (`long_shots`, `free_kicks`) but `PlayerAttributes` is camelCase. Use the existing `rowToAttributes` mapper instead of a cast — import it if exported, or select via the existing `getPlayerById`/attribute mapper. Verify in `src/database/queries/players.ts`: `rowToAttributes` is module-private. Cleanest: reuse `getPlayersWithAttributesByClub` per club, or export a small `mapAttributesRow`. **Implementation detail to resolve in this step:** select the attributes through an already-mapped path (e.g. loop clubs and call `getPlayersWithAttributesByClub`, which returns `attributes` in camelCase) so `calculateOverall` receives a real `PlayerAttributes`. Adjust the function body accordingly; the test only asserts the value moved, not the exact path.

Then wire the screen. In `src/screens/EndOfSeasonScreen.tsx`:
- Replace the expiry line (line 362) with the helper call (after `returnExpiredLoans` so a loaned player returns first, then expires — match the spec's ordering):
  ```ts
  // 2b. Return loaned players to their parent clubs (before expiry).
  await returnExpiredLoans(dbHandle, endedSeason);
  // 2. Contract expiry — release players whose contract ended (club_id NULL, wage 0).
  await expireContracts(dbHandle, endedSeason);
  ```
  (Remove the old line-362 `UPDATE ... SET is_free_agent = 1` and the now-duplicate `returnExpiredLoans` call; keep a single ordered pair.)
- After the potential-recalc block (line 393) and the age++ (so values are fresh), add:
  ```ts
  // Recompute market values for all attached/free players with fresh attributes.
  await recalculateMarketValues(dbHandle, newSeason);
  ```
  Add `import { expireContracts, recalculateMarketValues } from '@/engine/finance/rollover-economy';` to the screen.

Then wire **prize distribution in the game-loop** (this is where `archiveSeason` actually runs). In `src/engine/game-loop.ts`, at the season-end block (line 781), replace:
  ```ts
    await archiveSeason(db, season);
  ```
  with:
  ```ts
    const prizeAwards = await archiveSeason(db, season);
    await distributePrizeMoney(db, prizeAwards, season, week);
  ```
  Add `import { distributePrizeMoney } from '@/engine/finance/rollover-economy';` to `game-loop.ts` (alongside the existing `archiveSeason` import at line 30). This credits prizes to **all** clubs (champion, runner-up, league positions) once per season at the single season-end call point — idempotent by construction. Coordinate with `ai-world-alive` so its weekly multi-club finance pass does not also credit these.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/economy/rollover-economy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (the `archiveSeason` return is now consumed, resolving the Task 9 type note).

- [ ] **Step 6: Commit**

```bash
git add src/types/finance.ts src/engine/finance/rollover-economy.ts src/engine/game-loop.ts src/screens/EndOfSeasonScreen.tsx __tests__/engine/economy/rollover-economy.test.ts
git commit -m "feat(economy): rollover faz expiry real + recálculo de valor + distribuição de prêmio"
```

---

### Task 11: UI — modal de renovação de contrato no detalhe do jogador

**Files:**
- Modify: `src/screens/squad/PlayerDetailScreen.tsx` (or the sibling that shows a single player — confirm the actual screen with `grep -rln "getPlayerById" src/screens` before editing)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` — chaves `renewal.*`
- No unit test (UI). Validated by `tsc`, the parity test, and Playwright.

- [ ] **Step 1: Add i18n keys**

Add to both `src/i18n/pt.ts` and `src/i18n/en.ts` (keep parity — the existing `__tests__/i18n/parity.test.ts` enforces it):

pt:
```ts
  'renewal.button': 'Renovar contrato',
  'renewal.title': 'Renovar contrato',
  'renewal.wage_label': 'Salário semanal',
  'renewal.years_label': 'Anos de contrato',
  'renewal.confirm': 'Propor',
  'renewal.accepted': 'Renovação aceita!',
  'renewal.countered': 'O jogador pede {wage}/sem por {years} ano(s).',
  'renewal.rejected': 'O jogador recusou a proposta.',
  'renewal.wage_budget_exceeded': 'Estoura o teto salarial do clube.',
```

en:
```ts
  'renewal.button': 'Renew contract',
  'renewal.title': 'Renew contract',
  'renewal.wage_label': 'Weekly wage',
  'renewal.years_label': 'Contract years',
  'renewal.confirm': 'Propose',
  'renewal.accepted': 'Renewal accepted!',
  'renewal.countered': 'The player asks {wage}/wk for {years} year(s).',
  'renewal.rejected': 'The player declined the offer.',
  'renewal.wage_budget_exceeded': 'Exceeds the club wage budget.',
```

- [ ] **Step 2: Wire the modal**

In the player detail screen, add a "Renovar contrato" button (only when the player belongs to the user's club). On press, open a modal with wage/years inputs (reuse existing styled inputs/`theme` tokens — colors/spacing from `src/theme`, never hardcoded). On confirm:

```ts
import { evaluateRenewal } from '@/engine/transfer/contract-renewal';
import { updatePlayerContract, getPlayerContractInfo } from '@/database/queries/players';
import { canAffordWage } from '@/engine/finance/affordability';
import { calculateOverall } from '@/utils/overall';
import { useTranslation } from '@/i18n';
// inside the handler (player + attributes already loaded via getPlayerById):
const overall = calculateOverall(player.attributes, player.position);
const result = evaluateRenewal({
  playerAge: player.age,
  playerOverall: overall,
  effectivePotential: player.effectivePotential,
  currentWage: player.wage,
  offeredWage,
  offeredYears,
  contractYearsLeft: Math.max(0, player.contractEnd - season),
  clubReputation: playerClub.reputation,
});

if (result.decision === 'reject') { showMessage(t('renewal.rejected')); return; }

const agreedWage = result.decision === 'counter' ? result.counterWage! : offeredWage;
const agreedYears = result.decision === 'counter' ? result.counterYears! : offeredYears;
if (result.decision === 'counter') {
  showMessage(t('renewal.countered', { wage: agreedWage, years: agreedYears }));
  // present the counter for the user to accept/decline; on accept continue below
}

// Wage-budget gate before persisting.
const billRow = /* SELECT COALESCE(SUM(wage),0) bill FROM players WHERE club_id=? AND is_free_agent=0 */;
if (!canAffordWage(billRow.bill - player.wage, playerClub.wageBudget, agreedWage)) {
  showMessage(t('renewal.wage_budget_exceeded')); return;
}
await updatePlayerContract(dbHandle, player.id, agreedWage, season + agreedYears);
showMessage(t('renewal.accepted'));
```

(`billRow.bill - player.wage` removes the player's *current* wage from the bill before adding the renewed wage, so a renewal isn't double-counted.)

- [ ] **Step 3: Type-check + parity**

Run: `npx tsc --noEmit && npx jest __tests__/i18n/parity.test.ts`
Expected: exit 0 + parity PASS.

- [ ] **Step 4: Browser validation (Playwright MCP)**

Per the project web-dev-server notes (harness background `CI=1 npx expo start --web --port 19006`, navigate `localhost:8082`, restart with `--clear` to pick up edits):
- Open a player in your squad → the **"Renovar contrato"** button is visible.
- Propose a generous wage → "Renovação aceita!"; reopen the player → `contractEnd`/wage updated.
- Propose a low wage → counter or rejection message shows; no DB change on rejection.
- Propose a wage that blows the wage budget → "Estoura o teto salarial" and no change.
- Toggle EN in the MainMenu → the modal strings are in English (no raw keys).

- [ ] **Step 5: Commit**

```bash
git add src/screens/squad/PlayerDetailScreen.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(ui): modal de renovação de contrato no detalhe do jogador"
```

---

### Task 12: Verificação final

- [ ] **Step 1: Full suite + type-check**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green — baseline 536 + the new economy tests (~30) ≈ 566. No suite red.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Targeted regression sweep**

Run: `npx jest __tests__/engine/transfer/ __tests__/engine/finance/ __tests__/engine/history/ __tests__/engine/economy/ __tests__/database/queries/`
Expected: all PASS (loan wage, afford gate, wage budget, prize, debt, rollover, contract queries).

- [ ] **Step 3: Browser smoke (Playwright MCP)**

Advance a full season to the EndOfSeason screen and continue:
- A player whose contract expired is gone from the squad and appears in the free-agent pool (no double state).
- Squad market values changed vs. last season (no longer frozen at seed).
- The club budget shows a prize credit and the finances list has a `prize` row.
- A club kept negative for several weeks shows mounting `debt_weeks` (inspect via the finances/club screen or DB) — the board-stakes consumer is out of scope here, only the signal must be present.

- [ ] **Step 4: Push (com autorização do usuário)**

```bash
git push origin main
```

---

## Sequencing & dependencies

**Internal order (strict):**
1. **Tasks 1–3** (pure engine: affordability, prize-money, contract-renewal) — independent, parallelizable.
2. **Task 4** (schema/queries: `loan_wage`, `debt_weeks`, `updatePlayerContract`, `getPlayersByClub` guard) — gates Tasks 5, 7, 8, 10, 11.
3. **Tasks 5, 6, 7** (transfer fixes) — depend on Task 1 (affordability) and Task 4 (columns/queries). Parallelizable among themselves.
4. **Task 8** (finance-engine + loop) — depends on Task 2 (`gateReceiptMultiplier`) and Task 4 (`debt_weeks`).
5. **Task 9** (archiver returns prizes) — depends on Task 2 (prize calcs).
6. **Task 10** (rollover passes) — depends on Tasks 2, 4, 9 and the `FinanceType` 'prize' addition; Tasks 9+10 land together (the archiver return-type change is consumed here).
7. **Task 11** (UI renewal) — depends on Tasks 1, 3, 4.
8. **Task 12** — last.

**Cross-epic (honest):**
- **`save-isolation`** owns the idempotent migration mechanism in `database-store.ts` and `save_id`. The two columns here (`players.loan_wage`, `clubs.debt_weeks`) ride that same pass; if `save-isolation` lands first, append them to its block instead of adding a separate one. If value-recalc/prize must be scoped per `save_id`, follow whatever scoping `save-isolation` defines in the queries — do **not** invent it here.
- **`db-hardening`** owns indexes, transaction wrapping, FK-on in tests. The rollover batch (expiry + value + prize) is a natural candidate to run inside the rollover transaction `db-hardening` provides; assume that wrapping when it exists.
- **`board-stakes`** is the **consumer** of `clubs.debt_weeks` (trust/dismissal + game-over). This epic only **produces** the signal — no dismissal logic here.
- **`ai-world-alive`** owns applying weekly finances to *all* clubs. Prize distribution here credits AI clubs' budgets at rollover; coordinate so weekly multi-club wages (its scope) don't double-count the prize. Recálculo de valor já roda para todos os clubes.
- **`competitions-real`** owns knockout progression / real cup & CL champions. Cup/continental prize here depends on `archiveKnockout` finding a real champion; until `competitions-real` lands, cup prize uses the highest existing round's "champion" and is under-dimensioned — league prize is already correct. Sequence full cup-prize value **after** `competitions-real`.

## Definition of done

- `npx tsc --noEmit` exits 0.
- `npx jest --no-cache` all green (baseline 536 + ~30 new, no red suite).
- Every gap in the epic has a covering task: value recalc (T10), budget floor / afford gate (T1+T6+T8), contract expiry releases the player (T4+T10), renewal negotiation (T3+T11), loan wage split+restore (T4+T5), prize money / gate-receipt variation (T2+T9+T10+T8), `wage_budget` enforcement (T1+T7).
- Browser-validated (Playwright MCP): contract renewal modal works in PT/EN; expired players leave the squad and join free agents; market values move at rollover; prize credited and shown; `debt_weeks` mounts under sustained debt.
- No placeholders / TBD; every cited path, function, signature and line range grounded in the read code.
