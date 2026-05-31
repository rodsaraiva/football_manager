# Design: Board Stakes — Job Security & Meetable Objectives

**Data:** 2026-05-31
**Epic:** `board-stakes`
**Status:** Proposto

**Goal:** Tornar a diretoria uma stake real — objetivos de copa/promoção que de fato podem ser cumpridos, demissão que termina o jogo, reputação que reflete a força do elenco, e qualidade do assistente que importa mecanicamente.

---

## 1. Problem / current state

A engine do board (`reputation-engine.ts`, `trust-engine.ts`, `objective-generator.ts`) é correta e testada, mas o `EndOfSeasonScreen` a alimenta com inputs hardcoded e ignora a consequência mais importante. Gaps confirmados na auditoria (`docs/audit/2026-05-31-gap-audit.md`):

- **"cup_win and promotion objectives can never be met"** — `EndOfSeasonScreen.tsx:295-296` passa `wasPromoted: false` e `wonCup: false` literais. `trust-engine.ts:36,39` lê esses campos: qualquer copa vencida vira `objective_failed` (-15 trust). O dado de campeão de copa já existe em `season_competition_results` (escrito por `season-archiver.ts:325`, lido por `history.ts`) e nunca é consultado para `wonCup`; promoção nem é detectada.
- **"Firing has no consequence, no game-over loop"** / **"Board can fire the manager but the game continues into the same save"** — `trust-engine.ts:81-85` retorna `consequence: 'fired'` quando `newTrust < BOARD_TRUST_FIRE_THRESHOLD` (20). `EndOfSeasonScreen.tsx:662-663` mostra "FIRED — you have been dismissed." como texto, mas `handleContinue` (linha 325-530) envelhece jogadores, regenera o calendário e chama `navigation.navigate('Game')` (linha 528) incondicionalmente. Não há rota `GameOver`/`Fired` em `navigation/types.ts`; `lastTrustConsequence` em `board-store.ts` é setado e lido em lugar nenhum (grep confirma zero callers).
- **"Reputation squadDelta hardcoded zero"** — `reputation-engine.ts:61` tem `const squadDelta = 0;`. O input `squadAverageOverall` existe (`reputation-engine.ts:21`) mas `EndOfSeasonScreen.tsx:93` passa o literal `70`. Reputação não responde a quão forte o elenco realmente é.
- **"Assistant quality is tenure-only and inert"** — `assistant-engine.ts:38` deriva `qualityStars` só de `seasonsAtClub`; `getStaffEffects` (`staff-effects.ts:17`) mapeia `assistantAbility → tacticBonus/trainingBonus` mas tem **zero callers** em produção (auditoria HIGH "getStaffEffects / assistant tacticBonus is dead code"). Assistentes cobram salário (game-loop) sem nenhum efeito de jogo.
- **"Projection marks top-4 as promotion in top division"** — `classification-projection.ts:100` marca `pos <= ceil(n*0.25)` como `status: 'promotion'` em **qualquer** divisão, incluindo a 1ª, onde top-4 é vaga continental e não promoção. Bug cosmético de label no relatório de projeção.

Consequência: o pilar "ambição/diretoria" recém-shippado é hollow — o jogador pode terminar em último para sempre, ser "demitido" por texto, e seguir gerenciando.

## 2. Approach

Manter `engine/board/*` puro e quase intocado; o trabalho é **alimentar inputs reais** (cup/promotion/squad strength) na borda screen/loop e **adicionar um fluxo de game-over** quando `consequence === 'fired'`. Para o assistente, plugar `getStaffEffects` (já existente) no ponto único de progressão (`game-loop.ts:483`) e numa modificação leve de força de time, derivando `assistantAbility` de `qualityStars`. Alternativa considerada e descartada: reescrever o trust-engine para detecção interna de cup/promotion — rejeitada porque a engine deve permanecer pura (sem acesso a DB) e os dados já existem em tabelas que a screen lê.

## 3. Architecture & components

### Engine (puro — mudanças mínimas)

