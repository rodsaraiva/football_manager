# W0 — Career-Loop Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a rede de regressão de carreira multi-temporada: extrair a virada de temporada para funções headless reutilizáveis e escrever um e2e que joga ≥3 temporadas com aceitar/recusar oferta de emprego, determinístico (5×).

**Architecture:** Hoje a cerimônia de fim-de-temporada vive na UI (`EndOfSeasonScreen`): o *load-effect* avalia a diretoria/reputação/ofertas; o `handleContinue` faz a mutação (assistentes + promoção/rebaixamento + `rolloverSeason`). `advanceGameWeek` **não** roda a virada. Extraímos duas funções headless — `evaluateSeasonEndBoard` (avaliação) e `runSeasonTransition` (mutação) — usadas pela UI **e** pelo e2e (e depois pelo W2). O e2e dirige `advanceGameWeek` até `isSeasonEnd`, chama as duas + responde ao gate de ofertas, e repete por 3 temporadas.

**Tech Stack:** TypeScript, Jest + ts-jest, better-sqlite3 (e2e real em memória), SeededRng.

**Convenções:** TDD; `src/engine/` puro de React (orquestradores tocam DB como `game-loop.ts`); colunas novas em schema.ts E database-store.ts (n/a aqui); save-isolation `(db, saveId, …)`; nunca `Math.random`/`Date.now`/`ORDER BY RANDOM` em caminhos de engine; commits pequenos terminando com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch: `feat/w0-career-loop`.

> **Fatos verificados (revisão adversarial 2026-06-14):**
> - ✅ `ensureSeasonFixtures(db, saveId, season)` regenera o calendário para **TODOS os clubes de TODAS as ligas** (não só o do jogador) — logo, após uma troca de clube o novo clube TEM fixtures na nova temporada. (`calendar.ts`: `getAllLeagues`→`getClubsByLeague`→`generateSeasonCalendar`; heurística regenera se <100 fixtures.)
> - ✅ `acceptJobOffer(p)` exige `p = { db, saveId, offeringClubId, offerSeason, newSeason, rng }` (DOIS campos de temporada). `acceptJobOffer` **não** roda `rolloverSeason` — por isso o e2e roda `runSeasonTransition` ANTES de responder ao gate (espelha a UI).
> - ✅ Query de assistentes: `getAssistantsBySave(db, saveId)` (NÃO existe `getAssistantsByClub`). `processAssistantsSeasonEnd(db, saveId)` persiste o envelhecimento no DB.
> - ⚠️ `AssistantCandidate` (`src/types/assistant.ts`) **NÃO tem** `retirementAge` (é computado em `generateAssistant` para o tipo persistente). Logo Task 1 semeia localmente.
> - Os testes e2e deste repo usam `ctx.rawDb.prepare(...)` livremente (ver `full-season.e2e.test.ts`) — é o padrão estabelecido; manter.

---

## File Structure

- **Create** `src/engine/season/season-transition.ts` — `runSeasonTransition(...)`: assistentes + promoção/rebaixamento + `rolloverSeason`. Headless.
- **Create** `src/engine/season/season-end-eval.ts` — `evaluateSeasonEndBoard(...)`: stats finais + `processSeasonEndBoard` + acúmulo de reputação do treinador + geração de ofertas. Retorna resultado estruturado (sem tocar stores/achievements — isso fica na UI).
- **Modify** `src/screens/EndOfSeasonScreen.tsx` — load-effect chama `evaluateSeasonEndBoard`; `handleContinue` chama `runSeasonTransition`. Comportamento idêntico.
- **Modify** `src/screens/club/AssistantHiringScreen.tsx:108` — remove `Math.random` (usa `candidate.retirementAge`).
- **Modify** `src/engine/competition/round-progression.ts:139` — `ORDER BY group_name, club_id` na query de entries (determinismo do chaveamento da CL).
- **Modify** `__tests__/e2e/test-helpers.ts` — `playUntilSeasonEnd`, `endSeasonHeadless`, `respondToJobOfferGate`.
- **Create** `__tests__/e2e/career-loop.e2e.test.ts` — 3 temporadas, aceitar+recusar, asserts expandidos, reprodutibilidade.
- **Test** `__tests__/engine/season/season-transition.test.ts`, `__tests__/engine/season/season-end-eval.test.ts`.

**Signature contract (use estas assinaturas EXATAS em todas as tasks):**

```ts
// season-transition.ts
export async function runSeasonTransition(
  db: DbHandle,
  params: { saveId: number; playerClubId: number; endedSeason: number; newSeason: number; youthAcademyLevel: number; rng: SeededRng },
): Promise<RolloverSeasonResult>; // RolloverSeasonResult de @/engine/season-rollover

// season-end-eval.ts
export interface SeasonEndEval {
  stats: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; leaguePosition: number | null; totalTeams: number; income: number; expenses: number };
  board: import('@/engine/board/season-end-board').SeasonEndBoardResult;
  managerRep: { before: number; after: number; delta: number };
  wonCup: boolean;
  wasPromoted: boolean;
  wasRelegated: boolean;
  generatedOfferClubIds: number[]; // [] se demitido ou sem ofertas
}
export async function evaluateSeasonEndBoard(
  db: DbHandle,
  params: { saveId: number; playerClubId: number; clubReputation: number; endedSeason: number; newSeason: number; competitions: { id: number; type: string }[]; offerRng: SeededRng },
): Promise<SeasonEndEval>;
```

