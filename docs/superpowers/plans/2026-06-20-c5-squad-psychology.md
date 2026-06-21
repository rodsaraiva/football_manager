# C5 — Squad Psychology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2-5 min): teste falhando → rodar e ver falhar → implementação mínima → rodar e ver passar → commit. Código real em cada step, zero placeholder.

**Goal:** Transformar a moral de um inteiro opaco (1–100) num sistema explicável e dramático — drivers rastreáveis num ledger, arquétipos de personalidade que modulam deltas, química de cliques, conflitos/fallouts com auto-transfer-list, histórico de interação e uma tela "Por quê" — em cima dos motores de team-talk/press já existentes, mantendo determinismo e save-isolation.

**Architecture:** O inteiro `players.morale` continua sendo a verdade canônica. Em vez de reescrevê-lo, adicionamos uma **camada de decomposição**: todo motor de moral passa a devolver `MoraleDriver[]` (kind+delta+season+week) somado por `sumDrivers`; um módulo de **personalidade** (`derivePersonality`/`personalityMoraleModifier`) modula cada driver por arquétipo; **química** (`computeChemistryGroups`/`chemistryDriftBonus`) agrupa o elenco por afinidade e injeta um driver de drift; uma **máquina de estados de fallout** (`nextFalloutState`) escala conflito até `wantsOut` (auto-transfer-list + news). Um **orquestrador** (`psychology-orchestrator.ts`, padrão `game-loop.ts`: `(db, saveId, ...)`, sem React) costura tudo, persiste no ledger `morale_events` e em `chemistry_links`, e é chamado pelo `game-loop`. A tela "Por quê" lê o ledger.

**Tech Stack:** TS 5.9 strict, Jest+ts-jest, better-sqlite3 REAL (nunca mock), SeededRng, Zustand, React Navigation v7, react-native-svg.

**Convenções:** TDD; engine puro em `src/engine/morale` (ZERO React/Expo); novas levers como `MORALE_*`/`CHEMISTRY_*`/`FALLOUT_*`/`PERSONALITY_*` em `balance.ts`; colunas/tabelas novas em `schema.ts` (saves novos) E `database-store.ts` (`addColumnIfMissing`/`CREATE TABLE IF NOT EXISTS`, saves antigos); queries save-isoladas `(db, saveId, ...)` com `WHERE save_id = ?`; SeededRng para tudo aleatório — ZERO `Math.random`/`Date.now`/`ORDER BY RANDOM`; i18n pt/en paridade; tokens de `@/theme`; branch `feat/c5-squad-psychology`; commits terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. **Subagents NÃO commitam** (o orquestrador commita; o passo "commit" descreve o que commitar).

**Precedente a espelhar:**
- Motor puro de moral: `src/engine/morale/morale-engine.ts` (`computeMatchMoraleDelta:21-34`, `computeWeeklyMoraleDrift:37-39`, `applyMoraleDelta:42-44`).
- Interações: `src/engine/morale/interactions.ts` (`evaluatePraise:25-33`, `evaluateCriticism:42-52`).
- Team-talk/press como molde de "delta por membro + summary": `src/engine/morale/squad-team-talk.ts`, `src/engine/press/press-engine.ts`.
- Queries save-isoladas: `src/database/queries/interactions.ts:13-50`; `DbHandle` em `src/database/queries/players.ts:3-9`; `getPlayersByClub:116-123`, `updatePlayerMorale:204`.
- News: `src/database/queries/news.ts:31` (`insertNewsItem` + `NewsItemInput`); `NewsCategory` em `src/engine/news/news-generator.ts:9-23` (usaremos `'info'`).
- Migração: `src/store/database-store.ts` (`addColumnIfMissing:26-35`, `CREATE TABLE IF NOT EXISTS` blocks `:77-310`, `SAVE_ID_INDEXES_SQL` em `:314`).
- Orquestração no game-loop: `src/engine/game-loop.ts:470-491` (pós-partida) e `:721-742` (drift idle + streak).
- RNG: `src/engine/rng.ts` (`SeededRng`, `nextInt`, `next`, `pick`, `shuffle`, `weightedPick`).

---

## File Structure

- **Create** `src/engine/morale/driver-ledger.ts` — tipos `MoraleDriver`/`MoraleDriverKind`/`DriverCtx`; `sumDrivers()`; helper `driver()`.
- **Create** `src/engine/morale/personality.ts` — `PersonalityArchetype`, `derivePersonality()`, `personalityMoraleModifier()`.
- **Create** `src/engine/morale/chemistry.ts` — `ChemistryMember`/`ChemistryGroup`, `computeChemistryGroups()`, `chemistryDriftBonus()`.
- **Create** `src/engine/morale/fallout.ts` — `FalloutState`, `FalloutInput`, `nextFalloutState()`.
- **Create** `src/engine/morale/psychology-orchestrator.ts` — `applyMatchPsychology()`, `applyWeeklyPsychology()` (toca DB, padrão game-loop).
- **Create** `src/database/queries/morale.ts` — ledger + chemistry + personality + fallout CRUD save-isolado.
- **Create** `src/screens/squad/MoraleBreakdownScreen.tsx` — tela "Por quê" (kit `@/theme`).
- **Modify** `src/engine/balance.ts` — novas levers (`PERSONALITY_*`, `CHEMISTRY_*`, `FALLOUT_*`, `MORALE_EVENTS_KEEP_SEASONS`).
- **Modify** `src/engine/morale/morale-engine.ts` — `computeMatchMoraleDelta`/`computeWeeklyMoraleDrift` passam a devolver drivers; `applyMoraleDelta` INALTERADO.
- **Modify** `src/types/player.ts:29-56` — `personality: PersonalityArchetype`, `falloutState: FalloutState`.
- **Modify** `src/database/schema.ts:92-108,468+` — colunas em `players`, tabelas `morale_events`/`chemistry_links`, índices.
- **Modify** `src/store/database-store.ts` — migração das colunas/tabelas/índices.
- **Modify** `src/database/queries/players.ts` — `rowToPlayer` mapeia `personality`/`fallout_state`.
- **Modify** `src/engine/game-loop.ts:477-491,721-731` — chamar o orquestrador.
- **Modify** `src/navigation/*` — registrar rota `MoraleBreakdown`.
- **Modify** `src/screens/squad/PlayerDetailScreen.tsx` — badge de personalidade + link "Por quê".
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` — chaves de drivers/arquétipos/química/fallout/tela.
- **Test** `__tests__/engine/morale/driver-ledger.test.ts`, `personality.test.ts`, `chemistry.test.ts`, `fallout.test.ts`, `morale-engine-drivers.test.ts`, `__tests__/engine/morale/psychology-orchestrator.test.ts`, `__tests__/database/queries/morale-queries.test.ts`.

**Contract (assinaturas exatas):**

```ts
// src/engine/morale/driver-ledger.ts
export type MoraleDriverKind =
  | 'matchWin' | 'matchLoss' | 'matchDraw' | 'heavyDefeat'
  | 'benched' | 'benchStreak' | 'idleDrift'
  | 'praise' | 'criticism' | 'teamTalk' | 'press'
  | 'wage' | 'chemistry' | 'positionUnhappy';
export interface MoraleDriver { kind: MoraleDriverKind; delta: number; season: number; week: number; }
export interface DriverCtx { season: number; week: number; archetype: PersonalityArchetype; }
export function driver(kind: MoraleDriverKind, delta: number, ctx: DriverCtx): MoraleDriver;
export function sumDrivers(drivers: readonly MoraleDriver[]): number;

// src/engine/morale/personality.ts
export type PersonalityArchetype =
  | 'leader' | 'professional' | 'mercenary' | 'temperamental' | 'dressingRoomProblem' | 'balanced';
export interface PersonalityInput { leadership: number; composure: number; aggression: number; decisions: number; }
export function derivePersonality(input: PersonalityInput, seedComponent: number): PersonalityArchetype;
export function personalityMoraleModifier(archetype: PersonalityArchetype, kind: MoraleDriverKind, baseDelta: number): number;

// src/engine/morale/chemistry.ts
export interface ChemistryMember { id: number; nationality: string; age: number; seasonsAtClub: number; morale: number; }
export interface ChemistryGroup { memberIds: number[]; cohesion: number; } // cohesion 0..1
export function computeChemistryGroups(members: readonly ChemistryMember[], rng: SeededRng): ChemistryGroup[];
export function chemistryDriftBonus(group: ChemistryGroup, member: ChemistryMember): number;

// src/engine/morale/fallout.ts
export type FalloutState = 'none' | 'unsettled' | 'wantsOut';
export interface FalloutInput { current: FalloutState; morale: number; lowStreakWeeks: number; archetype: PersonalityArchetype; recentCriticisms: number; }
export function nextFalloutState(input: FalloutInput): FalloutState;

// src/engine/morale/morale-engine.ts (alterado)
export function computeMatchMoraleDelta(input: MatchMoraleInput, ctx: DriverCtx): MoraleDriver[];
export function computeWeeklyMoraleDrift(currentMorale: number, ctx: DriverCtx): MoraleDriver | null;
export function applyMoraleDelta(current: number, delta: number): number; // INALTERADO

