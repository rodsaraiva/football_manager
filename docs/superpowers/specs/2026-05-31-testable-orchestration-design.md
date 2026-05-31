# Design: Testable Orchestration — extrair rollover/advance para o engine

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `testable-orchestration`
**Escopo:** football-manager v0.1

---

## 1. Goal

Mover a orquestração de virada-de-temporada (`EndOfSeasonScreen.handleContinue`) e o *glue* de avanço-de-semana + reload de board/finanças (`HomeScreen.handleAdvanceWeek`) para módulos puros e testáveis do `engine/`, deixando as telas como *callers* finos — para que os épicos irmãos (ai-world-alive, competitions-real, progression-wired, economy-depth) estendam código coberto por testes em vez de lógica residente em tela.

---

## 2. Problema / estado atual

A auditoria (`docs/audit/2026-05-31-gap-audit.md`) confirma que a orquestração crítica do loop vive em telas grandes e não testadas:

- **"Season-rollover orchestration vive em telas não testadas, não no engine"** — `src/screens/EndOfSeasonScreen.tsx` tem **874 linhas**; `handleContinue` (linhas **325–530**) executa, dentro do componente, toda a virada: envelhecer jogadores (`UPDATE players SET age = age + 1`, 337-339), processar assistentes (341-357), expirar contratos (362), retornar empréstimos (`returnExpiredLoans`, 365), recalcular potencial (`recalculatePotential`, 379-391), gerar base (`generateYouthPlayers` + dois `INSERT` longos, 396-429) e regenerar o calendário (432-515). `processSeasonEndBoard` (78-164) faz upsert de objetivo/trust/reputação e os *budget cuts/bonus* (`UPDATE clubs SET budget = ... * 0.8 / * 1.1`, 126-128) também dentro da tela. Nenhuma dessas operações tem teste — `__tests__/` só cobre o `engine/`.

- **"Última bug shipado foi um loop infinito nessa mesma lógica residente em tela"** — commit `17fc8da` (`fix: prevent infinite loop in board loading when objective is null`) corrigiu um `useEffect` de `HomeScreen` que re-disparava quando `getBoardObjective` retornava `null` (`HomeScreen.tsx:181-196`). A correção foi um `boardLoadedRef` — um *band-aid* de ciclo de vida do React, justamente o tipo de bug que some quando a lógica de reload vira função pura testável.

- **"HomeScreen com 1352 linhas / advance-week glue não testado"** — `src/screens/home/HomeScreen.tsx` orquestra `advanceGameWeek` e o reload subsequente (`handleAdvanceWeek`, **198-275**): chama o engine, faz `updateWeek`, recarrega o clube (`getClubById`, 235), recarrega resultados recentes (240-242), seta `setNewSeason(true)` no fim de temporada (244) e propaga retirees. Esse *glue* (qual `season` buscar quando `isSeasonEnd`, linha 239; quando setar a flag de nova temporada) é lógica de decisão sem cobertura.

- **"Injuries cosmetic test gap"** — finding [HIGH] "Injuries occurring during a match never sideline the player" (`match-engine.ts:639`, `game-loop.ts:546`): o evento `injury` é persistido mas nada seta `injury_weeks_left > 0`; o único write pós-jogo é o decremento (`game-loop.ts:547`). O `advanceGameWeek` não tem hook que transforme evento de lesão em duração. Existe `src/engine/week-advance.ts` (`advanceWeek`, 48) que mapeia `injuredPlayers` para valores decrementados, **mas nunca é importado em produção** — `game-loop.ts` reimplementa a mesma lógica inline (547). Código morto duplicado é sintoma do mesmo gap de extração.

- **"Cobertura fina de save/load e glue de rollover"** — finding [HIGH] "rollover/novo-jogo sem transação (falha parcial = save corrompido)". `handleContinue` faz dezenas de writes sem transação; se um falhar no meio, o save fica meio-virado. O `catch` (522-525) só faz `updateWeek` e segue.