| Arquivo | Mudança | Responsabilidade |
|---|---|---|
| `src/engine/board/reputation-engine.ts` | Implementar `squadDelta` a partir de `squadAverageOverall` (hoje `const squadDelta = 0`). Novo helper puro `squadStrengthDelta(squadAverageOverall: number): number` com curva: `>= 80 → +3`, `>= 70 → +1`, `<= 50 → -2`, senão `0`. Constantes em `balance.ts` (`REPUTATION_SQUAD_STRONG_BONUS=3`, `REPUTATION_SQUAD_GOOD_BONUS=1`, `REPUTATION_SQUAD_WEAK_PENALTY=-2`, `REPUTATION_SQUAD_STRONG_THRESHOLD=80`, `REPUTATION_SQUAD_GOOD_THRESHOLD=70`, `REPUTATION_SQUAD_WEAK_THRESHOLD=50`). | Reputação reflete força real do elenco. Assinatura de `computeReputationDelta` inalterada (já recebe `squadAverageOverall`). |
| `src/engine/board/objective-generator.ts` | Sem mudança de assinatura. `divisionLevel` já é input; o gerador já produz `promotion` apenas para divisões inferiores (templates rep ≤ 30 não incluem promotion hoje — **fora de escopo** ampliar templates; ver §10). | — |
| `src/engine/board/trust-engine.ts` | Nenhuma mudança de lógica. Já consome `wonCup`/`wasPromoted` corretamente (linhas 36,39). Só passamos os valores reais. | — |
| `src/engine/staff/staff-effects.ts` | Sem mudança de assinatura. Novo helper puro `assistantAbilityFromStars(qualityStars: number): number` (mapeia 1-5 estrelas → 4-20 ability, `stars*4`) para alimentar `StaffEffectsInput.assistantAbility`. | Converter a métrica de qualidade do assistente (estrelas) na escala 1-20 que `getStaffEffects` espera. |
| `src/engine/training/progression.ts` | Adicionar campo **opcional** `staffTrainingBonus?: number` em `ProgressionInput` (default 0), somado ao fator de crescimento. **Coordenação:** se o epic `progression-wired` já adicionar esse campo, reusar; não duplicar. | Permitir que `trainingBonus` do assistente acelere a progressão. |

### Engine — novo módulo

| Arquivo | Responsabilidade | Interface |
|---|---|---|
| `src/engine/board/season-outcome.ts` (novo) | Função pura que, dadas as flags do fim de temporada, decide se o save terminou (game-over). Mantém a regra de "fired" testável sem React/DB. | `export function isManagerDismissed(consequence: TrustConsequence): boolean` (retorna `consequence === 'fired'`). Trivial mas centraliza o predicado para teste e evita string-compare espalhado nas screens. |

### Screens / navegação

| Arquivo | Mudança | Responsabilidade |
|---|---|---|
| `src/screens/GameOverScreen.tsx` (novo) | Tela de demissão/desemprego. Mostra clube, temporada, motivo (objetivo falhado + trust final), e dois CTAs: **"Voltar ao menu"** (chama `clearGame()` → `navigation.navigate('MainMenu')`) e **"Excluir save"** (opcional, via `deleteSave`). Strings via `src/i18n` (`t('gameover.*')`). Cores/spacing via `src/theme`. | Fechar o loop de fracasso. Lê params: motivo + trust + objetivo. |
| `src/navigation/types.ts` | Adicionar `GameOver: { reason: string; trust: number; objectiveDescription: string }` ao `RootStackParamList`. | Tipar a nova rota. |
| `src/navigation/RootNavigator.tsx` | Registrar `<Stack.Screen name="GameOver" component={GameOverScreen} options={{ headerShown: false }} />`. | Tornar a rota navegável (hoje rotas declaradas sem registro crasham — ver gap C5). |
| `src/screens/EndOfSeasonScreen.tsx` | (a) Consultar `wonCup` e `wasPromoted` reais antes de `processSeasonEndBoard` (ver §5). (b) Passar `squadAverageOverall` real. (c) Em `handleContinue`, **antes** de qualquer mutação de rollover: se `isManagerDismissed(boardEval.consequence)`, marcar o save como terminado e `navigation.navigate('GameOver', {...})` em vez de `Game`. | Alimentar inputs reais + rotear para game-over. |
| `src/screens/club/BoardScreen.tsx` | Sem mudança funcional obrigatória; opcionalmente exibir `lastTrustConsequence` se já em risco. **Fora do caminho crítico.** | — |
| `src/engine/reports/classification-projection.ts` | Adicionar input `divisionLevel: number` (default 1). Quando `divisionLevel === 1`, top-N não é `promotion` e sim `continental` (novo valor de `status`); promoção só aplica em `divisionLevel > 1`. | Corrigir o label de top-4 na 1ª divisão. |
| `src/screens/reports/ReportsProjectionScreen.tsx` | Passar `divisionLevel` real do clube do jogador; renderizar o novo status `continental`. | Refletir o fix no UI. |

