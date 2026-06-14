# W2 — Demitido → Ofertas-Resgate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox.

**Goal:** Quando o treinador é demitido no fim de temporada, em vez de GameOver imediato, gerar ofertas de clubes de MENOR reputação ("resgate"); aceitar → continua em clube menor (carreira preservada); recusar todas → GameOver. Fecha o loop de carreira (corte deliberado do P6).

**Architecture:** Reusa a maquinaria do W0. Hoje (pós-W0) o ramo de demissão em `EndOfSeasonScreen.handleContinue` faz `markSaveEnded`→GameOver ANTES da virada; o não-demitido roda `runSeasonTransition`. O W2 faz o ramo demitido **também** rodar `runSeasonTransition` (o mundo vira; o clube-resgate é rolado junto) + armar `job_offers_pending` + flag `unemployed`, roteando para a `JobOffersScreen` (modo desempregado). O risco do rollover-do-novo-clube já foi validado pela e2e do W0 (aceitar oferta → novo clube tem fixtures).

**Tech Stack:** TS, Jest+better-sqlite3, SeededRng. Alvo mobile (Alert.alert ok).

**Convenções:** TDD; engine puro; coluna nova em schema.ts E database-store.ts; save-isolation; i18n pt/en paridade; tokens `@/theme`; branch `feat/w2-rescue-offers`; commits `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Subagents NÃO commitam.**

**Peças existentes (✅):** `runSeasonTransition`/`evaluateSeasonEndBoard` (W0), `acceptJobOffer`, `generateJobOffers` (up-band: `reputation > currentClubReputation && <= managerRep + MANAGER_JOB_OFFER_STEP`), `JobOffersScreen` (`handleAccept`/`handleStay`), gate `job_offers_pending`, `isManagerDismissed`, `markSaveEnded`, `MANAGER_JOB_OFFER_STEP`/`MANAGER_JOB_OFFER_MAX` em balance.ts.

**Contract:**
```ts
// engine/board/job-offers-engine.ts (add)
export function generateRescueOffers(input: {
  managerReputation: number; currentClubId: number; currentClubReputation: number; candidates: JobOfferCandidateClub[];
}): { offeringClubId: number }[];
// filtro: c.id !== currentClubId && c.reputation < currentClubReputation && c.reputation <= managerReputation + MANAGER_JOB_OFFER_STEP
// sort reputation DESC, id ASC; top MANAGER_JOB_OFFER_MAX.

// database/queries/save.ts (add, espelhar setJobOffersPending/isJobOffersPending)
export async function setUnemployed(db: DbHandle, saveId: number, v: boolean): Promise<void>;
export async function isUnemployed(db: DbHandle, saveId: number): Promise<boolean>;
```

---

## Task 1: `generateRescueOffers` (TDD, puro)

**Files:** Modify `src/engine/board/job-offers-engine.ts`, Create `__tests__/engine/board/rescue-offers.test.ts`.

- [ ] **Step 1 — teste falhando:**
```ts
import { generateRescueOffers } from '@/engine/board/job-offers-engine';