// src/database/queries/morale.ts
export async function appendMoraleEvents(db: DbHandle, saveId: number, playerId: number, drivers: readonly MoraleDriver[]): Promise<void>;
export async function getMoraleEvents(db: DbHandle, saveId: number, playerId: number, limit: number): Promise<MoraleDriver[]>;
export async function pruneMoraleEvents(db: DbHandle, saveId: number, keepSeasons: number, currentSeason: number): Promise<void>;
export async function setPlayerPersonality(db: DbHandle, saveId: number, playerId: number, p: PersonalityArchetype): Promise<void>;
export async function setFalloutState(db: DbHandle, saveId: number, playerId: number, s: FalloutState): Promise<void>;
export async function countRecentCriticisms(db: DbHandle, saveId: number, playerId: number, sinceSeason: number, sinceWeek: number): Promise<number>;
export async function replaceChemistryLinks(db: DbHandle, saveId: number, clubId: number, groups: readonly ChemistryGroup[]): Promise<void>;
export async function getChemistryGroups(db: DbHandle, saveId: number, clubId: number): Promise<ChemistryGroup[]>;

// src/engine/morale/psychology-orchestrator.ts
export async function applyMatchPsychology(
  db: DbHandle, saveId: number, clubId: number,
  matchInput: { outcome: 'win' | 'draw' | 'loss'; goalDiff: number; startingIds: Set<number> },
  season: number, week: number,
): Promise<void>;
export async function applyWeeklyPsychology(
  db: DbHandle, saveId: number, clubId: number, season: number, week: number, rng: SeededRng,
): Promise<{ newlyWantsOut: number[] }>;
```

---

## Task 1: Driver ledger (tipos + `sumDrivers` + `driver`) — TDD

**Files:** Create `src/engine/morale/driver-ledger.ts`, Test `__tests__/engine/morale/driver-ledger.test.ts`.
**Interfaces:** Consumes: `PersonalityArchetype` (importado de `./personality`, criado na Task 2 — para evitar dependência circular nesta task, `DriverCtx.archetype` é tipado via `import type`). Produces: `MoraleDriver`, `MoraleDriverKind`, `DriverCtx`, `driver()`, `sumDrivers()`.

> Nota de sequência: `DriverCtx` referencia `PersonalityArchetype`. Para esta task compilar isolada, declaramos `PersonalityArchetype` localmente como `type` re-exportado? NÃO — usamos `import type { PersonalityArchetype } from './personality'` e criamos `personality.ts` PRIMEIRO como stub mínimo no Step 3 (só o tipo). A Task 2 preenche a lógica. Isso mantém os arquivos honestos sem circular runtime (só type import).

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/morale/driver-ledger.test.ts`:
```ts
import { driver, sumDrivers, MoraleDriver } from '@/engine/morale/driver-ledger';

const ctx = { season: 2, week: 10, archetype: 'balanced' as const };

it('driver() carimba kind/delta/season/week a partir do ctx', () => {
  const d = driver('matchWin', 3, ctx);
  expect(d).toEqual({ kind: 'matchWin', delta: 3, season: 2, week: 10 });
});

it('sumDrivers soma deltas e devolve 0 para lista vazia', () => {
  const ds: MoraleDriver[] = [driver('matchWin', 3, ctx), driver('benched', -2, ctx), driver('idleDrift', 1.5, ctx)];
  expect(sumDrivers(ds)).toBeCloseTo(2.5);
  expect(sumDrivers([])).toBe(0);
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente):** `npx jest __tests__/engine/morale/driver-ledger.test.ts` → `Cannot find module '@/engine/morale/driver-ledger'`.
- [ ] **Step 3 — implementar:** criar `src/engine/morale/personality.ts` (stub só com o tipo, será completado na Task 2):
```ts
export type PersonalityArchetype =
  | 'leader' | 'professional' | 'mercenary' | 'temperamental' | 'dressingRoomProblem' | 'balanced';
```
E `src/engine/morale/driver-ledger.ts`:
```ts
import type { PersonalityArchetype } from './personality';

export type MoraleDriverKind =
  | 'matchWin' | 'matchLoss' | 'matchDraw' | 'heavyDefeat'
  | 'benched' | 'benchStreak' | 'idleDrift'
  | 'praise' | 'criticism' | 'teamTalk' | 'press'
  | 'wage' | 'chemistry' | 'positionUnhappy';

export interface MoraleDriver {
  kind: MoraleDriverKind;
  delta: number; // float pré-clamp; arredondar só no applyMoraleDelta
  season: number;
  week: number;
}

export interface DriverCtx {
  season: number;
  week: number;
  archetype: PersonalityArchetype;
}

export function driver(kind: MoraleDriverKind, delta: number, ctx: DriverCtx): MoraleDriver {
  return { kind, delta, season: ctx.season, week: ctx.week };
}