**Padrão sistêmico (do veredito da auditoria):** muita lógica existe no `engine/` mas a *cola* do loop real mora em telas. Este épico é o lar dessa cola.

---

## 3. Abordagem

Criar **`src/engine/season-rollover.ts`** (módulo puro) que recebe um `DbHandle` + parâmetros e executa a virada inteira numa função orquestradora — espelhando o padrão já estabelecido de `advanceGameWeek` em `game-loop.ts`, que também recebe `DbHandle` e é testado com SQLite real (`__tests__/engine/game-loop.test.ts`). A tela `EndOfSeasonScreen.handleContinue` passa a ser um *caller* fino: monta os params do store, chama `rolloverSeason(...)`, e aplica os resultados nos stores (`setNewSeason(false)`, `updateWeek`).

**Alternativa considerada e descartada:** colocar a orquestração no `store/` (Zustand action). Descartada porque o `store/` importa React e os stores irmãos; a regra do projeto (CLAUDE.md) é **engine puro, zero dependência de React/Expo, testável isoladamente** — e a auditoria exige integração-com-SQLite-real, não mock. O engine é o lar correto; o store só repassa.

Decisão deliberada: este é primariamente um **refactor preservando comportamento**, mais (a) embrulhar a virada em transação e (b) plugar o hook de lesão que já deveria existir. Não muda regras de jogo (promoção/rebaixamento real, IA viva etc.) — isso é dos irmãos, que vão **estender** este módulo.

---

## 4. Arquitetura & componentes

### 4.1 Novo: `src/engine/season-rollover.ts` (puro)

Responsabilidade única: aplicar, no banco, todas as mutações de virada de temporada para o clube do jogador. Sem React. Recebe `DbHandle`.

```ts
export interface RolloverSeasonParams {
  dbHandle: DbHandle;
  playerClubId: number;
  saveId: number;        // -1 quando não há save (paridade com game-loop)
  endedSeason: number;   // temporada que acabou
  newSeason: number;     // próxima temporada (== store.season pós-advanceGameWeek)
  youthAcademyLevel: number;   // hoje hardcoded 3 em EndOfSeasonScreen:399
  rng: SeededRng;
}

export interface RolloverSeasonResult {
  agedPlayerCount: number;
  freedAgentCount: number;
  youthGeneratedIds: number[];
  potentialUpdatedIds: number[];
  competitionsCreated: number;
  fixturesCreated: number;
}

export async function rolloverSeason(p: RolloverSeasonParams): Promise<RolloverSeasonResult>;
```

Sub-passos (extraídos 1:1 de `EndOfSeasonScreen.handleContinue`, mesmas queries, mesma ordem):

1. Envelhecer não-aposentados (`UPDATE players SET age = age + 1 WHERE club_id IS NOT NULL OR is_free_agent = 1`).
2. Expirar contratos (`UPDATE players SET is_free_agent = 1 WHERE contract_end <= endedSeason AND club_id IS NOT NULL`).
3. `returnExpiredLoans(dbHandle, endedSeason)` (já em `src/engine/transfer/loan-returns.ts:16`).
4. Recalcular potencial do elenco do jogador via `recalculatePotential` (`src/engine/training/potential.ts:17`), lendo `player_stats` da `endedSeason`.
5. Gerar base via `generateYouthPlayers` (`src/engine/youth/youth-academy.ts:96`) e inserir em `players` + `player_attributes`.
6. Regenerar calendário via `generateSeasonCalendar` (`src/engine/competition/calendar.ts`) e persistir competições/entries/fixtures com os mesmos offsets de id (`+ newSeason * 10000` / `* 100000`).

**Fora deste módulo:** processamento de assistentes (`processAssistantSeasonEnd`) e o board pipeline (`processSeasonEndBoard`) — ver 4.2 e 4.3.

### 4.2 Novo: `src/engine/board/season-end-board.ts` (puro)