---

## Task 1: W5 micro-fix — AssistantHiring usa retirementAge semeado

**Files:**
- Modify: `src/screens/club/AssistantHiringScreen.tsx:108`
- Read first: `src/engine/assistant/assistant-engine.ts` (a candidata já vem de `generateAssistant`, que computa `retirementAge` via `rng.nextInt(ASSISTANT_RETIREMENT_MIN_AGE, ASSISTANT_RETIREMENT_MAX_AGE)`).

> **Verificado:** `AssistantCandidate` NÃO tem `retirementAge`; é preciso semear com `SeededRng` (espelhando `assistant-engine.ts:69` que usa `rng.nextInt(ASSISTANT_RETIREMENT_MIN_AGE, ASSISTANT_RETIREMENT_MAX_AGE)`).

- [ ] **Step 1: Confirmar as constantes.**

Run: `grep -n "ASSISTANT_RETIREMENT_MIN_AGE\|ASSISTANT_RETIREMENT_MAX_AGE" src/engine/balance.ts`
Expected: ambas existem (min/max, ex.: 60/70). Anote os nomes exatos.

- [ ] **Step 2: Semear `retirementAge` localmente.** Em `src/screens/club/AssistantHiringScreen.tsx`: adicionar imports `import { SeededRng } from '@/engine/rng';` e `import { ASSISTANT_RETIREMENT_MIN_AGE, ASSISTANT_RETIREMENT_MAX_AGE } from '@/engine/balance';`. Dentro do `onPress` handler (antes do `insertAssistant`), criar o rng e usar:

```ts
const retireRng = new SeededRng((currentSave.id * 131) + ((playerClubId ?? 0) * 7) + season + candidate.age);
// ...
await insertAssistant(dbHandle, {
  // ...campos existentes inalterados...
  retirementAge: retireRng.nextInt(ASSISTANT_RETIREMENT_MIN_AGE, ASSISTANT_RETIREMENT_MAX_AGE),
  // ...
});
```
Remover a linha `retirementAge: 60 + Math.floor(Math.random() * 11),`.

- [ ] **Step 3: type-check.**

Run: `npx tsc --noEmit`
Expected: exit 0. Confirmar 0 ocorrências de `Math.random` na tela: `grep -n "Math.random" src/screens/club/AssistantHiringScreen.tsx` → vazio.

- [ ] **Step 4: Commit.**

```bash
git add src/screens/club/AssistantHiringScreen.tsx
git commit -m "fix(determinism): retirementAge de assistente sem Math.random"
```

---

## Task 2: W5 micro-fix — ordem determinística dos grupos da CL

**Files:**
- Modify: `src/engine/competition/round-progression.ts:138-140`

> A auditoria sugeriu `.sort()` no loop da linha 155 — **incorreto** (esse loop ordena clubes DENTRO de cada grupo, já determinístico). A ordem das CHAVES de `groups` (passado a `seedClChampionsKnockout`) vem da ordem de inserção = ordem da query `entries`, que não tem `ORDER BY`. O fix correto é ordenar a query.

- [ ] **Step 1: Escrever teste de determinismo do chaveamento.**

Test: `__tests__/engine/competition/round-progression-determinism.test.ts`
```ts
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../../database/test-helpers';
// (use o mesmo padrão de setup do cup-to-champion.e2e.test.ts para chegar ao estágio de grupos da CL)
// Asserção mínima: rodar maybeSeedClKnockout-equivalente duas vezes em DBs idênticos
// e comparar as fixtures de mata-mata geradas (homeClubId/awayClubId por rodada) — devem ser idênticas.
```
Se montar o estágio de grupos for caro, **pular este teste isolado** e confiar na asserção 5× do e2e do W0 (Task 6) como validador — anotar a decisão no commit.

- [ ] **Step 2: Aplicar o fix.** Em `round-progression.ts`, trocar a query de entries:
```ts
const entries = (await db
  .prepare('SELECT club_id, group_name FROM competition_entries WHERE save_id = ? AND competition_id = ? AND group_name IS NOT NULL ORDER BY group_name, club_id')
  .all(saveId, competitionId)) as Array<{ club_id: number; group_name: string }>;
```
(adicionar `ORDER BY group_name, club_id`). Isso torna a ordem das chaves de `groups` determinística independente do estado do SQLite.

- [ ] **Step 3: Rodar a suíte de competição.**

Run: `npx jest __tests__/engine/competition/`
Expected: tudo verde (incl. `cup-to-champion.e2e`, `round-progression`).

- [ ] **Step 4: Commit.**

```bash
git add src/engine/competition/round-progression.ts __tests__/engine/competition/round-progression-determinism.test.ts
git commit -m "fix(determinism): ordem determinística dos grupos da CL no chaveamento"
```

---