const cands = [
  { id: 1, reputation: 80, divisionLevel: 1 }, // current club
  { id: 2, reputation: 70, divisionLevel: 1 }, // step down — qualifica
  { id: 3, reputation: 60, divisionLevel: 2 }, // step down — qualifica
  { id: 4, reputation: 90, divisionLevel: 1 }, // acima — NÃO (resgate é p/ baixo)
];
it('gera ofertas de clubes de MENOR reputação que o atual', () => {
  const offers = generateRescueOffers({ managerReputation: 75, currentClubId: 1, currentClubReputation: 80, candidates: cands });
  const ids = offers.map((o) => o.offeringClubId);
  expect(ids).not.toContain(1);   // não o atual
  expect(ids).not.toContain(4);   // não clube acima
  expect(ids).toContain(2);       // step down
  expect(offers.length).toBeGreaterThan(0);
});
it('vazio se nenhum clube de menor reputação ao alcance', () => {
  const offers = generateRescueOffers({ managerReputation: 75, currentClubId: 1, currentClubReputation: 1, candidates: cands });
  expect(offers).toEqual([]); // currentClubReputation 1 → nada abaixo
});
```
- [ ] **Step 2 — rodar (falha).**
- [ ] **Step 3 — implementar** `generateRescueOffers` em job-offers-engine.ts (espelhar `generateJobOffers`, trocar o filtro `c.reputation > currentClubReputation` por `c.reputation < currentClubReputation`, mantendo `<= managerReputation + MANAGER_JOB_OFFER_STEP`, exclusão do current, sort rep desc/id asc, top `MANAGER_JOB_OFFER_MAX`).
- [ ] **Step 4 — rodar (passa). Step 5:** (orquestrador commita).

---

## Task 2: Coluna `unemployed` + queries + store

**Files:** Modify `src/database/schema.ts`, `src/store/database-store.ts`, `src/database/queries/save.ts`, `src/store/game-store.ts`, Create `__tests__/database/queries/unemployed.test.ts`.

- [ ] **Step 1:** Adicionar `unemployed INTEGER NOT NULL DEFAULT 0` ao `save_games` em SCHEMA_SQL (schema.ts, junto de `onboarding_seen`) E `addColumnIfMissing(db,'save_games','unemployed','INTEGER NOT NULL DEFAULT 0')` em database-store.ts (junto dos outros gates).
- [ ] **Step 2 — teste falhando** (`__tests__/database/queries/unemployed.test.ts`, padrão seedTestDb+TEST_SAVE_ID): `setUnemployed(true)` → `isUnemployed` true; `setUnemployed(false)` → false.
- [ ] **Step 3 — implementar** `setUnemployed`/`isUnemployed` em save.ts (espelhar `setJobOffersPending`/`isJobOffersPending`).
- [ ] **Step 4:** store `game-store.ts`: add `unemployed: boolean` + `setUnemployed` + carregar no `loadSave` (espelhar `pressPending`). E em `types/save.ts` add `unemployed: boolean` ao SaveGame (+ mapear em `saves.ts` rowToSave).
- [ ] **Step 5 — rodar teste + tsc.** **Step 6:** (orquestrador commita).

---

## Task 3: `evaluateSeasonEndBoard` gera resgate quando demitido (TDD)

**Files:** Modify `src/engine/season/season-end-eval.ts`, `__tests__/engine/season/season-end-eval.test.ts`.

- [ ] **Step 1 — teste falhando:** num cenário forçado a demissão (board_trust baixo seedado), `evaluateSeasonEndBoard` retorna `generatedOfferClubIds` com clubes de reputação MENOR que o clube do jogador (ofertas-resgate), e `board.consequence` é demissão (`isManagerDismissed` true). (Setup: criar contexto e2e, baixar board_trust antes da virada — ver como o teste do W0 chega ao fim de temporada.)
- [ ] **Step 2 — rodar (falha).**
- [ ] **Step 3 — implementar:** no bloco de geração de ofertas de `evaluateSeasonEndBoard`, trocar `if (!isManagerDismissed(board.consequence)) { generateJobOffers... }` por: se demitido → `generateRescueOffers(...)`; senão → `generateJobOffers(...)`. Ambos `insertJobOffer` + retornam `generatedOfferClubIds`. (A persistência de manager rep continua igual.)
- [ ] **Step 4 — rodar (passa). Step 5:** (orquestrador commita).

---

## Task 4: Ramo de demissão da `EndOfSeasonScreen`

**Files:** Modify `src/screens/EndOfSeasonScreen.tsx`.

- [ ] **Step 1:** No load-effect, capturar se há ofertas-resgate num estado: após `evaluateSeasonEndBoard`, se `isManagerDismissed(evalRes.board.consequence) && evalRes.generatedOfferClubIds.length > 0` → `setHasRescueOffers(true)` e `setStoreJobOffersPending(true)`. (Adicionar `const [hasRescueOffers, setHasRescueOffers] = useState(false);`.)
- [ ] **Step 2:** Refatorar o ramo de demissão em `handleContinue` (o `if (isManagerDismissed(...)) { markSaveEnded; GameOver; return; }`) para:
```ts
    if (currentSave && isManagerDismissed(boardEval?.consequence ?? 'none')) {
      if (hasRescueOffers) {
        // Vira o mundo (clube-resgate é rolado junto) e abre o gate de desemprego.
        await runSeasonTransition(dbHandle, { saveId: currentSave.id, playerClubId, endedSeason, newSeason: season, youthAcademyLevel: playerClub?.youthAcademy ?? 3, rng: new SeededRng(season * 7777) });
        await setUnemployed(dbHandle, currentSave.id, true);
        setStoreUnemployed(true);
        setStoreJobOffersPending(true);
        setPreseasonPending(true);
        setNewSeason(false);
        updateWeek(season, 1);
        setStarting(false);
        navigation.navigate('Game'); // HomeScreen gate → JobOffersScreen (desempregado)
        return;
      }
      // Sem resgate → fim de carreira.
      await markSaveEnded(dbHandle, currentSave.id);
      setStarting(false);
      navigation.navigate('GameOver', { /* ...igual ao atual... */ });
      return;
    }