### Store

| Arquivo | Mudança |
|---|---|
| `src/store/board-store.ts` | `lastTrustConsequence` já existe; passa a ser **lido** por `EndOfSeasonScreen.handleContinue` (via `boardEval` local, que já carrega `consequence`). Sem mudança de shape. |
| `src/store/game-store.ts` | `clearGame()` já existe (reseta board+assistant+game). Reusar no game-over. Sem mudança de shape. |

## 4. Data flow

**Cup/promotion → objetivo cumprido:**
1. Durante `advanceGameWeek` no fim da temporada, `archiveSeason` (game-loop.ts:781) já escreve `season_competition_results` (campeão por competição) e `season_relegated`. Isso roda **antes** do `EndOfSeasonScreen` montar.
2. No `useEffect` do `EndOfSeasonScreen`, antes de `processSeasonEndBoard`:
   - **wonCup:** `getCompetitionsBySeason(db, endedSeason)` → filtrar `type === 'cup'` (excluir `'continental'` para o objetivo `cup_win` doméstico) → para cada comp, `SELECT champion_club_id FROM season_competition_results WHERE season=? AND competition_id=?` → `wonCup = algum champion === playerClubId`.
   - **wasPromoted:** depende do epic `competitions-real`, que possui a tabela `season_promoted` (ver §6). `SELECT id FROM season_promoted WHERE season=? AND club_id=? LIMIT 1` (espelha o padrão já usado para `season_relegated` em EndOfSeasonScreen.tsx:281-283).
3. Esses booleans entram em `processSeasonEndBoard` → `computeReputationDelta` e `computeTrustDelta`. `trust-engine.ts` já trata `cup_win`/`promotion` corretamente; agora o outcome pode ser `objective_met`.

**Squad strength → reputação:**
1. `getPlayersWithAttributesByClub(db, playerClubId)` → `calculateOverall(attributes, position)` por jogador → média = `squadAverageOverall`.
2. Passado para `computeReputationDelta`; `squadStrengthDelta` adiciona ao total.

**Fired → game-over:**
1. `processSeasonEndBoard` já computa `trustResult.consequence` e o expõe via `setBoardEval`. Hoje só o branch budget age (linhas 124-129).
2. Em `handleContinue`: `if (isManagerDismissed(boardEval?.consequence))` → setar `save_games` como terminado (coluna nova `ended`, ver §6) via `UPDATE save_games SET ended = 1 WHERE id = ?`, **não** rodar rollover, `navigation.navigate('GameOver', { reason, trust, objectiveDescription })`.
3. `GameOverScreen` → "Voltar ao menu" → `clearGame()` + `navigate('MainMenu')`. O save com `ended = 1` aparece no menu como terminado (MainMenu mostra badge/desabilita "load" — coordenação leve com UI do menu; fallback aceitável: load apenas reabre o GameOver).

**Assistant ability → mecânica:**
1. No fim de temporada e/ou no loop semanal, `getAssistantByRole(db, saveId, 'squad')` → `qualityStars` → `assistantAbilityFromStars()` → `getStaffEffects({ assistantAbility, ... })`.
2. `staffEffects.trainingBonus` → `staffTrainingBonus` em `calculateWeeklyProgression` (game-loop.ts:483, hoje o único call site). `staffEffects.tacticBonus` → multiplicador leve em `calculateTeamStrength` apenas para o clube do jogador (coordenação com o fix de home-advantage; manter conservador: aplicar só ao setor de ataque/meio, fora do caminho de IA).

## 5. Schema changes

Esta epic precisa de **duas** colunas/tabelas. Assumir o mecanismo de migração idempotente de `save-isolation`/`db-hardening` (execAsync em init, padrão já usado em `database-store.ts:150-176`); **não** inventar framework próprio.