## Task 3: Extrair `runSeasonTransition` (F0)

**Files:**
- Create: `src/engine/season/season-transition.ts`
- Modify: `src/screens/EndOfSeasonScreen.tsx:331-375` (substituir o bloco de mutação por uma chamada)
- Test: `__tests__/engine/season/season-transition.test.ts`

A função encapsula o bloco de mutação de `handleContinue` (linhas 331-375): `processAssistantsSeasonEnd` + promoção/rebaixamento (340-363) + `rolloverSeason` (367-375). **Movimento 1:1**, sem mudança de comportamento.

- [ ] **Step 1: Escrever o teste de integração (falhando).**

```ts
// __tests__/engine/season/season-transition.test.ts
import { createE2EContext, stepWeek } from '../../e2e/test-helpers';
import { runSeasonTransition } from '@/engine/season/season-transition';
import { SeededRng } from '@/engine/rng';

it('roda a virada: envelhece, regenera fixtures da nova temporada, abre pré-temporada', async () => {
  const ctx = await createE2EContext();
  // avançar até o fim da temporada 1
  let end = false; let g = 0;
  while (!end && g < 60) { const r = await stepWeek(ctx, 4242); end = r.isSeasonEnd; g++; }
  expect(end).toBe(true);
  expect(ctx.season).toBe(2);

  const ageBefore = (ctx.rawDb.prepare('SELECT age FROM players WHERE id = ?').get(1) as { age: number }).age;
  const fxBefore = (ctx.rawDb.prepare('SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = 2').get(ctx.saveId) as { n: number }).n;
  expect(fxBefore).toBe(0); // sem fixtures da temporada 2 antes da virada

  await runSeasonTransition(ctx.db, {
    saveId: ctx.saveId, playerClubId: ctx.playerClubId,
    endedSeason: 1, newSeason: 2,
    youthAcademyLevel: 3, rng: new SeededRng(2 * 7777),
  });

  const ageAfter = (ctx.rawDb.prepare('SELECT age FROM players WHERE id = ?').get(1) as { age: number }).age;
  const fxAfter = (ctx.rawDb.prepare('SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = 2').get(ctx.saveId) as { n: number }).n;
  const preseason = (ctx.rawDb.prepare('SELECT preseason_pending FROM save_games WHERE id = ?').get(ctx.saveId) as { preseason_pending: number }).preseason_pending;
  expect(ageAfter).toBe(ageBefore + 1);
  expect(fxAfter).toBeGreaterThan(0);   // calendário da temporada 2 gerado
  expect(preseason).toBe(1);
  ctx.rawDb.close();
});
```

- [ ] **Step 2: Rodar — deve falhar (módulo inexistente).**

Run: `npx jest __tests__/engine/season/season-transition.test.ts`
Expected: FAIL — `Cannot find module '@/engine/season/season-transition'`.

- [ ] **Step 3: Criar `season-transition.ts`.** Mover o corpo de `EndOfSeasonScreen.handleContinue` linhas 331-375 (assistentes + promoção/rebaixamento + rolloverSeason). Conteúdo:

```ts
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { Fixture } from '@/types';
import { getAllLeagues } from '@/database/queries/leagues';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { calculateStandings } from '@/engine/competition/standings';
import { buildDivisionPairs, computeDivisionSwaps } from '@/engine/competition/promotion';
import { rolloverSeason, RolloverSeasonResult } from '@/engine/season-rollover';
import { processAssistantsSeasonEnd } from '@/engine/assistant/season-end-assistants';

export interface SeasonTransitionParams {
  saveId: number; playerClubId: number; endedSeason: number; newSeason: number;
  youthAcademyLevel: number; rng: SeededRng;
}

/** Headless season-end mutation: assistants aging + promotion/relegation + rolloverSeason.
 * Extracted 1:1 from EndOfSeasonScreen.handleContinue (lines 331-375). */
export async function runSeasonTransition(db: DbHandle, p: SeasonTransitionParams): Promise<RolloverSeasonResult> {
  await processAssistantsSeasonEnd(db, p.saveId);

  // Promotion/relegation BEFORE rollover regenerates the calendar.
  const swapLeagues = await getAllLeagues(db);
  const standingsByLeague = new Map<number, number[]>();
  const competitionsEnded = await getCompetitionsBySeason(db, p.saveId, p.endedSeason);
  for (const lg of swapLeagues) {
    const leagueComp = competitionsEnded.find((c) => c.leagueId === lg.id && c.type === 'league');
    if (!leagueComp) continue;
    const lgClubs = await getClubsByLeague(db, p.saveId, lg.id);
    const lgClubIds = lgClubs.map((c) => c.id);
    const fxSet = new Map<number, Fixture>();
    for (const cid of lgClubIds) {
      const cf = await getFixturesByClub(db, p.saveId, cid, p.endedSeason);
      for (const f of cf) if (f.competitionId === leagueComp.id && f.played && !fxSet.has(f.id)) fxSet.set(f.id, f);
    }
    const ordered = calculateStandings(Array.from(fxSet.values()), lgClubIds);
    standingsByLeague.set(lg.id, ordered.map((e) => e.clubId));
  }
  const divisionSwaps = computeDivisionSwaps(buildDivisionPairs(swapLeagues), standingsByLeague);
  for (const s of divisionSwaps) {
    await db.prepare('UPDATE clubs SET league_id = ? WHERE save_id = ? AND id = ?').run(s.toLeagueId, p.saveId, s.clubId);
  }

  return rolloverSeason({
    dbHandle: db, playerClubId: p.playerClubId, saveId: p.saveId,
    endedSeason: p.endedSeason, newSeason: p.newSeason,
    youthAcademyLevel: p.youthAcademyLevel, rng: p.rng,
  });
}
```