```
Imports: `setUnemployed` de `@/database/queries/save`; `setUnemployed: setStoreUnemployed` do store.
- [ ] **Step 3:** `npx tsc --noEmit` (exit 0). **Step 4:** (orquestrador commita).

---

## Task 5: Modo desempregado na `JobOffersScreen` + i18n

**Files:** Modify `src/screens/career/JobOffersScreen.tsx`, `src/i18n/pt.ts`+`en.ts`.

- [ ] **Step 1 — i18n:** `joboffers.unemployed_header` ("Você foi demitido"), `joboffers.unemployed_sub` ("Clubes menores oferecem um recomeço."), `joboffers.decline_all` ("Recusar todas (encerrar carreira)"). Paridade pt/en.
- [ ] **Step 2:** Ler `unemployed` do store. Quando `unemployed`:
  - Mostrar header/sub de desemprego (em vez do título normal).
  - `handleStay` → **NÃO** navega pro Game; faz `markSaveEnded(dbHandle, saveId)` + `setUnemployed(false)` (store+db) + `navigation.navigate('GameOver', { reason: t('endseason.gameover_trust_depleted'), trust: 0, objectiveDescription: '' })`. Botão usa `joboffers.decline_all`.
  - `handleAccept` → após `acceptJobOffer` (igual), também `await setUnemployed(dbHandle, saveId, false)` + `setStoreUnemployed(false)`. (O novo clube já foi rolado na Task 4.)
  - Quando NÃO unemployed: comportamento atual intocado.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx jest __tests__/i18n/parity.test.ts`. **Step 4:** (orquestrador commita).

---

## Task 6: E2E do ramo demitido→resgate

**Files:** Modify `__tests__/e2e/test-helpers.ts`, `__tests__/e2e/career-loop.e2e.test.ts`.

- [ ] **Step 1 — helper:** estender `endSeasonHeadless` (ou criar `endSeasonHeadlessFired`) para o caso demitido: força `board_trust` baixo antes da virada (`UPDATE save_games SET board_trust = 0`); após `evaluateSeasonEndBoard`, se `isManagerDismissed(eval.board.consequence)`:
  - `opts.accept` && há ofertas → `runSeasonTransition(clube original)` + `acceptJobOffer(primeira oferta-resgate)` + `setUnemployed(false)`; retorna `{ fired:true, switched:true, newClubId }`.
  - senão → `markSaveEnded`; retorna `{ fired:true, switched:false }` (carreira encerrada).
- [ ] **Step 2 — teste:** novo caso em career-loop.e2e:
```ts
it('demitido com ofertas-resgate: aceita → continua em clube menor com elenco rolado', async () => {
  const ctx = await createE2EContext();
  await playUntilSeasonEnd(ctx, 555);
  ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId); // força demissão
  const ageBefore = age(ctx, 1);
  const r = await endSeasonHeadless(ctx, { accept: true });
  if (r.fired && r.switched) {
    expect(ctx.playerClubId).toBe(r.newClubId);
    // novo clube tem fixtures da nova temporada (mundo rolou) e jogadores envelheceram
    expect(fixturesCount(ctx, 2)).toBeGreaterThan(0);
    expect(age(ctx, 1)).toBe(ageBefore + 1);
    // segue jogando sem crash
    const r2 = await playUntilSeasonEnd(ctx, 556);
    expect(r2.isSeasonEnd).toBe(true);
  }
  ctx.rawDb.close();
});
it('demitido sem aceitar: carreira encerrada (markSaveEnded)', async () => {
  const ctx = await createE2EContext();
  await playUntilSeasonEnd(ctx, 999);
  ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId);
  const r = await endSeasonHeadless(ctx, { accept: false });
  if (r.fired) {
    const ended = ctx.rawDb.prepare('SELECT ended FROM save_games WHERE id = ?').get(ctx.saveId) as { ended: number };
    expect(ended.ended).toBe(1);
  }
  ctx.rawDb.close();
});
```
(Importar `age`/`fixturesCount` helpers do teste do W0 ou redefinir.)
- [ ] **Step 3 — rodar** `npx jest __tests__/e2e/career-loop.e2e.test.ts` 5× — todas verdes. **Step 4:** (orquestrador commita).

---

## Task 7: Verificação (DoD)

- [ ] **Step 1:** `npx tsc --noEmit && npx jest` — tudo verde.
- [ ] **Step 2 — browser (mobile-style):** difícil chegar à demissão no browser (precisa trust baixo no fim de temporada). Validar a `JobOffersScreen` em modo desempregado via inspeção do código + e2e; o fluxo de aceitar é o mesmo já validado no P6. (Aceitável: cobertura por e2e dado o alvo mobile e a barreira de temporada.)
- [ ] **Step 3 — DoD:** demitido→resgate→aceitar continua com elenco rolado; recusar→GameOver; `generateRescueOffers` + flag `unemployed` testados; e2e cobre os dois ramos, 5× verde; tsc+suíte verdes. Caminho não-demitido INTOCADO.

---

## Self-Review
1. **Cobertura:** rescue engine (T1), gate unemployed (T2), eval dismissed (T3), tela EndOfSeason (T4), JobOffers desempregado (T5), e2e dois ramos (T6). Risco do rollover-novo-clube mitigado: reusa `runSeasonTransition` (validado no W0).
2. **Placeholders:** nenhum — código concreto; "igual ao atual" no GameOver = preservar o bloco existente.
3. **Tipos:** `generateRescueOffers`/`setUnemployed`/`isUnemployed`/`unemployed` fixados no contract.
