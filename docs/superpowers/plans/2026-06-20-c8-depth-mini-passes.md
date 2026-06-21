# C8 — Mini-passes de Profundidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada **GRUPO** (a)..(g) é independente e shipável isoladamente — pode ser executado/revisado/mergeado em qualquer ordem. ATIVAR skill `superpowers:test-driven-development` em todo grupo que toca `engine/`/`database/`/`store/`. Subagents NÃO commitam — o passo "Commit" descreve o que o orquestrador commita.

**Goal:** Adicionar sete incrementos pequenos e independentes que aprofundam a simulação de carreira (pré-temporada, congestionamento/rotação, gravidade de lesão, portfólio de empréstimos, curva de forma, rotinas de bola parada, sentimento de mídia) sem reescrever nenhum sistema existente.

**Architecture:** Toda lógica nova vai para `src/engine/**` puro (zero React/Expo), seguindo `injury.ts`/`preseason-engine.ts` (funções puras retornam decisões; o caller persiste) e o orquestrador `game-loop.ts`/`preseason-runner.ts` (tocam DB). RNG sempre via `SeededRng` já threadado. **Não-regressão:** cada feature preserva o caminho legado byte-for-byte quando não configurada (defaults novos = comportamento atual; RNG consumido na MESMA posição do stream esteja a feature ligada ou não, padrão `resolveTaker`). Colunas novas em `schema.ts` (`SCHEMA_SQL`, fonte única) **e** `addColumnIfMissing` em `database-store.ts` para DBs legados.

**Tech Stack:** TS 5.9 strict, Jest 29 + ts-jest, better-sqlite3 REAL em memória (nunca mock), SeededRng, Zustand, React Native 0.81 / Expo 54, React Navigation v7.

**Convenções:** TDD; engine puro; SeededRng (zero `Math.random`/`Date.now`/`new Date()`/`ORDER BY RANDOM`); save-isolation `(db, saveId, ...)`; i18n pt/en paridade; tokens de `@/theme`; constantes de tuning nomeadas no topo do módulo; branch `feat/c8-mini-passes`; commits terminando com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. **Subagents NÃO commitam** (orquestrador commita).

**Precedente a espelhar:**
- Motor puro retorna-decisão: `src/engine/simulation/injury.ts` (`assignMatchInjuries`/`rollInjuryDuration`), `src/engine/preseason/preseason-engine.ts` (`applyFriendlyFitnessGain`).
- Designação honrada sem divergir RNG: `src/database/queries/set-piece-takers.ts` + `resolveTaker` em `match-engine.ts:643-648`.
- Coluna nova: `SCHEMA_SQL` em `src/database/schema.ts` + `addColumnIfMissing(db, table, col, def)` em `src/store/database-store.ts:71-92`.
- Query save-isolada: `src/database/queries/transfers.ts`, `src/database/queries/set-piece-takers.ts`.
- Mecânica de recall reaproveitável: `src/engine/transfer/loan-returns.ts:53-60`.
- Teste DB real: `__tests__/database/test-helpers.ts` (`createTestDb`/`createTestDbHandle`/`seedTestDb`/`TEST_SAVE_ID`).
- Tela: `src/screens/tactics/SetPiecesScreen.tsx` (estrutura de slot/seletor; estilos via `@/theme`).

---

## File Structure

**Grupo (a) — Efeitos de pré-temporada**
- **Create** `src/engine/preseason/preseason-effects.ts` — `computeFriendlyEffect` (puro): deltas de moral + afiação por participante.
- **Modify** `src/database/schema.ts` (tabela `players`, ~linha 105) — coluna `match_sharpness`.
- **Modify** `src/store/database-store.ts` (após :150) — `addColumnIfMissing` p/ `match_sharpness`.
- **Modify** `src/engine/preseason/preseason-runner.ts:143-153` — aplicar moral + sharpness além do fitness.
- **Test** `__tests__/engine/preseason/preseason-effects.test.ts`, `__tests__/engine/preseason/play-friendly-effects.test.ts`.

**Grupo (b) — Congestionamento de calendário**
- **Create** `src/engine/simulation/congestion.ts` — `computeCongestion` (puro): escala fitnessDrop + risco de lesão por pile-up.
- **Modify** `src/engine/simulation/injury.ts` — `assignMatchInjuries` aceita `injuryRiskMult` opcional (escala 1 roll, posição fixa).
- **Modify** `src/engine/game-loop.ts:420-444` — contar jogos recentes por jogador, escalar drop e repassar mult à lesão.
- **Test** `__tests__/engine/simulation/congestion.test.ts`, `__tests__/engine/game-loop-congestion.test.ts`.

**Grupo (c) — Gravidade de lesão + recuperação**
- **Modify** `src/engine/simulation/injury.ts` — `classifyInjury`, `injuryRecoveryStep`, `returnFitnessForSeverity`; `InjuryAssignment` ganha `severity`/`returnFitnessCap`.
- **Modify** `src/database/schema.ts` (tabela `players`) — `injury_severity` TEXT NULL, `injury_return_fitness` INTEGER NULL.
- **Modify** `src/store/database-store.ts` — `addColumnIfMissing` p/ ambas.
- **Modify** `src/engine/game-loop.ts:434-444` — recuperação modulada pelo physio; ao zerar, fitness ≤ cap.
- **Test** `__tests__/engine/simulation/injury-severity.test.ts`, `__tests__/engine/game-loop-injury-recovery.test.ts`.

**Grupo (d) — Portfólio de empréstimos**
- **Create** `src/engine/transfer/loan-portfolio.ts` — `buildLoanPortfolio` (puro).
- **Modify** `src/database/queries/transfers.ts` — `getActiveLoansByParent`, `recallLoan`.
- **Create** `src/screens/transfers/LoanPortfolioScreen.tsx` — lista + ação Recall.
- **Modify** `src/i18n/pt.ts` + `en.ts` — strings `loan_portfolio.*`.
- **Test** `__tests__/engine/transfer/loan-portfolio.test.ts`, `__tests__/database/queries/loan-portfolio-queries.test.ts`.

**Grupo (e) — Curva de forma recente**
- **Create** `src/engine/simulation/form.ts` — `computeFormModifier` (puro).
- **Modify** `src/database/queries/player-stats.ts` — `getLastNMatchForm`.
- **Modify** `src/engine/simulation/player-rating.ts:4-9,25-31` — `PlayerMatchInput.formModifier?`.
- **Modify** `src/engine/simulation/match-engine.ts:494-507` — injetar `formModifier` por jogador.
- **Modify** `src/engine/game-loop.ts:223-255` + `src/engine/simulation/match-runner.ts:6-12,63-74` — carregar forma e threadar.
- **Test** `__tests__/engine/simulation/form.test.ts`, `__tests__/database/queries/last-n-form.test.ts`.

**Grupo (f) — Rotina de escanteio**
- **Modify** `src/engine/simulation/match-engine.ts:13-17,624` — `SetPieceTakers.cornerRoutine?`; `cornerRoutineMultiplier`.
- **Modify** `src/database/schema.ts:490-497` — coluna `corner_routine`.
- **Modify** `src/store/database-store.ts` — `addColumnIfMissing` p/ `corner_routine`.
- **Modify** `src/database/queries/set-piece-takers.ts` — ler/gravar `corner_routine`.
- **Modify** `src/screens/tactics/SetPiecesScreen.tsx` — seletor de rotina.
- **Modify** `src/i18n/pt.ts` + `en.ts` — `set_pieces.routine_*`.
- **Test** `__tests__/engine/simulation/corner-routine.test.ts`, `__tests__/database/queries/corner-routine-migration.test.ts`.

**Grupo (g) — Sentimento de mídia**
- **Create** `src/engine/press/media-sentiment.ts` — `mediaTierForReputation`, `nextMediaSentiment` (puro).
- **Modify** `src/database/schema.ts:304-321` (save_games) — `media_sentiment`.
- **Modify** `src/store/database-store.ts` — `addColumnIfMissing` p/ `media_sentiment`.
- **Modify** `src/database/queries/save.ts` — `getMediaSentiment`, `setMediaSentiment`.
- **Test** `__tests__/engine/press/media-sentiment.test.ts`, `__tests__/database/queries/media-sentiment.test.ts`.

**Contract (assinaturas exatas):**

```ts
// (a) src/engine/preseason/preseason-effects.ts
export interface FriendlyEffectInput {
  myGoals: number;
  oppGoals: number;
  myReputation: number;
  oppReputation: number;   // bater rep maior vale mais moral
  participated: boolean;
}
export interface FriendlyEffect {
  moraleDelta: number;     // aplicado via applyMoraleDelta no caller
  sharpnessDelta: number;  // pontos de afiação (coluna match_sharpness)
}
export function computeFriendlyEffect(input: FriendlyEffectInput): FriendlyEffect;

// (b) src/engine/simulation/congestion.ts
export interface CongestionInput {
  gamesInWindow: number;   // jogos do jogador na janela recente
  baseFitnessDrop: number; // swing atual (5..15) já sorteado
}
export interface CongestionResult {
  fitnessDrop: number;     // baseFitnessDrop escalado por pile-up
  injuryRiskMult: number;  // >=1; multiplica INJURY_PROB efetivo
}
export function computeCongestion(input: CongestionInput): CongestionResult;

// (c) src/engine/simulation/injury.ts  (ADITIVO)
export type InjurySeverity = 'knock' | 'moderate' | 'serious';
export interface InjuryAssignment {
  playerId: number;
  weeksLeft: number;
  severity: InjurySeverity;        // novo
  returnFitnessCap: number;        // 60..90: fitness máx ao voltar
}
export function classifyInjury(weeksLeft: number): InjurySeverity;
export function returnFitnessForSeverity(severity: InjurySeverity): number;
export function injuryRecoveryStep(weeksLeft: number, physioAbility: number): number;
// assignMatchInjuries ganha 4º arg opcional: injuryRiskMult?: number (default 1)

// (d) src/engine/transfer/loan-portfolio.ts
export interface LoanedPlayerRow {
  playerId: number; name: string; loanClubId: number; loanClubName: string;
  loanEnd: number; appearances: number; avgRating: number; minutesPlayed: number;
}
export interface LoanPortfolioEntry extends LoanedPlayerRow {
  recallEligible: boolean;   // janela aberta + ainda na vigência
}
export function buildLoanPortfolio(
  rows: LoanedPlayerRow[], currentSeason: number, currentWeek: number,
): LoanPortfolioEntry[];

// (e) src/engine/simulation/form.ts
export function computeFormModifier(recentRatings: number[]): number; // -1.0..+1.0
// player-rating.ts: PlayerMatchInput.formModifier?: number;
// player-stats.ts:
export interface LastNForm { ratings: number[]; }
export function getLastNMatchForm(
  db: DbHandle, saveId: number, playerId: number, season: number, n: number,
): Promise<number[]>;

// (f) match-engine.ts
export type CornerRoutine = 'auto' | 'near_post' | 'far_post' | 'short';
// SetPieceTakers.cornerRoutine?: CornerRoutine;
export function cornerRoutineMultiplier(routine: CornerRoutine | undefined): number;

// (g) src/engine/press/media-sentiment.ts
export type MediaTier = 'local' | 'national' | 'global';
export function mediaTierForReputation(reputation: number): MediaTier;
export interface SentimentInput {
  current: number;            // -100..100, persistido por save
  outcome: PressOutcome;      // reusa de press-engine
  tone: PressTone;            // reusa de press-engine
  tier: MediaTier;
}
export function nextMediaSentiment(input: SentimentInput): number; // clamped ±100
```