- [ ] **Step 4: Refatorar `EndOfSeasonScreen.handleContinue`.** `runSeasonTransition` **inclui** `processAssistantsSeasonEnd` (1ª linha do Step 3) + promoção/rebaixamento + `rolloverSeason` — ou seja, encapsula as linhas 333 + 337-375. A UI só chama a função e **depois** atualiza o store de assistentes lendo do DB. Substituir o bloco das linhas 331-375 (do `// Assistants:` até o fim da chamada `rolloverSeason({...});`) por:

```ts
      if (currentSave) {
        await runSeasonTransition(dbHandle, {
          saveId: currentSave.id, playerClubId,
          endedSeason, newSeason,
          youthAcademyLevel: playerClub?.youthAcademy ?? 3,
          rng: new SeededRng(newSeason * 7777),
        });
        // refresh assistants store from DB after the transition aged them
        setAssistants(await getAssistantsBySave(dbHandle, currentSave.id));
      }
```
Adicionar import `import { runSeasonTransition } from '@/engine/season/season-transition';`. Confirmar que `getAssistantsBySave` já está importado (senão adicionar de `@/database/queries/assistants`).

- [ ] **Step 4b: Remover imports órfãos.** Após o Step 4, estes imports da `EndOfSeasonScreen.tsx` ficam sem uso (movidos para `season-transition.ts`) — remover: `rolloverSeason` (linha 35), `buildDivisionPairs, computeDivisionSwaps` (linha 22). **MANTER** `calculateStandings`, `getCompetitionsBySeason`, `getFixturesByClub`, `processAssistantsSeasonEnd` só se ainda forem referenciados (a Task 4 também mexe no load-effect; reavaliar após Task 4). Validar com `npx tsc --noEmit` (ou `grep -n "rolloverSeason\|buildDivisionPairs" src/screens/EndOfSeasonScreen.tsx` → vazio).

- [ ] **Step 5: Rodar o teste da Task 3 + tsc.**

Run: `npx jest __tests__/engine/season/season-transition.test.ts && npx tsc --noEmit`
Expected: PASS + exit 0.

- [ ] **Step 6: Commit.**

```bash
git add src/engine/season/season-transition.ts src/screens/EndOfSeasonScreen.tsx __tests__/engine/season/season-transition.test.ts
git commit -m "refactor(season): extrair runSeasonTransition headless da EndOfSeasonScreen"
```

---

## Task 4: Extrair `evaluateSeasonEndBoard`

**Files:**
- Create: `src/engine/season/season-end-eval.ts`
- Modify: `src/screens/EndOfSeasonScreen.tsx` load-effect (board param computation + processSeasonEndBoard + manager rep + offers, linhas ~159-281)
- Test: `__tests__/engine/season/season-end-eval.test.ts`

Extrai a lógica que computa stats finais + roda `processSeasonEndBoard` + acumula reputação do treinador + gera ofertas. **NÃO** mexe em stores nem em achievements (UI). Retorna `SeasonEndEval` (ver contract). O load-effect passa a chamar a função e só wira stores/achievements.

- [ ] **Step 1: Escrever o teste (falhando).**

```ts
// __tests__/engine/season/season-end-eval.test.ts
import { createE2EContext, stepWeek } from '../../e2e/test-helpers';
import { evaluateSeasonEndBoard } from '@/engine/season/season-end-eval';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getClubById } from '@/database/queries/clubs';
import { getManagerReputation } from '@/database/queries/save';
import { SeededRng } from '@/engine/rng';

it('avalia diretoria, acumula rep do treinador e gera ofertas (se não demitido)', async () => {
  const ctx = await createE2EContext();
  let end = false, g = 0;
  while (!end && g < 60) { const r = await stepWeek(ctx, 9001); end = r.isSeasonEnd; g++; }
  const club = (await getClubById(ctx.db, ctx.saveId, ctx.playerClubId))!;
  const comps = (await getCompetitionsBySeason(ctx.db, ctx.saveId, 1)).map((c) => ({ id: c.id, type: c.type }));
  const repBefore = await getManagerReputation(ctx.db, ctx.saveId);

  const evalRes = await evaluateSeasonEndBoard(ctx.db, {
    saveId: ctx.saveId, playerClubId: ctx.playerClubId, clubReputation: club.reputation,
    endedSeason: 1, newSeason: 2, competitions: comps, offerRng: new SeededRng(1 * 6151 + ctx.saveId),
  });
  expect(evalRes.board.newTrust).toBeGreaterThanOrEqual(0);
  expect(evalRes.managerRep.before).toBe(repBefore);
  const repAfter = await getManagerReputation(ctx.db, ctx.saveId);
  expect(repAfter).toBe(evalRes.managerRep.after); // persistido
  ctx.rawDb.close();
});
```