export function sumDrivers(drivers: readonly MoraleDriver[]): number {
  return drivers.reduce((s, d) => s + d.delta, 0);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/morale/driver-ledger.test.ts` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/morale/driver-ledger.ts src/engine/morale/personality.ts __tests__/engine/morale/driver-ledger.test.ts` · msg: `feat(c5): driver ledger de moral (MoraleDriver/sumDrivers) + stub de personality`.

---

## Task 2: Personalidade (`derivePersonality` + `personalityMoraleModifier`) — TDD

**Files:** Modify `src/engine/morale/personality.ts`, Modify `src/engine/balance.ts`, Test `__tests__/engine/morale/personality.test.ts`.
**Interfaces:** Consumes: `MoraleDriverKind`. Produces: `derivePersonality()`, `personalityMoraleModifier()`, `PersonalityInput`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/morale/personality.test.ts`:
```ts
import { derivePersonality, personalityMoraleModifier } from '@/engine/morale/personality';

it('derivePersonality é determinística e mapeia perfis-chave', () => {
  const leaderIn = { leadership: 18, composure: 16, aggression: 8, decisions: 14 };
  expect(derivePersonality(leaderIn, 7)).toBe('leader');
  expect(derivePersonality(leaderIn, 7)).toBe(derivePersonality(leaderIn, 7)); // estável

  const tempIn = { leadership: 9, composure: 4, aggression: 18, decisions: 8 };
  expect(derivePersonality(tempIn, 3)).toBe('temperamental');

  const proIn = { leadership: 11, composure: 15, aggression: 7, decisions: 15 };
  expect(derivePersonality(proIn, 1)).toBe('professional');
});

it('personalityMoraleModifier: líder amortece benched, mercenário amplifica wage, temperamental amplifica criticism', () => {
  // benched é negativo: líder sofre MENOS (delta menos negativo)
  expect(personalityMoraleModifier('leader', 'benched', -4)).toBeGreaterThan(-4);
  // wage negativo: mercenário sofre MAIS (mais negativo)
  expect(personalityMoraleModifier('mercenary', 'wage', -3)).toBeLessThan(-3);
  // criticism negativo: temperamental sofre MAIS
  expect(personalityMoraleModifier('temperamental', 'criticism', -3)).toBeLessThan(-3);
  // professional ~neutro (igual ao base)
  expect(personalityMoraleModifier('professional', 'criticism', -3)).toBe(-3);
  // balanced sempre neutro
  expect(personalityMoraleModifier('balanced', 'matchWin', 3)).toBe(3);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/morale/personality.test.ts` → `derivePersonality is not a function`.
- [ ] **Step 3 — implementar.** Em `src/engine/balance.ts`, após o bloco `MORALE_*` (`:88-95`), adicionar:
```ts
// ─── C5: Psicologia — personalidade (modula deltas de driver por arquétipo) ────
// Multiplicadores por (arquétipo, "sinal" do driver). 1.0 = neutro. Aplicado sobre
// o delta base; o resultado é clampado em magnitude p/ não explodir a moral.
export const PERSONALITY_BENCH_DAMPEN_LEADER = 0.5;   // líder sofre metade do banco
export const PERSONALITY_WAGE_AMPLIFY_MERCENARY = 1.6; // mercenário liga p/ salário
export const PERSONALITY_CRITICISM_AMPLIFY_TEMPER = 1.5; // temperamental explode com crítica
export const PERSONALITY_NEGATIVE_AMPLIFY_PROBLEM = 1.3; // dressing-room amplia qualquer negativo
export const PERSONALITY_MODIFIER_MAX_MAGNITUDE = 8;   // teto absoluto do delta após modulação
```
Substituir todo o conteúdo de `src/engine/morale/personality.ts`:
```ts
import type { MoraleDriverKind } from './driver-ledger';
import {
  PERSONALITY_BENCH_DAMPEN_LEADER,
  PERSONALITY_WAGE_AMPLIFY_MERCENARY,
  PERSONALITY_CRITICISM_AMPLIFY_TEMPER,
  PERSONALITY_NEGATIVE_AMPLIFY_PROBLEM,
  PERSONALITY_MODIFIER_MAX_MAGNITUDE,
} from '@/engine/balance';

export type PersonalityArchetype =
  | 'leader' | 'professional' | 'mercenary' | 'temperamental' | 'dressingRoomProblem' | 'balanced';

export interface PersonalityInput {
  leadership: number;
  composure: number;
  aggression: number;
  decisions: number;
}

/**
 * Pure & deterministic: mapeia atributos mentais + um componente da seed do save
 * para um arquétipo estável. O seedComponent (0..N) só desempata na faixa "balanced",
 * garantindo variedade sem quebrar determinismo (mesma seed → mesmo arquétipo).
 */
export function derivePersonality(input: PersonalityInput, seedComponent: number): PersonalityArchetype {
  const { leadership, composure, aggression, decisions } = input;
  if (leadership >= 15 && composure >= 13) return 'leader';
  if (aggression >= 15 && composure <= 7) return 'temperamental';
  if (composure >= 13 && decisions >= 13) return 'professional';
  if (aggression >= 13 && leadership <= 8 && composure <= 9) return 'dressingRoomProblem';
  if (decisions <= 8 && composure <= 9) return 'mercenary';
  // faixa intermediária: o seed escolhe entre balanced/professional/mercenary de forma estável
  const bucket = ((seedComponent % 3) + 3) % 3;
  return bucket === 0 ? 'professional' : bucket === 1 ? 'mercenary' : 'balanced';
}

/** Pure: modula um delta de driver conforme o arquétipo, clampando a magnitude. */
export function personalityMoraleModifier(
  archetype: PersonalityArchetype,
  kind: MoraleDriverKind,
  baseDelta: number,
): number {
  let factor = 1;
  if (archetype === 'leader' && (kind === 'benched' || kind === 'benchStreak')) {
    factor = PERSONALITY_BENCH_DAMPEN_LEADER;
  } else if (archetype === 'mercenary' && kind === 'wage') {
    factor = PERSONALITY_WAGE_AMPLIFY_MERCENARY;
  } else if (archetype === 'temperamental' && kind === 'criticism') {
    factor = PERSONALITY_CRITICISM_AMPLIFY_TEMPER;
  } else if (archetype === 'dressingRoomProblem' && baseDelta < 0) {
    factor = PERSONALITY_NEGATIVE_AMPLIFY_PROBLEM;
  }
  const modulated = baseDelta * factor;
  const cap = PERSONALITY_MODIFIER_MAX_MAGNITUDE;
  return Math.max(-cap, Math.min(cap, modulated));
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/morale/personality.test.ts` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/morale/personality.ts src/engine/balance.ts __tests__/engine/morale/personality.test.ts` · msg: `feat(c5): arquétipos de personalidade derivados de atributos + modulador de moral`.

---

## Task 3: `morale-engine` devolve drivers (refactor não-regressão) — TDD

**Files:** Modify `src/engine/morale/morale-engine.ts`, Test `__tests__/engine/morale/morale-engine-drivers.test.ts`.
**Interfaces:** Consumes: `MoraleDriver`, `DriverCtx`, `driver()`. Produces: `computeMatchMoraleDelta(input, ctx): MoraleDriver[]`, `computeWeeklyMoraleDrift(current, ctx): MoraleDriver | null`. `applyMoraleDelta` INALTERADO.

> Não-regressão: para `archetype: 'balanced'`, a SOMA dos drivers deve igualar exatamente o `number` que a versão antiga devolvia (mesmos valores de `balance.ts:88-95`).

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/morale/morale-engine-drivers.test.ts`:
```ts
import { computeMatchMoraleDelta, computeWeeklyMoraleDrift } from '@/engine/morale/morale-engine';
import { sumDrivers } from '@/engine/morale/driver-ledger';
import {
  MORALE_WIN_BONUS, MORALE_LOSS_PENALTY, MORALE_BENCH_PENALTY,
  MORALE_BENCH_STREAK_EXTRA, MORALE_HEAVY_DEFEAT_EXTRA, MORALE_DRIFT_TARGET, MORALE_DRIFT_RATE,
} from '@/engine/balance';

const ctx = { season: 1, week: 5, archetype: 'balanced' as const };

it('win → driver matchWin somando ao bônus antigo', () => {
  const ds = computeMatchMoraleDelta({ result: 'win', played: true, minutesPlayed: 90, goalDiff: 1, benchStreakWeeks: 0 }, ctx);
  expect(ds.map((d) => d.kind)).toContain('matchWin');
  expect(sumDrivers(ds)).toBe(MORALE_WIN_BONUS);
});

it('goleada sofrida → matchLoss + heavyDefeat somando ao antigo', () => {
  const ds = computeMatchMoraleDelta({ result: 'loss', played: true, minutesPlayed: 90, goalDiff: -3, benchStreakWeeks: 0 }, ctx);
  expect(ds.map((d) => d.kind).sort()).toEqual(['heavyDefeat', 'matchLoss']);
  expect(sumDrivers(ds)).toBe(MORALE_LOSS_PENALTY + MORALE_HEAVY_DEFEAT_EXTRA);
});

it('banco com streak → benched + benchStreak', () => {
  const ds = computeMatchMoraleDelta({ result: 'win', played: false, minutesPlayed: 0, goalDiff: 1, benchStreakWeeks: 4 }, ctx);
  expect(sumDrivers(ds)).toBe(MORALE_BENCH_PENALTY + 4 * MORALE_BENCH_STREAK_EXTRA);
  expect(ds.map((d) => d.kind)).toContain('benched');
});

it('drift idle devolve driver idleDrift ou null quando já no alvo', () => {
  const d = computeWeeklyMoraleDrift(30, ctx);
  expect(d?.kind).toBe('idleDrift');
  expect(d?.delta).toBeCloseTo((MORALE_DRIFT_TARGET - 30) * MORALE_DRIFT_RATE);
  expect(computeWeeklyMoraleDrift(MORALE_DRIFT_TARGET, ctx)).toBeNull();
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/morale/morale-engine-drivers.test.ts` → erro de tipo/assinatura (computeMatchMoraleDelta ainda devolve number, sem 2º arg).
- [ ] **Step 3 — implementar.** Substituir `src/engine/morale/morale-engine.ts` por:
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
import { driver, MoraleDriver, DriverCtx } from './driver-ledger';

export interface MatchMoraleInput {
  result: 'win' | 'draw' | 'loss';
  played: boolean;
  minutesPlayed: number;
  goalDiff: number; // from this player's club POV (positive = won by N)
  benchStreakWeeks: number;
}

/** Pure: morale change from one matchday, decomposed into drivers. */
export function computeMatchMoraleDelta(input: MatchMoraleInput, ctx: DriverCtx): MoraleDriver[] {
  if (!input.played) {
    const drivers: MoraleDriver[] = [driver('benched', MORALE_BENCH_PENALTY, ctx)];
    if (input.benchStreakWeeks > 0) {
      drivers.push(driver('benchStreak', input.benchStreakWeeks * MORALE_BENCH_STREAK_EXTRA, ctx));
    }
    return drivers;
  }
  const drivers: MoraleDriver[] = [];
  if (input.result === 'win') drivers.push(driver('matchWin', MORALE_WIN_BONUS, ctx));
  else if (input.result === 'loss') drivers.push(driver('matchLoss', MORALE_LOSS_PENALTY, ctx));
  else drivers.push(driver('matchDraw', MORALE_DRAW_DELTA, ctx));

  if (input.result === 'loss' && input.goalDiff <= -3) {
    drivers.push(driver('heavyDefeat', MORALE_HEAVY_DEFEAT_EXTRA, ctx));
  }
  return drivers;
}

/** Pure: idle-week regression toward MORALE_DRIFT_TARGET. null when already at target. */
export function computeWeeklyMoraleDrift(currentMorale: number, ctx: DriverCtx): MoraleDriver | null {
  const delta = (MORALE_DRIFT_TARGET - currentMorale) * MORALE_DRIFT_RATE;
  if (delta === 0) return null;
  return driver('idleDrift', delta, ctx);
}

/** Pure: apply a delta, round to int, clamp to the schema's [1,100] CHECK. INALTERADO. */
export function applyMoraleDelta(current: number, delta: number): number {
  return Math.max(1, Math.min(100, Math.round(current + delta)));
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/morale/morale-engine-drivers.test.ts` → verde. (Os call-sites do game-loop quebram tsc — serão corrigidos na Task 8; **não rodar `tsc` global ainda**, rodar só o jest deste arquivo.)
- [ ] **Step 5 — commit:** `git add src/engine/morale/morale-engine.ts __tests__/engine/morale/morale-engine-drivers.test.ts` · msg: `refactor(c5): morale-engine devolve MoraleDriver[] (decomposição sem regressão de valores)`.

---

## Task 4: Química (`computeChemistryGroups` + `chemistryDriftBonus`) — TDD

**Files:** Create `src/engine/morale/chemistry.ts`, Modify `src/engine/balance.ts`, Test `__tests__/engine/morale/chemistry.test.ts`.
**Interfaces:** Consumes: `SeededRng`. Produces: `ChemistryMember`, `ChemistryGroup`, `computeChemistryGroups()`, `chemistryDriftBonus()`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/morale/chemistry.test.ts`:
```ts
import { computeChemistryGroups, chemistryDriftBonus, ChemistryMember } from '@/engine/morale/chemistry';
import { SeededRng } from '@/engine/rng';

const make = (id: number, nat: string, age: number, sea: number, mor: number): ChemistryMember =>
  ({ id, nationality: nat, age, seasonsAtClub: sea, morale: mor });

it('elenco vazio → []', () => {
  expect(computeChemistryGroups([], new SeededRng(1))).toEqual([]);
});

it('determinístico: mesma seed → mesmos grupos', () => {
  const squad = [make(1,'BR',24,3,70), make(2,'BR',25,3,72), make(3,'AR',30,1,40), make(4,'IT',31,1,42)];
  const a = computeChemistryGroups(squad, new SeededRng(99));
  const b = computeChemistryGroups(squad, new SeededRng(99));
  expect(a).toEqual(b);
});

it('coesão sobe com nacionalidade/idade compartilhadas', () => {
  const homogeneo = [make(1,'BR',24,3,70), make(2,'BR',24,3,70), make(3,'BR',25,3,70)];
  const heterogeneo = [make(1,'BR',19,0,70), make(2,'AR',34,6,70), make(3,'IT',28,2,70)];
  const ch = computeChemistryGroups(homogeneo, new SeededRng(7));
  const he = computeChemistryGroups(heterogeneo, new SeededRng(7));
  const avg = (gs: {cohesion:number}[]) => gs.reduce((s,g)=>s+g.cohesion,0)/Math.max(1,gs.length);
  expect(avg(ch)).toBeGreaterThan(avg(he));
});

it('chemistryDriftBonus: grupo feliz puxa p/ cima, membro infeliz arrasta', () => {
  const happy = { memberIds: [1,2,3], cohesion: 0.9 };
  const happyMember = make(2,'BR',24,3,78);
  expect(chemistryDriftBonus(happy, happyMember)).toBeGreaterThan(0);
  const sadMember = make(2,'BR',24,3,20);
  expect(chemistryDriftBonus(happy, sadMember)).toBeLessThan(0);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/morale/chemistry.test.ts` → `Cannot find module`.
- [ ] **Step 3 — implementar.** Em `balance.ts`, após o bloco `PERSONALITY_*`:
```ts
// ─── C5: Psicologia — química de cliques ──────────────────────────────────────
export const CHEMISTRY_MAX_GROUPS = 3;            // até N cliques por elenco
export const CHEMISTRY_AFF_NATIONALITY = 0.4;     // peso de nacionalidade compartilhada
export const CHEMISTRY_AFF_AGE_BAND = 0.3;        // peso de faixa etária próxima (<=3 anos)
export const CHEMISTRY_AFF_TENURE = 0.3;          // peso de tempo de casa próximo
export const CHEMISTRY_DRIFT_HAPPY = 75;          // moral do membro acima disto → grupo puxa p/ cima
export const CHEMISTRY_DRIFT_SAD = 35;            // abaixo disto → grupo arrasta p/ baixo
export const CHEMISTRY_DRIFT_MAX_BONUS = 1.5;     // |bônus| máximo por semana
```
Criar `src/engine/morale/chemistry.ts`:
```ts
import { SeededRng } from '@/engine/rng';
import {
  CHEMISTRY_MAX_GROUPS,
  CHEMISTRY_AFF_NATIONALITY,
  CHEMISTRY_AFF_AGE_BAND,
  CHEMISTRY_AFF_TENURE,
  CHEMISTRY_DRIFT_HAPPY,
  CHEMISTRY_DRIFT_SAD,
  CHEMISTRY_DRIFT_MAX_BONUS,
} from '@/engine/balance';

export interface ChemistryMember {
  id: number;
  nationality: string;
  age: number;
  seasonsAtClub: number;
  morale: number;
}

export interface ChemistryGroup {
  memberIds: number[];
  cohesion: number; // 0..1
}

function affinity(a: ChemistryMember, b: ChemistryMember): number {
  let aff = 0;
  if (a.nationality === b.nationality) aff += CHEMISTRY_AFF_NATIONALITY;
  if (Math.abs(a.age - b.age) <= 3) aff += CHEMISTRY_AFF_AGE_BAND;
  if (Math.abs(a.seasonsAtClub - b.seasonsAtClub) <= 1) aff += CHEMISTRY_AFF_TENURE;
  return aff; // 0..1
}

/**
 * Pure & deterministic (rng seedado): particiona o elenco em até CHEMISTRY_MAX_GROUPS
 * cliques. Seed embaralha a ordem de seeds dos grupos; a atribuição é greedy por afinidade
 * média ao grupo. Cohesion = afinidade média intragrupo.
 */
export function computeChemistryGroups(members: readonly ChemistryMember[], rng: SeededRng): ChemistryGroup[] {
  if (members.length === 0) return [];
  const order = rng.shuffle([...members]);
  const groupCount = Math.max(1, Math.min(CHEMISTRY_MAX_GROUPS, Math.ceil(order.length / 6)));
  const buckets: ChemistryMember[][] = Array.from({ length: groupCount }, () => []);
  for (const m of order) {
    // escolhe o bucket com maior afinidade média (vazio = 0); empate → menor índice (determinístico)
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const score = b.length === 0 ? 0 : b.reduce((s, x) => s + affinity(m, x), 0) / b.length;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    buckets[best].push(m);
  }
  return buckets
    .filter((b) => b.length > 0)
    .map((b) => {
      let pairs = 0;
      let sum = 0;
      for (let i = 0; i < b.length; i++) {
        for (let j = i + 1; j < b.length; j++) { sum += affinity(b[i], b[j]); pairs++; }
      }
      const cohesion = pairs === 0 ? 0.5 : sum / pairs; // solo group = neutral cohesion
      return { memberIds: b.map((x) => x.id).sort((a, c) => a - c), cohesion };
    });
}

/** Pure: bônus/penalidade de drift que o grupo aplica ao membro nesta semana. */
export function chemistryDriftBonus(group: ChemistryGroup, member: ChemistryMember): number {
  let raw = 0;
  if (member.morale >= CHEMISTRY_DRIFT_HAPPY) raw = group.cohesion * CHEMISTRY_DRIFT_MAX_BONUS;
  else if (member.morale <= CHEMISTRY_DRIFT_SAD) raw = -group.cohesion * CHEMISTRY_DRIFT_MAX_BONUS;
  return Math.max(-CHEMISTRY_DRIFT_MAX_BONUS, Math.min(CHEMISTRY_DRIFT_MAX_BONUS, raw));
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/morale/chemistry.test.ts` → verde. `npx tsc --noEmit` (ainda quebra só em game-loop — ok; rodar jest do arquivo).
- [ ] **Step 5 — commit:** `git add src/engine/morale/chemistry.ts src/engine/balance.ts __tests__/engine/morale/chemistry.test.ts` · msg: `feat(c5): química de cliques determinística + bônus de drift por grupo`.

---

## Task 5: Máquina de fallout (`nextFalloutState`) — TDD

**Files:** Create `src/engine/morale/fallout.ts`, Modify `src/engine/balance.ts`, Test `__tests__/engine/morale/fallout.test.ts`.
**Interfaces:** Consumes: `PersonalityArchetype`. Produces: `FalloutState`, `FalloutInput`, `nextFalloutState()`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/morale/fallout.test.ts`:
```ts
import { nextFalloutState, FalloutInput } from '@/engine/morale/fallout';

const base: FalloutInput = { current: 'none', morale: 30, lowStreakWeeks: 3, archetype: 'temperamental', recentCriticisms: 0 };

it('none→unsettled com streak baixo + arquétipo de risco', () => {
  expect(nextFalloutState(base)).toBe('unsettled');
});

it('arquétipo estável (professional) não escala mesmo com streak', () => {
  expect(nextFalloutState({ ...base, archetype: 'professional' })).toBe('none');
});

it('unsettled→wantsOut com criticism repetida', () => {
  expect(nextFalloutState({ ...base, current: 'unsettled', recentCriticisms: 2 })).toBe('wantsOut');
});

it('unsettled NÃO vira wantsOut sem criticism suficiente', () => {
  expect(nextFalloutState({ ...base, current: 'unsettled', recentCriticisms: 0 })).toBe('unsettled');
});

it('histerese: só regride a none com moral bem acima do alvo', () => {
  expect(nextFalloutState({ current: 'wantsOut', morale: 55, lowStreakWeeks: 0, archetype: 'temperamental', recentCriticisms: 0 })).toBe('wantsOut');
  expect(nextFalloutState({ current: 'wantsOut', morale: 80, lowStreakWeeks: 0, archetype: 'temperamental', recentCriticisms: 0 })).toBe('none');
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/morale/fallout.test.ts` → `Cannot find module`.
- [ ] **Step 3 — implementar.** Em `balance.ts`, após o bloco `CHEMISTRY_*`:
```ts
// ─── C5: Psicologia — conflito / fallout (máquina de estados por jogador) ──────
export const FALLOUT_RISK_ARCHETYPES: readonly string[] = ['temperamental', 'mercenary', 'dressingRoomProblem'];
export const FALLOUT_STREAK_TO_UNSETTLE = 3;        // semanas de moral baixa p/ ficar inquieto
export const FALLOUT_CRITICISMS_TO_WANT_OUT = 2;    // críticas recentes p/ pedir p/ sair
export const FALLOUT_RECOVERY_MORALE = 70;          // moral acima disto regride o estado (histerese)
```
Criar `src/engine/morale/fallout.ts`:
```ts
import type { PersonalityArchetype } from './personality';
import {
  FALLOUT_RISK_ARCHETYPES,
  FALLOUT_STREAK_TO_UNSETTLE,
  FALLOUT_CRITICISMS_TO_WANT_OUT,
  FALLOUT_RECOVERY_MORALE,
} from '@/engine/balance';

export type FalloutState = 'none' | 'unsettled' | 'wantsOut';

export interface FalloutInput {
  current: FalloutState;
  morale: number;
  lowStreakWeeks: number;
  archetype: PersonalityArchetype;
  recentCriticisms: number;
}

/**
 * Pure: máquina de estados de conflito com histerese (escala lento, regride só com
 * moral bem acima do alvo p/ evitar flip-flop e venda forçada acidental).
 */
export function nextFalloutState(input: FalloutInput): FalloutState {
  const atRisk = FALLOUT_RISK_ARCHETYPES.includes(input.archetype);

  // Recuperação: moral alta zera o conflito a partir de qualquer estado.
  if (input.morale >= FALLOUT_RECOVERY_MORALE) return 'none';

  if (input.current === 'wantsOut') return 'wantsOut'; // pegajoso até recuperar
  if (input.current === 'unsettled') {
    return input.recentCriticisms >= FALLOUT_CRITICISMS_TO_WANT_OUT ? 'wantsOut' : 'unsettled';
  }
  // current === 'none'
  if (atRisk && input.lowStreakWeeks >= FALLOUT_STREAK_TO_UNSETTLE) return 'unsettled';
  return 'none';
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/morale/fallout.test.ts` → verde. `npx tsc --noEmit` (ok exceto game-loop).
- [ ] **Step 5 — commit:** `git add src/engine/morale/fallout.ts src/engine/balance.ts __tests__/engine/morale/fallout.test.ts` · msg: `feat(c5): máquina de estados de fallout (none→unsettled→wantsOut) com histerese`.

---

## Task 6: Schema + migração + tipo Player

**Files:** Modify `src/database/schema.ts`, `src/store/database-store.ts`, `src/types/player.ts`, `src/database/queries/players.ts`. (Sem teste dedicado nesta task — coberto pela Task 7 com SQLite real.)
**Interfaces:** Produces: colunas `players.personality`/`players.fallout_state`, tabelas `morale_events`/`chemistry_links`, índices; `Player.personality`/`Player.falloutState`.

- [ ] **Step 1 — schema (saves novos).** Em `src/database/schema.ts`, dentro do `CREATE TABLE players`, após `last_interaction_week INTEGER` (`:107`), adicionar antes do `);`:
```sql
  ,personality   TEXT NOT NULL DEFAULT 'balanced'
  ,fallout_state TEXT NOT NULL DEFAULT 'none'
```
Após o bloco `CREATE TABLE news_items` (perto de `:529`), adicionar as tabelas:
```sql
CREATE TABLE IF NOT EXISTS morale_events (
  id        INTEGER PRIMARY KEY,
  save_id   INTEGER NOT NULL REFERENCES save_games(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  kind      TEXT    NOT NULL,
  delta     REAL    NOT NULL,
  season    INTEGER NOT NULL,
  week      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chemistry_links (
  id        INTEGER PRIMARY KEY,
  save_id   INTEGER NOT NULL REFERENCES save_games(id),
  club_id   INTEGER NOT NULL REFERENCES clubs(id),
  group_idx INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(id),
  cohesion  REAL    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_morale_events_player ON morale_events(save_id, player_id, season, week);
CREATE INDEX IF NOT EXISTS idx_chem_links_club      ON chemistry_links(save_id, club_id);
```
- [ ] **Step 2 — migração (saves antigos).** Em `src/store/database-store.ts`, antes de `await migrateSaveIdAsync(db);` (`:310`), adicionar:
```ts
      await addColumnIfMissing(db, 'players', 'personality',   "TEXT NOT NULL DEFAULT 'balanced'");
      await addColumnIfMissing(db, 'players', 'fallout_state', "TEXT NOT NULL DEFAULT 'none'");
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS morale_events (
          id        INTEGER PRIMARY KEY,
          save_id   INTEGER NOT NULL REFERENCES save_games(id),
          player_id INTEGER NOT NULL REFERENCES players(id),
          kind      TEXT    NOT NULL,
          delta     REAL    NOT NULL,
          season    INTEGER NOT NULL,
          week      INTEGER NOT NULL
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS chemistry_links (
          id        INTEGER PRIMARY KEY,
          save_id   INTEGER NOT NULL REFERENCES save_games(id),
          club_id   INTEGER NOT NULL REFERENCES clubs(id),
          group_idx INTEGER NOT NULL,
          player_id INTEGER NOT NULL REFERENCES players(id),
          cohesion  REAL    NOT NULL
        );
      `);
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_morale_events_player ON morale_events(save_id, player_id, season, week);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_chem_links_club ON chemistry_links(save_id, club_id);');
```
- [ ] **Step 3 — tipo Player.** Em `src/types/player.ts`, importar os tipos no topo e estender `Player`:
```ts
import type { PersonalityArchetype } from '@/engine/morale/personality';
import type { FalloutState } from '@/engine/morale/fallout';
```
E após `willRetireAtSeasonEnd: boolean;` (`:55`):
```ts
  personality: PersonalityArchetype;
  falloutState: FalloutState;
```
- [ ] **Step 4 — mapear em rowToPlayer.** Em `src/database/queries/players.ts`: adicionar a `PlayerRow` (perto de `:20`) `personality: string;` e `fallout_state: string;`; em `rowToPlayer` (localizar a função que monta o `Player`), adicionar:
```ts
    personality: (row.personality ?? 'balanced') as Player['personality'],
    falloutState: (row.fallout_state ?? 'none') as Player['falloutState'],
```
- [ ] **Step 5 — rodar:** `npx jest __tests__/database` → suíte de DB existente verde (schema válido; saves antigos migram). `npx tsc --noEmit` (game-loop ainda pendente — ok).
- [ ] **Step 6 — commit:** `git add src/database/schema.ts src/store/database-store.ts src/types/player.ts src/database/queries/players.ts` · msg: `feat(c5): schema+migração de personality/fallout_state, morale_events, chemistry_links`.

---

## Task 7: Queries `morale.ts` (ledger/chemistry/personality/fallout) — TDD, SQLite real

**Files:** Create `src/database/queries/morale.ts`, Test `__tests__/database/queries/morale-queries.test.ts`.
**Interfaces:** Consumes: `DbHandle`, `MoraleDriver`, `MoraleDriverKind`, `PersonalityArchetype`, `FalloutState`, `ChemistryGroup`. Produces: as 8 funções do Contract.

> Usar o helper de seed de DB padrão de `__tests__/database/queries/` (mesmo padrão de `interactions`/`staff-hire`: `better-sqlite3` em memória + `SCHEMA_SQL`). Ler um teste vizinho em `__tests__/database/queries/` para o setup exato (`createTestDb`/`seedTestDb` + `TEST_SAVE_ID`).

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/morale-queries.test.ts`:
```ts
import Database from 'better-sqlite3';
import { SCHEMA_SQL, SAVE_ID_INDEXES_SQL } from '@/database/schema';
import {
  appendMoraleEvents, getMoraleEvents, pruneMoraleEvents,
  setPlayerPersonality, setFalloutState, replaceChemistryLinks, getChemistryGroups,
} from '@/database/queries/morale';
import { MoraleDriver } from '@/engine/morale/driver-ledger';

// Adapter síncrono p/ o DbHandle async usado nas queries.
function handle(raw: any) {
  return {
    prepare(sql: string) {
      const st = raw.prepare(sql);
      return {
        async all(...p: unknown[]) { return st.all(...p); },
        async get(...p: unknown[]) { return st.get(...p); },
        async run(...p: unknown[]) { const r = st.run(...p); return { lastInsertRowid: r.lastInsertRowid }; },
      };
    },
  };
}

function setup() {
  const raw = new Database(':memory:');
  raw.exec(SCHEMA_SQL);
  raw.exec(SAVE_ID_INDEXES_SQL);
  raw.exec("INSERT INTO save_games (id, name, current_season, current_week, seed) VALUES (1,'A',1,1,123),(2,'B',1,1,456)");
  raw.exec("INSERT INTO clubs (id, save_id, name, league_id, reputation, budget, wage_budget) VALUES (10,1,'CA',1,70,1000000,200000)");
  // jogador mínimo p/ FKs do morale_events (apenas colunas NOT NULL)
  raw.exec(`INSERT INTO players (id, save_id, name, nationality, age, position, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness)
            VALUES (100,1,'P1','BR',25,'ST',1000,2,1000000,80,80,60,90)`);
  return handle(raw);
}

const d = (kind: any, delta: number, season: number, week: number): MoraleDriver => ({ kind, delta, season, week });

it('append/get respeita save_id e ordem', async () => {
  const db = setup();
  await appendMoraleEvents(db, 1, 100, [d('matchWin', 3, 1, 1), d('chemistry', 1.2, 1, 2)]);
  const got = await getMoraleEvents(db, 1, 100, 10);
  expect(got).toHaveLength(2);
  expect(got[0].kind).toBe('chemistry'); // mais recente primeiro (season/week desc)
  // outro save não enxerga
  expect(await getMoraleEvents(db, 2, 100, 10)).toHaveLength(0);
});

it('pruneMoraleEvents mantém só keepSeasons', async () => {
  const db = setup();
  await appendMoraleEvents(db, 1, 100, [d('matchWin', 3, 1, 1), d('matchLoss', -4, 2, 1), d('teamTalk', 2, 3, 1)]);
  await pruneMoraleEvents(db, 1, 2, 3); // currentSeason=3, keep 2 → mantém seasons 2 e 3
  const got = await getMoraleEvents(db, 1, 100, 10);
  expect(got.map((x) => x.season).sort()).toEqual([2, 3]);
});

it('setPlayerPersonality/setFalloutState persistem e isolam por save', async () => {
  const db = setup();
  await setPlayerPersonality(db, 1, 100, 'leader');
  await setFalloutState(db, 1, 100, 'unsettled');
  const row = await db.prepare('SELECT personality, fallout_state FROM players WHERE save_id=? AND id=?').get(1, 100) as any;
  expect(row.personality).toBe('leader');
  expect(row.fallout_state).toBe('unsettled');
});

it('replace/getChemistryGroups substitui e isola por clube/save', async () => {
  const db = setup();
  await replaceChemistryLinks(db, 1, 10, [{ memberIds: [100], cohesion: 0.8 }]);
  let groups = await getChemistryGroups(db, 1, 10);
  expect(groups).toEqual([{ memberIds: [100], cohesion: 0.8 }]);
  await replaceChemistryLinks(db, 1, 10, []); // substitui por vazio
  groups = await getChemistryGroups(db, 1, 10);
  expect(groups).toEqual([]);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/morale-queries.test.ts` → `Cannot find module '@/database/queries/morale'`.
- [ ] **Step 3 — implementar** `src/database/queries/morale.ts`:
```ts
import type { DbHandle } from './players';
import type { MoraleDriver, MoraleDriverKind } from '@/engine/morale/driver-ledger';
import type { PersonalityArchetype } from '@/engine/morale/personality';
import type { FalloutState } from '@/engine/morale/fallout';
import type { ChemistryGroup } from '@/engine/morale/chemistry';

export async function appendMoraleEvents(
  db: DbHandle, saveId: number, playerId: number, drivers: readonly MoraleDriver[],
): Promise<void> {
  for (const d of drivers) {
    await db
      .prepare('INSERT INTO morale_events (save_id, player_id, kind, delta, season, week) VALUES (?, ?, ?, ?, ?, ?)')
      .run(saveId, playerId, d.kind, d.delta, d.season, d.week);
  }
}

export async function getMoraleEvents(
  db: DbHandle, saveId: number, playerId: number, limit: number,
): Promise<MoraleDriver[]> {
  const rows = (await db
    .prepare(
      'SELECT kind, delta, season, week FROM morale_events WHERE save_id = ? AND player_id = ? ORDER BY season DESC, week DESC, id DESC LIMIT ?',
    )
    .all(saveId, playerId, limit)) as Array<{ kind: string; delta: number; season: number; week: number }>;
  return rows.map((r) => ({ kind: r.kind as MoraleDriverKind, delta: r.delta, season: r.season, week: r.week }));
}

export async function pruneMoraleEvents(
  db: DbHandle, saveId: number, keepSeasons: number, currentSeason: number,
): Promise<void> {
  const cutoff = currentSeason - keepSeasons + 1;
  await db.prepare('DELETE FROM morale_events WHERE save_id = ? AND season < ?').run(saveId, cutoff);
}

export async function setPlayerPersonality(
  db: DbHandle, saveId: number, playerId: number, p: PersonalityArchetype,
): Promise<void> {
  await db.prepare('UPDATE players SET personality = ? WHERE save_id = ? AND id = ?').run(p, saveId, playerId);
}

export async function setFalloutState(
  db: DbHandle, saveId: number, playerId: number, s: FalloutState,
): Promise<void> {
  await db.prepare('UPDATE players SET fallout_state = ? WHERE save_id = ? AND id = ?').run(s, saveId, playerId);
}

/** Conta críticas (kind='criticism') registradas no ledger desde (sinceSeason, sinceWeek) inclusive. */
export async function countRecentCriticisms(
  db: DbHandle, saveId: number, playerId: number, sinceSeason: number, sinceWeek: number,
): Promise<number> {
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM morale_events
        WHERE save_id = ? AND player_id = ? AND kind = 'criticism'
          AND (season > ? OR (season = ? AND week >= ?))`,
    )
    .get(saveId, playerId, sinceSeason, sinceSeason, sinceWeek)) as { n: number };
  return row.n;
}

export async function replaceChemistryLinks(
  db: DbHandle, saveId: number, clubId: number, groups: readonly ChemistryGroup[],
): Promise<void> {
  await db.prepare('DELETE FROM chemistry_links WHERE save_id = ? AND club_id = ?').run(saveId, clubId);
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    for (const pid of g.memberIds) {
      await db
        .prepare('INSERT INTO chemistry_links (save_id, club_id, group_idx, player_id, cohesion) VALUES (?, ?, ?, ?, ?)')
        .run(saveId, clubId, gi, pid, g.cohesion);
    }
  }
}

export async function getChemistryGroups(
  db: DbHandle, saveId: number, clubId: number,
): Promise<ChemistryGroup[]> {
  const rows = (await db
    .prepare(
      'SELECT group_idx, player_id, cohesion FROM chemistry_links WHERE save_id = ? AND club_id = ? ORDER BY group_idx, player_id',
    )
    .all(saveId, clubId)) as Array<{ group_idx: number; player_id: number; cohesion: number }>;
  const byIdx = new Map<number, ChemistryGroup>();
  for (const r of rows) {
    let g = byIdx.get(r.group_idx);
    if (!g) { g = { memberIds: [], cohesion: r.cohesion }; byIdx.set(r.group_idx, g); }
    g.memberIds.push(r.player_id);
  }
  return [...byIdx.keys()].sort((a, b) => a - b).map((k) => byIdx.get(k)!);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/queries/morale-queries.test.ts` → verde.
- [ ] **Step 5 — commit:** `git add src/database/queries/morale.ts __tests__/database/queries/morale-queries.test.ts` · msg: `feat(c5): queries save-isoladas do ledger de moral + química + personalidade/fallout`.

---

## Task 8: Orquestrador + wiring no game-loop — TDD, SQLite real

**Files:** Create `src/engine/morale/psychology-orchestrator.ts`, Modify `src/engine/game-loop.ts`, Modify `src/engine/balance.ts`, Test `__tests__/engine/morale/psychology-orchestrator.test.ts`.
**Interfaces:** Consumes: tudo das Tasks 1-7 + `getPlayersByClub`, `updatePlayerMorale`, `insertNewsItem`. Produces: `applyMatchPsychology()`, `applyWeeklyPsychology()`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/morale/psychology-orchestrator.test.ts` (mesmo adapter+setup da Task 7, com 2-3 jogadores no clube 10; seedar `personality` via `setPlayerPersonality`):
```ts
// ...imports do adapter/setup como na Task 7, exportando `handle` e um seed local...
import { applyMatchPsychology, applyWeeklyPsychology } from '@/engine/morale/psychology-orchestrator';
import { getMoraleEvents, getChemistryGroups } from '@/database/queries/morale';
import { SeededRng } from '@/engine/rng';

it('applyMatchPsychology atualiza moral E grava drivers que somam ao delta', async () => {
  const db = setupSquad(); // clube 10, players 100(starting),101(banco), morale 60
  await applyMatchPsychology(db, 1, 10, { outcome: 'win', goalDiff: 2, startingIds: new Set([100]) }, 1, 5);
  const m100 = await db.prepare('SELECT morale FROM players WHERE id=100').get() as any;
  expect(m100.morale).toBeGreaterThan(60);                 // titular ganhou com a vitória
  const ev100 = await getMoraleEvents(db, 1, 100, 10);
  expect(ev100.some((e) => e.kind === 'matchWin')).toBe(true);
  const ev101 = await getMoraleEvents(db, 1, 101, 10);
  expect(ev101.some((e) => e.kind === 'benched')).toBe(true); // suplente foi pro banco
});

it('applyWeeklyPsychology grava chemistry_links, escala fallout, marca wantsOut e retorna ids', async () => {
  const db = setupSquad();
  // força cenário de fallout: jogador 100 temperamental, moral baixa, streak alto, 2 críticas no ledger
  await db.prepare("UPDATE players SET personality='temperamental', morale=20, consecutive_low_morale_weeks=5 WHERE id=100").run();
  await db.prepare("INSERT INTO morale_events (save_id,player_id,kind,delta,season,week) VALUES (1,100,'criticism',-3,1,3),(1,100,'criticism',-3,1,4)").run();
  const out = await applyWeeklyPsychology(db, 1, 10, 1, 5, new SeededRng(42));
  expect(out.newlyWantsOut).toContain(100);
  const p100 = await db.prepare('SELECT fallout_state, is_transfer_listed FROM players WHERE id=100').get() as any;
  expect(p100.fallout_state).toBe('wantsOut');
  expect(p100.is_transfer_listed).toBe(1);
  const groups = await getChemistryGroups(db, 1, 10);
  expect(groups.length).toBeGreaterThan(0);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/morale/psychology-orchestrator.test.ts` → `Cannot find module`.
- [ ] **Step 3 — implementar.** Em `balance.ts`, após o bloco `FALLOUT_*`:
```ts
export const MORALE_EVENTS_KEEP_SEASONS = 2; // janela do ledger podada no rollover
export const FALLOUT_CRITICISM_LOOKBACK_WEEKS = 8; // janela p/ contar críticas recentes
```
Criar `src/engine/morale/psychology-orchestrator.ts`:
```ts
import type { DbHandle } from '@/database/queries/players';
import { getPlayersByClub, updatePlayerMorale } from '@/database/queries/players';
import { insertNewsItem } from '@/database/queries/news';
import { SeededRng } from '@/engine/rng';
import { computeMatchMoraleDelta, computeWeeklyMoraleDrift, applyMoraleDelta } from './morale-engine';
import { driver, sumDrivers, MoraleDriver, DriverCtx } from './driver-ledger';
import { personalityMoraleModifier, PersonalityArchetype } from './personality';
import { computeChemistryGroups, chemistryDriftBonus, ChemistryMember } from './chemistry';
import { nextFalloutState, FalloutState } from './fallout';
import {
  appendMoraleEvents, replaceChemistryLinks, setFalloutState, countRecentCriticisms,
} from '@/database/queries/morale';
import { FALLOUT_CRITICISM_LOOKBACK_WEEKS } from '@/engine/balance';

/** Aplica o modificador de personalidade a cada driver (preservando kind/season/week). */
function modulate(drivers: readonly MoraleDriver[], archetype: PersonalityArchetype): MoraleDriver[] {
  return drivers.map((d) => ({ ...d, delta: personalityMoraleModifier(archetype, d.kind, d.delta) }));
}

export async function applyMatchPsychology(
  db: DbHandle,
  saveId: number,
  clubId: number,
  matchInput: { outcome: 'win' | 'draw' | 'loss'; goalDiff: number; startingIds: Set<number> },
  season: number,
  week: number,
): Promise<void> {
  const squad = await getPlayersByClub(db, saveId, clubId);
  for (const p of squad) {
    const ctx: DriverCtx = { season, week, archetype: p.personality };
    const played = matchInput.startingIds.has(p.id);
    const raw = computeMatchMoraleDelta(
      {
        result: matchInput.outcome,
        played,
        minutesPlayed: played ? 90 : 0,
        goalDiff: matchInput.goalDiff,
        benchStreakWeeks: played ? 0 : (p.consecutiveLowMoraleWeeks ?? 0),
      },
      ctx,
    );
    const drivers = modulate(raw, p.personality);
    const next = applyMoraleDelta(p.morale, sumDrivers(drivers));
    if (next !== p.morale) await updatePlayerMorale(db, saveId, p.id, next);
    if (drivers.length > 0) await appendMoraleEvents(db, saveId, p.id, drivers);
  }
}

export async function applyWeeklyPsychology(
  db: DbHandle,
  saveId: number,
  clubId: number,
  season: number,
  week: number,
  rng: SeededRng,
): Promise<{ newlyWantsOut: number[] }> {
  const squad = await getPlayersByClub(db, saveId, clubId);
  const newlyWantsOut: number[] = [];

  // 1. Química do elenco nesta semana → persistir grafo.
  const members: ChemistryMember[] = squad.map((p) => ({
    id: p.id,
    nationality: p.nationality,
    age: p.age,
    seasonsAtClub: Math.max(0, p.contractEnd - season), // proxy de tempo de casa via contrato
    morale: p.morale,
  }));
  const groups = computeChemistryGroups(members, rng);
  await replaceChemistryLinks(db, saveId, clubId, groups);
  const groupByMember = new Map<number, (typeof groups)[number]>();
  for (const g of groups) for (const id of g.memberIds) groupByMember.set(id, g);

  // 2. Por jogador: drift idle + bônus de química → drivers; depois fallout.
  const lookbackWeek = Math.max(1, week - FALLOUT_CRITICISM_LOOKBACK_WEEKS);
  const lookbackSeason = week - FALLOUT_CRITICISM_LOOKBACK_WEEKS < 1 ? season - 1 : season;
  for (const p of squad) {
    const ctx: DriverCtx = { season, week, archetype: p.personality };
    const drivers: MoraleDriver[] = [];
    const drift = computeWeeklyMoraleDrift(p.morale, ctx);
    if (drift) drivers.push({ ...drift, delta: personalityMoraleModifier(p.personality, drift.kind, drift.delta) });
    const grp = groupByMember.get(p.id);
    const member = members.find((m) => m.id === p.id)!;
    if (grp) {
      const bonus = chemistryDriftBonus(grp, member);
      if (bonus !== 0) drivers.push(driver('chemistry', bonus, ctx));
    }
    const total = sumDrivers(drivers);
    const next = applyMoraleDelta(p.morale, total);
    if (next !== p.morale) await updatePlayerMorale(db, saveId, p.id, next);
    if (drivers.length > 0) await appendMoraleEvents(db, saveId, p.id, drivers);

    // 3. Fallout (usa a moral ATUAL pós-update + streak persistido + críticas recentes).
    const recentCriticisms = await countRecentCriticisms(db, saveId, p.id, lookbackSeason, lookbackWeek);
    const nextState: FalloutState = nextFalloutState({
      current: p.falloutState,
      morale: next,
      lowStreakWeeks: p.consecutiveLowMoraleWeeks ?? 0,
      archetype: p.personality,
      recentCriticisms,
    });
    if (nextState !== p.falloutState) {
      await setFalloutState(db, saveId, p.id, nextState);
      if (nextState === 'wantsOut' && p.falloutState !== 'wantsOut') {
        await db.prepare('UPDATE players SET is_transfer_listed = 1 WHERE save_id = ? AND id = ?').run(saveId, p.id);
        await insertNewsItem(db, saveId, {
          season, week, category: 'info',
          titleKey: 'psychology.news_wants_out_title', titleVars: { name: p.name },
          bodyKey: 'psychology.news_wants_out_body', bodyVars: { name: p.name },
          icon: '🚪', priority: 6,
        });
        newlyWantsOut.push(p.id);
      }
    }
  }
  return { newlyWantsOut };
}
```
- [ ] **Step 4 — wiring no game-loop.** Em `src/engine/game-loop.ts`, substituir o bloco `:477-491` pelo orquestrador (importar `applyMatchPsychology` no topo; remover o `import` agora-órfão de `computeMatchMoraleDelta` se não usado em outro lugar):
```ts
    await applyMatchPsychology(
      db, saveId, playerClubId,
      { outcome: matchOutcome, goalDiff, startingIds },
      season, week,
    );
```
E substituir o bloco idle `:721-731` por (importar `applyWeeklyPsychology`; o `rng` deve derivar de `(saveSeed, season, week)` — usar o padrão de derivação já presente no game-loop, ex.: `new SeededRng(saveSeed ^ (season * 100 + week))`):
```ts
  if (!playerFixture) {
    await applyWeeklyPsychology(db, saveId, playerClubId, season, week, new SeededRng(saveSeed ^ (season * 1000 + week)));
  }
```
> A `var saveSeed` deve vir do save (ler como o game-loop obtém o seed; se não houver, usar `saveId` como fallback determinístico). O bloco `7b` (streak SQL) e `7c` (retirement) permanecem INALTERADOS após este ponto. Podar o ledger no rollover: no bloco de season-end (`:805-809`), após o reset de flags, adicionar `await pruneMoraleEvents(db, saveId, MORALE_EVENTS_KEEP_SEASONS, season);` (importar ambos).
- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/engine/morale/psychology-orchestrator.test.ts` → verde. Depois **suíte inteira** `npx jest` (career-loop e2e + balanceamento não podem regredir; os baselines de moral usam `archetype:'balanced'` ⇒ soma idêntica). `npx tsc --noEmit` → exit 0 (game-loop agora compila).
- [ ] **Step 6 — commit:** `git add src/engine/morale/psychology-orchestrator.ts src/engine/game-loop.ts src/engine/balance.ts __tests__/engine/morale/psychology-orchestrator.test.ts` · msg: `feat(c5): orquestrador de psicologia (drivers+química+fallout) plugado no game-loop`.

---

## Task 9: i18n (chaves de drivers/arquétipos/química/fallout/tela)

**Files:** Modify `src/i18n/pt.ts`, `src/i18n/en.ts`. (Sem teste novo; a suíte de paridade i18n existente valida.)
**Interfaces:** Produces: chaves `psychology.*`.

- [ ] **Step 1 — pt.** Adicionar em `src/i18n/pt.ts` (dentro do objeto de traduções):
```ts
  'psychology.title': 'Por que esta moral?',
  'psychology.archetype_leader': 'Líder',
  'psychology.archetype_professional': 'Profissional',
  'psychology.archetype_mercenary': 'Mercenário',
  'psychology.archetype_temperamental': 'Temperamental',
  'psychology.archetype_dressingRoomProblem': 'Problema de vestiário',
  'psychology.archetype_balanced': 'Equilibrado',
  'psychology.driver_matchWin': 'Vitória',
  'psychology.driver_matchLoss': 'Derrota',
  'psychology.driver_matchDraw': 'Empate',
  'psychology.driver_heavyDefeat': 'Goleada sofrida',
  'psychology.driver_benched': 'No banco',
  'psychology.driver_benchStreak': 'Sequência no banco',
  'psychology.driver_idleDrift': 'Semana sem jogo',
  'psychology.driver_praise': 'Elogio',
  'psychology.driver_criticism': 'Crítica',
  'psychology.driver_teamTalk': 'Conversa do elenco',
  'psychology.driver_press': 'Coletiva de imprensa',
  'psychology.driver_wage': 'Salário',
  'psychology.driver_chemistry': 'Química do grupo',
  'psychology.driver_positionUnhappy': 'Posição',
  'psychology.fallout_none': 'Tranquilo',
  'psychology.fallout_unsettled': 'Inquieto',
  'psychology.fallout_wantsOut': 'Quer sair',
  'psychology.chemistry_group': 'Clique ({cohesion}% de coesão)',
  'psychology.empty': 'Nenhum evento de moral recente.',
  'psychology.news_wants_out_title': '{name} quer deixar o clube',
  'psychology.news_wants_out_body': 'O moral de {name} despencou e ele foi colocado na lista de transferências.',
  'psychology.link_why': 'Por que esta moral?',
```
- [ ] **Step 2 — en.** Mesmas chaves em `src/i18n/en.ts` com valores em inglês (paridade: ex. `'psychology.title': 'Why this morale?'`, `'psychology.archetype_leader': 'Leader'`, `'psychology.driver_matchWin': 'Win'`, `'psychology.fallout_wantsOut': 'Wants out'`, `'psychology.news_wants_out_title': '{name} wants to leave the club'`, etc.).
- [ ] **Step 3 — rodar:** `npx jest -t i18n` (ou o nome do teste de paridade) → verde; `npx tsc --noEmit` → exit 0.
- [ ] **Step 4 — commit:** `git add src/i18n/pt.ts src/i18n/en.ts` · msg: `feat(c5): i18n pt/en para drivers, arquétipos, química, fallout e tela "Por quê"`.

---

## Task 10: Tela "Por quê" + link na PlayerDetail + rota

**Files:** Create `src/screens/squad/MoraleBreakdownScreen.tsx`, Modify `src/screens/squad/PlayerDetailScreen.tsx`, Modify navegação (`src/navigation/*`).
**Interfaces:** Consumes: `getMoraleEvents`, `getChemistryGroups`, store de DB, `t()`. Produces: tela `MoraleBreakdown`.

> A tela é leitura pura do ledger. Usar o kit/tokens de `@/theme` (Card/Text/StatBar/EmptyState como o PlayerDetail atual já consome). Validação real é no browser (Step 4).

- [ ] **Step 1 — rota.** Localizar a stack onde `PlayerDetail` está registrado (`grep -rn "PlayerDetail" src/navigation`) e adicionar `MoraleBreakdown: { playerId: number }` ao param list + `<Stack.Screen name="MoraleBreakdown" component={MoraleBreakdownScreen} />`. Importar a tela.
- [ ] **Step 2 — tela.** Criar `src/screens/squad/MoraleBreakdownScreen.tsx`: ler `playerId` da rota, carregar via store `getMoraleEvents(db, saveId, playerId, 20)` + o jogador (personality/falloutState) + `getChemistryGroups`. Renderizar: badge do arquétipo (`psychology.archetype_<x>`), estado de fallout (`psychology.fallout_<x>`), lista de drivers (cada linha: ícone/label `psychology.driver_<kind>` + delta com sinal e cor por sinal via tokens de `@/theme`), e `EmptyState` (`psychology.empty`) quando vazio. Sem `StyleSheet` hardcoded de cores — usar tokens. (Espelhar a estrutura de carregamento async + estado de loading do `PlayerDetailScreen.tsx`.)
- [ ] **Step 3 — link na PlayerDetail.** Em `src/screens/squad/PlayerDetailScreen.tsx`: adicionar um badge mostrando `t('psychology.archetype_' + player.personality)` perto da moral, e um botão/linha `t('psychology.link_why')` que faz `navigation.navigate('MoraleBreakdown', { playerId: player.id })`.
- [ ] **Step 4 — rodar + browser.** `npx tsc --noEmit` → exit 0; `npx jest` → suíte verde. Subir o web server (background do harness, `--clear`), abrir Squad → Player → "Por que esta moral?": drivers listados com sinais/cores, badge de personalidade, EmptyState quando sem eventos, 0 erros de console.
- [ ] **Step 5 — commit:** `git add src/screens/squad/MoraleBreakdownScreen.tsx src/screens/squad/PlayerDetailScreen.tsx src/navigation` · msg: `feat(c5): tela "Por quê" da moral + badge de personalidade + rota na PlayerDetail`.

---

## Task 11: Verificação final (DoD)

**Files:** nenhuma (só execução).

- [ ] **Step 1:** `npx tsc --noEmit && npx jest` — TUDO verde (motor puro, queries SQLite real, orquestrador integração, career-loop e2e, baselines de balanceamento sem mudança de levers para `balanced`, paridade i18n).
- [ ] **Step 2 — determinismo:** rodar `npx jest __tests__/engine/morale` duas vezes; resultados idênticos (química/personalidade seedadas; ledger ordenado por `(season,week,id)`). Conferir grep: `grep -rn "Math.random\|Date.now\|ORDER BY RANDOM" src/engine/morale` → vazio.
- [ ] **Step 3 — browser:** save antigo carrega (migração `addColumnIfMissing` aplica defaults `balanced`/`none`); avançar algumas semanas com clube humano e abrir a tela "Por quê" — drivers de partida/drift/química aparecem; um jogador de risco com moral cronicamente baixa eventualmente vira `wantsOut` + entra na lista de transferências + gera news.
- [ ] **Step 4 — DoD:** ledger persistido e podado; personalidade derivada/estável; química grafada; fallout escala com histerese; tela explica a moral; suíte+tsc verdes; UI validada; save-isolation conferida em todos os testes de query.

---

## Self-Review

1. **Cobertura do spec:** driver ledger (T1) + refactor não-regressão dos motores (T3); personalidade derivada + modulador (T2); química/cliques (T4); fallout/conflito (T5); schema+migração+tipo (T6); queries save-isoladas (T7); orquestrador + wiring no game-loop + poda do ledger (T8); i18n pt/en (T9); tela "Por quê" + badge + rota (T10); verificação/determinismo/save-isolation (T11). Reuso (não reescrita) de team-talk/press/interactions/news/retirement-streak confirmado — eles seguem com suas assinaturas atuais; só os motores `computeMatchMoraleDelta`/`computeWeeklyMoraleDrift` mudam de assinatura (call-sites só no game-loop, ajustados em T8).
2. **Placeholder scan:** sem "TBD"/"FIXME". Todas as levers entram em `balance.ts` (`PERSONALITY_*`, `CHEMISTRY_*`, `FALLOUT_*`, `MORALE_EVENTS_KEEP_SEASONS`, `FALLOUT_CRITICISM_LOOKBACK_WEEKS`). Pontos a confirmar na execução (não comportamentais): nome exato do helper de seed de DB em `__tests__/database/queries/` (Task 7 instrui ler um vizinho); obtenção do `saveSeed` no game-loop (Task 8, fallback `saveId`); arquivo exato da stack de navegação (Task 10, via grep). Nenhum altera o contrato.
3. **Consistência de tipos:** `MoraleDriverKind`/`MoraleDriver`/`DriverCtx` usados uniformemente; `derivePersonality`/`personalityMoraleModifier`/`computeChemistryGroups`/`chemistryDriftBonus`/`nextFalloutState` batem com o Contract; queries `morale.ts` casam com `DbHandle` (async) e com os tipos do engine; orquestrador `(db, saveId, ...)` espelha `game-loop.ts`; `Player.personality`/`Player.falloutState` mapeados em `rowToPlayer`. Dependência circular evitada: `driver-ledger` só faz `import type` de `personality`; `personality` só faz `import type` de `driver-ledger` (kinds) — runtime sem ciclo.