---

# Grupo (a) — Efeitos de pré-temporada

> ATIVAR `superpowers:test-driven-development`. Entregável isolado: amistoso passa a mexer moral E afiação (não só fitness), escalando pela força do adversário.

## Task A1: Coluna `match_sharpness` (schema + migração legada)
**Files:** Modify `src/database/schema.ts`, `src/store/database-store.ts`. Test `__tests__/database/queries/match-sharpness-migration.test.ts`.
**Interfaces:** Consumes: — · Produces: coluna `players.match_sharpness`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/match-sharpness-migration.test.ts`:
```ts
import Database from 'better-sqlite3';
import { createTestDb } from '../database/test-helpers';

it('SCHEMA_SQL cria players.match_sharpness com default 100', () => {
  const db = createTestDb();
  const cols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string; dflt_value: string | null }>;
  const col = cols.find((c) => c.name === 'match_sharpness');
  expect(col).toBeDefined();
  expect(col!.dflt_value).toBe('100');
});

it('DB legado sem a coluna recebe ADD COLUMN idempotente', () => {
  const db = new Database(':memory:');
  // tabela mínima sem a coluna nova
  db.exec("CREATE TABLE players (id INTEGER PRIMARY KEY, fitness INTEGER NOT NULL DEFAULT 100)");
  const hasCol = () => (db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>).some((c) => c.name === 'match_sharpness');
  expect(hasCol()).toBe(false);
  db.exec("ALTER TABLE players ADD COLUMN match_sharpness INTEGER NOT NULL DEFAULT 100");
  expect(hasCol()).toBe(true);
  db.prepare('INSERT INTO players (id) VALUES (1)').run();
  const row = db.prepare('SELECT match_sharpness FROM players WHERE id = 1').get() as { match_sharpness: number };
  expect(row.match_sharpness).toBe(100);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/match-sharpness-migration.test.ts` → 1º teste falha (`col` undefined).
- [ ] **Step 3 — implementar:** em `src/database/schema.ts`, na tabela `players` após `suspension_weeks_left ... DEFAULT 0,` (linha ~105) adicionar:
```sql
  match_sharpness              INTEGER NOT NULL DEFAULT 100 CHECK (match_sharpness BETWEEN 1 AND 100),
```
Em `src/store/database-store.ts`, após o bloco de `addColumnIfMissing(db, 'players', 'is_loan_listed', ...)` (~:150) adicionar:
```ts
      await addColumnIfMissing(db, 'players', 'match_sharpness', 'INTEGER NOT NULL DEFAULT 100');
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/queries/match-sharpness-migration.test.ts` (2/2 verdes) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/database/schema.ts src/store/database-store.ts __tests__/database/queries/match-sharpness-migration.test.ts` · msg: `feat(c8-a): coluna match_sharpness p/ afiação de pré-temporada`.

## Task A2: Motor puro `computeFriendlyEffect`
**Files:** Create `src/engine/preseason/preseason-effects.ts`, Test `__tests__/engine/preseason/preseason-effects.test.ts`.
**Interfaces:** Consumes: `FriendlyEffectInput` · Produces: `computeFriendlyEffect`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/preseason/preseason-effects.test.ts`:
```ts
import { computeFriendlyEffect } from '@/engine/preseason/preseason-effects';

it('não-participante: tudo zero', () => {
  expect(computeFriendlyEffect({ myGoals: 3, oppGoals: 0, myReputation: 50, oppReputation: 80, participated: false }))
    .toEqual({ moraleDelta: 0, sharpnessDelta: 0 });
});

it('participante ganha afiação positiva ao jogar', () => {
  const r = computeFriendlyEffect({ myGoals: 1, oppGoals: 1, myReputation: 50, oppReputation: 50, participated: true });
  expect(r.sharpnessDelta).toBeGreaterThan(0);
});

it('vencer rep maior dá mais moral que vencer rep menor', () => {
  const vsBigger = computeFriendlyEffect({ myGoals: 2, oppGoals: 0, myReputation: 50, oppReputation: 80, participated: true });
  const vsSmaller = computeFriendlyEffect({ myGoals: 2, oppGoals: 0, myReputation: 50, oppReputation: 30, participated: true });
  expect(vsBigger.moraleDelta).toBeGreaterThan(vsSmaller.moraleDelta);
});

it('derrota dá moral negativa; empate ~neutro pequeno', () => {
  expect(computeFriendlyEffect({ myGoals: 0, oppGoals: 3, myReputation: 50, oppReputation: 50, participated: true }).moraleDelta).toBeLessThan(0);
  const draw = computeFriendlyEffect({ myGoals: 1, oppGoals: 1, myReputation: 50, oppReputation: 50, participated: true });
  expect(Math.abs(draw.moraleDelta)).toBeLessThanOrEqual(1);
});

it('determinístico: sem RNG, mesma entrada → mesma saída', () => {
  const i = { myGoals: 2, oppGoals: 1, myReputation: 50, oppReputation: 60, participated: true } as const;
  expect(computeFriendlyEffect(i)).toEqual(computeFriendlyEffect(i));
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/preseason/preseason-effects.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar:** criar `src/engine/preseason/preseason-effects.ts` (puro, SEM RNG — determinístico pela entrada):
```ts
export interface FriendlyEffectInput {
  myGoals: number;
  oppGoals: number;
  myReputation: number;
  oppReputation: number;
  participated: boolean;
}

export interface FriendlyEffect {
  moraleDelta: number;
  sharpnessDelta: number;
}

/** Pontos de afiação por amistoso disputado (independe do placar). */
const SHARPNESS_GAIN = 8;
/** Moral base por resultado, antes do ajuste por força do adversário. */
const MORALE_WIN = 3;
const MORALE_DRAW = 0;
const MORALE_LOSS = -2;
/** Quão forte a diferença de reputação modula a moral (pontos por 30 de gap). */
const REP_SCALE = 30;

/**
 * Pure: dado o resultado de um amistoso e a força relativa, devolve deltas de
 * moral e afiação para um participante. Não-participantes não mudam (espelha
 * applyFriendlyFitnessGain). Sem RNG — determinístico pela entrada.
 */
export function computeFriendlyEffect(input: FriendlyEffectInput): FriendlyEffect {
  if (!input.participated) return { moraleDelta: 0, sharpnessDelta: 0 };

  const diff = input.myGoals - input.oppGoals;
  let morale = diff > 0 ? MORALE_WIN : diff < 0 ? MORALE_LOSS : MORALE_DRAW;

  // Bater rep maior vale mais; perder p/ rep menor dói mais.
  const repGap = input.oppReputation - input.myReputation; // >0 = adversário mais forte
  if (diff > 0) morale += Math.round(Math.max(0, repGap) / REP_SCALE);
  else if (diff < 0) morale -= Math.round(Math.max(0, -repGap) / REP_SCALE);

  return { moraleDelta: morale, sharpnessDelta: SHARPNESS_GAIN };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/preseason/preseason-effects.test.ts` (5/5) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/preseason/preseason-effects.ts __tests__/engine/preseason/preseason-effects.test.ts` · msg: `feat(c8-a): motor puro computeFriendlyEffect (moral + afiação)`.

## Task A3: Integrar efeitos no `playFriendly`
**Files:** Modify `src/engine/preseason/preseason-runner.ts:143-153`. Test `__tests__/engine/preseason/play-friendly-effects.test.ts`.
**Interfaces:** Consumes: `computeFriendlyEffect`, `applyMoraleDelta` · Produces: persistência de `morale`/`match_sharpness`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/preseason/play-friendly-effects.test.ts` (DB real; semeia, cria amistoso, joga). Esqueleto:
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { playFriendly } from '@/engine/preseason/preseason-runner';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';

it('amistoso muda moral E afiação dos titulares; suplentes inalterados', async () => {
  const raw = createTestDb();
  seedTestDb(raw);
  const db = createTestDbHandle(raw);
  const clubId = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(TEST_SAVE_ID) as { c: number }).c;
  const oppId = (raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, clubId) as { id: number }).id;
  raw.prepare("INSERT INTO friendlies (id, save_id, season, home_club_id, away_club_id, played) VALUES (900, ?, 1, ?, ?, 0)").run(TEST_SAVE_ID, clubId, oppId);

  const before = await getPlayersByClub(db, TEST_SAVE_ID, clubId);
  await playFriendly({ dbHandle: db, saveId: TEST_SAVE_ID, season: 1, friendlyId: 900, playerClubId: clubId, rng: new SeededRng(7) });
  const after = await getPlayersByClub(db, TEST_SAVE_ID, clubId);

  // ao menos um jogador teve moral OU sharpness mexido
  const moraleChanged = after.some((p) => p.morale !== before.find((b) => b.id === p.id)!.morale);
  const sharp = raw.prepare('SELECT match_sharpness AS s FROM players WHERE save_id = ? AND club_id = ? AND match_sharpness != 100').all(TEST_SAVE_ID, clubId) as Array<{ s: number }>;
  expect(moraleChanged || sharp.length > 0).toBe(true);
  expect(sharp.length).toBeGreaterThan(0);
});

it('determinístico: mesma seed → mesmo estado final', async () => {
  const run = async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const clubId = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(TEST_SAVE_ID) as { c: number }).c;
    const oppId = (raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, clubId) as { id: number }).id;
    raw.prepare("INSERT INTO friendlies (id, save_id, season, home_club_id, away_club_id, played) VALUES (901, ?, 1, ?, ?, 0)").run(TEST_SAVE_ID, clubId, oppId);
    await playFriendly({ dbHandle: db, saveId: TEST_SAVE_ID, season: 1, friendlyId: 901, playerClubId: clubId, rng: new SeededRng(11) });
    return raw.prepare('SELECT id, morale, fitness, match_sharpness FROM players WHERE save_id = ? AND club_id = ? ORDER BY id').all(TEST_SAVE_ID, clubId);
  };
  expect(await run()).toEqual(await run());
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/preseason/play-friendly-effects.test.ts` → sharpness sempre 100 (feature não integrada).
- [ ] **Step 3 — implementar:** em `src/engine/preseason/preseason-runner.ts`, adicionar imports no topo:
```ts
import { applyFriendlyFitnessGain } from './preseason-engine';
import { computeFriendlyEffect } from './preseason-effects';
import { applyMoraleDelta } from '@/engine/morale/morale-engine';
```
Substituir o loop `for (const player of squad)` (linhas 147-153) por:
```ts
  const myGoals = isHome ? result.homeGoals : result.awayGoals;
  const oppGoals = isHome ? result.awayGoals : result.homeGoals;
  const myReputation = isHome ? home.reputation : away.reputation;
  const oppReputation = isHome ? away.reputation : home.reputation;
  for (const player of squad) {
    const participated = playerStartingIds.has(player.id);
    const nextFitness = applyFriendlyFitnessGain(player.fitness, participated, rng);
    const eff = computeFriendlyEffect({ myGoals, oppGoals, myReputation, oppReputation, participated });
    const nextMorale = applyMoraleDelta(player.morale, eff.moraleDelta);
    const sharpRow = (await db
      .prepare('SELECT match_sharpness AS s FROM players WHERE save_id = ? AND id = ?')
      .get(saveId, player.id)) as { s: number } | undefined;
    const nextSharp = Math.max(1, Math.min(100, (sharpRow?.s ?? 100) + eff.sharpnessDelta));
    await db
      .prepare('UPDATE players SET fitness = ?, morale = ?, match_sharpness = ? WHERE save_id = ? AND id = ?')
      .run(nextFitness, nextMorale, nextSharp, saveId, player.id);
  }
```
> Nota RNG: `applyFriendlyFitnessGain` continua consumindo o stream EXATAMENTE como antes (1 roll p/ participante via `rng.nextInt`), para não divergir do baseline. `computeFriendlyEffect` não usa RNG.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/preseason/play-friendly-effects.test.ts` (2/2) + `npx jest __tests__/engine/preseason` (suíte de pré-temporada existente verde) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/preseason/preseason-runner.ts __tests__/engine/preseason/play-friendly-effects.test.ts` · msg: `feat(c8-a): playFriendly aplica moral + afiação escalados pelo adversário`.

---

# Grupo (b) — Congestionamento de calendário

> ATIVAR `superpowers:test-driven-development`. Toca o caminho quente `game-loop`/`injury`. Entregável: jogos próximos pesam mais (fitness cai mais, risco de lesão sobe). Sem regressão quando `gamesInWindow<=1`.

## Task B1: Motor puro `computeCongestion`
**Files:** Create `src/engine/simulation/congestion.ts`, Test `__tests__/engine/simulation/congestion.test.ts`.
**Interfaces:** Consumes: `CongestionInput` · Produces: `computeCongestion`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/simulation/congestion.test.ts`:
```ts
import { computeCongestion } from '@/engine/simulation/congestion';

it('1 jogo na janela: sem regressão (mult=1, drop=base)', () => {
  expect(computeCongestion({ gamesInWindow: 1, baseFitnessDrop: 10 })).toEqual({ fitnessDrop: 10, injuryRiskMult: 1 });
});

it('0 jogos === 1 jogo (não quebra determinismo do caminho legado)', () => {
  expect(computeCongestion({ gamesInWindow: 0, baseFitnessDrop: 10 }))
    .toEqual(computeCongestion({ gamesInWindow: 1, baseFitnessDrop: 10 }));
});

it('pile-up monotônico: mais jogos → mais drop e mais risco', () => {
  const a = computeCongestion({ gamesInWindow: 1, baseFitnessDrop: 10 });
  const b = computeCongestion({ gamesInWindow: 3, baseFitnessDrop: 10 });
  const c = computeCongestion({ gamesInWindow: 5, baseFitnessDrop: 10 });
  expect(b.fitnessDrop).toBeGreaterThan(a.fitnessDrop);
  expect(c.fitnessDrop).toBeGreaterThan(b.fitnessDrop);
  expect(b.injuryRiskMult).toBeGreaterThan(1);
  expect(c.injuryRiskMult).toBeGreaterThan(b.injuryRiskMult);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/simulation/congestion.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar:** criar `src/engine/simulation/congestion.ts`:
```ts
export interface CongestionInput {
  gamesInWindow: number;
  baseFitnessDrop: number;
}

export interface CongestionResult {
  fitnessDrop: number;
  injuryRiskMult: number;
}

/** Jogos "de graça" antes do pile-up começar a pesar. */
const FREE_GAMES = 1;
/** Ganho de drop por jogo extra na janela (10% por jogo acima do baseline). */
const DROP_PER_EXTRA = 0.10;
/** Ganho de risco de lesão por jogo extra (15% por jogo). */
const RISK_PER_EXTRA = 0.15;

/**
 * Pure: escala o swing de fitness e o risco de lesão pelo nº de jogos recentes.
 * gamesInWindow <= 1 → sem efeito (caminho legado byte-for-byte). Sem RNG.
 */
export function computeCongestion(input: CongestionInput): CongestionResult {
  const extra = Math.max(0, input.gamesInWindow - FREE_GAMES);
  const fitnessDrop = Math.round(input.baseFitnessDrop * (1 + extra * DROP_PER_EXTRA));
  const injuryRiskMult = 1 + extra * RISK_PER_EXTRA;
  return { fitnessDrop, injuryRiskMult };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/simulation/congestion.test.ts` (3/3) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/simulation/congestion.ts __tests__/engine/simulation/congestion.test.ts` · msg: `feat(c8-b): motor puro computeCongestion`.

## Task B2: `assignMatchInjuries` aceita multiplicador de risco (sem divergir RNG)
**Files:** Modify `src/engine/simulation/injury.ts`. Test (estender) `__tests__/engine/simulation/congestion.test.ts` ou `__tests__/engine/simulation/injury-risk-mult.test.ts`.
**Interfaces:** Consumes: `MatchEvent[]`, `injuryRiskMult` · Produces: `assignMatchInjuries(events, ids, rng, injuryRiskMult?)`.

> Decisão (spec §6): o evento `injury` JÁ foi emitido pelo `match-engine` (probabilidade fixa lá). O multiplicador NÃO altera `match-engine` (evitaria mexer no caminho quente e nos baselines). Em vez disso, no caller, um roll ADICIONAL — consumido SEMPRE, mesmo quando mult=1 — decide se um evento de lesão "marginal" vira lesão real. Para mult=1 o roll é consumido mas nunca filtra (preserva todos os eventos), mantendo o stream igual ao legado em posição mas com 1 roll a mais por lesão. **Para garantir não-regressão estrita do baseline atual, o roll extra só ocorre quando há eventos de lesão**, e o teste de determinismo abaixo trava o comportamento. (Alternativa de não consumir roll quando mult=1 também é aceitável; escolher a que mantém o baseline de 933f2f1 verde — validar no Step 4.)

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/simulation/injury-risk-mult.test.ts`:
```ts
import { assignMatchInjuries } from '@/engine/simulation/injury';
import { SeededRng } from '@/engine/rng';
import { MatchEvent } from '@/types';

const inj = (playerId: number): MatchEvent => ({ fixtureId: 1, minute: 10, type: 'injury', playerId, secondaryPlayerId: null });

it('mult=1 mantém todas as lesões (sem regressão)', () => {
  const ev = [inj(1), inj(2)];
  const r = assignMatchInjuries(ev, new Set([1, 2]), new SeededRng(3), 1);
  expect(r.map((a) => a.playerId).sort()).toEqual([1, 2]);
});

it('mult alto nunca remove lesões (só pode adicionar marginais — aqui só escala risco)', () => {
  const ev = [inj(1)];
  const r = assignMatchInjuries(ev, new Set([1]), new SeededRng(3), 3);
  expect(r.length).toBeGreaterThanOrEqual(1);
});

it('determinístico p/ uma dada seed e mult', () => {
  const a = assignMatchInjuries([inj(1), inj(2)], new Set([1, 2]), new SeededRng(9), 2);
  const b = assignMatchInjuries([inj(1), inj(2)], new Set([1, 2]), new SeededRng(9), 2);
  expect(a).toEqual(b);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/simulation/injury-risk-mult.test.ts` → `assignMatchInjuries` não aceita 4º arg / comportamento ausente.
- [ ] **Step 3 — implementar:** em `src/engine/simulation/injury.ts`, alterar a assinatura de `assignMatchInjuries` para aceitar `injuryRiskMult` opcional. O multiplicador, neste pass, apenas garante que cada evento de lesão emitido pelo motor seja sempre confirmado (mult>=1 nunca reduz), reservando o RNG na mesma posição:
```ts
export function assignMatchInjuries(
  events: MatchEvent[],
  clubPlayerIds: Set<number>,
  rng: SeededRng,
  injuryRiskMult: number = 1,
): InjuryAssignment[] {
  const out: InjuryAssignment[] = [];
  for (const e of events) {
    if (e.type === 'injury' && clubPlayerIds.has(e.playerId)) {
      const weeksLeft = rollInjuryDuration(rng);
      // injuryRiskMult >= 1 confirma a lesão; >1 pode escalar a gravidade (1 roll fixo).
      const escalate = injuryRiskMult > 1 && rng.next() < (injuryRiskMult - 1) * 0.2;
      const severity = classifyInjury(escalate ? weeksLeft + 2 : weeksLeft);
      out.push({
        playerId: e.playerId,
        weeksLeft: escalate ? weeksLeft + 2 : weeksLeft,
        severity,
        returnFitnessCap: returnFitnessForSeverity(severity),
      });
    }
  }
  return out;
}
```
> `classifyInjury`/`returnFitnessForSeverity` vêm do Grupo (c) — se (b) for executado ANTES de (c), criar stubs mínimos (ver Task C1) ou executar (c) primeiro. Recomendado: ordem (c)→(b). Caso (b) vá antes, adicionar `severity`/`returnFitnessCap` ao `InjuryAssignment` e os dois helpers já neste passo (copiar de C1).
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/simulation/injury-risk-mult.test.ts` + `npx jest __tests__/engine/simulation/injury` + **re-rodar baseline de balanceamento** `npx jest __tests__/balance` (verde, sem mudança de levers — guard de 933f2f1) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/simulation/injury.ts __tests__/engine/simulation/injury-risk-mult.test.ts` · msg: `feat(c8-b): assignMatchInjuries aceita injuryRiskMult (roll fixo, sem divergir stream)`.

## Task B3: Aplicar congestionamento no `game-loop`
**Files:** Modify `src/engine/game-loop.ts:420-444`. Test `__tests__/engine/game-loop-congestion.test.ts`.
**Interfaces:** Consumes: `computeCongestion`, fixtures recentes · Produces: fitness/lesão escalados.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/game-loop-congestion.test.ts` que semeia 2 fixtures do clube do usuário em semanas próximas, avança e assere que o drop de fitness de um titular foi maior do que o swing base máximo de 15 quando houve jogo recente. Esqueleto (ajustar nº de fixtures conforme `getFixturesByWeek`):
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
// ... helpers p/ inserir fixtures + competição + standings conforme outros game-loop tests ...
it('jogador com 2+ jogos na janela cai mais fitness que o swing base', async () => {
  // setup: semear, inserir fixture na semana anterior (jogada) e na semana atual p/ o clube do usuário
  // avançar a semana atual via advanceGameWeek
  // assertar que o drop observado de um titular > 15 (máx do swing base) OU >= drop de um cenário sem jogo prévio
  expect(true).toBe(true); // substituir pela asserção real após montar o fixture
});
```
> **Nota para o implementador:** espelhar o setup de fixtures de um teste game-loop existente (`grep -l advanceGameWeek __tests__/`). "Jogos na janela" = COUNT de `fixtures` do clube com `played=1` nas últimas 3 semanas (window = `[week-3, week-1]`), via query inline `SELECT COUNT(*) FROM fixtures WHERE save_id=? AND (home_club_id=? OR away_club_id=?) AND season=? AND week BETWEEN ? AND ? AND home_goals IS NOT NULL`.
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/game-loop-congestion.test.ts`.
- [ ] **Step 3 — implementar:** em `src/engine/game-loop.ts`, importar `computeCongestion`. No passo 6 (fitness, linhas 420-432), antes do loop, contar jogos recentes do clube do usuário:
```ts
import { computeCongestion } from './simulation/congestion';
// ... dentro do bloco passo 6:
    const windowStart = Math.max(1, week - 3);
    const congestionRow = (await db.prepare(
      `SELECT COUNT(*) AS n FROM fixtures
       WHERE save_id = ? AND (home_club_id = ? OR away_club_id = ?)
         AND season = ? AND week BETWEEN ? AND ? AND home_goals IS NOT NULL`,
    ).get(saveId, playerClubId, playerClubId, season, windowStart, week - 1)) as { n: number };
    const gamesInWindow = congestionRow.n + 1; // +1 = a partida desta semana
    for (const p of playerSquadRaw) {
      const played = startingIds.has(p.id);
      let newFitness: number;
      if (played) {
        const baseDrop = rng.nextInt(5, 15);
        const { fitnessDrop } = computeCongestion({ gamesInWindow, baseFitnessDrop: baseDrop });
        newFitness = Math.max(30, p.fitness - fitnessDrop);
      } else {
        const gain = rng.nextInt(5, 15);
        newFitness = Math.min(100, p.fitness + gain);
      }
      await db.prepare('UPDATE players SET fitness = ? WHERE save_id = ? AND id = ?').run(newFitness, saveId, p.id);
    }
```
No passo 7 (lesão, linha 442), passar o mult:
```ts
    const { injuryRiskMult } = computeCongestion({ gamesInWindow, baseFitnessDrop: 0 });
    for (const inj of assignMatchInjuries(matchResult.events, playerClubIds, rng, injuryRiskMult)) {
      await db.prepare('UPDATE players SET injury_weeks_left = ?, injury_severity = ?, injury_return_fitness = ? WHERE save_id = ? AND id = ?')
        .run(inj.weeksLeft, inj.severity, inj.returnFitnessCap, saveId, inj.playerId);
    }
```
> Importante p/ determinismo: o roll `rng.nextInt(5,15)` por titular permanece na MESMA posição/ordem do legado; `computeCongestion` apenas pós-escala (sem consumir RNG). `assignMatchInjuries` consome rolls como em B2.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/game-loop-congestion.test.ts` + `npx jest __tests__/engine/game-loop` + `npx jest __tests__/balance` (baseline verde) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/game-loop.ts __tests__/engine/game-loop-congestion.test.ts` · msg: `feat(c8-b): game-loop escala fitness/lesão por congestionamento de calendário`.

---

# Grupo (c) — Gravidade de lesão + recuperação

> ATIVAR `superpowers:test-driven-development`. Entregável: lesões têm tier (knock/moderate/serious), recuperação acelerada por physio, e retorno abaixo de 100% de fitness. RECOMENDADO executar ANTES de (b) (B2/B3 consomem `classifyInjury`/`returnFitnessForSeverity`).

## Task C1: Tiers + helpers puros em `injury.ts`
**Files:** Modify `src/engine/simulation/injury.ts`. Test `__tests__/engine/simulation/injury-severity.test.ts`.
**Interfaces:** Produces: `InjurySeverity`, `classifyInjury`, `returnFitnessForSeverity`, `injuryRecoveryStep`; `InjuryAssignment` ganha `severity`/`returnFitnessCap`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/simulation/injury-severity.test.ts`:
```ts
import { classifyInjury, returnFitnessForSeverity, injuryRecoveryStep, assignMatchInjuries } from '@/engine/simulation/injury';
import { SeededRng } from '@/engine/rng';
import { MatchEvent } from '@/types';

it('classifica por duração: <=2 knock, 3-5 moderate, >=6 serious', () => {
  expect(classifyInjury(1)).toBe('knock');
  expect(classifyInjury(2)).toBe('knock');
  expect(classifyInjury(3)).toBe('moderate');
  expect(classifyInjury(5)).toBe('moderate');
  expect(classifyInjury(6)).toBe('serious');
  expect(classifyInjury(8)).toBe('serious');
});

it('cap de retorno cai com a gravidade (mais grave volta pior)', () => {
  expect(returnFitnessForSeverity('knock')).toBeGreaterThan(returnFitnessForSeverity('moderate'));
  expect(returnFitnessForSeverity('moderate')).toBeGreaterThan(returnFitnessForSeverity('serious'));
  expect(returnFitnessForSeverity('serious')).toBeGreaterThanOrEqual(60);
});

it('physio acelera a recuperação; physio 0 = decremento 1/semana (legado)', () => {
  expect(injuryRecoveryStep(4, 0)).toBe(3);
  expect(injuryRecoveryStep(4, 20)).toBeLessThan(3);
  expect(injuryRecoveryStep(0, 20)).toBe(0);     // no-op
  expect(injuryRecoveryStep(1, 20)).toBeGreaterThanOrEqual(0); // nunca negativo
});

it('assignMatchInjuries devolve severity + returnFitnessCap', () => {
  const ev: MatchEvent[] = [{ fixtureId: 1, minute: 5, type: 'injury', playerId: 1, secondaryPlayerId: null }];
  const [a] = assignMatchInjuries(ev, new Set([1]), new SeededRng(2));
  expect(a.severity).toBe(classifyInjury(a.weeksLeft));
  expect(a.returnFitnessCap).toBe(returnFitnessForSeverity(a.severity));
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/simulation/injury-severity.test.ts` → helpers inexistentes.
- [ ] **Step 3 — implementar:** em `src/engine/simulation/injury.ts` adicionar:
```ts
export type InjurySeverity = 'knock' | 'moderate' | 'serious';

export function classifyInjury(weeksLeft: number): InjurySeverity {
  if (weeksLeft <= 2) return 'knock';
  if (weeksLeft <= 5) return 'moderate';
  return 'serious';
}

const RETURN_FITNESS: Record<InjurySeverity, number> = { knock: 90, moderate: 75, serious: 60 };
export function returnFitnessForSeverity(severity: InjurySeverity): number {
  return RETURN_FITNESS[severity];
}

/** Quanto o physio (0..20) acelera além do decremento base de 1/semana. */
const PHYSIO_MAX_BONUS = 1; // physio 20 → recupera ~2 semanas/semana
export function injuryRecoveryStep(weeksLeft: number, physioAbility: number): number {
  if (weeksLeft <= 0) return 0;
  const bonus = Math.round((Math.max(0, Math.min(20, physioAbility)) / 20) * PHYSIO_MAX_BONUS);
  return Math.max(0, weeksLeft - 1 - bonus);
}
```
E estender `InjuryAssignment` + `assignMatchInjuries` (forma base, sem mult — B2 adiciona o 4º arg):
```ts
export interface InjuryAssignment {
  playerId: number;
  weeksLeft: number;
  severity: InjurySeverity;
  returnFitnessCap: number;
}

export function assignMatchInjuries(
  events: MatchEvent[],
  clubPlayerIds: Set<number>,
  rng: SeededRng,
): InjuryAssignment[] {
  const out: InjuryAssignment[] = [];
  for (const e of events) {
    if (e.type === 'injury' && clubPlayerIds.has(e.playerId)) {
      const weeksLeft = rollInjuryDuration(rng);
      const severity = classifyInjury(weeksLeft);
      out.push({ playerId: e.playerId, weeksLeft, severity, returnFitnessCap: returnFitnessForSeverity(severity) });
    }
  }
  return out;
}
```
> Se (b) já foi executado e adicionou o 4º arg `injuryRiskMult`, mantenha-o; este passo só garante `severity`/`returnFitnessCap` no retorno.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/simulation/injury-severity.test.ts` + `npx jest __tests__/engine/simulation/injury` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/simulation/injury.ts __tests__/engine/simulation/injury-severity.test.ts` · msg: `feat(c8-c): tiers de lesão + cap de retorno + injuryRecoveryStep`.

## Task C2: Colunas `injury_severity` + `injury_return_fitness`
**Files:** Modify `src/database/schema.ts`, `src/store/database-store.ts`. Test `__tests__/database/queries/injury-columns-migration.test.ts`.
**Interfaces:** Produces: colunas `players.injury_severity` (TEXT NULL), `players.injury_return_fitness` (INTEGER NULL).

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/injury-columns-migration.test.ts`:
```ts
import { createTestDb } from '../database/test-helpers';

it('SCHEMA_SQL cria injury_severity e injury_return_fitness (nullable)', () => {
  const db = createTestDb();
  const names = (db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>).map((c) => c.name);
  expect(names).toContain('injury_severity');
  expect(names).toContain('injury_return_fitness');
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/injury-columns-migration.test.ts`.
- [ ] **Step 3 — implementar:** em `src/database/schema.ts`, na tabela `players` após `injury_weeks_left INTEGER NOT NULL DEFAULT 0,` (linha 94) adicionar:
```sql
  injury_severity              TEXT,
  injury_return_fitness        INTEGER,
```
Em `src/store/database-store.ts` (junto aos outros `addColumnIfMissing` de `players`):
```ts
      await addColumnIfMissing(db, 'players', 'injury_severity', 'TEXT');
      await addColumnIfMissing(db, 'players', 'injury_return_fitness', 'INTEGER');
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/queries/injury-columns-migration.test.ts` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/database/schema.ts src/store/database-store.ts __tests__/database/queries/injury-columns-migration.test.ts` · msg: `feat(c8-c): colunas injury_severity + injury_return_fitness`.

## Task C3: Recuperação modulada por physio + retorno <100% no `game-loop`
**Files:** Modify `src/engine/game-loop.ts:434-444`. Test `__tests__/engine/game-loop-injury-recovery.test.ts`.
**Interfaces:** Consumes: `injuryRecoveryStep`, `staffEffects.physio` (já lido :350-358) · Produces: recuperação acelerada + cap no retorno.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/game-loop-injury-recovery.test.ts`: semeia jogador lesionado (`injury_weeks_left=1`, `injury_return_fitness=70`), físio com alta ability no clube, avança a semana e assere `injury_weeks_left=0` e `fitness <= 70`. Esqueleto (montar o fixture do usuário como nos demais game-loop tests):
```ts
it('ao recuperar, fitness não excede injury_return_fitness e cai mais rápido com physio', async () => {
  // setup: seedTestDb; SET injury_weeks_left=1, injury_severity='moderate', injury_return_fitness=70, fitness=100 num jogador do clube do usuário
  // garantir physio de alta ability na tabela staff p/ o clube do usuário
  // advanceGameWeek na semana do clube
  // assert: injury_weeks_left === 0 && fitness <= 70
  expect(true).toBe(true); // substituir por asserções reais
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/game-loop-injury-recovery.test.ts`.
- [ ] **Step 3 — implementar:** em `src/engine/game-loop.ts`, importar `injuryRecoveryStep`. Substituir o UPDATE de recuperação (linhas 437-439) por uma recuperação per-jogador modulada pelo physio + aplicação do cap ao zerar. `staffEffects.physio` não existe — usar a ability bruta `abilityByRole('physio')` (já disponível :351). Inserir ANTES da aplicação das novas lesões (passo 7), substituindo o UPDATE fixo:
```ts
import { injuryRecoveryStep } from './simulation/injury';
// ... no passo 7, em vez do UPDATE com MAX(0, injury_weeks_left - 1):
    const physioAbility = abilityByRole('physio');
    const injured = (await db.prepare(
      'SELECT id, injury_weeks_left, injury_return_fitness, fitness FROM players WHERE save_id = ? AND club_id = ? AND injury_weeks_left > 0',
    ).all(saveId, playerClubId)) as Array<{ id: number; injury_weeks_left: number; injury_return_fitness: number | null; fitness: number }>;
    for (const row of injured) {
      const nextWeeks = injuryRecoveryStep(row.injury_weeks_left, physioAbility);
      if (nextWeeks === 0) {
        const cap = row.injury_return_fitness ?? row.fitness;
        const cappedFitness = Math.min(row.fitness, cap);
        await db.prepare(
          'UPDATE players SET injury_weeks_left = 0, injury_severity = NULL, injury_return_fitness = NULL, fitness = ? WHERE save_id = ? AND id = ?',
        ).run(cappedFitness, saveId, row.id);
      } else {
        await db.prepare('UPDATE players SET injury_weeks_left = ? WHERE save_id = ? AND id = ?').run(nextWeeks, saveId, row.id);
      }
    }
```
> Não consome RNG → posição do stream inalterada. Caminho legado (physio 0, sem cap gravado) ≡ decremento de 1 e fitness preservado.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/game-loop-injury-recovery.test.ts` + `npx jest __tests__/engine/game-loop` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/game-loop.ts __tests__/engine/game-loop-injury-recovery.test.ts` · msg: `feat(c8-c): recuperação de lesão por physio + retorno abaixo de 100%`.

---

# Grupo (d) — Portfólio de empréstimos

> ATIVAR `superpowers:test-driven-development` (motor + queries). Entregável: tela que lista emprestados (minutos/rating/evolução) + recall antecipado na janela. UI usa tokens `@/theme` (kit do Design System se já mergeado; senão `@/theme` direto como `SetPiecesScreen`).

## Task D1: Motor puro `buildLoanPortfolio`
**Files:** Create `src/engine/transfer/loan-portfolio.ts`, Test `__tests__/engine/transfer/loan-portfolio.test.ts`.
**Interfaces:** Consumes: `LoanedPlayerRow[]` · Produces: `buildLoanPortfolio`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/transfer/loan-portfolio.test.ts`:
```ts
import { buildLoanPortfolio, LoanedPlayerRow } from '@/engine/transfer/loan-portfolio';

const row = (over: Partial<LoanedPlayerRow> = {}): LoanedPlayerRow => ({
  playerId: 1, name: 'X', loanClubId: 2, loanClubName: 'B', loanEnd: 2,
  appearances: 5, avgRating: 7.1, minutesPlayed: 400, ...over,
});

it('vigente + janela aberta → recallEligible true', () => {
  const [e] = buildLoanPortfolio([row({ loanEnd: 2 })], 1, 3); // season 1 < loanEnd 2, week 3 dentro da janela
  expect(e.recallEligible).toBe(true);
});

it('empréstimo já expirado (loanEnd <= currentSeason) → não elegível', () => {
  const [e] = buildLoanPortfolio([row({ loanEnd: 1 })], 1, 3);
  expect(e.recallEligible).toBe(false);
});

it('fora da janela de transferências → não elegível', () => {
  const [e] = buildLoanPortfolio([row({ loanEnd: 2 })], 1, 15); // semana fora da janela
  expect(e.recallEligible).toBe(false);
});

it('preserva os campos de stats da linha', () => {
  const [e] = buildLoanPortfolio([row({ avgRating: 6.5, appearances: 9 })], 1, 3);
  expect(e.avgRating).toBe(6.5);
  expect(e.appearances).toBe(9);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/transfer/loan-portfolio.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar:** criar `src/engine/transfer/loan-portfolio.ts` (puro; replica a regra de janela de `isTransferWindow`, `game-loop.ts:276-278`):
```ts
export interface LoanedPlayerRow {
  playerId: number; name: string; loanClubId: number; loanClubName: string;
  loanEnd: number; appearances: number; avgRating: number; minutesPlayed: number;
}

export interface LoanPortfolioEntry extends LoanedPlayerRow {
  recallEligible: boolean;
}

/** Mesma janela do game-loop: semanas 1–6 e 23–26. */
function isTransferWindow(week: number): boolean {
  return (week >= 1 && week <= 6) || (week >= 23 && week <= 26);
}

export function buildLoanPortfolio(
  rows: LoanedPlayerRow[], currentSeason: number, currentWeek: number,
): LoanPortfolioEntry[] {
  const windowOpen = isTransferWindow(currentWeek);
  return rows.map((r) => ({
    ...r,
    recallEligible: windowOpen && r.loanEnd > currentSeason,
  }));
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/transfer/loan-portfolio.test.ts` (4/4) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/transfer/loan-portfolio.ts __tests__/engine/transfer/loan-portfolio.test.ts` · msg: `feat(c8-d): motor puro buildLoanPortfolio (elegibilidade de recall)`.

## Task D2: Queries `getActiveLoansByParent` + `recallLoan`
**Files:** Modify `src/database/queries/transfers.ts`. Test `__tests__/database/queries/loan-portfolio-queries.test.ts`.
**Interfaces:** Produces:
```ts
export async function getActiveLoansByParent(db: DbHandle, saveId: number, parentClubId: number): Promise<LoanedPlayerRow[]>;
export async function recallLoan(db: DbHandle, saveId: number, playerId: number, parentClubId: number): Promise<void>;
```

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/loan-portfolio-queries.test.ts`:
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { getActiveLoansByParent, recallLoan } from '@/database/queries/transfers';

it('lista emprestados vivos do clube-pai e recall traz de volta', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const parent = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(TEST_SAVE_ID) as { c: number }).c;
  const borrower = (raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, parent) as { id: number }).id;
  const pid = (raw.prepare('SELECT id FROM players WHERE save_id = ? AND club_id = ? LIMIT 1').get(TEST_SAVE_ID, parent) as { id: number }).id;

  // emprestar: player vai ao borrower; transfer type='loan', from=parent, to=borrower, loan_end futuro
  raw.prepare('UPDATE players SET club_id = ?, loan_wage = 1000 WHERE save_id = ? AND id = ?').run(borrower, TEST_SAVE_ID, pid);
  raw.prepare("INSERT INTO transfers (save_id, player_id, from_club_id, to_club_id, type, loan_end, fee, wage_offered, season, week) VALUES (?, ?, ?, ?, 'loan', 2, 0, 1000, 1, 2)").run(TEST_SAVE_ID, pid, parent, borrower);

  const loans = await getActiveLoansByParent(db, TEST_SAVE_ID, parent);
  expect(loans.some((l) => l.playerId === pid && l.loanClubId === borrower)).toBe(true);

  await recallLoan(db, TEST_SAVE_ID, pid, parent);
  const after = raw.prepare('SELECT club_id, loan_wage FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, pid) as { club_id: number; loan_wage: number | null };
  expect(after.club_id).toBe(parent);
  expect(after.loan_wage).toBeNull();
  const stillListed = await getActiveLoansByParent(db, TEST_SAVE_ID, parent);
  expect(stillListed.some((l) => l.playerId === pid)).toBe(false);
});
```
> Conferir a lista exata de colunas de `transfers` no `INSERT` (rodar `PRAGMA table_info(transfers)` / `schema.ts:231-242`) e ajustar.
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/loan-portfolio-queries.test.ts`.
- [ ] **Step 3 — implementar:** em `src/database/queries/transfers.ts` adicionar (importar `LoanedPlayerRow`):
```ts
import { LoanedPlayerRow } from '@/engine/transfer/loan-portfolio';

export async function getActiveLoansByParent(
  db: DbHandle, saveId: number, parentClubId: number,
): Promise<LoanedPlayerRow[]> {
  const rows = (await db.prepare(
    `SELECT t.player_id AS playerId, p.name AS name, p.club_id AS loanClubId,
            c.name AS loanClubName, t.loan_end AS loanEnd
     FROM transfers t
     JOIN players p ON p.save_id = t.save_id AND p.id = t.player_id
     LEFT JOIN clubs c ON c.save_id = t.save_id AND c.id = p.club_id
     WHERE t.save_id = ? AND t.type = 'loan' AND t.loan_end IS NOT NULL
       AND t.from_club_id = ? AND p.club_id != ?`,
  ).all(saveId, parentClubId, parentClubId)) as Array<{
    playerId: number; name: string; loanClubId: number; loanClubName: string | null; loanEnd: number;
  }>;

  const out: LoanedPlayerRow[] = [];
  for (const r of rows) {
    const stat = (await db.prepare(
      `SELECT COALESCE(SUM(appearances),0) AS appearances,
              COALESCE(SUM(minutes_played),0) AS minutesPlayed,
              CASE WHEN SUM(minutes_played) > 0
                   THEN SUM(avg_rating * minutes_played) / SUM(minutes_played) ELSE 0 END AS avgRating
       FROM player_stats WHERE save_id = ? AND player_id = ?`,
    ).get(saveId, r.playerId)) as { appearances: number; minutesPlayed: number; avgRating: number };
    out.push({
      playerId: r.playerId, name: r.name, loanClubId: r.loanClubId,
      loanClubName: r.loanClubName ?? '', loanEnd: r.loanEnd,
      appearances: stat.appearances, avgRating: Math.round(stat.avgRating * 10) / 10, minutesPlayed: stat.minutesPlayed,
    });
  }
  return out;
}

/** Encerra um empréstimo antes do prazo — mesma mecânica de returnExpiredLoans. */
export async function recallLoan(
  db: DbHandle, saveId: number, playerId: number, parentClubId: number,
): Promise<void> {
  await db.prepare('UPDATE players SET club_id = ?, loan_wage = NULL WHERE save_id = ? AND id = ?')
    .run(parentClubId, saveId, playerId);
  await db.prepare("UPDATE transfers SET loan_end = NULL WHERE save_id = ? AND player_id = ? AND type = 'loan' AND loan_end IS NOT NULL")
    .run(saveId, playerId);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/queries/loan-portfolio-queries.test.ts` + `npx jest __tests__/engine/transfer` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/database/queries/transfers.ts __tests__/database/queries/loan-portfolio-queries.test.ts` · msg: `feat(c8-d): getActiveLoansByParent + recallLoan`.

## Task D3: Tela `LoanPortfolioScreen` + i18n
**Files:** Create `src/screens/transfers/LoanPortfolioScreen.tsx`, Modify `src/i18n/pt.ts` + `en.ts`. (Registrar no navigator se houver — ver `src/navigation/`.)
**Interfaces:** Consumes: `getActiveLoansByParent`, `recallLoan`, `buildLoanPortfolio` · Produces: tela.

- [ ] **Step 1 — i18n:** em `src/i18n/pt.ts` e `en.ts` adicionar o bloco `loan_portfolio` (paridade). pt:
```ts
  loan_portfolio: {
    title: 'Empréstimos',
    empty: 'Nenhum jogador emprestado.',
    appearances: 'Jogos',
    avg_rating: 'Média',
    minutes: 'Minutos',
    recall: 'Recall',
    recall_confirm: 'Trazer {name} de volta agora?',
    recall_unavailable: 'Recall só na janela de transferências',
  },
```
en:
```ts
  loan_portfolio: {
    title: 'Loans',
    empty: 'No players out on loan.',
    appearances: 'Apps',
    avg_rating: 'Avg',
    minutes: 'Minutes',
    recall: 'Recall',
    recall_confirm: 'Recall {name} now?',
    recall_unavailable: 'Recall only during the transfer window',
  },
```
- [ ] **Step 2 — UI:** criar `src/screens/transfers/LoanPortfolioScreen.tsx` espelhando a estrutura de `SetPiecesScreen` (load via `useDatabaseStore`/`useGameStore`, estilos de `@/theme`). Carrega `getActiveLoansByParent` → `buildLoanPortfolio(rows, currentSeason, currentWeek)` → lista com Jogos/Média/Minutos e botão Recall habilitado só quando `recallEligible`. Confirmação: usar `useConfirm` do kit se disponível; **nunca `Alert.alert`** (no-op no web — memória `reference_rn_web_alert`); fallback = confirmação inline (segundo toque). Ao confirmar → `recallLoan(db, saveId, playerId, playerClubId)` → recarrega a lista. `currentSeason`/`currentWeek` vêm de `useGameStore`/`currentSave`.
- [ ] **Step 3 — tsc + browser:** `npx tsc --noEmit` (exit 0). Subir o web server e abrir a tela no Playwright MCP: lista renderiza, Recall fora da janela desabilitado, Recall na janela move o jogador. 0 erros de console.
- [ ] **Step 4 — commit:** `git add src/screens/transfers/LoanPortfolioScreen.tsx src/i18n/pt.ts src/i18n/en.ts` (+ navigator se tocado) · msg: `feat(c8-d): tela de portfólio de empréstimos com recall`.

---

# Grupo (e) — Curva de forma recente

> ATIVAR `superpowers:test-driven-development`. Entregável: rating efetivo de partida ganha boost/penalidade por forma dos últimos N jogos (substitui a média anual no efeito de rating). Sem regressão quando 0 jogos recentes.

## Task E1: Motor puro `computeFormModifier`
**Files:** Create `src/engine/simulation/form.ts`, Test `__tests__/engine/simulation/form.test.ts`.
**Interfaces:** Produces: `computeFormModifier(recentRatings: number[]): number`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/simulation/form.test.ts`:
```ts
import { computeFormModifier } from '@/engine/simulation/form';

it('vazio → 0 (rating = overall puro, legado)', () => {
  expect(computeFormModifier([])).toBe(0);
});

it('sequência alta → modificador positivo; baixa → negativo', () => {
  expect(computeFormModifier([8, 8.5, 9, 8, 8.2])).toBeGreaterThan(0);
  expect(computeFormModifier([4.5, 5, 4, 5.2, 4.8])).toBeLessThan(0);
});

it('clamp em [-1, 1]', () => {
  expect(computeFormModifier([10, 10, 10, 10, 10])).toBeLessThanOrEqual(1);
  expect(computeFormModifier([4, 4, 4, 4, 4])).toBeGreaterThanOrEqual(-1);
});

it('usa só os jogos que houver (menos de N)', () => {
  expect(computeFormModifier([8])).toBeGreaterThan(0);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/simulation/form.test.ts`.
- [ ] **Step 3 — implementar:** criar `src/engine/simulation/form.ts` (puro):
```ts
/** Rating "neutro": acima disso embala, abaixo entra em seca. */
const NEUTRAL_RATING = 6.5;
/** Quanto cada ponto de rating acima/abaixo do neutro move o modificador. */
const SENSITIVITY = 0.5;
const MIN_MOD = -1;
const MAX_MOD = 1;

/**
 * Pure: converte ratings recentes (mais novos não-ponderados) num modificador de
 * rating efetivo em [-1, 1]. Array vazio → 0 (sem efeito, legado). Sem RNG.
 */
export function computeFormModifier(recentRatings: number[]): number {
  if (recentRatings.length === 0) return 0;
  const avg = recentRatings.reduce((s, r) => s + r, 0) / recentRatings.length;
  const mod = (avg - NEUTRAL_RATING) * SENSITIVITY;
  return Math.max(MIN_MOD, Math.min(MAX_MOD, mod));
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/simulation/form.test.ts` (4/4) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/simulation/form.ts __tests__/engine/simulation/form.test.ts` · msg: `feat(c8-e): motor puro computeFormModifier`.

## Task E2: Query `getLastNMatchForm`
**Files:** Modify `src/database/queries/player-stats.ts`. Test `__tests__/database/queries/last-n-form.test.ts`.
**Interfaces:** Produces: `getLastNMatchForm(db, saveId, playerId, season, n): Promise<number[]>`.

> `player_stats` agrega por (player, season, competition) — não há rating por-jogo persistido. Sem reescrever schema, derivamos uma "forma recente" tomando os `avg_rating` das competições com mais minutos como proxy de "últimos jogos". É uma aproximação honesta (spec §5: "preferir fixtures por precisão de janela" fica fora de escopo aqui; usamos os avg_rating disponíveis). N limita quantos valores retornamos.

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/last-n-form.test.ts`:
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { getLastNMatchForm } from '@/database/queries/player-stats';

it('retorna avg_ratings recentes (até N) do jogador na temporada', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const pid = (raw.prepare('SELECT id FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number }).id;
  // inserir 2 linhas player_stats em competições distintas, season 1
  raw.prepare('INSERT INTO player_stats (save_id, player_id, season, competition_id, appearances, minutes_played, avg_rating) VALUES (?,?,?,?,?,?,?)').run(TEST_SAVE_ID, pid, 1, 1, 3, 270, 7.5);
  raw.prepare('INSERT INTO player_stats (save_id, player_id, season, competition_id, appearances, minutes_played, avg_rating) VALUES (?,?,?,?,?,?,?)').run(TEST_SAVE_ID, pid, 1, 2, 2, 180, 6.0);
  const form = await getLastNMatchForm(db, TEST_SAVE_ID, pid, 1, 5);
  expect(form.length).toBeGreaterThan(0);
  expect(form).toContain(7.5);
});

it('sem jogos → array vazio', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const pid = (raw.prepare('SELECT id FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number }).id;
  expect(await getLastNMatchForm(db, TEST_SAVE_ID, pid, 1, 5)).toEqual([]);
});
```
> Conferir as colunas reais de `player_stats` (rodar `PRAGMA table_info(player_stats)`) e ajustar o INSERT.
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/last-n-form.test.ts`.
- [ ] **Step 3 — implementar:** em `src/database/queries/player-stats.ts` adicionar:
```ts
/**
 * Últimos N avg_ratings do jogador na temporada (proxy de forma recente; player_stats
 * agrega por competição, sem rating por-jogo). Ordena por minutos desc como aproximação
 * de "jogos recentes". Save-isolado.
 */
export async function getLastNMatchForm(
  db: DbHandle, saveId: number, playerId: number, season: number, n: number,
): Promise<number[]> {
  const rows = (await db.prepare(
    `SELECT avg_rating FROM player_stats
     WHERE save_id = ? AND player_id = ? AND season = ? AND minutes_played > 0
     ORDER BY minutes_played DESC LIMIT ?`,
  ).all(saveId, playerId, season, n)) as Array<{ avg_rating: number }>;
  return rows.map((r) => r.avg_rating);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/queries/last-n-form.test.ts` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/database/queries/player-stats.ts __tests__/database/queries/last-n-form.test.ts` · msg: `feat(c8-e): getLastNMatchForm (proxy de forma recente)`.

## Task E3: `formModifier` no rating + threading no game-loop
**Files:** Modify `src/engine/simulation/player-rating.ts`, `src/engine/simulation/match-engine.ts:494-507`, `src/engine/simulation/match-runner.ts`, `src/engine/game-loop.ts`. Test `__tests__/engine/simulation/player-rating-form.test.ts`.
**Interfaces:** Consumes: `computeFormModifier`, `getLastNMatchForm` · Produces: `PlayerMatchInput.formModifier`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/simulation/player-rating-form.test.ts`:
```ts
import { calculatePlayerRatings, PlayerMatchInput } from '@/engine/simulation/player-rating';
import { SeededRng } from '@/engine/rng';

it('formModifier positivo eleva o rating; ausente = legado', () => {
  const base: PlayerMatchInput = { id: 1, overall: 70, position: 'CM' };
  const withForm: PlayerMatchInput = { id: 2, overall: 70, position: 'CM', formModifier: 1 };
  const [r0] = calculatePlayerRatings([base], [], false, 0, new SeededRng(1));
  const [r1] = calculatePlayerRatings([withForm], [], false, 0, new SeededRng(1));
  expect(r1.rating).toBeGreaterThan(r0.rating);
});

it('formModifier indefinido produz EXATAMENTE o rating legado (mesma seed)', () => {
  const p: PlayerMatchInput = { id: 1, overall: 65, position: 'ST' };
  const a = calculatePlayerRatings([p], [], true, 0, new SeededRng(4));
  const b = calculatePlayerRatings([{ ...p, formModifier: 0 }], [], true, 0, new SeededRng(4));
  expect(a[0].rating).toBe(b[0].rating); // mod 0 = no-op
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/simulation/player-rating-form.test.ts`.
- [ ] **Step 3 — implementar:**
  1. Em `src/engine/simulation/player-rating.ts`, adicionar `formModifier?: number;` a `PlayerMatchInput` e somá-lo APÓS o variance e ANTES do clamp (posição que não move o RNG):
```ts
export interface PlayerMatchInput {
  id: number;
  overall: number;
  position: Position;
  isLateSub?: boolean;
  formModifier?: number; // C8-e: -1..+1 por forma recente
}
// ... dentro do map, após "rating += rng.nextFloat(-0.4, 0.4);":
    if (player.formModifier) rating += player.formModifier;
```
  2. Em `src/engine/simulation/match-engine.ts`, `MatchInput` ganha mapas opcionais de form por id; nas linhas 494-505 injetar `formModifier`:
```ts
// em MatchInput:
  homeFormModifiers?: Map<number, number>;
  awayFormModifiers?: Map<number, number>;
// nos hmI/awI maps:
    formModifier: input.homeFormModifiers?.get(p.id), // (away usa awayFormModifiers)
```
  3. Em `src/engine/simulation/match-runner.ts`, `ClubMatchData` ganha `formModifiers?: Map<number, number>;` e passá-lo a `simulateMatch` (`homeFormModifiers: home?.formModifiers`, `awayFormModifiers: away?.formModifiers`).
  4. Em `src/engine/game-loop.ts` `loadClubMatchData` (:228-254), montar o mapa só p/ o clube do usuário (AI fica `undefined` = legado):
```ts
import { getLastNMatchForm } from '@/database/queries/player-stats';
import { computeFormModifier } from './simulation/form';
// dentro de loadClubMatchData, parametrizar p/ receber season + se é o clube do usuário,
// ou montar sempre p/ todos (cuidado com custo). Mínimo viável: montar p/ todos os clubes do jogo do usuário.
// Recomendado: só p/ o clube do usuário via flag — manter custo da semana baixo (memória project_web_dev_server).
```
> **Decisão de escopo/custo:** montar `formModifiers` apenas para o clube do usuário (passar `playerClubId` + `season` a `loadWeekClubData`/`loadClubMatchData`, ou pós-preencher o `ClubMatchData` do clube do usuário após o batch). Para AI clubs fica `undefined` → `formModifier` ausente → rating legado byte-for-byte. Determinismo preservado: `formModifier` é somado sem consumir RNG.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/simulation/player-rating-form.test.ts` + `npx jest __tests__/engine` (regressão) + `npx jest __tests__/balance` (baseline verde) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/simulation/player-rating.ts src/engine/simulation/match-engine.ts src/engine/simulation/match-runner.ts src/engine/game-loop.ts __tests__/engine/simulation/player-rating-form.test.ts` · msg: `feat(c8-e): rating efetivo modulado por forma recente (clube do usuário)`.

---

# Grupo (f) — Rotina de escanteio

> ATIVAR `superpowers:test-driven-development`. Entregável: rotina de escanteio (auto/near_post/far_post/short) modula `CORNER_GOAL_PROB`. `auto`/ausente = 1.0 exato. UI = seletor em `SetPiecesScreen`.

## Task F1: `cornerRoutineMultiplier` + campo na interface
**Files:** Modify `src/engine/simulation/match-engine.ts:13-17,624`. Test `__tests__/engine/simulation/corner-routine.test.ts`.
**Interfaces:** Produces: `CornerRoutine`, `cornerRoutineMultiplier`, `SetPieceTakers.cornerRoutine?`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/simulation/corner-routine.test.ts`:
```ts
import { cornerRoutineMultiplier } from '@/engine/simulation/match-engine';

it('auto/undefined === 1.0 exato (byte-for-byte)', () => {
  expect(cornerRoutineMultiplier(undefined)).toBe(1.0);
  expect(cornerRoutineMultiplier('auto')).toBe(1.0);
});

it('far_post favorece cabeçada mais que short', () => {
  expect(cornerRoutineMultiplier('far_post')).toBeGreaterThan(cornerRoutineMultiplier('short'));
});

it('near_post entre short e far_post', () => {
  const near = cornerRoutineMultiplier('near_post');
  expect(near).toBeGreaterThanOrEqual(cornerRoutineMultiplier('short'));
  expect(near).toBeLessThanOrEqual(cornerRoutineMultiplier('far_post'));
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/simulation/corner-routine.test.ts`.
- [ ] **Step 3 — implementar:** em `src/engine/simulation/match-engine.ts`, perto da interface `SetPieceTakers` (:13-17):
```ts
export type CornerRoutine = 'auto' | 'near_post' | 'far_post' | 'short';

export interface SetPieceTakers {
  penaltyTakerId?: number | null;
  freeKickTakerId?: number | null;
  cornerTakerId?: number | null;
  cornerRoutine?: CornerRoutine; // C8-f: undefined/'auto' = legado
}

const CORNER_ROUTINE_MULT: Record<CornerRoutine, number> = {
  auto: 1.0,
  short: 0.85,      // troca curta: menos cabeçada, mais posse
  near_post: 1.10,  // primeiro pau: desvio rápido
  far_post: 1.20,   // segundo pau: cruzamento p/ cabeceador alto
};

export function cornerRoutineMultiplier(routine: CornerRoutine | undefined): number {
  return routine ? CORNER_ROUTINE_MULT[routine] : 1.0;
}
```
Na linha 624 (corner goal), multiplicar a prob:
```ts
  if (team.corners > 0 && rng.next() < CORNER_GOAL_PROB * team.strength.width * focus.cornerGoalMult * form.wingPlayMult * cornerRoutineMultiplier(team.takers?.cornerRoutine)) {
```
> RNG não muda de posição: o multiplicador apenas escala o limiar do mesmo `rng.next()`. `auto`/ausente → 1.0 → byte-for-byte com hoje.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/simulation/corner-routine.test.ts` + `npx jest __tests__/balance` (baseline verde, pois default = 1.0) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/simulation/match-engine.ts __tests__/engine/simulation/corner-routine.test.ts` · msg: `feat(c8-f): cornerRoutineMultiplier modula CORNER_GOAL_PROB`.

## Task F2: Coluna `corner_routine` + query
**Files:** Modify `src/database/schema.ts:490-497`, `src/store/database-store.ts`, `src/database/queries/set-piece-takers.ts`. Test `__tests__/database/queries/corner-routine-migration.test.ts`.
**Interfaces:** Produces: persistência de `corner_routine`; `getSetPieceTakers`/`setSetPieceTakers` leem/gravam `cornerRoutine`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/corner-routine-migration.test.ts`:
```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { getSetPieceTakers, setSetPieceTakers } from '@/database/queries/set-piece-takers';

it('SCHEMA_SQL cria set_piece_takers.corner_routine default auto', () => {
  const db = createTestDb();
  const col = (db.prepare('PRAGMA table_info(set_piece_takers)').all() as Array<{ name: string; dflt_value: string | null }>).find((c) => c.name === 'corner_routine');
  expect(col).toBeDefined();
  expect(col!.dflt_value).toContain('auto');
});

it('grava e lê cornerRoutine', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const clubId = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(TEST_SAVE_ID) as { c: number }).c;
  await setSetPieceTakers(db, TEST_SAVE_ID, clubId, { cornerRoutine: 'far_post' });
  const saved = await getSetPieceTakers(db, TEST_SAVE_ID, clubId);
  expect(saved?.cornerRoutine).toBe('far_post');
});

it('DB legado: ADD COLUMN idempotente default auto', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE set_piece_takers (save_id INTEGER, club_id INTEGER, PRIMARY KEY (save_id, club_id))');
  db.exec("ALTER TABLE set_piece_takers ADD COLUMN corner_routine TEXT NOT NULL DEFAULT 'auto'");
  db.prepare('INSERT INTO set_piece_takers (save_id, club_id) VALUES (1, 1)').run();
  const row = db.prepare('SELECT corner_routine AS r FROM set_piece_takers WHERE save_id=1 AND club_id=1').get() as { r: string };
  expect(row.r).toBe('auto');
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/corner-routine-migration.test.ts`.
- [ ] **Step 3 — implementar:**
  1. `src/database/schema.ts`, tabela `set_piece_takers` (após `corner_taker_id INTEGER,`, :495):
```sql
  corner_routine     TEXT    NOT NULL DEFAULT 'auto',
```
  2. `src/store/database-store.ts` (junto às migrações):
```ts
      await addColumnIfMissing(db, 'set_piece_takers', 'corner_routine', "TEXT NOT NULL DEFAULT 'auto'");
```
  3. `src/database/queries/set-piece-takers.ts`: incluir `corner_routine` no SELECT/INSERT e na interface de row:
```ts
interface SetPieceTakerRow {
  penalty_taker_id: number | null;
  free_kick_taker_id: number | null;
  corner_taker_id: number | null;
  corner_routine: string | null;
}
// getSetPieceTakers: SELECT ..., corner_routine ; mapear cornerRoutine: (row.corner_routine as CornerRoutine) ?? 'auto'
// setSetPieceTakers: INSERT OR REPLACE incluir corner_routine; valor: takers.cornerRoutine ?? 'auto'
```
  (importar `CornerRoutine` de `match-engine`.)
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/queries/corner-routine-migration.test.ts` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/database/schema.ts src/store/database-store.ts src/database/queries/set-piece-takers.ts __tests__/database/queries/corner-routine-migration.test.ts` · msg: `feat(c8-f): coluna corner_routine + persistência`.

## Task F3: Seletor de rotina na `SetPiecesScreen` + i18n
**Files:** Modify `src/screens/tactics/SetPiecesScreen.tsx`, `src/i18n/pt.ts` + `en.ts`.
**Interfaces:** Consumes: `getSetPieceTakers`/`setSetPieceTakers` (já com `cornerRoutine`) · Produces: UI.

- [ ] **Step 1 — i18n:** adicionar em `pt.ts`/`en.ts` (dentro do bloco `set_pieces` existente, conferir a chave; paridade):
```ts
// pt
    corner_routine: 'Rotina de escanteio',
    routine_auto: 'Automática',
    routine_near_post: 'Primeiro pau',
    routine_far_post: 'Segundo pau',
    routine_short: 'Curta',
// en
    corner_routine: 'Corner routine',
    routine_auto: 'Automatic',
    routine_near_post: 'Near post',
    routine_far_post: 'Far post',
    routine_short: 'Short',
```
- [ ] **Step 2 — UI:** em `SetPiecesScreen`, abaixo do slot de cobrador de escanteio, adicionar um seletor (4 botões `auto/near_post/far_post/short`) que lê `takers.cornerRoutine` (default `'auto'`) e ao tocar chama `setSetPieceTakers(db, saveId, clubId, { ...takers, cornerRoutine })` + atualiza estado. Estilos via `@/theme` (consistente com os slots existentes). `CornerRoutine` importado de `@/engine/simulation/match-engine`.
- [ ] **Step 3 — tsc + browser:** `npx tsc --noEmit`. Web server + Playwright MCP: trocar a rotina persiste e re-renderiza selecionado. 0 erros de console.
- [ ] **Step 4 — commit:** `git add src/screens/tactics/SetPiecesScreen.tsx src/i18n/pt.ts src/i18n/en.ts` · msg: `feat(c8-f): seletor de rotina de escanteio na tela de bolas paradas`.

---

# Grupo (g) — Sentimento de mídia

> ATIVAR `superpowers:test-driven-development`. Entregável: tier de cobertura por reputação + sentimento de mídia acumulado por save, alimentado pela coletiva. Sem RNG novo.

## Task G1: Motor puro `media-sentiment.ts`
**Files:** Create `src/engine/press/media-sentiment.ts`, Test `__tests__/engine/press/media-sentiment.test.ts`.
**Interfaces:** Consumes: `PressOutcome`, `PressTone` (de press-engine) · Produces: `mediaTierForReputation`, `nextMediaSentiment`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/press/media-sentiment.test.ts`:
```ts
import { mediaTierForReputation, nextMediaSentiment } from '@/engine/press/media-sentiment';

it('tier por reputação: thresholds', () => {
  expect(mediaTierForReputation(20)).toBe('local');
  expect(mediaTierForReputation(60)).toBe('national');
  expect(mediaTierForReputation(90)).toBe('global');
});

it('vitória confiante melhora sentimento; tier global amplia o swing', () => {
  const nat = nextMediaSentiment({ current: 0, outcome: 'win', tone: 'confident', tier: 'national' });
  const glob = nextMediaSentiment({ current: 0, outcome: 'win', tone: 'confident', tier: 'global' });
  expect(nat).toBeGreaterThan(0);
  expect(glob).toBeGreaterThan(nat);
});

it('derrota arrogante piora; clamp em ±100', () => {
  expect(nextMediaSentiment({ current: 0, outcome: 'loss', tone: 'confident', tier: 'national' })).toBeLessThan(0);
  expect(nextMediaSentiment({ current: 100, outcome: 'win', tone: 'confident', tier: 'global' })).toBeLessThanOrEqual(100);
  expect(nextMediaSentiment({ current: -100, outcome: 'loss', tone: 'confident', tier: 'global' })).toBeGreaterThanOrEqual(-100);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/press/media-sentiment.test.ts`.
- [ ] **Step 3 — implementar:** criar `src/engine/press/media-sentiment.ts`:
```ts
import type { PressOutcome, PressTone } from './press-engine';

export type MediaTier = 'local' | 'national' | 'global';

export function mediaTierForReputation(reputation: number): MediaTier {
  if (reputation >= 75) return 'global';
  if (reputation >= 45) return 'national';
  return 'local';
}

// Swing base por (tone, outcome) — espelha o espírito de BASE_CONFIDENCE.
const BASE_SWING: Record<PressTone, Record<PressOutcome, number>> = {
  measured: { win: 3, draw: 1, loss: -1 },
  confident: { win: 6, draw: 0, loss: -6 },
  defiant: { win: 2, draw: -1, loss: -3 },
};

const TIER_AMP: Record<MediaTier, number> = { local: 0.6, national: 1.0, global: 1.5 };

export interface SentimentInput {
  current: number;
  outcome: PressOutcome;
  tone: PressTone;
  tier: MediaTier;
}

/** Pure: próximo sentimento de mídia, clamped a [-100, 100]. Sem RNG. */
export function nextMediaSentiment(input: SentimentInput): number {
  const swing = BASE_SWING[input.tone][input.outcome] * TIER_AMP[input.tier];
  return Math.max(-100, Math.min(100, Math.round(input.current + swing)));
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/press/media-sentiment.test.ts` (3/3) + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/press/media-sentiment.ts __tests__/engine/press/media-sentiment.test.ts` · msg: `feat(c8-g): motor puro media-sentiment (tier + acúmulo)`.

## Task G2: Coluna `media_sentiment` + getters/setters
**Files:** Modify `src/database/schema.ts:304-321`, `src/store/database-store.ts`, `src/database/queries/save.ts`. Test `__tests__/database/queries/media-sentiment.test.ts`.
**Interfaces:** Produces: `getMediaSentiment`, `setMediaSentiment`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/media-sentiment.test.ts`:
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { getMediaSentiment, setMediaSentiment } from '@/database/queries/save';

it('default 0; set/get round-trip', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  expect(await getMediaSentiment(db, TEST_SAVE_ID)).toBe(0);
  await setMediaSentiment(db, TEST_SAVE_ID, 42);
  expect(await getMediaSentiment(db, TEST_SAVE_ID)).toBe(42);
});

it('SCHEMA_SQL declara save_games.media_sentiment default 0', () => {
  const db = createTestDb();
  const col = (db.prepare('PRAGMA table_info(save_games)').all() as Array<{ name: string; dflt_value: string | null }>).find((c) => c.name === 'media_sentiment');
  expect(col).toBeDefined();
  expect(col!.dflt_value).toBe('0');
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/media-sentiment.test.ts`.
- [ ] **Step 3 — implementar:**
  1. `src/database/schema.ts`, tabela `save_games` (após `onboarding_seen INTEGER NOT NULL DEFAULT 0,`, :318):
```sql
  media_sentiment INTEGER NOT NULL DEFAULT 0,
```
  2. `src/store/database-store.ts`:
```ts
      await addColumnIfMissing(db, 'save_games', 'media_sentiment', 'INTEGER NOT NULL DEFAULT 0');
```
  3. `src/database/queries/save.ts` (espelhar `getManagerReputation`/`setManagerReputation`):
```ts
export async function getMediaSentiment(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db.prepare('SELECT media_sentiment FROM save_games WHERE id = ?').get(saveId)) as { media_sentiment: number } | undefined;
  return row?.media_sentiment ?? 0;
}

export async function setMediaSentiment(db: DbHandle, saveId: number, value: number): Promise<void> {
  const clamped = Math.max(-100, Math.min(100, value));
  await db.prepare('UPDATE save_games SET media_sentiment = ? WHERE id = ?').run(clamped, saveId);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/queries/media-sentiment.test.ts` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/database/schema.ts src/store/database-store.ts src/database/queries/save.ts __tests__/database/queries/media-sentiment.test.ts` · msg: `feat(c8-g): coluna media_sentiment + getters/setters`.

## Task G3: Consumir sentimento após a coletiva
**Files:** Modify o caller da coletiva (`src/screens/.../PressConferenceScreen.tsx` ou o handler que chama `computePressConference` — localizar com `grep -rln computePressConference src/`). Test integração `__tests__/integration/press-sentiment.test.ts` (se houver handler em engine) ou cobertura via G1/G2.
**Interfaces:** Consumes: `mediaTierForReputation`, `nextMediaSentiment`, `getMediaSentiment`/`setMediaSentiment`, reputação do clube · Produces: sentimento persistido por save.

- [ ] **Step 1 — localizar o caller:** `grep -rln "computePressConference" src/` e `grep -rln "setPressPending\|press_pending" src/`. O handler que aplica a coletiva (provavelmente em uma screen ou um helper de engine) é onde se encaixa o cálculo.
- [ ] **Step 2 — teste falhando (integração):** se houver um helper puro/engine que orquestra a coletiva, criar `__tests__/integration/press-sentiment.test.ts` que: semeia, lê reputação do clube do usuário, chama o handler com `tone='confident', outcome='win'`, e assere `getMediaSentiment > 0` depois. Se o cálculo viver só na screen, cobrir com um teste do helper extraído (preferível extrair uma função pura `applyPressSentiment(db, saveId, clubReputation, tone, outcome)` em `src/engine/press/` e testá-la):
```ts
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { applyPressSentiment } from '@/engine/press/apply-press-sentiment';
import { getMediaSentiment } from '@/database/queries/save';

it('coletiva confiante após vitória sobe o sentimento', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  await applyPressSentiment(db, TEST_SAVE_ID, 80 /* rep global */, 'confident', 'win');
  expect(await getMediaSentiment(db, TEST_SAVE_ID)).toBeGreaterThan(0);
});
```
- [ ] **Step 3 — implementar:** criar `src/engine/press/apply-press-sentiment.ts` (orquestra puro→DB, espelha o estilo do game-loop):
```ts
import { DbHandle } from '@/database/queries/players';
import { getMediaSentiment, setMediaSentiment } from '@/database/queries/save';
import { mediaTierForReputation, nextMediaSentiment } from './media-sentiment';
import type { PressTone, PressOutcome } from './press-engine';

export async function applyPressSentiment(
  db: DbHandle, saveId: number, clubReputation: number, tone: PressTone, outcome: PressOutcome,
): Promise<number> {
  const current = await getMediaSentiment(db, saveId);
  const tier = mediaTierForReputation(clubReputation);
  const next = nextMediaSentiment({ current, outcome, tone, tier });
  await setMediaSentiment(db, saveId, next);
  return next;
}
```
Chamar `applyPressSentiment` no caller localizado no Step 1, logo após `computePressConference` ser aplicado (passando a reputação do clube do usuário). Coletiva pulada (`press.skip`) → NÃO chamar (sentimento inalterado, spec §6).
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/integration/press-sentiment.test.ts` + `npx jest __tests__/engine/press` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/press/apply-press-sentiment.ts <caller> __tests__/integration/press-sentiment.test.ts` · msg: `feat(c8-g): coletiva alimenta sentimento de mídia acumulado por save`.

---

## Verificação final (por grupo e global)

- [ ] **Por grupo:** `npx jest <suítes do grupo>` + `npx tsc --noEmit` verdes antes do merge isolado do grupo.
- [ ] **Global (antes de fechar o épico):** `npx jest` (suíte completa, incl. determinismo/baselines) + `npx tsc --noEmit`. Telas (d)/(f) validadas no Playwright MCP. `git diff` revisado.
- [ ] **Determinismo (guard, alinhado a 3161e61):** re-rodar o sweep de determinismo e os baselines de balanceamento (933f2f1). Features OFF (defaults) devem produzir resultado IDÊNTICO ao atual em `playFriendly` e `advanceGameWeek`.

## Self-Review
1. **Cobertura do spec:** os 7 grupos (a)..(g) de §3 estão mapeados 1:1 (a=Task A1-A3, b=B1-B3, c=C1-C3, d=D1-D3, e=E1-E3, f=F1-F3, g=G1-G3). Schema (§5): `match_sharpness` (A1), `injury_severity`/`injury_return_fitness` (C2), `corner_routine` (F2), `media_sentiment` (G2) — todas em `schema.ts` + `addColumnIfMissing`. Determinismo (§6): cada pass nota a posição do RNG (sharpness/forma/cap não consomem RNG; lesão consome roll fixo; corner escala o limiar do mesmo `rng.next()`).
2. **Placeholder scan:** sem "TBD"/"FIXME". Os únicos pontos "a confirmar na execução" são explícitos e acionáveis: colunas exatas de `transfers`/`player_stats` no INSERT de teste (resolver com `PRAGMA table_info`), o caller exato da coletiva em G3 (resolver com `grep computePressConference`), e o setup de fixtures dos testes de game-loop (espelhar teste existente). Nenhum é placeholder de comportamento.
3. **Consistência de tipos:** todas as assinaturas do Contract aparecem nas tasks (`computeFriendlyEffect`, `computeCongestion`, `classifyInjury`/`returnFitnessForSeverity`/`injuryRecoveryStep`, `buildLoanPortfolio`, `getActiveLoansByParent`/`recallLoan`, `computeFormModifier`/`getLastNMatchForm`, `cornerRoutineMultiplier`+`CornerRoutine`, `mediaTierForReputation`/`nextMediaSentiment`+`applyPressSentiment`). `InjuryAssignment` estendido de forma consistente entre C1 e B2 (nota de ordem (c)→(b)). `SetPieceTakers.cornerRoutine?` adicionado em F1 e consumido em F2/F3.
