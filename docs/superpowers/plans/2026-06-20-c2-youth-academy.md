# C2 — Youth Academy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2-5 min): escrever teste que falha → rodar e ver falhar → implementação mínima → rodar e ver passar → commit. SEM placeholders: todo passo que muda código MOSTRA o código. Subagents NÃO commitam — o passo "commit" descreve o que o orquestrador commita.

**Goal:** Transformar a Academia de Base de um intake estático invisível num loop de dinastia jogável: tier de elenco (`squad_tier`), preview determinístico de intake, pipeline jovem→reserva→profissional com promoção, empréstimo de desenvolvimento com tracking/recall, reputação de academia comparável e especialização do youth coach — culminando na reescrita da tela no novo kit.

**Architecture:** Toda lógica nova é engine puro (`src/engine/youth/*`) ou orquestrador `(db, saveId, ...)` (padrão `end-of-season-ops.ts`). Jovens continuam na tabela `players` (um único id por toda a carreira); o tier é uma coluna `players.squad_tier`. As fórmulas mágicas de `youth-academy.ts` são extraídas para um módulo de *levers* puro que serve tanto ao preview (sem rng) quanto ao gerador real (mesma seed = mesmo resultado). Loan de desenvolvimento é uma tabela `youth_loans` que estende o loan genérico com acumuladores de minutos/rating. Reputação de academia espelha `club_reputation_history`. Tudo `save_id`-scoped, determinístico via `SeededRng`.

**Tech Stack:** TS 5.9 strict · Jest 29 + ts-jest · better-sqlite3 REAL em memória (nunca mock) · SeededRng · Zustand · React Native 0.81 · expo-sqlite (runtime).

**Convenções (valores exatos):**
- Engine puro: ZERO React/Expo, ZERO `Math.random`/`Date.now`/`new Date()`/`ORDER BY RANDOM`. Tudo aleatório via `SeededRng` (`@/engine/rng`).
- Defaults de schema: `players.squad_tier='first'`, `clubs.academy_reputation=50`, `staff.youth_specialization='balanced'`.
- `GEM_THRESHOLD = 80`. Tier-set: `'youth' | 'reserve' | 'first'`.
- Colunas/tabelas novas vão em DOIS lugares: `src/database/schema.ts` (`SCHEMA_SQL`, usado por `createAllTables`/testes) **E** `src/store/database-store.ts` (`addColumnIfMissing`/`execAsync`, migração de DBs runtime existentes).
- Tabelas novas (`youth_loans`, `academy_reputation_history`) registradas em `TABLE_NAMES` (`schema.ts:1-37`).
- AUTOINCREMENT nas tabelas novas (como `club_reputation_history`); `players` inserido com id manual via `saveOffset` (`constants.ts:7-11`).
- i18n: paridade pt/en obrigatória. Tokens via `@/theme`.
- Branch: `feat/c2-youth-academy`. Mensagens de commit terminam com:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Precedente a espelhar:**
- `src/engine/youth/youth-academy.ts` (gerador determinístico, clamps, `POSITION_BOOSTS`, `generateAttributes`).
- `src/engine/season/end-of-season-ops.ts` (`generateClubYouth`, insert de intake, `saveOffset` para ids; orquestrador `(db, saveId, ...)`).
- `src/engine/transfer/loan-returns.ts` (`returnExpiredLoans`: guardas, restaurar `club_id`/`loan_wage`, neutralizar registro).
- `src/database/queries/staff.ts` (`hireStaff`/`fireStaff`, `rowToStaff`, `STAFF_HIRE_CONTRACT_END`).
- `src/database/schema.ts:402-410` (`club_reputation_history`: UNIQUE idempotente, CHECK 1-100).
- `src/store/database-store.ts:91-152` (padrão `addColumnIfMissing` + `execAsync(CREATE TABLE IF NOT EXISTS ...)`).
- `__tests__/database/test-helpers.ts` (`createTestDb`, `createTestDbHandle`, `seedTestDb`, `TEST_SAVE_ID`).
- `__tests__/engine/youth/youth-academy.test.ts` (estilo dos testes de determinismo).

---

## File Structure

- **Create** `src/engine/youth/youth-levers.ts` — motor puro: `previewIntake`, `resolveIntakeCount`, `potentialCeiling`, tipos `IntakeLevers`/`IntakePreview`/`YouthSpecialization`, `GEM_THRESHOLD`.
- **Create** `src/engine/youth/youth-progression.ts` — motor puro: `evaluateTierTransitions`, `evaluatePromotion`, tipos `TierCandidate`/`SquadContext`/`TierTransition`.
- **Create** `src/engine/youth/youth-loans.ts` — orquestrador `(db, saveId, ...)`: `processYouthLoanWeek`, `recallYouthLoan`, `settleYouthLoanDevelopment`.
- **Create** `src/engine/youth/academy-reputation.ts` — motor puro `computeAcademyReputationDelta` + orquestrador `applyAcademyReputation`.
- **Create** `src/database/queries/youth.ts` — queries tipadas: `getActiveYouthLoans`, `insertYouthLoan`, `getYouthLoanById`, `getAcademyReputationRanking`, `promotePlayerTier`, `getPlayersByClubAndTier`.
- **Modify** `src/engine/youth/youth-academy.ts` — estender `YouthGenerationInput` (`academyReputation`, `specialization`); consumir `youth-levers` para count/potencial; enviesar `POSITION_BOOSTS`/grupos por specialization.
- **Modify** `src/engine/season/end-of-season-ops.ts:56-106` — `generateClubYouth` monta `academyReputation`+`specialization`, insere `squad_tier='youth'`.
- **Modify** `src/engine/season-rollover.ts:41-105` — encaixar `settleYouthLoanDevelopment`, `evaluateTierTransitions`, `applyAcademyReputation` na transação.
- **Modify** `src/engine/game-loop.ts` — chamar `processYouthLoanWeek` na varredura semanal (após apuração de partidas, perto do bloco de transfer-window).
- **Modify** `src/database/schema.ts` — colunas `players.squad_tier`, `clubs.academy_reputation`, `staff.youth_specialization`; tabelas `youth_loans`, `academy_reputation_history`; índices; `TABLE_NAMES`.
- **Modify** `src/store/database-store.ts` — `addColumnIfMissing` p/ as 3 colunas + `execAsync` p/ as 2 tabelas.
- **Modify** `src/database/queries/players.ts` — `getPlayersByClub`/`getPlayersWithAttributesByClub` ganham filtro `tier?`; `PlayerRow.squad_tier` + `rowToPlayer`.
- **Modify** `src/database/queries/clubs.ts` — `ClubRow.academy_reputation` + `rowToClub`.
- **Modify** `src/types/player.ts` — `SquadTier` + `Player.squadTier`.
- **Modify** `src/types/club.ts` — `Club.academyReputation`.
- **Modify** `src/types/index.ts` — re-export `SquadTier` se o barrel existir (verificar).
- **Modify** `src/screens/squad/YouthAcademyScreen.tsx` — reescrita no kit.
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` — chaves `youth.*` novas (paridade).
- **Test** `__tests__/engine/youth/youth-levers.test.ts`
- **Test** `__tests__/engine/youth/youth-academy-specialization.test.ts`
- **Test** `__tests__/engine/youth/youth-progression.test.ts`
- **Test** `__tests__/engine/youth/youth-loans.test.ts`
- **Test** `__tests__/engine/youth/academy-reputation.test.ts`
- **Test** `__tests__/database/queries/youth-queries.test.ts`
- **Test** `__tests__/integration/youth-rollover-wiring.test.ts`
- **Test** `__tests__/save-isolation/youth-isolation.test.ts`

**Contract (assinaturas exatas):**

```ts
// src/types/player.ts
export type SquadTier = 'youth' | 'reserve' | 'first';
// Player ganha: squadTier: SquadTier;

// src/types/club.ts — Club ganha: academyReputation: number;

// src/engine/youth/youth-levers.ts
export type YouthSpecialization =
  | 'balanced' | 'technical' | 'physical' | 'mental' | 'position';
export interface IntakeLevers {
  academyLevel: number;       // 1-5
  youthCoachBonus: number;    // 0-10
  academyReputation: number;  // 1-100
  specialization: YouthSpecialization;
}
export interface IntakePreview {
  countMin: number; countMax: number;
  potentialMin: number; potentialMax: number;
  expectedGems: number;
  reputationTier: 'elite' | 'forte' | 'mediana' | 'fraca';
}
export const GEM_THRESHOLD = 80;
export function previewIntake(levers: IntakeLevers): IntakePreview;
export function resolveIntakeCount(levers: IntakeLevers, rng: SeededRng): number;
export function potentialCeiling(levers: IntakeLevers): number;

// src/engine/youth/youth-academy.ts (input estendido — backward compatible)
export interface YouthGenerationInput {
  clubId: number;
  academyLevel: number;
  youthCoachBonus: number;
  academyReputation?: number;          // NOVO (default 50)
  specialization?: YouthSpecialization; // NOVO (default 'balanced')
  countryCode: string;
  rng: SeededRng;
}

// src/engine/youth/youth-progression.ts
export interface TierCandidate {
  playerId: number; age: number; currentOverall: number;
  effectivePotential: number; squadTier: SquadTier; seasonMinutesPercent: number;
}
export interface SquadContext { firstTeamSize: number; starterAvgOverall: number; }
export interface TierTransition {
  playerId: number; from: SquadTier; to: SquadTier;
  reason: 'age' | 'overall' | 'integration' | 'manual';
}
export function evaluateTierTransitions(
  candidates: TierCandidate[], ctx: SquadContext, rng: SeededRng,
): TierTransition[];
export function evaluatePromotion(
  candidate: TierCandidate, ctx: SquadContext,
): { allowed: boolean; reason: 'ready' | 'too_raw' | 'squad_full' };
export const PROMOTION_OVERALL_MARGIN = 2;   // espelha ReportsYouthScreen.tsx:137
export const FIRST_TEAM_CAP = 30;            // teto de elenco principal

// src/engine/youth/youth-loans.ts (orquestradores — tocam DB)
export interface YouthLoanWeekResult { trackedPlayerIds: number[]; }
export function processYouthLoanWeek(
  db: DbHandle, saveId: number, season: number, week: number,
): Promise<YouthLoanWeekResult>;
export function recallYouthLoan(
  db: DbHandle, saveId: number, loanId: number, season: number, week: number,
): Promise<{ recalled: boolean; reason?: string }>;
export function settleYouthLoanDevelopment(
  db: DbHandle, saveId: number, endedSeason: number, rng: SeededRng,
): Promise<number[]>;

// src/engine/youth/academy-reputation.ts
export interface AcademyOutput {
  promotedToFirstTeam: number;
  graduatesSoldForProfit: number;
  graduateStarterCount: number;
}
export function computeAcademyReputationDelta(current: number, output: AcademyOutput): number;
export function applyAcademyReputation(db: DbHandle, saveId: number, season: number): Promise<void>;