Mover `processSeasonEndBoard` (hoje `EndOfSeasonScreen.tsx:78-164`) para cá, **sem os callbacks de store**. A função retorna um resultado plano; a tela aplica nos stores. Isso isola os *budget cut/bonus* (`UPDATE clubs SET budget * 0.8 / * 1.1`) e o upsert de objetivo/trust/reputação como engine testável.

```ts
export interface SeasonEndBoardParams {
  dbHandle: DbHandle; clubId: number; saveId: number;
  endedSeason: number; newSeason: number;
  leaguePosition: number | null; totalTeams: number;
  currentReputation: number; budgetBalance: number;
  wasRelegated: boolean; wasPromoted: boolean; wonLeague: boolean; wonCup: boolean;
}
export interface SeasonEndBoardResult {
  oldReputation: number; newReputation: number; reputationDelta: number;
  newTrust: number; outcome: TrustOutcome; consequence: TrustConsequence;
  newObjective: BoardObjective;           // já persistido p/ newSeason
  reputationHistory: ReputationHistoryEntry[];
}
export async function processSeasonEndBoard(p: SeasonEndBoardParams): Promise<SeasonEndBoardResult>;
```

A tela consome o resultado e chama `setCurrentObjective`/`setCurrentTrust`/`setLastTrustResult`/`setReputationHistory` + `setBoardEval` exatamente como hoje — só que sobre um objeto puro.

### 4.3 Novo: `src/engine/assistant/season-end-assistants.ts` (puro)

Embrulhar o loop de assistentes (`EndOfSeasonScreen.tsx:341-357`) numa função `processAssistantsSeasonEnd(dbHandle, saveId)` que aplica `processAssistantSeasonEnd` (já em `src/engine/assistant/assistant-engine.ts:93`) e persiste (delete/update). Retorna a lista atualizada para a tela setar `setAssistants`.

### 4.4 Alterado: `src/screens/EndOfSeasonScreen.tsx`

`handleContinue` vira ~30 linhas: monta params do store, embrulha em **uma transação** (ver §6), chama `processAssistantsSeasonEnd` + `rolloverSeason`, depois `setPendingAnnouncedRetirementIds([])`, `setNewSeason(false)`, `updateWeek(newSeason, 1)`, `navigation.navigate('Game')`. O `useEffect` de stats e `processSeasonEndBoard` (4.2) continuam na tela mas chamando os módulos puros. Alvo: a tela cai bem abaixo de 874 linhas e a lógica testável sai do componente.

### 4.5 Alterado: `src/engine/game-loop.ts` (advance-week glue + hook de lesão)

(a) **Hook de lesão** (fecha o gap cosmético): em `advanceGameWeek`, **após** persistir os eventos do jogo (já em 459-467) e **após** o decremento existente (`game-loop.ts:547`, reordenar para vir antes), iterar os eventos `type === 'injury'` do clube do jogador e setar `injury_weeks_left` a uma duração rolada via `rng` (1–8 semanas, peso para curto). Helper puro novo `rollInjuryDuration(rng): number` em `src/engine/simulation/injury.ts` para ser testável isolado.

(b) **Advance-week reload glue:** extrair a *decisão* do reload (qual `season` buscar para recentes quando `isSeasonEnd` — `HomeScreen.tsx:239`; quando setar `newSeason`) para um helper puro `resolveAdvanceReload({ result, season })` em `game-loop.ts` (ou módulo `advance-reload.ts`), retornando `{ fetchSeasonForRecents, shouldStartNewSeason }`. `HomeScreen.handleAdvanceWeek` passa a chamar esse helper em vez de calcular inline. (A reescrita do finance inline duplicado e a remoção do `week-advance.ts` morto ficam fora — ver §10.)

### 4.6 Alterado: `src/screens/home/HomeScreen.tsx`

`handleAdvanceWeek` usa `resolveAdvanceReload` para o ramo `isSeasonEnd`. O `useEffect` de board-loading (181-196) **não muda de comportamento** neste épico (o `boardLoadedRef` permanece), mas a lógica de "o que carregar" já está coberta indiretamente por `processSeasonEndBoard` testado. (A eliminação do ref via store action é candidata futura, não escopo.)