- [ ] **Step 2: Rodar — falha (módulo inexistente).**

Run: `npx jest __tests__/engine/season/season-end-eval.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Criar `season-end-eval.ts`.** Mover a lógica do load-effect (linhas 159-281: detecção de relegated/promoted/wonCup, squad average, processSeasonEndBoard, manager rep, geração de ofertas). Conteúdo (computar stats via os mesmos queries que o load-effect usa nas linhas ~120-157 — `getFixturesByClub`/`getFinancesBySeason`/`calculateStandings`):

```ts
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { getFinancesBySeason } from '@/database/queries/finances';
import { getCompetitionsBySeason, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague, getAllClubs } from '@/database/queries/clubs';
import { calculateStandings } from '@/engine/competition/standings';
import { getPromotedForClub } from '@/database/queries/season-promoted';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { processSeasonEndBoard, SeasonEndBoardResult } from '@/engine/board/season-end-board';
import { isManagerDismissed } from '@/engine/board/season-outcome';
import { computeManagerReputationDelta } from '@/engine/board/manager-reputation-engine';
import { generateJobOffers, JobOfferCandidateClub } from '@/engine/board/job-offers-engine';
import { getManagerReputation, setManagerReputation } from '@/database/queries/save';
import { insertJobOffer } from '@/database/queries/job-offers';

export interface SeasonEndEval {
  stats: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; leaguePosition: number | null; totalTeams: number; income: number; expenses: number };
  board: SeasonEndBoardResult;
  managerRep: { before: number; after: number; delta: number };
  wonCup: boolean; wasPromoted: boolean; wasRelegated: boolean;
  generatedOfferClubIds: number[];
}

export async function evaluateSeasonEndBoard(db: DbHandle, p: {
  saveId: number; playerClubId: number; clubReputation: number;
  endedSeason: number; newSeason: number; competitions: { id: number; type: string }[]; offerRng: SeededRng;
}): Promise<SeasonEndEval> {
  // (mover aqui o cálculo de stats das linhas ~120-157 e o bloco board/rep/offers das linhas 163-281,
  //  trocando `setX(...)` de store por campos do objeto de retorno e removendo achievements/UI.)
  // ... ver EndOfSeasonScreen.tsx para o corpo exato; é movimento 1:1 sem as chamadas de store/achievements.
}
```
> **Importante — a função RE-COMPUTA tudo internamente (não herda do load-effect):**
> - **stats** (played/wins/draws/losses/goalsFor/goalsAgainst/leaguePosition/totalTeams/income/expenses): copiar a lógica das linhas ~120-157 (`getFixturesByClub` + `calculateStandings` + `getFinancesBySeason`).
> - **promoção/rebaixamento/taça** (linhas 163-175): `getPromotedForClub` + `SELECT ... FROM season_relegated` + loop nas competições de copa.
> - **squad average** (linhas 177-182): `getPlayersWithAttributesByClub` + `calculateOverall`.
> - **board/rep/ofertas** (linhas 184-281): `processSeasonEndBoard` + `computeManagerReputationDelta`+`setManagerReputation` (persiste) + (se `!isManagerDismissed`) `generateJobOffers`+`insertJobOffer`+`setJobOffersPending(true)`.
> Substituir cada `setX(...)` de store por preenchimento do objeto de retorno `SeasonEndEval`. **Não** chamar `processAchievementCheckpoint` aqui (fica na UI). Retornar `generatedOfferClubIds` = ids das ofertas inseridas (`[]` se demitido/sem ofertas).

- [ ] **Step 4: Refatorar o load-effect da `EndOfSeasonScreen`.** Substituir o cálculo de stats + bloco board/rep/offers (linhas ~120-281) por:
```ts
        const evalRes = await evaluateSeasonEndBoard(dbHandle, {
          saveId: currentSave.id, playerClubId, clubReputation: playerClub.reputation,
          endedSeason, newSeason: season, competitions: competitions.map(c => ({ id: c.id, type: c.type })),
          offerRng: new SeededRng(season * 6151 + saveId),
        });
        setStats(evalRes.stats);
        if (!boardProcessed) {
          setBoardProcessed(true);
          setCurrentObjective(evalRes.board.newObjective);
          setCurrentTrust(evalRes.board.newTrust);
          setLastTrustResult(evalRes.board.outcome, evalRes.board.consequence);
          setReputationHistory(evalRes.board.reputationHistory);
          setBoardEval({ oldRep: evalRes.board.oldReputation, newRep: evalRes.board.newReputation, delta: evalRes.board.reputationDelta, trust: evalRes.board.newTrust, outcome: evalRes.board.outcome, consequence: evalRes.board.consequence, objectiveType: evalRes.board.objectiveType, objectiveTarget: evalRes.board.objectiveTarget });
          setStoreManagerReputation(evalRes.managerRep.after);
          setManagerRepEval({ before: evalRes.managerRep.before, after: evalRes.managerRep.after, delta: evalRes.managerRep.delta });
          if (evalRes.generatedOfferClubIds.length > 0) setStoreJobOffersPending(true);
        }