- **`save_games.ended INTEGER NOT NULL DEFAULT 0`** — flag de game-over (owner: esta epic). Migração: `ALTER TABLE save_games ADD COLUMN ended INTEGER NOT NULL DEFAULT 0` guardado por checagem de coluna existente.
- **`season_promoted` (season, league_id, club_id, final_position, UNIQUE(season, league_id, club_id))** — **owned por `competitions-real`** (que implementa promoção/rebaixamento físico). Esta epic **consome** a tabela; se `competitions-real` ainda não tiver landado, o `wasPromoted` cai para `false` graciosamente (query retorna vazio). Listado aqui explicitamente como dependência, não como criação desta epic.

Se `save-isolation` adicionar `save_id` às tabelas do board, as queries de cup/promotion desta epic devem incluir `save_id` no WHERE — coordenar, não redesenhar.

## 6. Error handling & edge cases

- **Empate na 1ª divisão sem copa:** `wonCup = false`, objetivo `cup_win` falha corretamente.
- **Copa continental (CL) vs copa doméstica:** o objetivo `cup_win` é satisfeito por **qualquer** `type === 'cup'`. Decisão: excluir `'continental'` do gate de `cup_win` para evitar que ganhar a CL satisfaça um objetivo de copa doméstica de forma ambígua; CL alimenta `wonCup` da **reputação** (que já soma `REPUTATION_CUP_BONUS`) mas não o objetivo. Documentado para evitar ambiguidade.
- **Cup sem final real (gap C2 de competitions-real):** se `competitions-real` ainda não gera rodadas ≥2, `season_competition_results` pode conter um "campeão" de 1ª rodada. Esta epic não corrige isso (dependência); apenas lê o que estiver lá. Quando `competitions-real` landar, o dado fica correto sem mudança aqui.
- **Fired no mesmo fim de temporada em que há promoção:** trust pode subir por promoção e não disparar fired — ordem correta porque trust é computado **com** os booleans reais antes da decisão.
- **`boardEval` null (falha no processSeasonEnd):** `handleContinue` trata `boardEval?.consequence` como undefined → não-fired → segue rollover normal (degradação graciosa, sem crash).
- **Save já terminado (`ended=1`) sendo recarregado:** `loadSave` deve checar `ended` e, se 1, navegar direto para `GameOver` (coordenação leve; fallback: HomeScreen vazio é aceitável no MVP).
- **squadAverageOverall com elenco vazio:** divisão por zero — guardar com `squad.length ? avg : 70` (default neutro, mantém comportamento atual).

## 7. Testing strategy

SQLite real em memória (`better-sqlite3`), **nunca** mock. TDD obrigatório (toca `engine/board`, `engine/training`, `store`).

**Engine (unit, puro):**
- `reputation-engine.test.ts` (ampliar): `squadAverageOverall=85 → squadDelta=+3`; `=72 → +1`; `=45 → -2`; `=60 → 0`. Caso: `wonCup=true` soma `REPUTATION_CUP_BONUS`.
- `trust-engine.test.ts` (já cobre fired; ampliar): objetivo `cup_win` com `wonCup=true → objective_met` (+15); `promotion` com `wasPromoted=true → objective_met`. Edge: trust sobe acima de 20 com cup vencida evita fired.
- `season-outcome.test.ts` (novo): `isManagerDismissed('fired') === true`; demais consequences `false`.
- `staff-effects.test.ts` (ampliar): `assistantAbilityFromStars(5)=20`, `(1)=4`; `getStaffEffects` com ability 20 dá `tacticBonus=0.10`, `trainingBonus=0.30`.
- `classification-projection.test.ts` (ampliar): `divisionLevel=1` → top-4 vira `continental`, não `promotion`; `divisionLevel=2` → top-N continua `promotion`.
- `progression.test.ts` (ampliar): `staffTrainingBonus=0.3` aumenta o ganho de atributo vs `0`.