**Engine puro garantido:** `season-rollover.ts`, `season-end-board.ts`, `season-end-assistants.ts`, `injury.ts` importam só de `@/database/queries/*` (que já são puros, sem React) e de outros módulos de `engine/`. Zero import de React/Expo/`store/`.

---

## 5. Fluxo de dados

**Fim de temporada (rollover):**
`advanceGameWeek` (game-loop) detecta `week >= SEASON_END_WEEK` → arquiva e retorna `isSeasonEnd: true` → `HomeScreen.handleAdvanceWeek` faz `setNewSeason(true)` (via `resolveAdvanceReload`) → `useEffect` navega para `EndOfSeason` (`HomeScreen.tsx:154-158`) → tela calcula stats + chama `processSeasonEndBoard` (engine) no mount → usuário toca *Continue* → `handleContinue` abre transação → `processAssistantsSeasonEnd` + `rolloverSeason` (engine) mutam o banco → tela faz `setNewSeason(false)` + `updateWeek(newSeason, 1)` → navega para `Game`.

**Avanço de semana normal:**
`handleAdvanceWeek` → `advanceGameWeek` (engine; simula, finanças, lesões via novo hook, retirees) → `resolveAdvanceReload` decide reload → tela recarrega clube/recentes nos stores.

Os stores (`game-store`, `board-store`, `assistant-store`) só **recebem** os resultados; nenhuma regra de jogo roda dentro deles.

---

## 6. Schema changes

**Nenhuma coluna/tabela nova é introduzida por este épico.** O rollover usa apenas colunas existentes (`players.age`, `is_free_agent`, `contract_end`, `injury_weeks_left`, `effective_potential`; `clubs.budget`, `reputation`).

**Dependência de migração (não inventada aqui):** `rolloverSeason` deve rodar dentro de **uma transação**. O mecanismo de `BEGIN/COMMIT` (e o FK-on em testes) é de responsabilidade do épico **db-hardening**. Este épico **consome** esse wrapper transacional — não cria um framework de migração próprio. Se o helper transacional de db-hardening ainda não existir quando esta extração landar, usamos um `dbHandle.prepare('BEGIN').run()` / `COMMIT` / `ROLLBACK` mínimo e idempotente no `season-rollover.ts`, a ser substituído pelo wrapper canônico quando disponível.

**Colunas que IRMÃOS vão adicionar e que este módulo deve acomodar sem reescrever** (apenas passar adiante / scoping):
- `save_id` em tabelas de mundo (épico **save-isolation**) — `rolloverSeason` já recebe `saveId`; quando o scoping existir, as queries internas ganham `AND save_id = ?` sem mudar a assinatura pública.
- `season_promoted` + estado de mata-mata (épico **competitions-real**) — a regeneração de calendário em `rolloverSeason` é o ponto de extensão onde swaps de divisão e rounds ≥2 vão entrar.
- `training_focus` persistido (épico **progression-wired**) — o passo 4 (recalcular potencial) lê hoje inputs simplificados; quando a coluna existir, vira input real.
- `suspension_weeks_left` (épico **match-consequences**) — o hook de lesão (§4.5a) é o vizinho natural; suspensão entra no mesmo ponto pós-jogo.

---

## 7. Error handling & edge cases