```
**Achievements (continua na UI):** as variáveis locais usadas pelo bloco existente (linhas 238-253) foram removidas — trocar o `snapshot` de `processAchievementCheckpoint` para usar `evalRes`:
```ts
snapshot: {
  wonLeague: evalRes.stats.leaguePosition === 1,
  wonCup: evalRes.wonCup,
  promoted: evalRes.wasPromoted,
  managerReputation: evalRes.managerRep.after,
  seasonsCompleted: endedSeason,
},
```

- [ ] **Step 4c: Remover imports órfãos do load-effect.** Após mover a avaliação para `season-end-eval.ts`, ficam órfãos na `EndOfSeasonScreen.tsx`: `processSeasonEndBoard`, `computeManagerReputationDelta`, `generateJobOffers`/`JobOfferCandidateClub`, `getManagerReputation`/`setManagerReputation`, `insertJobOffer`, `getPromotedForClub`, `getFinancesBySeason`, `getPlayersWithAttributesByClub`, `calculateOverall`, `getAllClubs`, `getAllLeagues` (se não usados em outro ponto). Remover os não-referenciados; manter `isManagerDismissed`, `objectiveDescriptor`, `markSaveEnded`, `processAchievementCheckpoint` (ainda usados). Validar com `npx tsc --noEmit`.

- [ ] **Step 5: Rodar o teste da Task 4 + tsc.**

Run: `npx jest __tests__/engine/season/season-end-eval.test.ts && npx tsc --noEmit`
Expected: PASS + exit 0.

- [ ] **Step 6: Commit.**

```bash
git add src/engine/season/season-end-eval.ts src/screens/EndOfSeasonScreen.tsx __tests__/engine/season/season-end-eval.test.ts
git commit -m "refactor(season): extrair evaluateSeasonEndBoard headless da EndOfSeasonScreen"
```

---

## Task 5: Test helpers — gate de ofertas + cerimônia headless

**Files:**
- Modify: `__tests__/e2e/test-helpers.ts`
- Read first: `src/engine/board/accept-job-offer.ts` (`acceptJobOffer`), `src/database/queries/save.ts` (`setJobOffersPending`, `getManagerReputation`), `src/database/queries/job-offers.ts` (`getPendingJobOffers`/equivalente).

- [ ] **Step 1: Adicionar helpers** ao final de `test-helpers.ts`:

```ts
import { evaluateSeasonEndBoard } from '@/engine/season/season-end-eval';
import { runSeasonTransition } from '@/engine/season/season-transition';
import { acceptJobOffer } from '@/engine/board/accept-job-offer';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getClubById } from '@/database/queries/clubs';
import { setJobOffersPending } from '@/database/queries/save';
import { getPendingJobOffers } from '@/database/queries/job-offers';

/** Advance week-by-week until the season ends; returns the AdvanceWeekResult. */
export async function playUntilSeasonEnd(ctx: E2EContext, seed = 42): Promise<AdvanceWeekResult> {
  let r: AdvanceWeekResult | null = null; let guard = 0;
  do { r = await stepWeek(ctx, seed); guard++; } while (!r.isSeasonEnd && guard < 70);
  if (!r || !r.isSeasonEnd) throw new Error('season did not end within 70 weeks');
  return r;
}

/** Responds to the job-offers gate: accepts the given club's offer (club switch) or, if null, rejects all. */
export async function respondToJobOfferGate(ctx: E2EContext, endedSeason: number, offeringClubIdOrNull: number | null): Promise<boolean> {
  if (offeringClubIdOrNull == null) { await setJobOffersPending(ctx.db, ctx.saveId, false); return false; }
  await acceptJobOffer({ db: ctx.db, saveId: ctx.saveId, offeringClubId: offeringClubIdOrNull, offerSeason: endedSeason, newSeason: ctx.season, rng: new SeededRng(ctx.saveId * 13 + endedSeason) });
  ctx.playerClubId = offeringClubIdOrNull;
  return true;
}

/** Full headless season-end ceremony, mirroring EndOfSeasonScreen: evaluate board → transition → respond to offer gate.
 * Call right after playUntilSeasonEnd returns isSeasonEnd. `accept` picks the first pending offer if true. */