**Integração (SQLite real):**
- `EndOfSeasonScreen` cup-objective: seed save + clube com objetivo `cup_win`, escrever `season_competition_results` com `champion_club_id = playerClubId` → rodar `processSeasonEndBoard` → assert outcome `objective_met` e trust sobe.
- `EndOfSeasonScreen` promotion-objective: seed `season_promoted` com o clube → assert `wasPromoted` detectado → outcome `objective_met`.
- `EndOfSeasonScreen` fired-flow: forçar trust < 20 (objetivo falhado, rep baixa) → assert `handleContinue` **não** insere fixtures da nova temporada (rollover não roda) e `save_games.ended = 1`. (Edge crítico: garantir que nenhum envelhecimento/youth-gen ocorre no save demitido.)
- `EndOfSeasonScreen` squad-delta: seed elenco forte (overall médio ~82) → assert reputação sobe mais que com elenco médio.
- Assistant effect: seed assistant `squad` com `seasons_at_club` alto (5 estrelas) → rodar 1 semana de progressão → assert ganho de atributo > baseline sem assistente.

## 8. Dependencies & sequencing

- **`competitions-real` (deve landar antes / em paralelo):** dona da tabela `season_promoted` e do mata-mata real de copa. Esta epic consome ambos. Sem ele, `wasPromoted` é sempre `false` e o "campeão" de copa pode ser de 1ª rodada — degrada graciosamente, não crasha. Implementar o consumo de cup já agora (lê `season_competition_results`, que existe hoje).
- **`economy-depth`:** trigger de demissão por dívida (orçamento muito negativo) deve **somar** ao gate de trust < 20. Coordenar: `economy-depth` pode setar trust=0 ou marcar uma flag de insolvência; esta epic só precisa que `consequence === 'fired'` seja alcançável — o caminho via dívida reusa o **mesmo** `GameOverScreen` e o mesmo branch em `handleContinue`. Definir o motivo (`reason`) por origem (objetivo vs dívida).
- **`save-isolation` (db-hardening):** dono do `save_id` nas tabelas do mundo e do mecanismo de migração. Esta epic usa esse mecanismo para a coluna `save_games.ended` e adiciona `save_id` aos WHEREs de cup/promotion se já presente. Não inventar migração separada.
- **`progression-wired`:** se já adicionar `staffTrainingBonus`/training-focus a `ProgressionInput`, reusar o campo; caso contrário esta epic o adiciona como opcional. Coordenar para evitar conflito de assinatura.

**Ordem recomendada:** `save-isolation`/`db-hardening` (migração) → esta epic (cup/squad/fired/projection) em paralelo com `competitions-real` (que entrega `season_promoted`) → integração final do `wasPromoted`.

## 9. Out of scope

- Ofertas de **novo emprego** após demissão (apenas "voltar ao menu" no MVP; o GameOverScreen é extensível para isso depois).
- Reputação **do treinador** separada da reputação do clube (a auditoria lista como pilar ausente; não tratado aqui).
- Ampliar templates do `objective-generator` para incluir mais objetivos de `promotion` em divisões inferiores (o tipo já existe e é avaliável; geração mais rica fica para depois).
- Mover clubes entre divisões fisicamente (`UPDATE clubs SET league_id`) — pertence a `competitions-real`.
- Aplicar finanças/efeitos de assistente aos clubes da **IA** (mundo-IA inerte é outro cluster da auditoria).
- Penalty shootout para decidir final de copa empatada (TODO já marcado em `season-archiver.ts:320`).

## 10. Spec self-review

- **Placeholder scan:** sem TBD/placeholder. Todos os arquivos, funções e linhas citados foram verificados via Read/Grep (`reputation-engine.ts:61`, `trust-engine.ts:36/39/81-85`, `EndOfSeasonScreen.tsx:93/281-296/325-530/662-663`, `classification-projection.ts:100`, `staff-effects.ts:17`, `assistant-engine.ts:38`, `game-loop.ts:483/781`, `season-archiver.ts:325`, `getCompetitionsBySeason` retorna `type`/`leagueId`, `calculateOverall(attributes, position)`).
- **Consistência interna:** `wonCup` lê `season_competition_results` (escrito antes do screen por `archiveSeason@game-loop:781`); `wasPromoted` é dependência explícita de `competitions-real` com fallback `false`; fired reusa `clearGame()` e a coluna nova `ended`.
- **Ambiguidade resolvida:** CL não satisfaz objetivo `cup_win` doméstico (§6); `divisionLevel` desambigua promotion vs continental no projection; `staffTrainingBonus` opcional evita conflito com `progression-wired`.
- **Pureza preservada:** mudanças em `engine/board/*`, `engine/staff/*`, `engine/training/*`, `engine/reports/*` permanecem sem imports de React/DB; toda leitura de DB fica nas screens.