- **Falha parcial da virada:** hoje `handleContinue` não tem transação (corrupção parcial confirmada na auditoria). Em transação, qualquer erro faz `ROLLBACK` → save permanece na temporada anterior, usuário tenta de novo. Sem estado meio-virado.
- **`saveId === -1` (sem save):** paridade com `game-loop.ts` (guarda `if (saveId >= 0)`); `rolloverSeason`/board pulam upserts dependentes de save.
- **`player_stats` ausente para um jogador:** `recalculatePotential` é pulado (mesmo `if (!seasonStats) continue` de hoje, 375).
- **`leaguePosition === null`:** propagado ao board (já tratado por `?? Math.ceil(totalTeams/2)` em `reputation-engine`).
- **Re-entrância:** o `boardEval`/`boardProcessed` guard da tela (279) permanece para impedir reprocessar board em re-render — agora reforçado por o board ser função pura idempotente sobre `(clubId, endedSeason)`.
- **Loop infinito de `useEffect` (a regressão histórica):** ao mover a decisão "carregar board / nova temporada?" para funções puras com retorno determinístico, testes cobrem o caso `objective == null` que originou `17fc8da` — não depende mais de timing de render.
- **IDs de youth colidindo:** preservar o `SELECT MAX(id)` + incremento atual (405-406) dentro da transação para evitar corrida.
- **Calendário já existente:** preservar os `try/catch` "may already exist" atuais (478, 493, 512) para idempotência quando a virada é re-tentada.

---

## 8. Estratégia de testes (SQLite real, nunca mock)

Padrão: `createTestDb` + `seedTestDb` + `createTestDbHandle` de `__tests__/database/test-helpers.ts` (mesmo setup de `__tests__/engine/game-loop.test.ts`).

**`__tests__/engine/season-rollover.test.ts`** (integração):
- Após `rolloverSeason`, todo jogador com `club_id` ou `is_free_agent=1` teve `age + 1`; aposentados (`club_id=NULL, is_free_agent=0`) **não** envelheceram (regressão de 337-339).
- Jogador com `contract_end <= endedSeason` vira free agent; com `contract_end > endedSeason` não.
- Youth: `youthGeneratedIds.length > 0`, novos `players` têm `club_id = playerClubId` e linha em `player_attributes`.
- Calendário: `competitionsCreated > 0` e `fixturesCreated > 0` para `newSeason`; re-rodar `rolloverSeason` não duplica (idempotência via try/catch).
- **Edge:** elenco sem `player_stats` → não quebra, `potentialUpdatedIds` vazio.
- **Edge:** `saveId = -1` → não toca tabelas de save.

**`__tests__/engine/board/season-end-board.test.ts`** (integração):
- `consequence === 'budget_cut'` → `clubs.budget` caiu ~20%; `budget_bonus` → subiu ~10%.
- `newObjective` persistido em `board_objectives` para `newSeason` (`getBoardObjective` retorna não-nulo) — cobre o caso que gerava o loop infinito (objetivo presente vs ausente).
- `reputationHistory` inclui a `endedSeason`.
- Idempotência: chamar 2× com mesmos params não dobra o budget cut (guard de reprocesso).

**`__tests__/engine/season-end-assistants.test.ts`** (integração):
- Assistente que atinge idade de aposentadoria é deletado; os demais têm `age+1`/`seasonsAtClub+1`.

**`__tests__/engine/injury.test.ts`** (unit) + extensão em `game-loop.test.ts` (integração):
- `rollInjuryDuration(rng)` ∈ [1, 8], determinístico por seed.
- **Gap cosmético fechado:** após `advanceGameWeek` numa partida que produz evento `injury` no clube do jogador, esse jogador tem `injury_weeks_left > 0` e é **excluído** do XI da semana seguinte (re-rodar advance e checar `pickStartingEleven`). Ordem: decremento antes de aplicar nova lesão (não zera a recém-criada).

**`__tests__/engine/advance-reload.test.ts`** (unit):
- `resolveAdvanceReload({ result: { isSeasonEnd: true, newSeason }, season })` → `fetchSeasonForRecents === season` e `shouldStartNewSeason === true`.
- `isSeasonEnd: false` → `fetchSeasonForRecents === result.newSeason`, `shouldStartNewSeason === false`.

**Regressão garantida:** a suíte existente (62 suítes / 536 testes) deve continuar verde — `game-loop.test.ts` e `season-archiver.test.ts` não mudam de comportamento, só ganham o hook de lesão.

---

## 9. Dependências & sequenciamento

**Este épico deve landar CEDO (a extração-esqueleto primeiro).** A ordem ideal:

1. **db-hardening** (idealmente antes, ou em paralelo): fornece o wrapper transacional usado por `rolloverSeason` (§6). Se não estiver pronto, usamos `BEGIN/COMMIT` mínimo como ponte.
2. **testable-orchestration (este)**: cria `season-rollover.ts` / `season-end-board.ts` / `season-end-assistants.ts` / `injury.ts` + `resolveAdvanceReload`. **Não depende** de `save-isolation` para landar — a assinatura já recebe `saveId`, e o scoping por `save_id` é aditivo (queries internas ganham `AND save_id = ?` depois).
3. **Irmãos que estendem este módulo (depois):**
   - **competitions-real** adiciona swap de divisão (promoção/rebaixamento real) e rounds ≥2 dentro do passo de calendário de `rolloverSeason`, e `season_promoted`.
   - **progression-wired** troca os inputs simplificados do passo 4 por `training_focus`/minutos reais.
   - **ai-world-alive** / **economy-depth** plugam finanças/IA multi-clube no rollover (substituindo eventualmente o `week-advance.ts` morto).
   - **match-consequences** adiciona suspensão no mesmo ponto pós-jogo do hook de lesão.

**Acoplamento com save-isolation:** independência confirmada — `rolloverSeason(saveId)` não precisa do schema multi-save para existir; só não estará *isolado* até save-isolation landar. Sem dependência bloqueante em nenhuma direção.

---

## 10. Fora de escopo (deferido)

- **Promoção/rebaixamento real** (mover clubes entre divisões) — épico **competitions-real**. Este épico só cria o ponto de extensão no calendário.
- **Mata-mata multi-round / campeão real de copa** — **competitions-real**.
- **`save_id` scoping** das queries de mundo — **save-isolation**. Aqui só passamos `saveId` adiante.
- **Suspensão por cartões** (`suspension_weeks_left`) — **match-consequences**. Apenas a *vizinhança* (hook pós-jogo) é preparada.
- **Reescrever as finanças inline duplicadas** de `game-loop.ts` (589-678) e **remover/reusar `src/engine/week-advance.ts` morto** — refactor maior, candidato a **economy-depth**; aqui só documentamos a duplicação.
- **Eliminar o `boardLoadedRef`** de `HomeScreen` via store action — melhoria de ciclo de vida, não bloqueante; o reload já fica coberto por testes do board puro.
- **IA viva / lesões em clubes da IA** — **ai-world-alive**. O hook de lesão deste épico cobre só o clube do jogador (paridade com o comportamento atual).
- **i18n das strings novas** das telas afinadas — segue o épico de i18n; este épico não introduz strings de UI novas (só remove lógica).

---

## 11. Self-review

- **Placeholder scan:** sem "TBD"/"TODO"/`...` não-intencional. Assinaturas (`rolloverSeason`, `processSeasonEndBoard`, `rollInjuryDuration`, `resolveAdvanceReload`) e arquivos citados (`game-loop.ts:323`, `EndOfSeasonScreen.tsx:325`, `HomeScreen.tsx:198`, `week-advance.ts:48`, `loan-returns.ts:16`, `potential.ts:17`, `youth-academy.ts:96`, `objective-generator.ts:26`, `assistant-engine.ts:93`, `season-archiver.ts:359`, `test-helpers.ts:6/32/48`) verificados no código real.
- **Consistência interna:** §4 (componentes) ↔ §8 (um teste por módulo novo) ↔ §9 (sequenciamento) batem. O hook de lesão aparece em §4.5, §7, §8 e §10 coerentemente (clube do jogador apenas, AI deferida).
- **Ambiguidade resolvida:** deixado explícito que o board pipeline (§4.2) sai da tela mas o `setBoardEval`/UI fica; que `boardLoadedRef` não é removido neste épico; que a transação vem de db-hardening com ponte mínima caso ausente.
- **Escopo honesto:** este épico é refactor + 2 plugs (lesão, reload glue); todas as regras de jogo novas estão atribuídas a irmãos nominalmente.