export async function endSeasonHeadless(ctx: E2EContext, opts: { accept: boolean } = { accept: false }): Promise<{ switched: boolean; newClubId: number | null }> {
  const endedSeason = ctx.season - 1; // advanceGameWeek already bumped the pointer
  const club = (await getClubById(ctx.db, ctx.saveId, ctx.playerClubId))!;
  const comps = (await getCompetitionsBySeason(ctx.db, ctx.saveId, endedSeason)).map((c) => ({ id: c.id, type: c.type }));
  const evalRes = await evaluateSeasonEndBoard(ctx.db, {
    saveId: ctx.saveId, playerClubId: ctx.playerClubId, clubReputation: club.reputation,
    endedSeason, newSeason: ctx.season, competitions: comps, offerRng: new SeededRng(endedSeason * 6151 + ctx.saveId),
  });
  // Transition runs with the ORIGINAL club (mirrors the UI: rollover happens before the offer gate).
  await runSeasonTransition(ctx.db, { saveId: ctx.saveId, playerClubId: ctx.playerClubId, endedSeason, newSeason: ctx.season, youthAcademyLevel: club.youthAcademy, rng: new SeededRng(ctx.season * 7777) });
  // Respond to the offer gate — accept the FIRST pending offer if requested (robusto:
  // não depende de generatedOfferClubIds; aceita qualquer oferta persistida/pendente).
  void evalRes; // (evalRes fica disponível p/ asserts futuros; aqui só dirige o gate)
  let newClubId: number | null = null;
  if (opts.accept) {
    const pending = await getPendingJobOffers(ctx.db, ctx.saveId, endedSeason);
    newClubId = pending[0]?.offeringClubId ?? null;
  }
  const switched = await respondToJobOfferGate(ctx, endedSeason, newClubId);
  return { switched, newClubId: switched ? newClubId : null };
}
```
> Confirmar a forma de `getPendingJobOffers` (campos retornados — `offeringClubId`?) e ajustar. Confirmar a assinatura de `acceptJobOffer` (params nomeados).

- [ ] **Step 2: tsc.**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit.**

```bash
git add __tests__/e2e/test-helpers.ts
git commit -m "test(e2e): helpers de cerimônia de fim-de-temporada e gate de ofertas"
```

---

## Task 6: E2E de carreira multi-temporada

**Files:**
- Create: `__tests__/e2e/career-loop.e2e.test.ts`

- [ ] **Step 1: Escrever o e2e (3 temporadas, aceitar + recusar, asserts expandidos).**

```ts
import { createE2EContext, playUntilSeasonEnd, endSeasonHeadless, E2EContext } from './test-helpers';
import { getManagerReputation, setManagerReputation } from '@/database/queries/save';

function age(ctx: E2EContext, playerId: number): number {
  return (ctx.rawDb.prepare('SELECT age FROM players WHERE id = ?').get(playerId) as { age: number }).age;
}
function fixturesCount(ctx: E2EContext, season: number): number {
  return (ctx.rawDb.prepare('SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = ?').get(ctx.saveId, season) as { n: number }).n;
}

describe('E2E · career loop (multi-season)', () => {
  let ctx: E2EContext;
  beforeEach(async () => { ctx = await createE2EContext(); });
  afterEach(() => { ctx.rawDb.close(); });

  it('joga 3 temporadas, troca de clube ao aceitar oferta, mantém reputação', async () => {
    const ageStart = age(ctx, 1);

    // Temporada 1 → recusar oferta (segue no mesmo clube)
    await playUntilSeasonEnd(ctx, 111);
    expect(ctx.season).toBe(2);
    const club1 = ctx.playerClubId;
    const r1 = await endSeasonHeadless(ctx, { accept: false });
    expect(r1.switched).toBe(false);
    expect(ctx.playerClubId).toBe(club1);
    expect(fixturesCount(ctx, 2)).toBeGreaterThan(0);     // calendário da temp. 2 gerado
    expect(age(ctx, 1)).toBe(ageStart + 1);               // envelheceu 1 na virada

    // Temporada 2 → GARANTIR oferta (reputação alta) e aceitar (troca de clube)
    await playUntilSeasonEnd(ctx, 222);
    expect(ctx.season).toBe(3);
    await setManagerReputation(ctx.db, ctx.saveId, 99);   // ceiling alto → clubes acima do atual ofertam
    const r2 = await endSeasonHeadless(ctx, { accept: true });
    expect(r2.switched).toBe(true);                       // a troca DEVE acontecer (sem no-op silencioso)
    expect(ctx.playerClubId).toBe(r2.newClubId);
    const pc = ctx.rawDb.prepare('SELECT player_club_id, board_trust FROM save_games WHERE id = ?').get(ctx.saveId) as { player_club_id: number; board_trust: number };
    expect(pc.player_club_id).toBe(r2.newClubId);
    expect(pc.board_trust).toBe(50);                      // BOARD_TRUST_INITIAL no novo clube
    expect(fixturesCount(ctx, 3)).toBeGreaterThan(0);     // calendário da temp. 3 p/ TODOS os clubes (inclui o novo)
    const repAfterS2 = await getManagerReputation(ctx.db, ctx.saveId);
    expect(repAfterS2).toBeGreaterThanOrEqual(99);        // reputação não cai por troca de clube

    // Temporada 3 → joga até o fim COM O NOVO CLUBE sem crash (prova as fixtures regeneradas)
    const r3 = await playUntilSeasonEnd(ctx, 333);
    expect(r3.isSeasonEnd).toBe(true);
    expect(ctx.season).toBe(4);
  }, 120_000);
});
```
> Se `r2.switched` vier `false`, significa que `generateJobOffers` não achou nenhum clube com reputação maior que a do clube atual (caso o clube 1 seja o de maior reputação do mundo). Mitigação: escolher um `playerClubId` de menor reputação no `createE2EContext({ playerClubId })`, OU inserir uma oferta pendente manualmente antes do boundary. Validar na execução.

- [ ] **Step 2: Rodar.**

Run: `npx jest __tests__/e2e/career-loop.e2e.test.ts`
Expected: PASS. Se a temporada 3 não tiver fixtures (crash/loop vazio), o bug está na ordem da cerimônia — revisar Task 5 (transição roda antes do switch).

- [ ] **Step 3: Commit.**

```bash
git add __tests__/e2e/career-loop.e2e.test.ts
git commit -m "test(e2e): loop de carreira multi-temporada com troca de clube"
```

---

## Task 7: Reprodutibilidade (mesmo seed → idêntico) + 5×

**Files:**
- Modify: `__tests__/e2e/career-loop.e2e.test.ts` (adicionar caso)

- [ ] **Step 1: Adicionar o teste de reprodutibilidade.**

```ts
  it('é reprodutível: dois saves, mesmo seed, 2 temporadas → estado-chave idêntico', async () => {
    const run = async () => {
      const c = await createE2EContext();
      await playUntilSeasonEnd(c, 777); await endSeasonHeadless(c, { accept: true });
      await playUntilSeasonEnd(c, 777);
      const snapshot = c.rawDb.prepare(
        `SELECT id, club_id, age, market_value FROM players WHERE save_id = ? ORDER BY id`
      ).all(c.saveId);
      const budgets = c.rawDb.prepare(`SELECT id, budget FROM clubs WHERE save_id = ? ORDER BY id`).all(c.saveId);
      const pcid = c.playerClubId;
      c.rawDb.close();
      return JSON.stringify({ snapshot, budgets, pcid });
    };
    const a = await run(); const b = await run();
    expect(a).toEqual(b);
  }, 120_000);