// src/database/queries/youth.ts
export interface YouthLoanRow {
  id: number; playerId: number; parentClubId: number; loanClubId: number;
  startSeason: number; loanEnd: number;
  minutesPlayed: number; appearances: number; ratingSum: number;
  recalled: 0 | 1; settled: 0 | 1;
}
export function insertYouthLoan(
  db: DbHandle, saveId: number,
  r: { playerId: number; parentClubId: number; loanClubId: number; startSeason: number; loanEnd: number },
): Promise<number>;
export function getActiveYouthLoans(db: DbHandle, saveId: number, parentClubId: number): Promise<YouthLoanRow[]>;
export function getYouthLoanById(db: DbHandle, saveId: number, loanId: number): Promise<YouthLoanRow | null>;
export function promotePlayerTier(db: DbHandle, saveId: number, playerId: number, tier: SquadTier): Promise<void>;
export function getPlayersByClubAndTier(db: DbHandle, saveId: number, clubId: number, tier: SquadTier): Promise<Player[]>;
export function getAcademyReputationRanking(
  db: DbHandle, saveId: number, countryId: number,
): Promise<Array<{ clubId: number; name: string; academyReputation: number; rank: number }>>;
```

---

## Task 1: Schema + migração + tipos (`squad_tier`, `academy_reputation`, `youth_specialization`, tabelas novas)

**Files:** Modify `src/database/schema.ts`, `src/store/database-store.ts`, `src/types/player.ts`, `src/types/club.ts`, `src/database/queries/players.ts`, `src/database/queries/clubs.ts`. Create `__tests__/database/queries/youth-schema.test.ts`.
**Interfaces:** Consumes: `createTestDb`, `createTestDbHandle`, `seedTestDb`, `TEST_SAVE_ID`. Produces: colunas/tabelas no schema; `SquadTier`, `Player.squadTier`, `Club.academyReputation`.

- [ ] **Step 1 — teste falhando** `__tests__/database/queries/youth-schema.test.ts`:
```ts
import { createTestDb } from '../test-helpers';

describe('C2 schema migrations', () => {
  it('players tem coluna squad_tier default first; clubs academy_reputation default 50; staff youth_specialization default balanced', () => {
    const db = createTestDb();
    const pcols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
    const ccols = db.prepare('PRAGMA table_info(clubs)').all() as Array<{ name: string }>;
    const scols = db.prepare('PRAGMA table_info(staff)').all() as Array<{ name: string }>;
    expect(pcols.some((c) => c.name === 'squad_tier')).toBe(true);
    expect(ccols.some((c) => c.name === 'academy_reputation')).toBe(true);
    expect(scols.some((c) => c.name === 'youth_specialization')).toBe(true);
    db.close();
  });

  it('youth_loans e academy_reputation_history existem', () => {
    const db = createTestDb();
    const t = (name: string) =>
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").all(name) as unknown[]).length;
    expect(t('youth_loans')).toBe(1);
    expect(t('academy_reputation_history')).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/youth-schema.test.ts`
  → Esperado: assertions falham (colunas/tabelas inexistentes).

- [ ] **Step 3 — implementar schema.** Em `src/database/schema.ts`:
  - Adicionar à lista `TABLE_NAMES` (após `'news_items',`): `'youth_loans',` e `'academy_reputation_history',`.
  - Na DDL de `clubs` (`schema.ts:75`, antes do `);`) acrescentar: `  academy_reputation  INTEGER NOT NULL DEFAULT 50 CHECK (academy_reputation BETWEEN 1 AND 100),` — mover a `debt_weeks` linha de modo a não deixar vírgula pendente (adicionar antes de `debt_weeks`).
  - Na DDL de `players` (`schema.ts:107`, antes do `);`) acrescentar: `,\n  squad_tier         TEXT    NOT NULL DEFAULT 'first'`.
  - Na DDL de `staff` localizar a tabela e acrescentar `,\n  youth_specialization TEXT NOT NULL DEFAULT 'balanced'` antes do `);`.
  - Antes do fechamento de `SCHEMA_SQL` (a crase final `` ` ``), adicionar:
```sql
CREATE TABLE IF NOT EXISTS youth_loans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id        INTEGER NOT NULL REFERENCES save_games(id),
  player_id      INTEGER NOT NULL REFERENCES players(id),
  parent_club_id INTEGER NOT NULL REFERENCES clubs(id),
  loan_club_id   INTEGER NOT NULL REFERENCES clubs(id),
  start_season   INTEGER NOT NULL,
  loan_end       INTEGER NOT NULL,
  minutes_played INTEGER NOT NULL DEFAULT 0,
  appearances    INTEGER NOT NULL DEFAULT 0,
  rating_sum     REAL    NOT NULL DEFAULT 0,
  recalled       INTEGER NOT NULL DEFAULT 0,
  settled        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS academy_reputation_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id    INTEGER NOT NULL REFERENCES save_games(id),
  club_id    INTEGER NOT NULL REFERENCES clubs(id),
  season     INTEGER NOT NULL,
  reputation INTEGER NOT NULL CHECK (reputation BETWEEN 1 AND 100),
  delta      INTEGER NOT NULL,
  UNIQUE(save_id, club_id, season)
);
```
  - Em `SAVE_ID_INDEXES_SQL` (`schema.ts:535-543`) adicionar:
```sql
CREATE INDEX IF NOT EXISTS idx_youth_loans_save_parent ON youth_loans(save_id, parent_club_id);
CREATE INDEX IF NOT EXISTS idx_youth_loans_active      ON youth_loans(save_id, settled, recalled);
CREATE INDEX IF NOT EXISTS idx_players_save_tier       ON players(save_id, club_id, squad_tier);
CREATE INDEX IF NOT EXISTS idx_academy_rep_hist        ON academy_reputation_history(save_id, club_id, season);
```
  > Nota: o `seedTestDb` (`test-helpers.ts:86-99`) insere `clubs` sem `academy_reputation` e `players` sem `squad_tier` — como ambas têm DEFAULT, o INSERT por colunas explícitas continua válido. Não alterar `seedTestDb`.

- [ ] **Step 4 — implementar migração runtime.** Em `src/store/database-store.ts`, após o bloco de `players` (perto de `database-store.ts:160`), adicionar:
```ts
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
```

- [ ] **Step 5 — tipos + mapeamento de rows.**
  - `src/types/player.ts`: antes de `export interface Player` (linha 29) adicionar `export type SquadTier = 'youth' | 'reserve' | 'first';`; dentro de `Player` adicionar `  squadTier: SquadTier;` após `willRetireAtSeasonEnd`.
  - `src/database/queries/players.ts`: em `PlayerRow` (após `suspension_weeks_left`) adicionar `  squad_tier: string;`; importar `SquadTier` no topo (`import { Player, PlayerAttributes, Position, Foot, SquadTier } from '@/types';` — confirmar barrel; senão `'@/types/player'`); em `rowToPlayer` (após `willRetireAtSeasonEnd`) adicionar `    squadTier: (row.squad_tier as SquadTier) ?? 'first',`.
  - `src/types/club.ts`: em `Club` adicionar `  academyReputation: number;` após `trainingFocus`.
  - `src/database/queries/clubs.ts`: em `ClubRow` adicionar `  academy_reputation: number;`; em `rowToClub` adicionar `    academyReputation: row.academy_reputation ?? 50,`.
  - Verificar `src/types/index.ts`: se reexporta de `player.ts`/`club.ts` via `export *`, `SquadTier` já sai. Senão, adicionar export.

- [ ] **Step 6 — rodar (passa):** `npx jest __tests__/database/queries/youth-schema.test.ts && npx tsc --noEmit`
  → Esperado: 2 testes verdes; tsc exit 0.

- [ ] **Step 7 — commit:** (orquestrador)
  `git add src/database/schema.ts src/store/database-store.ts src/types/player.ts src/types/club.ts src/database/queries/players.ts src/database/queries/clubs.ts __tests__/database/queries/youth-schema.test.ts`
  msg: `feat(c2): schema de tier de elenco, reputação de academia e especialização do youth coach` + trailer.

---

## Task 2: Motor puro `youth-levers.ts` (preview + count + ceiling)

**Files:** Create `src/engine/youth/youth-levers.ts`, `__tests__/engine/youth/youth-levers.test.ts`.
**Interfaces:** Consumes: `SeededRng`. Produces: `previewIntake`, `resolveIntakeCount`, `potentialCeiling`, `IntakeLevers`, `IntakePreview`, `YouthSpecialization`, `GEM_THRESHOLD`.

- [ ] **Step 1 — teste falhando** `__tests__/engine/youth/youth-levers.test.ts`:
```ts
import {
  previewIntake, resolveIntakeCount, potentialCeiling, GEM_THRESHOLD, IntakeLevers,
} from '@/engine/youth/youth-levers';
import { SeededRng } from '@/engine/rng';

const L = (over: Partial<IntakeLevers> = {}): IntakeLevers => ({
  academyLevel: 3, youthCoachBonus: 5, academyReputation: 50, specialization: 'balanced', ...over,
});

describe('youth-levers', () => {
  it('preview de academia top é melhor que base em count, potencial e joias', () => {
    const top = previewIntake(L({ academyLevel: 5, youthCoachBonus: 10, academyReputation: 90 }));
    const low = previewIntake(L({ academyLevel: 1, youthCoachBonus: 0, academyReputation: 1 }));
    expect(top.countMax).toBeGreaterThanOrEqual(low.countMax);
    expect(top.potentialMax).toBeGreaterThan(low.potentialMax);
    expect(top.expectedGems).toBeGreaterThanOrEqual(low.expectedGems);
  });

  it('respeita o piso histórico de count [2,5] e teto de potencial 95', () => {
    const low = previewIntake(L({ academyLevel: 1, youthCoachBonus: 0, academyReputation: 1 }));
    expect(low.countMin).toBeGreaterThanOrEqual(2);
    const top = previewIntake(L({ academyLevel: 5, youthCoachBonus: 10, academyReputation: 100 }));
    expect(top.countMax).toBeLessThanOrEqual(5);
    expect(potentialCeiling(L({ academyLevel: 5, youthCoachBonus: 10, academyReputation: 100 }))).toBeLessThanOrEqual(95);
    expect(potentialCeiling(L({ academyLevel: 1, youthCoachBonus: 0, academyReputation: 1 }))).toBeGreaterThanOrEqual(45);
  });

  it('reputationTier classifica por faixa', () => {
    expect(previewIntake(L({ academyReputation: 90 })).reputationTier).toBe('elite');
    expect(previewIntake(L({ academyReputation: 70 })).reputationTier).toBe('forte');
    expect(previewIntake(L({ academyReputation: 45 })).reputationTier).toBe('mediana');
    expect(previewIntake(L({ academyReputation: 20 })).reputationTier).toBe('fraca');
  });

  it('preview é puro (sem rng) — mesma entrada, mesma saída', () => {
    expect(previewIntake(L())).toEqual(previewIntake(L()));
  });

  it('resolveIntakeCount é determinístico por seed e fica em [2,5]', () => {
    const a = resolveIntakeCount(L({ academyLevel: 4 }), new SeededRng(7));
    const b = resolveIntakeCount(L({ academyLevel: 4 }), new SeededRng(7));
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(2);
    expect(a).toBeLessThanOrEqual(5);
  });

  it('GEM_THRESHOLD é 80', () => { expect(GEM_THRESHOLD).toBe(80); });
});
```

- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/youth/youth-levers.test.ts`
  → Esperado: "Cannot find module '@/engine/youth/youth-levers'".

- [ ] **Step 3 — implementar** `src/engine/youth/youth-levers.ts`:
```ts
import { SeededRng } from '@/engine/rng';

export type YouthSpecialization =
  | 'balanced' | 'technical' | 'physical' | 'mental' | 'position';

export interface IntakeLevers {
  academyLevel: number;       // 1-5
  youthCoachBonus: number;    // 0-10
  academyReputation: number;  // 1-100
  specialization: YouthSpecialization;
}

export interface IntakePreview {
  countMin: number;
  countMax: number;
  potentialMin: number;
  potentialMax: number;
  expectedGems: number;
  reputationTier: 'elite' | 'forte' | 'mediana' | 'fraca';
}

export const GEM_THRESHOLD = 80;

const COUNT_FLOOR = 2;   // youth-academy.ts:101 clamp [2,5]
const COUNT_CAP = 5;
const POT_FLOOR = 45;    // youth-academy.ts:112 clamp [45,95]
const POT_CAP = 95;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function reputationTier(rep: number): IntakePreview['reputationTier'] {
  if (rep >= 80) return 'elite';
  if (rep >= 60) return 'forte';
  if (rep >= 35) return 'mediana';
  return 'fraca';
}

/**
 * Teto de potencial efetivo desta academia. Estende a fórmula original
 * (youth-academy.ts:111: 40 + level*8 + coachBonus + rng.nextInt(-5,10)) com um
 * bônus pequeno de reputação, mantendo o clamp [45,95]. O +10 é o topo da variância
 * de rng do gerador, então o ceiling reflete o melhor prospecto plausível.
 */
export function potentialCeiling(levers: IntakeLevers): number {
  const repBonus = Math.round((levers.academyReputation - 50) / 12); // ~[-4,+4]
  const raw = 40 + levers.academyLevel * 8 + levers.youthCoachBonus + repBonus + 10;
  return clamp(raw, POT_FLOOR, POT_CAP);
}

function potentialBaseline(levers: IntakeLevers): number {
  const repBonus = Math.round((levers.academyReputation - 50) / 12);
  const raw = 40 + levers.academyLevel * 8 + levers.youthCoachBonus + repBonus - 5;
  return clamp(raw, POT_FLOOR, POT_CAP);
}

/**
 * Count efetivo desta seed. Espelha youth-academy.ts:100-101
 * (academyLevel + rng.nextInt(-1,0), clamp [2,5]) e adiciona um leve viés de
 * reputação top (+1 só para academias elite, ainda clampado).
 */
export function resolveIntakeCount(levers: IntakeLevers, rng: SeededRng): number {
  const repBump = levers.academyReputation >= 80 ? 1 : 0;
  const raw = levers.academyLevel + rng.nextInt(-1, 0) + repBump;
  return clamp(raw, COUNT_FLOOR, COUNT_CAP);
}

export function previewIntake(levers: IntakeLevers): IntakePreview {
  const repBump = levers.academyReputation >= 80 ? 1 : 0;
  const countMin = clamp(levers.academyLevel - 1, COUNT_FLOOR, COUNT_CAP);
  const countMax = clamp(levers.academyLevel + repBump, COUNT_FLOOR, COUNT_CAP);
  const potentialMax = potentialCeiling(levers);
  const potentialMin = potentialBaseline(levers);
  // joias esperadas: fração do count que tende a superar GEM_THRESHOLD, função do teto.
  const headroom = Math.max(0, potentialMax - GEM_THRESHOLD); // 0..15
  const gemFraction = headroom / (POT_CAP - GEM_THRESHOLD);    // 0..1
  const expectedGems = Math.round(countMax * gemFraction * 0.6);
  return {
    countMin, countMax, potentialMin, potentialMax,
    expectedGems, reputationTier: reputationTier(levers.academyReputation),
  };
}
```

- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/youth/youth-levers.test.ts && npx tsc --noEmit`
  → Esperado: 6 testes verdes; tsc exit 0.

- [ ] **Step 5 — commit:** (orquestrador)
  `git add src/engine/youth/youth-levers.ts __tests__/engine/youth/youth-levers.test.ts`
  msg: `feat(c2): motor puro de levers de intake (preview determinístico + count/ceiling)` + trailer.

---

## Task 3: Estender `youth-academy.ts` (consumir levers + specialization)

**Files:** Modify `src/engine/youth/youth-academy.ts`. Create `__tests__/engine/youth/youth-academy-specialization.test.ts`.
**Interfaces:** Consumes: `resolveIntakeCount`, `potentialCeiling`, `YouthSpecialization`. Produces: `YouthGenerationInput` estendido; `generateYouthPlayers` enviesa por specialization mantendo determinismo.

- [ ] **Step 1 — teste falhando** `__tests__/engine/youth/youth-academy-specialization.test.ts`:
```ts
import { generateYouthPlayers, YouthGenerationInput } from '@/engine/youth/youth-academy';
import { SeededRng } from '@/engine/rng';

const base = (over: Partial<YouthGenerationInput> = {}): YouthGenerationInput => ({
  clubId: 1, academyLevel: 4, youthCoachBonus: 6, academyReputation: 70,
  specialization: 'balanced', countryCode: 'EN', rng: new SeededRng(11), ...over,
});

describe('generateYouthPlayers — specialization & levers', () => {
  it('mesma seed + mesmo input estendido ⇒ jogadores idênticos', () => {
    const a = generateYouthPlayers(base({ rng: new SeededRng(11) }));
    const b = generateYouthPlayers(base({ rng: new SeededRng(11) }));
    expect(a).toEqual(b);
  });

  it('seeds diferentes divergem', () => {
    const a = generateYouthPlayers(base({ rng: new SeededRng(11) }));
    const b = generateYouthPlayers(base({ rng: new SeededRng(99) }));
    expect(a).not.toEqual(b);
  });

  it("specialization 'physical' eleva atributos físicos agregados vs 'balanced' na mesma seed", () => {
    const physKeys = ['pace', 'stamina', 'strength', 'agility', 'jumping'] as const;
    const sum = (ps: ReturnType<typeof generateYouthPlayers>) =>
      ps.reduce((acc, p) => acc + physKeys.reduce((s, k) => s + p.attributes[k], 0), 0);
    const balanced = generateYouthPlayers(base({ specialization: 'balanced', rng: new SeededRng(11) }));
    const physical = generateYouthPlayers(base({ specialization: 'physical', rng: new SeededRng(11) }));
    expect(sum(physical)).toBeGreaterThan(sum(balanced));
  });

  it('input legado sem academyReputation/specialization ainda funciona (defaults)', () => {
    const legacy = generateYouthPlayers({
      clubId: 1, academyLevel: 3, youthCoachBonus: 5, countryCode: 'EN', rng: new SeededRng(42),
    } as YouthGenerationInput);
    expect(legacy.length).toBeGreaterThanOrEqual(2);
    expect(legacy.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/youth/youth-academy-specialization.test.ts`
  → Esperado: erro de tipo/asserção (`specialization`/`academyReputation` não existem em `YouthGenerationInput`; sem viés físico).

- [ ] **Step 3 — implementar** em `src/engine/youth/youth-academy.ts`:
  - Topo: `import { resolveIntakeCount, YouthSpecialization } from '@/engine/youth/youth-levers';`
  - Estender a interface:
```ts
export interface YouthGenerationInput {
  clubId: number;
  academyLevel: number;    // 1-5
  youthCoachBonus: number; // 0-10 (from staff effects)
  academyReputation?: number;          // 1-100 (default 50)
  specialization?: YouthSpecialization; // default 'balanced'
  countryCode: string;
  rng: SeededRng;
}
```
  - Acima de `generateAttributes`, mapear grupos de atributo por specialization:
```ts
const PHYSICAL_ATTRS: (keyof PlayerAttributes)[] = ['pace', 'stamina', 'strength', 'agility', 'jumping'];
const TECHNICAL_ATTRS: (keyof PlayerAttributes)[] = ['finishing', 'passing', 'crossing', 'dribbling', 'heading', 'longShots', 'freeKicks'];
const MENTAL_ATTRS: (keyof PlayerAttributes)[] = ['vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership'];

function specializationBoostSet(spec: YouthSpecialization, position: Position): Set<keyof PlayerAttributes> {
  switch (spec) {
    case 'physical': return new Set(PHYSICAL_ATTRS);
    case 'technical': return new Set(TECHNICAL_ATTRS);
    case 'mental': return new Set(MENTAL_ATTRS);
    case 'position': return new Set(POSITION_BOOSTS[position] ?? []);
    default: return new Set();
  }
}
```
  - Alterar `generateAttributes` para receber a specialization e somar um boost determinístico extra aos atributos do grupo:
```ts
function generateAttributes(
  rng: SeededRng, position: Position, base: number, spec: YouthSpecialization,
): PlayerAttributes {
  const attrKeys: (keyof PlayerAttributes)[] = [
    'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'longShots', 'freeKicks',
    'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
    'pace', 'stamina', 'strength', 'agility', 'jumping',
  ];
  const boosts = new Set(POSITION_BOOSTS[position] ?? []);
  const specBoosts = specializationBoostSet(spec, position);
  const attrs: Partial<PlayerAttributes> = {};
  for (const key of attrKeys) {
    const variance = rng.nextInt(-10, 10);
    const boost = boosts.has(key) ? rng.nextInt(5, 8) : 0;
    const specBoost = specBoosts.has(key) ? rng.nextInt(3, 6) : 0;
    attrs[key] = clamp(base + variance + boost + specBoost, 1, 99);
  }
  return attrs as PlayerAttributes;
}
```
  > Determinismo: `rng.nextInt(3,6)` é consumido em TODA chave do grupo de spec; em `'balanced'` o set é vazio e o stream de rng fica idêntico ao legado (logo o teste de input legado bate count [2,5]).
  - Em `generateYouthPlayers`, ler defaults e usar `resolveIntakeCount`:
```ts
export function generateYouthPlayers(input: YouthGenerationInput): YouthPlayer[] {
  const { academyLevel, youthCoachBonus, countryCode, rng } = input;
  const academyReputation = input.academyReputation ?? 50;
  const specialization = input.specialization ?? 'balanced';

  const count = resolveIntakeCount(
    { academyLevel, youthCoachBonus, academyReputation, specialization }, rng,
  );

  const players: YouthPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const age = rng.nextInt(16, 18);
    const position = rng.weightedPick(POSITIONS, POSITION_WEIGHTS);
    const repBonus = Math.round((academyReputation - 50) / 12);
    const rawPotential = 40 + academyLevel * 8 + youthCoachBonus + repBonus + rng.nextInt(-5, 10);
    const basePotential = clamp(rawPotential, 45, 95);
    const rawOverall = basePotential - rng.nextInt(10, 20);
    const currentOverall = clamp(rawOverall, 30, 70);
    const attributes = generateAttributes(rng, position, currentOverall, specialization);
    const name = generateName(rng, countryCode);
    players.push({ name, age, position, attributes, basePotential, currentOverall });
  }
  return players;
}
```
  > `repBonus` foi inserido ANTES de `rng.nextInt(-5,10)`: como é puro (não consome rng), o stream segue idêntico ao legado para `academyReputation=50` (repBonus=0). O teste de "input legado" (Step 1) garante isso.

- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/youth/youth-academy-specialization.test.ts __tests__/engine/youth/youth-academy.test.ts && npx tsc --noEmit`
  → Esperado: novos testes + o legado `youth-academy.test.ts` verdes (count/idade/posições preservados); tsc exit 0.
  > Se o teste legado "higher academy level produces better youth" quebrar por causa de `repBonus`/`resolveIntakeCount`, investigar com superpowers:systematic-debugging — NÃO afrouxar o teste; ambos usam `academyReputation` default 50 (repBonus=0) e o repBump só age em rep>=80, então não deve quebrar.

- [ ] **Step 5 — commit:** (orquestrador)
  `git add src/engine/youth/youth-academy.ts __tests__/engine/youth/youth-academy-specialization.test.ts`
  msg: `feat(c2): youth-academy consome levers e enviesa atributos por especialização do coach` + trailer.

---

## Task 4: Motor puro `youth-progression.ts` (transições de tier + promoção)

**Files:** Create `src/engine/youth/youth-progression.ts`, `__tests__/engine/youth/youth-progression.test.ts`.
**Interfaces:** Consumes: `SquadTier` (`@/types`), `SeededRng`. Produces: `evaluateTierTransitions`, `evaluatePromotion`, `TierCandidate`, `SquadContext`, `TierTransition`, `PROMOTION_OVERALL_MARGIN`, `FIRST_TEAM_CAP`.

- [ ] **Step 1 — teste falhando** `__tests__/engine/youth/youth-progression.test.ts`:
```ts
import {
  evaluateTierTransitions, evaluatePromotion, TierCandidate, SquadContext,
  PROMOTION_OVERALL_MARGIN, FIRST_TEAM_CAP,
} from '@/engine/youth/youth-progression';
import { SeededRng } from '@/engine/rng';

const cand = (over: Partial<TierCandidate> = {}): TierCandidate => ({
  playerId: 1, age: 19, currentOverall: 60, effectivePotential: 80,
  squadTier: 'youth', seasonMinutesPercent: 0, ...over,
});
const ctx: SquadContext = { firstTeamSize: 22, starterAvgOverall: 72 };

describe('youth-progression', () => {
  it('jovem velho o suficiente sobe de youth para reserve', () => {
    const ts = evaluateTierTransitions([cand({ age: 19, currentOverall: 64 })], ctx, new SeededRng(3));
    expect(ts.find((t) => t.playerId === 1)).toMatchObject({ from: 'youth', to: 'reserve' });
  });

  it('jovem cru (16, overall baixo) permanece youth', () => {
    const ts = evaluateTierTransitions([cand({ age: 16, currentOverall: 40 })], ctx, new SeededRng(3));
    expect(ts.find((t) => t.playerId === 1)).toBeUndefined();
  });

  it('reserva pronto (overall perto do benchmark) integra ao first', () => {
    const ts = evaluateTierTransitions(
      [cand({ squadTier: 'reserve', currentOverall: 71, seasonMinutesPercent: 60 })], ctx, new SeededRng(3),
    );
    expect(ts.find((t) => t.playerId === 1)).toMatchObject({ from: 'reserve', to: 'first', reason: 'integration' });
  });

  it('é determinístico para a mesma seed', () => {
    const a = evaluateTierTransitions([cand(), cand({ playerId: 2, age: 20 })], ctx, new SeededRng(5));
    const b = evaluateTierTransitions([cand(), cand({ playerId: 2, age: 20 })], ctx, new SeededRng(5));
    expect(a).toEqual(b);
  });

  it('evaluatePromotion: ready quando overall >= benchmark - margem', () => {
    const r = evaluatePromotion(cand({ currentOverall: ctx.starterAvgOverall - PROMOTION_OVERALL_MARGIN }), ctx);
    expect(r).toEqual({ allowed: true, reason: 'ready' });
  });

  it('evaluatePromotion: too_raw quando muito abaixo', () => {
    const r = evaluatePromotion(cand({ currentOverall: 50 }), ctx);
    expect(r).toEqual({ allowed: false, reason: 'too_raw' });
  });

  it('evaluatePromotion: squad_full quando first no teto', () => {
    const full: SquadContext = { firstTeamSize: FIRST_TEAM_CAP, starterAvgOverall: 72 };
    const r = evaluatePromotion(cand({ currentOverall: 75 }), full);
    expect(r).toEqual({ allowed: false, reason: 'squad_full' });
  });
});
```

- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/youth/youth-progression.test.ts`
  → Esperado: "Cannot find module '@/engine/youth/youth-progression'".

- [ ] **Step 3 — implementar** `src/engine/youth/youth-progression.ts`:
```ts
import { SquadTier } from '@/types';
import { SeededRng } from '@/engine/rng';

export interface TierCandidate {
  playerId: number;
  age: number;
  currentOverall: number;
  effectivePotential: number;
  squadTier: SquadTier;
  seasonMinutesPercent: number; // 0-100
}

export interface SquadContext {
  firstTeamSize: number;
  starterAvgOverall: number; // benchmark (top-11 avg, cf. ReportsYouthScreen)
}

export interface TierTransition {
  playerId: number;
  from: SquadTier;
  to: SquadTier;
  reason: 'age' | 'overall' | 'integration' | 'manual';
}

export const PROMOTION_OVERALL_MARGIN = 2; // ReportsYouthScreen.tsx:137 (overall >= avg - 2)
export const FIRST_TEAM_CAP = 30;

const YOUTH_GRADUATION_AGE = 18;  // após 18 deixa de ser "youth"
const RESERVE_MIN_OVERALL = 62;   // overall mínimo p/ sair de youth com mérito

/**
 * Decisão pura de promoção manual. squad_full tem precedência: nem o jogador
 * pronto entra se o elenco estourou o teto.
 */
export function evaluatePromotion(
  candidate: TierCandidate, ctx: SquadContext,
): { allowed: boolean; reason: 'ready' | 'too_raw' | 'squad_full' } {
  if (ctx.firstTeamSize >= FIRST_TEAM_CAP) return { allowed: false, reason: 'squad_full' };
  if (candidate.currentOverall >= ctx.starterAvgOverall - PROMOTION_OVERALL_MARGIN) {
    return { allowed: true, reason: 'ready' };
  }
  return { allowed: false, reason: 'too_raw' };
}

/**
 * Transições automáticas no rollover. Determinístico (rng só desempata casos de
 * fronteira). youth→reserve por idade+overall; reserve→first por integração
 * (overall perto do benchmark + minutos).
 */
export function evaluateTierTransitions(
  candidates: TierCandidate[], ctx: SquadContext, rng: SeededRng,
): TierTransition[] {
  const out: TierTransition[] = [];
  // ordem estável por playerId (sem ORDER BY RANDOM)
  const sorted = [...candidates].sort((a, b) => a.playerId - b.playerId);
  let projectedFirst = ctx.firstTeamSize;

  for (const c of sorted) {
    if (c.squadTier === 'youth') {
      const oldEnough = c.age > YOUTH_GRADUATION_AGE;
      const goodEnough = c.currentOverall >= RESERVE_MIN_OVERALL;
      // joia jovem com potencial alto pode pular cedo (desempate determinístico)
      const earlyJewel = c.effectivePotential >= 85 && c.age >= 18 && rng.nextInt(0, 1) === 1;
      if (oldEnough || goodEnough || earlyJewel) {
        out.push({ playerId: c.playerId, from: 'youth', to: 'reserve', reason: oldEnough ? 'age' : 'overall' });
      }
      continue;
    }
    if (c.squadTier === 'reserve') {
      const ready = c.currentOverall >= ctx.starterAvgOverall - PROMOTION_OVERALL_MARGIN;
      const earnedMinutes = c.seasonMinutesPercent >= 40;
      if (ready && earnedMinutes && projectedFirst < FIRST_TEAM_CAP) {
        out.push({ playerId: c.playerId, from: 'reserve', to: 'first', reason: 'integration' });
        projectedFirst++;
      }
    }
  }
  return out;
}
```

- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/youth/youth-progression.test.ts && npx tsc --noEmit`
  → Esperado: 7 testes verdes; tsc exit 0.

- [ ] **Step 5 — commit:** (orquestrador)
  `git add src/engine/youth/youth-progression.ts __tests__/engine/youth/youth-progression.test.ts`
  msg: `feat(c2): pipeline puro de transições de tier + regra de promoção manual` + trailer.

---

## Task 5: Queries `youth.ts` (loan rows, tier, ranking de reputação)

**Files:** Create `src/database/queries/youth.ts`, `__tests__/database/queries/youth-queries.test.ts`. Modify `src/database/queries/players.ts` (filtro `tier?`).
**Interfaces:** Consumes: `DbHandle`, `Player`, `SquadTier`, `rowToPlayer`, `saveOffset`. Produces: `insertYouthLoan`, `getActiveYouthLoans`, `getYouthLoanById`, `promotePlayerTier`, `getPlayersByClubAndTier`, `getAcademyReputationRanking`, `YouthLoanRow`.

- [ ] **Step 1 — teste falhando** `__tests__/database/queries/youth-queries.test.ts`:
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import {
  insertYouthLoan, getActiveYouthLoans, getYouthLoanById,
  promotePlayerTier, getPlayersByClubAndTier, getAcademyReputationRanking,
} from '@/database/queries/youth';

describe('youth queries (SQLite real)', () => {
  it('insertYouthLoan + getActiveYouthLoans + getYouthLoanById', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const player = raw.prepare('SELECT id, club_id FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number; club_id: number };
    const otherClub = raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, player.club_id) as { id: number };
    const id = await insertYouthLoan(db, TEST_SAVE_ID, {
      playerId: player.id, parentClubId: player.club_id, loanClubId: otherClub.id, startSeason: 1, loanEnd: 1,
    });
    const active = await getActiveYouthLoans(db, TEST_SAVE_ID, player.club_id);
    expect(active.some((l) => l.id === id && l.recalled === 0 && l.settled === 0)).toBe(true);
    const byId = await getYouthLoanById(db, TEST_SAVE_ID, id);
    expect(byId?.parentClubId).toBe(player.club_id);
    raw.close();
  });

  it('promotePlayerTier + getPlayersByClubAndTier filtra por tier', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const player = raw.prepare('SELECT id, club_id FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number; club_id: number };
    await promotePlayerTier(db, TEST_SAVE_ID, player.id, 'reserve');
    const reserves = await getPlayersByClubAndTier(db, TEST_SAVE_ID, player.club_id, 'reserve');
    expect(reserves.some((p) => p.id === player.id && p.squadTier === 'reserve')).toBe(true);
    const firsts = await getPlayersByClubAndTier(db, TEST_SAVE_ID, player.club_id, 'first');
    expect(firsts.some((p) => p.id === player.id)).toBe(false);
    raw.close();
  });

  it('getAcademyReputationRanking ordena DESC com rank e tie-break por clubId', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const clubs = raw.prepare('SELECT id, country_id FROM clubs WHERE save_id = ? ORDER BY id LIMIT 3').all(TEST_SAVE_ID) as Array<{ id: number; country_id: number }>;
    raw.prepare('UPDATE clubs SET academy_reputation = ? WHERE save_id = ? AND id = ?').run(90, TEST_SAVE_ID, clubs[0].id);
    raw.prepare('UPDATE clubs SET academy_reputation = ? WHERE save_id = ? AND id = ?').run(90, TEST_SAVE_ID, clubs[1].id);
    raw.prepare('UPDATE clubs SET academy_reputation = ? WHERE save_id = ? AND id = ?').run(40, TEST_SAVE_ID, clubs[2].id);
    const ranking = await getAcademyReputationRanking(db, TEST_SAVE_ID, clubs[0].country_id);
    expect(ranking[0].rank).toBe(1);
    // empate 90/90 → menor clubId primeiro
    const top2 = ranking.filter((r) => r.academyReputation === 90).map((r) => r.clubId);
    expect(top2[0]).toBeLessThan(top2[1]);
    raw.close();
  });
});
```

- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/youth-queries.test.ts`
  → Esperado: "Cannot find module '@/database/queries/youth'".

- [ ] **Step 3 — implementar** `src/database/queries/youth.ts`:
```ts
import { Player, SquadTier } from '@/types';
import { DbHandle } from './players';

export interface YouthLoanRow {
  id: number; playerId: number; parentClubId: number; loanClubId: number;
  startSeason: number; loanEnd: number;
  minutesPlayed: number; appearances: number; ratingSum: number;
  recalled: 0 | 1; settled: 0 | 1;
}

interface YouthLoanDbRow {
  id: number; player_id: number; parent_club_id: number; loan_club_id: number;
  start_season: number; loan_end: number;
  minutes_played: number; appearances: number; rating_sum: number;
  recalled: number; settled: number;
}

function toLoanRow(r: YouthLoanDbRow): YouthLoanRow {
  return {
    id: r.id, playerId: r.player_id, parentClubId: r.parent_club_id, loanClubId: r.loan_club_id,
    startSeason: r.start_season, loanEnd: r.loan_end,
    minutesPlayed: r.minutes_played, appearances: r.appearances, ratingSum: r.rating_sum,
    recalled: (r.recalled === 1 ? 1 : 0), settled: (r.settled === 1 ? 1 : 0),
  };
}

export async function insertYouthLoan(
  db: DbHandle, saveId: number,
  r: { playerId: number; parentClubId: number; loanClubId: number; startSeason: number; loanEnd: number },
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO youth_loans (save_id, player_id, parent_club_id, loan_club_id, start_season, loan_end)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(saveId, r.playerId, r.parentClubId, r.loanClubId, r.startSeason, r.loanEnd);
  return Number((res as { lastInsertRowid: number | bigint }).lastInsertRowid);
}

export async function getActiveYouthLoans(
  db: DbHandle, saveId: number, parentClubId: number,
): Promise<YouthLoanRow[]> {
  const rows = (await db
    .prepare(
      `SELECT * FROM youth_loans
       WHERE save_id = ? AND parent_club_id = ? AND settled = 0 AND recalled = 0
       ORDER BY id ASC`,
    )
    .all(saveId, parentClubId)) as YouthLoanDbRow[];
  return rows.map(toLoanRow);
}

export async function getYouthLoanById(
  db: DbHandle, saveId: number, loanId: number,
): Promise<YouthLoanRow | null> {
  const row = (await db
    .prepare('SELECT * FROM youth_loans WHERE save_id = ? AND id = ?')
    .get(saveId, loanId)) as YouthLoanDbRow | undefined;
  return row ? toLoanRow(row) : null;
}

export async function promotePlayerTier(
  db: DbHandle, saveId: number, playerId: number, tier: SquadTier,
): Promise<void> {
  await db.prepare('UPDATE players SET squad_tier = ? WHERE save_id = ? AND id = ?').run(tier, saveId, playerId);
}

export async function getPlayersByClubAndTier(
  db: DbHandle, saveId: number, clubId: number, tier: SquadTier,
): Promise<Player[]> {
  const { getPlayersByClub } = await import('./players');
  const all = await getPlayersByClub(db, saveId, clubId, tier);
  return all;
}

export async function getAcademyReputationRanking(
  db: DbHandle, saveId: number, countryId: number,
): Promise<Array<{ clubId: number; name: string; academyReputation: number; rank: number }>> {
  const rows = (await db
    .prepare(
      `SELECT id, name, academy_reputation FROM clubs
       WHERE save_id = ? AND country_id = ?
       ORDER BY academy_reputation DESC, id ASC`,
    )
    .all(saveId, countryId)) as Array<{ id: number; name: string; academy_reputation: number }>;
  return rows.map((r, i) => ({ clubId: r.id, name: r.name, academyReputation: r.academy_reputation, rank: i + 1 }));
}
```

- [ ] **Step 4 — estender `getPlayersByClub` com filtro `tier?`** em `src/database/queries/players.ts`. Substituir a função (`players.ts:116-123`) por:
```ts
export async function getPlayersByClub(
  db: DbHandle, saveId: number, clubId: number, tier?: import('@/types').SquadTier,
): Promise<Player[]> {
  // Defensive guard: a freed player (is_free_agent=1) must never count as squad.
  const sql = tier
    ? 'SELECT * FROM players WHERE save_id = ? AND club_id = ? AND is_free_agent = 0 AND squad_tier = ?'
    : 'SELECT * FROM players WHERE save_id = ? AND club_id = ? AND is_free_agent = 0';
  const rows = tier
    ? await db.prepare(sql).all(saveId, clubId, tier) as PlayerRow[]
    : await db.prepare(sql).all(saveId, clubId) as PlayerRow[];
  return rows.map(rowToPlayer);
}
```
  > `getPlayersWithAttributesByClub` recebe o mesmo tratamento opcional se for útil à tela; para esta entrega o filtro em `getPlayersByClub` basta (a tela usa tiers via `getPlayersByClubAndTier`).

- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/database/queries/youth-queries.test.ts && npx tsc --noEmit`
  → Esperado: 3 testes verdes; tsc exit 0.

- [ ] **Step 6 — commit:** (orquestrador)
  `git add src/database/queries/youth.ts src/database/queries/players.ts __tests__/database/queries/youth-queries.test.ts`
  msg: `feat(c2): queries tier-aware, youth_loans e ranking de reputação de academia` + trailer.

---

## Task 6: Orquestrador `youth-loans.ts` (week tracking, recall, settle)

**Files:** Create `src/engine/youth/youth-loans.ts`, `__tests__/engine/youth/youth-loans.test.ts`.
**Interfaces:** Consumes: `DbHandle`, `SeededRng`, `getActiveYouthLoans`, `getYouthLoanById`, `player_stats`. Produces: `processYouthLoanWeek`, `recallYouthLoan`, `settleYouthLoanDevelopment`, `YouthLoanWeekResult`.

- [ ] **Step 1 — teste falhando** `__tests__/engine/youth/youth-loans.test.ts`:
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { insertYouthLoan, getYouthLoanById } from '@/database/queries/youth';
import { processYouthLoanWeek, recallYouthLoan, settleYouthLoanDevelopment } from '@/engine/youth/youth-loans';
import { SeededRng } from '@/engine/rng';

function setupLoan(raw: ReturnType<typeof createTestDb>) {
  seedTestDb(raw);
  const player = raw.prepare('SELECT id, club_id, base_potential FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number; club_id: number; base_potential: number };
  const loanClub = raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, player.club_id) as { id: number };
  // jogador está no clube de empréstimo durante a vigência
  raw.prepare('UPDATE players SET club_id = ? WHERE save_id = ? AND id = ?').run(loanClub.id, TEST_SAVE_ID, player.id);
  return { player, loanClub };
}