```

- [ ] **Step 2: Rodar o arquivo 5× para confirmar 0 flake.**

Run: `for i in 1 2 3 4 5; do npx jest __tests__/e2e/career-loop.e2e.test.ts --silent || echo "RUN $i FALHOU"; done`
Expected: 5 execuções verdes. Se falhar, investigar a fonte de não-determinismo (provável CL group order → confirmar Task 2; ou Math.random remanescente → `grep -rn "Math.random" src/engine src/database`).

- [ ] **Step 3: Commit.**

```bash
git add __tests__/e2e/career-loop.e2e.test.ts
git commit -m "test(e2e): asserção de reprodutibilidade do loop de carreira (5x)"
```

---

## Task 8: Verificação final do W0 (DoD)

- [ ] **Step 1: Suíte completa + tsc.**

Run: `npx tsc --noEmit && npx jest`
Expected: exit 0 + todas as suítes verdes (a refatoração da EndOfSeasonScreen não pode regredir nada; o `end-of-season-board.test.ts` existente é um guarda).

- [ ] **Step 2: Rodar a suíte completa 3× (caça-flake).**

Run: `for i in 1 2 3; do npx jest --silent | tail -2; done`
Expected: 3× "X passed" sem falhas.

- [ ] **Step 3: Confirmar DoD do W0:** `runSeasonTransition` + `evaluateSeasonEndBoard` extraídos; career-loop e2e verde, cobre aceitar + recusar, reprodutível (5×); 2 micro-fixes de determinismo aplicados; suíte verde; tsc limpo.

---

## Self-Review (executar após escrever — checklist do autor)

1. **Cobertura do spec (W0):** `runSeasonTransition` (Task 3 ✓), `evaluateSeasonEndBoard` p/ DRY (Task 4 ✓), helpers (Task 5 ✓), e2e 3 temporadas aceitar+recusar (Task 6 ✓), reprodutibilidade 5× (Task 7 ✓), micro-fixes W5 (Tasks 1-2 ✓), asserts expandidos — idade, fixtures por temporada, trust reset, troca de clube, reputação preservada (Task 6 ✓). Ramo demitido→resgate fica para W2 (fora do W0, correto).
2. **Placeholders:** Task 3/4 usam "movimento 1:1 — ver linhas X-Y" para o corpo da extração (legítimo: é mover código existente). `evaluateSeasonEndBoard` RE-COMPUTA stats/promoção/taça/squad internamente (não herda). Demais steps têm código completo.
3. **Consistência de tipos (revisão adversarial aplicada):** ✅ `acceptJobOffer` usa `offerSeason`+`newSeason` (não `season`); ✅ `getAssistantsBySave` (não `getAssistantsByClub`); ✅ `AssistantCandidate` não tem `retirementAge` → semeado em Task 1; ✅ `ensureSeasonFixtures` cobre todos os clubes (novo clube tem fixtures); ✅ `getPendingJobOffers` retorna `offeringClubId`; ✅ imports órfãos removidos (Steps 4b/4c). Itens restantes a confirmar na execução: constantes `ASSISTANT_RETIREMENT_*` (Task 1 Step 1), e `r2.switched===true` (boost de reputação garante; fallback documentado).