describe('youth-loans (SQLite real)', () => {
  it('processYouthLoanWeek acumula minutos/appearances/rating da semana no clube de empréstimo', async () => {
    const raw = createTestDb(); const db = createTestDbHandle(raw);
    const { player, loanClub } = setupLoan(raw);
    const loanId = await insertYouthLoan(db, TEST_SAVE_ID, {
      playerId: player.id, parentClubId: 1 /* placeholder */, loanClubId: loanClub.id, startSeason: 1, loanEnd: 2,
    });
    // player_stats da rodada (engine grava avg_rating + minutes_played por temporada)
    raw.prepare(
      `INSERT INTO player_stats (save_id, player_id, season, competition_id, appearances, minutes_played, goals, assists, avg_rating, yellow_cards, red_cards)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(TEST_SAVE_ID, player.id, 1, 0, 1, 90, 0, 0, 7.4, 0, 0);
    const res = await processYouthLoanWeek(db, TEST_SAVE_ID, 1, 5);
    expect(res.trackedPlayerIds).toContain(player.id);
    const row = await getYouthLoanById(db, TEST_SAVE_ID, loanId);
    expect(row!.minutesPlayed).toBeGreaterThan(0);
    expect(row!.appearances).toBeGreaterThan(0);
    expect(row!.ratingSum).toBeGreaterThan(0);
    raw.close();
  });

  it('settleYouthLoanDevelopment: muitos minutos+rating alto ⇒ mais ganho que zero minutos; idempotente', async () => {
    const raw = createTestDb(); const db = createTestDbHandle(raw);
    const { player, loanClub } = setupLoan(raw);
    const beforePot = (raw.prepare('SELECT effective_potential FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, player.id) as { effective_potential: number }).effective_potential;
    const loanId = await insertYouthLoan(db, TEST_SAVE_ID, {
      playerId: player.id, parentClubId: loanClub.id, loanClubId: loanClub.id, startSeason: 1, loanEnd: 1,
    });
    raw.prepare('UPDATE youth_loans SET minutes_played = 2400, appearances = 28, rating_sum = 210 WHERE id = ?').run(loanId);
    const settled = await settleYouthLoanDevelopment(db, TEST_SAVE_ID, 1, new SeededRng(9));
    expect(settled).toContain(player.id);
    const afterPot = (raw.prepare('SELECT effective_potential FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, player.id) as { effective_potential: number }).effective_potential;
    expect(afterPot).toBeGreaterThanOrEqual(beforePot);
    // idempotente: segunda chamada não re-aplica (settled=1)
    const again = await settleYouthLoanDevelopment(db, TEST_SAVE_ID, 1, new SeededRng(9));
    expect(again).not.toContain(player.id);
    raw.close();
  });

  it('recallYouthLoan restaura club_id ao parent e marca recalled; segunda chamada false', async () => {
    const raw = createTestDb(); const db = createTestDbHandle(raw);
    const { player, loanClub } = setupLoan(raw);
    const parentClubId = raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, loanClub.id) as { id: number };
    const loanId = await insertYouthLoan(db, TEST_SAVE_ID, {
      playerId: player.id, parentClubId: parentClubId.id, loanClubId: loanClub.id, startSeason: 1, loanEnd: 2,
    });
    const r1 = await recallYouthLoan(db, TEST_SAVE_ID, loanId, 1, 10);
    expect(r1.recalled).toBe(true);
    const club = (raw.prepare('SELECT club_id, loan_wage FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, player.id) as { club_id: number; loan_wage: number | null });
    expect(club.club_id).toBe(parentClubId.id);
    expect(club.loan_wage).toBeNull();
    const r2 = await recallYouthLoan(db, TEST_SAVE_ID, loanId, 1, 11);
    expect(r2.recalled).toBe(false);
    raw.close();
  });
});
```

- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/youth/youth-loans.test.ts`
  → Esperado: "Cannot find module '@/engine/youth/youth-loans'".

- [ ] **Step 3 — implementar** `src/engine/youth/youth-loans.ts`:
```ts
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getActiveYouthLoans, getYouthLoanById } from '@/database/queries/youth';

export interface YouthLoanWeekResult { trackedPlayerIds: number[]; }

/**
 * Acumula, por empréstimo de base ativo, os minutos/appearances/rating da rodada
 * a partir de player_stats (engine grava acumulado por temporada). Tomamos a
 * fotografia atual menos o já contabilizado: como player_stats é cumulativo na
 * temporada, sincronizamos os contadores do loan ao snapshot da temporada.
 */
export async function processYouthLoanWeek(
  db: DbHandle, saveId: number, season: number, _week: number,
): Promise<YouthLoanWeekResult> {
  const loans = (await db
    .prepare('SELECT * FROM youth_loans WHERE save_id = ? AND settled = 0 AND recalled = 0')
    .all(saveId)) as Array<{ id: number; player_id: number; start_season: number }>;
  const tracked: number[] = [];
  for (const loan of loans) {
    const st = (await db
      .prepare(
        `SELECT COALESCE(SUM(appearances),0) AS apps, COALESCE(SUM(minutes_played),0) AS mins,
                COALESCE(AVG(NULLIF(avg_rating,0)),0) AS rating
         FROM player_stats WHERE save_id = ? AND player_id = ? AND season >= ?`,
      )
      .get(saveId, loan.player_id, loan.start_season)) as { apps: number; mins: number; rating: number };
    if (st.apps <= 0 && st.mins <= 0) continue;
    await db
      .prepare(
        'UPDATE youth_loans SET minutes_played = ?, appearances = ?, rating_sum = ? WHERE save_id = ? AND id = ?',
      )
      .run(st.mins, st.apps, st.rating * st.apps, saveId, loan.id);
    tracked.push(loan.player_id);
  }
  return { trackedPlayerIds: tracked };
}

/**
 * Recall mid-season: restaura o jovem ao clube-pai, limpa o override de loan_wage
 * (espelha loan-returns.ts:53-55) e marca recalled=1. Guarda settled=0 && recalled=0.
 */
export async function recallYouthLoan(
  db: DbHandle, saveId: number, loanId: number, _season: number, _week: number,
): Promise<{ recalled: boolean; reason?: string }> {
  const loan = await getYouthLoanById(db, saveId, loanId);
  if (!loan) return { recalled: false, reason: 'not_found' };
  if (loan.settled === 1 || loan.recalled === 1) return { recalled: false, reason: 'already_closed' };
  // só age se o clube-pai ainda existe (loan-returns.ts:43 guarda análoga)
  const parent = (await db
    .prepare('SELECT id FROM clubs WHERE save_id = ? AND id = ?')
    .get(saveId, loan.parentClubId)) as { id: number } | undefined;
  if (!parent) return { recalled: false, reason: 'no_parent' };
  await db
    .prepare('UPDATE players SET club_id = ?, loan_wage = NULL WHERE save_id = ? AND id = ?')
    .run(loan.parentClubId, saveId, loan.playerId);
  await db
    .prepare('UPDATE youth_loans SET recalled = 1 WHERE save_id = ? AND id = ?')
    .run(saveId, loanId);
  return { recalled: true };
}

/**
 * No rollover: converte minutos/rating do empréstimo em ganho de potencial/overall.
 * appearances=0 ⇒ ganho neutro/levemente negativo (estagnou). Idempotente via settled=1.
 */
export async function settleYouthLoanDevelopment(
  db: DbHandle, saveId: number, endedSeason: number, rng: SeededRng,
): Promise<number[]> {
  const loans = (await db
    .prepare(
      `SELECT * FROM youth_loans WHERE save_id = ? AND settled = 0 AND start_season <= ? AND loan_end <= ?`,
    )
    .all(saveId, endedSeason, endedSeason)) as Array<{
      id: number; player_id: number; minutes_played: number; appearances: number; rating_sum: number;
    }>;
  const settled: number[] = [];
  for (const loan of loans) {
    const avg = loan.appearances > 0 ? loan.rating_sum / loan.appearances : 0;
    // ganho: minutos jogados (proxy de exposição) × qualidade (rating acima de 6.0).
    const minutesFactor = Math.min(1, loan.minutes_played / 2700); // 30 jogos × 90'
    const qualityFactor = avg > 0 ? Math.max(-0.5, (avg - 6.0) / 2) : -0.25; // [-0.5,+1.x]
    const jitter = rng.nextInt(0, 1); // desempate determinístico de fronteira
    const gain = Math.round(minutesFactor * qualityFactor * 6 + jitter * (qualityFactor > 0 ? 1 : 0));

    const player = (await db
      .prepare('SELECT effective_potential, base_potential FROM players WHERE save_id = ? AND id = ?')
      .get(saveId, loan.player_id)) as { effective_potential: number; base_potential: number } | undefined;
    if (player) {
      const newPot = Math.max(1, Math.min(100, player.effective_potential + gain));
      await db
        .prepare('UPDATE players SET effective_potential = ? WHERE save_id = ? AND id = ?')
        .run(newPot, saveId, loan.player_id);
    }
    await db.prepare('UPDATE youth_loans SET settled = 1 WHERE save_id = ? AND id = ?').run(saveId, loan.id);
    settled.push(loan.player_id);
  }
  return settled;
}
```
  > Verificar nomes de colunas de `player_stats` no schema (Step 1 usa `appearances, minutes_played, goals, assists, avg_rating, yellow_cards, red_cards`). Se diferir, ajustar a query/insert do teste e da implementação para os nomes reais (grep `CREATE TABLE IF NOT EXISTS player_stats` em `schema.ts`).

- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/youth/youth-loans.test.ts && npx tsc --noEmit`
  → Esperado: 3 testes verdes; tsc exit 0. Se quebrar, usar superpowers:systematic-debugging (não relaxar asserção).

- [ ] **Step 5 — commit:** (orquestrador)
  `git add src/engine/youth/youth-loans.ts __tests__/engine/youth/youth-loans.test.ts`
  msg: `feat(c2): empréstimo de desenvolvimento com tracking semanal, recall e settle no rollover` + trailer.

---

## Task 7: `academy-reputation.ts` (delta puro + orquestrador)

**Files:** Create `src/engine/youth/academy-reputation.ts`, `__tests__/engine/youth/academy-reputation.test.ts`.
**Interfaces:** Consumes: `DbHandle`. Produces: `computeAcademyReputationDelta`, `applyAcademyReputation`, `AcademyOutput`.

- [ ] **Step 1 — teste falhando** `__tests__/engine/youth/academy-reputation.test.ts`:
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { computeAcademyReputationDelta, applyAcademyReputation } from '@/engine/youth/academy-reputation';

describe('academy-reputation', () => {
  it('delta sobe com produtos da base e cai/estagna sem nada', () => {
    const up = computeAcademyReputationDelta(50, { promotedToFirstTeam: 2, graduatesSoldForProfit: 1, graduateStarterCount: 3 });
    const flat = computeAcademyReputationDelta(50, { promotedToFirstTeam: 0, graduatesSoldForProfit: 0, graduateStarterCount: 0 });
    expect(up).toBeGreaterThan(0);
    expect(flat).toBeLessThanOrEqual(0);
  });

  it('applyAcademyReputation grava clubs.academy_reputation novo + linha única em history', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const club = raw.prepare('SELECT id FROM clubs WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number };
    // dá ao clube 2 jovens promovidos a first nesta temporada
    const pids = raw.prepare('SELECT id FROM players WHERE save_id = ? AND club_id = ? LIMIT 2').all(TEST_SAVE_ID, club.id) as Array<{ id: number }>;
    for (const p of pids) raw.prepare('UPDATE players SET squad_tier = ? WHERE save_id = ? AND id = ?').run('first', TEST_SAVE_ID, p.id);
    await applyAcademyReputation(db, TEST_SAVE_ID, 1);
    const hist = raw.prepare('SELECT COUNT(*) AS n FROM academy_reputation_history WHERE save_id = ? AND club_id = ? AND season = 1').get(TEST_SAVE_ID, club.id) as { n: number };
    expect(hist.n).toBe(1);
    const rep = raw.prepare('SELECT academy_reputation FROM clubs WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, club.id) as { academy_reputation: number };
    expect(rep.academy_reputation).toBeGreaterThanOrEqual(1);
    expect(rep.academy_reputation).toBeLessThanOrEqual(100);
    // idempotente por UNIQUE(save,club,season)
    await applyAcademyReputation(db, TEST_SAVE_ID, 1);
    const hist2 = raw.prepare('SELECT COUNT(*) AS n FROM academy_reputation_history WHERE save_id = ? AND club_id = ? AND season = 1').get(TEST_SAVE_ID, club.id) as { n: number };
    expect(hist2.n).toBe(1);
    raw.close();
  });
});
```

- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/youth/academy-reputation.test.ts`
  → Esperado: "Cannot find module '@/engine/youth/academy-reputation'".

- [ ] **Step 3 — implementar** `src/engine/youth/academy-reputation.ts`:
```ts
import { DbHandle } from '@/database/queries/players';

export interface AcademyOutput {
  promotedToFirstTeam: number;
  graduatesSoldForProfit: number;
  graduateStarterCount: number;
}

const REP_FLOOR = 1;
const REP_CAP = 100;
const DECAY_NO_OUTPUT = -1; // estagna/cai 1 ponto sem produtos

/** Delta clampado de reputação; o chamador soma a `current` e re-clampa [1,100]. */
export function computeAcademyReputationDelta(current: number, output: AcademyOutput): number {
  const raw =
    output.promotedToFirstTeam * 3 +
    output.graduatesSoldForProfit * 4 +
    output.graduateStarterCount * 2;
  if (raw === 0) return DECAY_NO_OUTPUT;
  // retornos decrescentes perto do topo: ganho menor quanto maior a reputação atual.
  const headroomFactor = (REP_CAP - current) / REP_CAP; // 0..1
  const delta = Math.round(raw * (0.5 + 0.5 * headroomFactor));
  return Math.max(-5, Math.min(10, delta));
}

/**
 * Calcula o output da temporada por clube (jovens promovidos a 'first'), aplica o
 * delta a clubs.academy_reputation (re-clampado) e grava academy_reputation_history.
 * Idempotente via UNIQUE(save,club,season) com INSERT OR IGNORE.
 */
export async function applyAcademyReputation(
  db: DbHandle, saveId: number, season: number,
): Promise<void> {
  const clubs = (await db
    .prepare('SELECT id, academy_reputation FROM clubs WHERE save_id = ?')
    .all(saveId)) as Array<{ id: number; academy_reputation: number }>;

  for (const club of clubs) {
    const promoted = (await db
      .prepare("SELECT COUNT(*) AS n FROM players WHERE save_id = ? AND club_id = ? AND squad_tier = 'first' AND age <= 21")
      .get(saveId, club.id)) as { n: number };
    const starters = (await db
      .prepare("SELECT COUNT(*) AS n FROM players WHERE save_id = ? AND club_id = ? AND squad_tier = 'first'")
      .get(saveId, club.id)) as { n: number };
    const output: AcademyOutput = {
      promotedToFirstTeam: promoted.n,
      graduatesSoldForProfit: 0, // V1: vendas não rastreadas por origem de academia
      graduateStarterCount: Math.min(starters.n, promoted.n),
    };
    const delta = computeAcademyReputationDelta(club.academy_reputation, output);
    const newRep = Math.max(REP_FLOOR, Math.min(REP_CAP, club.academy_reputation + delta));
    await db.prepare('UPDATE clubs SET academy_reputation = ? WHERE save_id = ? AND id = ?').run(newRep, saveId, club.id);
    await db
      .prepare(
        `INSERT OR IGNORE INTO academy_reputation_history (save_id, club_id, season, reputation, delta)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(saveId, club.id, season, newRep, delta);
  }
}
```

- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/youth/academy-reputation.test.ts && npx tsc --noEmit`
  → Esperado: 2 testes verdes; tsc exit 0.

- [ ] **Step 5 — commit:** (orquestrador)
  `git add src/engine/youth/academy-reputation.ts __tests__/engine/youth/academy-reputation.test.ts`
  msg: `feat(c2): reputação de academia evoluída por produtos da base + histórico anual` + trailer.

---

## Task 8: Wiring — `end-of-season-ops.ts`, `season-rollover.ts`, `game-loop.ts`

**Files:** Modify `src/engine/season/end-of-season-ops.ts`, `src/engine/season-rollover.ts`, `src/engine/game-loop.ts`. Create `__tests__/integration/youth-rollover-wiring.test.ts`.
**Interfaces:** Consumes: `generateYouthPlayers` (input estendido), `settleYouthLoanDevelopment`, `evaluateTierTransitions`, `applyAcademyReputation`, `processYouthLoanWeek`, `promotePlayerTier`. Produces: rollover/week que persistem tier, settle e reputação.

- [ ] **Step 1 — teste falhando** `__tests__/integration/youth-rollover-wiring.test.ts`:
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { generateClubYouth } from '@/engine/season/end-of-season-ops';
import { SeededRng } from '@/engine/rng';

describe('intake grava squad_tier=youth', () => {
  it('jovens gerados nascem no tier youth', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const club = raw.prepare('SELECT id FROM clubs WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number };
    const ids = await generateClubYouth(db, TEST_SAVE_ID, club.id, 2, new SeededRng(7));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const tiers = raw.prepare(
      `SELECT squad_tier FROM players WHERE save_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    ).all(TEST_SAVE_ID, ...ids) as Array<{ squad_tier: string }>;
    expect(tiers.every((t) => t.squad_tier === 'youth')).toBe(true);
    raw.close();
  });
});
```

- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/integration/youth-rollover-wiring.test.ts`
  → Esperado: jovens nascem com `squad_tier='first'` (default) → assert `=== 'youth'` falha.

- [ ] **Step 3 — implementar `generateClubYouth`** em `src/engine/season/end-of-season-ops.ts`:
  - Importar specialization e reputação. Antes de `const youth = generateYouthPlayers({...})` (`end-of-season-ops.ts:74`), obter:
```ts
  const youthCoach = staff.find((s) => s.role === 'youth_coach');
  const specialization = ((youthCoach as { youthSpecialization?: string } | undefined)?.youthSpecialization
    ?? 'balanced') as import('@/engine/youth/youth-levers').YouthSpecialization;
  const academyReputation = ((club as { academyReputation?: number } | null)?.academyReputation) ?? 50;
```
  > `getStaffByClub`/`rowToStaff` ainda não mapeiam `youth_specialization`. Para evitar acoplamento, ler direto: substituir a obtenção por uma query pontual:
```ts
  const youthSpecRow = (await db
    .prepare("SELECT youth_specialization FROM staff WHERE save_id = ? AND club_id = ? AND role = 'youth_coach' LIMIT 1")
    .get(saveId, clubId)) as { youth_specialization: string } | undefined;
  const specialization = (youthSpecRow?.youth_specialization ?? 'balanced') as import('@/engine/youth/youth-levers').YouthSpecialization;
  const academyRow = (await db
    .prepare('SELECT academy_reputation FROM clubs WHERE save_id = ? AND id = ?')
    .get(saveId, clubId)) as { academy_reputation: number } | undefined;
  const academyReputation = academyRow?.academy_reputation ?? 50;
```
  - Passar ao gerador:
```ts
  const youth = generateYouthPlayers({
    clubId,
    academyLevel: club?.youthAcademy ?? 3,
    youthCoachBonus,
    academyReputation,
    specialization,
    countryCode,
    rng,
  });
```
  - No INSERT de `players` (`end-of-season-ops.ts:86-92`), adicionar `squad_tier` à lista de colunas e o valor `'youth'`:
```ts
    await db.prepare(
      'INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent, squad_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      nextId, saveId, y.name, nationality, y.age, y.position, null,
      clubId, 5000, newSeason + 3, 100000,
      y.basePotential, y.basePotential, 70, 100, 0, 0, 'youth',
    );
```

- [ ] **Step 4 — rodar (passa parcial):** `npx jest __tests__/integration/youth-rollover-wiring.test.ts && npx tsc --noEmit`
  → Esperado: teste de tier verde; tsc exit 0.

- [ ] **Step 5 — wiring no `season-rollover.ts`.** Em `src/engine/season-rollover.ts`:
  - Imports no topo:
```ts
import { settleYouthLoanDevelopment } from '@/engine/youth/youth-loans';
import { evaluateTierTransitions } from '@/engine/youth/youth-progression';
import { applyAcademyReputation } from '@/engine/youth/academy-reputation';
import { promotePlayerTier } from '@/database/queries/youth';
```
  - Dentro de `runInTransaction`, logo APÓS `returnExpiredLoans` (`season-rollover.ts:49`) e antes de `expireContracts`, adicionar o settle de loans de base:
```ts
    // 2c. C2: liquida desenvolvimento dos empréstimos de base antes de o jovem
    //     ter idade incrementada/contrato resolvido (espelha a ordem do loan genérico).
    await settleYouthLoanDevelopment(db, saveId, endedSeason, p.rng);
```
  - Após `generateClubYouth` do clube humano (`season-rollover.ts:63`), adicionar transições de tier do elenco humano:
```ts
    // 4a. C2: transições automáticas de tier (youth→reserve→first) para o clube humano.
    {
      const tierRows = (await db
        .prepare("SELECT id, age, effective_potential, squad_tier FROM players WHERE save_id = ? AND club_id = ? AND is_free_agent = 0")
        .all(saveId, playerClubId)) as Array<{ id: number; age: number; effective_potential: number; squad_tier: string }>;
      const statsById = new Map<number, number>();
      for (const r of tierRows) {
        const st = (await db
          .prepare('SELECT minutes_played FROM player_stats WHERE save_id = ? AND player_id = ? AND season = ?')
          .get(saveId, r.id, endedSeason)) as { minutes_played: number } | undefined;
        statsById.set(r.id, Math.min(100, ((st?.minutes_played ?? 0) / (38 * 90)) * 100));
      }
      const firstCount = tierRows.filter((r) => r.squad_tier === 'first').length;
      const candidates = tierRows.map((r) => ({
        playerId: r.id, age: r.age + 1, currentOverall: r.effective_potential, // proxy pós-age
        effectivePotential: r.effective_potential, squadTier: r.squad_tier as import('@/types').SquadTier,
        seasonMinutesPercent: statsById.get(r.id) ?? 0,
      }));
      const benchmark = candidates.length
        ? Math.round(candidates.reduce((s, c) => s + c.currentOverall, 0) / candidates.length)
        : 70;
      const transitions = evaluateTierTransitions(candidates, { firstTeamSize: firstCount, starterAvgOverall: benchmark }, p.rng);
      for (const t of transitions) await promotePlayerTier(db, saveId, t.playerId, t.to);
    }
```
  > `currentOverall` usa `effective_potential` como proxy (overall real exige carregar atributos; aceitável aqui — o motor é testado em isolamento na Task 4 com overall real). Documentar no commit.
  - Após `applyOrdinaryRetirements` (`season-rollover.ts:105`), adicionar:
```ts
    // 4e. C2: reputação de academia da temporada encerrada (todos os clubes).
    await applyAcademyReputation(db, saveId, endedSeason);
```

- [ ] **Step 6 — wiring no `game-loop.ts`.** Em `src/engine/game-loop.ts`:
  - Import: `import { processYouthLoanWeek } from '@/engine/youth/youth-loans';`
  - Dentro de `advanceGameWeek`, após o bloco de transfer-window/`processPendingOffers` (perto de `game-loop.ts:569-575`), antes do `return`:
```ts
  // C2: acumula minutos/rating dos empréstimos de desenvolvimento desta rodada.
  await processYouthLoanWeek(db, saveId, season, week);
```

- [ ] **Step 7 — rodar (passa):** `npx jest __tests__/integration/youth-rollover-wiring.test.ts && npx tsc --noEmit`
  → Esperado: verde; tsc exit 0.

- [ ] **Step 8 — suíte de regressão:** `npx jest __tests__/integration __tests__/save-isolation __tests__/engine/season`
  → Esperado: career-loop e rollover existentes continuam verdes (o wiring não altera contratos). Se quebrar, superpowers:systematic-debugging.

- [ ] **Step 9 — commit:** (orquestrador)
  `git add src/engine/season/end-of-season-ops.ts src/engine/season-rollover.ts src/engine/game-loop.ts __tests__/integration/youth-rollover-wiring.test.ts`
  msg: `feat(c2): encaixar settle de loans, transições de tier e reputação no rollover + tracking semanal no game-loop` + trailer.

---

## Task 9: save-isolation (queries de um save nunca enxergam o outro)

**Files:** Create `__tests__/save-isolation/youth-isolation.test.ts`.
**Interfaces:** Consumes: `insertYouthLoan`, `getActiveYouthLoans`, `promotePlayerTier`, `getPlayersByClubAndTier`. Produces: prova de isolamento.

- [ ] **Step 1 — teste falhando** `__tests__/save-isolation/youth-isolation.test.ts`:
```ts
import { createTestDb, createTestDbHandle } from '../database/test-helpers';
import { seedReferenceTables, seedWorldForSave } from '@/database/seed';
import { insertYouthLoan, getActiveYouthLoans } from '@/database/queries/youth';

describe('youth save-isolation', () => {
  it('loans de save A não aparecem em save B', async () => {
    const raw = createTestDb(); const db = createTestDbHandle(raw);
    seedReferenceTables(raw, 42);
    seedWorldForSave(raw, 1, 42);
    seedWorldForSave(raw, 2, 42);
    const clubA = raw.prepare('SELECT id FROM clubs WHERE save_id = 1 LIMIT 1').get() as { id: number };
    const club2A = raw.prepare('SELECT id FROM clubs WHERE save_id = 1 AND id != ? LIMIT 1').get(clubA.id) as { id: number };
    const playerA = raw.prepare('SELECT id FROM players WHERE save_id = 1 AND club_id = ? LIMIT 1').get(clubA.id) as { id: number };
    await insertYouthLoan(db, 1, { playerId: playerA.id, parentClubId: clubA.id, loanClubId: club2A.id, startSeason: 1, loanEnd: 2 });
    const inA = await getActiveYouthLoans(db, 1, clubA.id);
    const inB = await getActiveYouthLoans(db, 2, clubA.id);
    expect(inA.length).toBeGreaterThan(0);
    expect(inB.length).toBe(0);
    raw.close();
  });
});
```
  > Verificar a assinatura real de `seedReferenceTables`/`seedWorldForSave` (`__tests__/save-isolation/*.test.ts` existentes mostram o padrão correto). Ajustar argumentos se diferir.

- [ ] **Step 2 — rodar (falha→passa):** `npx jest __tests__/save-isolation/youth-isolation.test.ts`
  → Esperado: passa de imediato se as queries já são `save_id`-scoped (são, por contrato). Se falhar, há vazamento — corrigir a query, não o teste.

- [ ] **Step 3 — commit:** (orquestrador)
  `git add __tests__/save-isolation/youth-isolation.test.ts`
  msg: `test(c2): save-isolation de youth_loans e tier` + trailer.

---

## Task 10: i18n `youth.*` (paridade pt/en)

**Files:** Modify `src/i18n/pt.ts`, `src/i18n/en.ts`. (Sem teste dedicado novo — o teste de paridade i18n existente cobre.)
**Interfaces:** Produces: chaves consumidas pela tela (Task 11).

- [ ] **Step 1 — adicionar chaves** em `src/i18n/pt.ts` (e os equivalentes em `en.ts`). Localizar o bloco `youth.*` existente e acrescentar:
```ts
  // pt.ts
  'youth.title': 'Academia de Base',
  'youth.subtitle': 'Desenvolva a próxima geração',
  'youth.section_preview': 'Intake da próxima temporada',
  'youth.section_reserves': 'Reservas (pipeline)',
  'youth.section_loans': 'Empréstimos ativos',
  'youth.section_ranking': 'Reputação de academia',
  'youth.preview_count': 'Jogadores esperados: {min}–{max}',
  'youth.preview_potential': 'Potencial do topo: {min}–{max}',
  'youth.preview_gems': 'Joias esperadas: {n}',
  'youth.rep_tier.elite': 'Elite',
  'youth.rep_tier.forte': 'Forte',
  'youth.rep_tier.mediana': 'Mediana',
  'youth.rep_tier.fraca': 'Fraca',
  'youth.promote': 'Promover ao elenco',
  'youth.promote_confirm': 'Promover {name} ao elenco principal?',
  'youth.promote_ok': '{name} promovido ao elenco principal',
  'youth.promote_too_raw': '{name} ainda não está pronto',
  'youth.promote_squad_full': 'Elenco principal cheio',
  'youth.recall': 'Chamar de volta',
  'youth.recall_confirm': 'Encerrar o empréstimo de {name}?',
  'youth.recall_ok': '{name} retornou ao clube',
  'youth.loan_minutes': '{minutes} min · {apps} jogos · nota {rating}',
  'youth.rank_row': '{rank}. {name} — {rep}',
  'youth.empty_reserves': 'Nenhuma reserva no momento',
  'youth.empty_loans': 'Nenhum empréstimo ativo',
```
  - Em `en.ts`, as MESMAS chaves com tradução (ex.: `'youth.title': 'Youth Academy'`, `'youth.promote': 'Promote to first team'`, etc.). Reaproveitar `youth.empty`/`youth.empty_hint` se já existirem (não duplicar).

- [ ] **Step 2 — rodar paridade:** `npx jest __tests__/i18n && npx tsc --noEmit`
  → Esperado: teste de paridade pt/en verde (mesmo conjunto de chaves).

- [ ] **Step 3 — commit:** (orquestrador)
  `git add src/i18n/pt.ts src/i18n/en.ts`
  msg: `feat(c2): chaves i18n da tela de academia (paridade pt/en)` + trailer.

---

## Task 11: Reescrever `YouthAcademyScreen` no kit

**Files:** Modify `src/screens/squad/YouthAcademyScreen.tsx`.
**Interfaces:** Consumes: `previewIntake`, `getPlayersByClubAndTier`, `getActiveYouthLoans`, `getAcademyReputationRanking`, `evaluatePromotion`, `promotePlayerTier`, `recallYouthLoan`, kit do Design System (`Card`/`StatBar`/`Text`/`Icon`/`Button`/`EmptyState`/`Toast`/`useConfirm`).
> **Dependência:** esta task requer o kit do Design System (épico D3/D4). Se o kit ainda não existir no repo, **parar e reportar** ao orquestrador — Tasks 1-10 (engine/DB/queries/i18n) são entregáveis independentes e podem ser commitadas/mergeadas sem a tela. NÃO reintroduzir estilos inline crus do stub.

- [ ] **Step 1 — confirmar o kit:** verificar existência dos componentes:
  `ls src/components/ui/ 2>/dev/null; grep -rln "export function useConfirm\|export function Toast\|export function StatBar" src/components/`
  → Se vazio: PARAR, reportar bloqueio (kit ausente). Se presente: seguir.

- [ ] **Step 2 — implementar a tela** usando o store (`useDatabaseStore`), a sessão atual (clube/país/save via store de jogo) e os hooks de dados. Estrutura (sem código de kit inventado — espelhar uma tela JÁ migrada do D4, ex.: a primeira tela que usa `Card`/`StatBar`):
  - Header: `Text` título `t('youth.title')` + subtítulo.
  - **Seção preview**: `Card` com `previewIntake(levers)` onde `levers` vem de `club.youthAcademy`, `getStaffEffects(...).youthQualityBonus`, `club.academyReputation`, specialization do youth coach. Renderiza `youth.preview_count/_potential/_gems` + badge `youth.rep_tier.*`.
  - **Seção reservas**: lista `getPlayersByClubAndTier(db, saveId, clubId, 'reserve')`; cada item com `Button` "Promover" → `evaluatePromotion` → se `allowed` `promotePlayerTier` + `Toast(youth.promote_ok)`; senão `Toast` com o motivo. `EmptyState` `youth.empty_reserves` se vazio.
  - **Seção empréstimos**: `getActiveYouthLoans(db, saveId, clubId)`; cada item com `youth.loan_minutes` + `Button` "Chamar de volta" → `useConfirm(youth.recall_confirm)` → `recallYouthLoan` → `Toast(youth.recall_ok)` + refresh. `EmptyState` `youth.empty_loans` se vazio.
  - **Seção ranking**: `getAcademyReputationRanking(db, saveId, club.countryId)`; render top-N com `youth.rank_row`, destacando o clube do jogador.
  - Confirmações via `useConfirm` (NUNCA `Alert.alert` — no-op no RN Web, ver MEMORY).
  - Cores/spacing via `@/theme`.

- [ ] **Step 3 — type-check:** `npx tsc --noEmit` (exit 0).

- [ ] **Step 4 — validar no browser (Playwright MCP):** subir o web server (background do harness, `npm run web`, porta 8082; reiniciar com `--clear` se CI mode não hot-reloadar — ver MEMORY), navegar até Squad → Academia de Base. Verificar: preview renderiza faixas; promover uma reserva reflete na lista + Toast; recall de um empréstimo (se houver) funciona; 0 erros no console.

- [ ] **Step 5 — commit:** (orquestrador)
  `git add src/screens/squad/YouthAcademyScreen.tsx`
  msg: `feat(c2): reescrever tela de academia no kit — preview, reservas, empréstimos, ranking` + trailer.

---

## Task 12: Verificação final (DoD)

- [ ] **Step 1 — suíte completa:** `npx jest && npx tsc --noEmit`
  → Esperado: tudo verde (incl. determinismo sweep, career-loop e2e, paridade i18n); tsc exit 0.
- [ ] **Step 2 — determinismo:** rodar o sweep de determinismo do projeto (mesma seed → save B == save A) cobrindo um rollover com intake + 1 loan + 1 promoção. Se houver script dedicado (`npm run` que valide determinismo), executá-lo; senão, o teste de wiring (Task 8) + isolation (Task 9) cobrem.
- [ ] **Step 3 — browser (se Task 11 entregue):** Squad → Academia de Base sem erros de console; promover/recall funcionais.
- [ ] **Step 4 — DoD:** schema+migração em DOIS lugares; engine puro determinístico; loans com tracking/recall/settle; reputação com histórico; tela no kit; suíte+tsc verdes; UI validada; `git diff` revisado.

---

## Self-Review

1. **Cobertura do spec:**
   - `players.squad_tier` + `clubs.academy_reputation` + `staff.youth_specialization` (Task 1) — schema.ts E database-store.ts ✔
   - Preview determinístico de intake (`youth-levers`, Task 2) ✔
   - youth-academy estendido + specialization (Task 3) ✔
   - Pipeline de promoção/integração (`youth-progression`, Task 4) ✔
   - Queries tier-aware + youth_loans + ranking (Task 5) ✔
   - Empréstimo de desenvolvimento com tracking+recall+settle (Task 6) ✔
   - Especialização do youth coach (Task 3 atributos + Task 8 consumo do `staff.youth_specialization`) ✔
   - Reputação de academia (Task 7) ✔
   - Wiring rollover + game-loop (Task 8) ✔
   - save-isolation (Task 9), i18n (Task 10), tela reescrita no kit (Task 11) ✔
2. **Placeholder scan:** sem "TBD"/"???"/lorem. Pontos a confirmar na execução estão marcados como verificação concreta (nomes de colunas de `player_stats` no Task 6 Step 3; assinatura de `seedReferenceTables`/`seedWorldForSave` no Task 9; existência do kit no Task 11) — não são comportamento omitido, são checagens contra o código real.
3. **Consistência de tipos:** `SquadTier`, `YouthSpecialization`, `IntakeLevers`/`IntakePreview`, `TierCandidate`/`SquadContext`/`TierTransition`, `YouthLoanRow`, `AcademyOutput` fixados no Contract e usados igual em todas as tasks. Defaults (`'first'`/`50`/`'balanced'`) repetidos idênticos em schema (Task 1), migração (Task 1), gerador (Task 3) e mapeadores de row (Task 1). `GEM_THRESHOLD=80` único em `youth-levers`. Determinismo: todo caminho de engine usa `SeededRng`; preview é puro; ordenações com tie-break estável (`id ASC`).
