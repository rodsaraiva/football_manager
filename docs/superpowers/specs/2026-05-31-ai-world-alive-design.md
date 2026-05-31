# Design: AI World Alive — real sim, finances, regeneration for all clubs

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `ai-world-alive`
**Escopo:** football-manager v0.1

**Goal:** Tornar os clubes da IA cidadãos de primeira classe — toda partida usa o motor real, todo clube paga salários e recebe receita semanal, e todo elenco se regenera (base/potencial/declínio) na virada de temporada, de modo que a qualidade da liga não colapse e a tabela reflita o que a IA faz.

---

## 1. Problema / estado atual

O motor (`simulateMatch`, finanças, treino, base) é rico mas **só roda para o clube humano**. Tudo que não é do jogador é simulado por um coin-flip de reputação e fica financeiramente/demograficamente inerte. Cinco achados do audit (`docs/audit/2026-05-31-gap-audit.md`) compõem este epic:

1. **"All non-player matches use a reputation-only coin flip, ignoring the real engine"** — `simulateAiMatch` (`src/engine/game-loop.ts:187-208`) calcula gols só de `home.reputation`/`away.reputation` (`homeGoals = round((homeStrength/total)*2.5 + nextFloat(-1.5,1.5))`); nunca carrega elenco, tática, forma, fitness ou chama `simulateMatch`. O loop roteia toda fixture não-humana por ele (`game-loop.ts:552-556`). Sem stats/cards/injuries para clubes da IA.

2. **"AI clubs never pay wages or receive weekly income"** — `advanceGameWeek` calcula income/expenses e chama `updateClubBudget` **só** para `playerClubId` (`game-loop.ts:573-682`). A única rotina multi-clube, `advanceWeek` em `src/engine/week-advance.ts:48-154`, é **código morto** (importada apenas em testes). Orçamento da IA só muda via transferências.

3. **"Youth intake, potential recalc, and training only run for the human club; AI squads decay"** — progressão semanal roda só para `playerSquadRaw` (`game-loop.ts:474-525`); recálculo de potencial e geração de base ficam dentro de `if (playerClubId)` (`EndOfSeasonScreen.tsx:367-393`, `:395-429`). Porém **todos** os jogadores envelhecem (`EndOfSeasonScreen.tsx:337-339`) e aposentadoria compulsória aos 41 atinge todos os clubes (`game-loop.ts:758-773`). Net: elencos da IA só perdem jogadores, nunca repõem.

4. **"AI offer generation only targets the human club's squad"** — `generateAiOffersForPlayerClub` (`src/engine/transfer/ai-offer-generator.ts:38-263`) busca apenas o elenco de `playerClubId`. `processAiTransfers` (`game-loop.ts:238-319`) move jogadores entre clubes da IA mas com `overall: 70` hardcoded (`game-loop.ts:272`) e sem usar o mercado real. Nenhuma IA disputa o elenco de outra IA com lógica de avaliação real.

5. **"week-advance.ts is dead code with a different season-length/home-away model"** — `week-advance.ts` usa `SEASON_LENGTH = 46` local (vs `SEASON_END_WEEK` de `balance.ts`) e `hasHomeMatch = week % 2 !== 0` (aproximação par/ímpar), divergindo do loop real. Precisa ser consolidado, não revivido como está.

**Consequência sistêmica:** ao longo de poucas temporadas a liga colapsa (aposentadoria/transferência saem, nada entra; reputação congela tabelas; IA acumula caixa infinito). Este epic ataca a raiz: o mundo da IA passa a ser simulado de verdade.

---

## 2. Aprovação prévia (do audit) e baseline

- `calculateMarketValue` (`src/engine/transfer/market-value.ts:8-25`) já existe e está testado — usado aqui para reavaliar valores na virada (achado "Market value is frozen at seed forever" também é deste epic via regeneração).
- `getStaffEffects` (`src/engine/staff/staff-effects.ts:17`) é código morto; **não** é escopo central deste epic (ver §9 Dependências — `progression-wired`), mas o ponto de integração de treino da IA é desenhado para aceitá-lo depois.
- Baseline: `npx tsc --noEmit` limpo, 62 suítes / 536 testes verdes.

---

## 3. Abordagem

**Escolhida: simulação real com carga de elenco em lote + cache de strength por semana, e um passo de finanças/regeneração multi-clube no mesmo loop.** Substituir `simulateAiMatch` por `simulateMatch` para todas as fixtures; para performance (uma liga inteira por semana = ~10 partidas/divisão), carregar todos os elencos da semana de uma vez (uma query por tabela, agrupada por clube) e cachear `TeamStrength`/squad por clube dentro do tick. Finanças semanais e regeneração de fim de temporada passam a iterar sobre **todos** os clubes via um único loop, eliminando `simulateAiMatch` e consolidando `advanceWeek`.

**Alternativa descartada:** manter um "lightweight engine" separado só para IA (gols a partir de attack/defense sem eventos). Rejeitada porque (a) duplica regras e diverge do humano — exatamente o bug que estamos corrigindo; (b) o `simulateMatch` já é puro e determinístico; o custo está na **carga de dados**, não na simulação. Otimizamos a carga, não bifurcamos o motor. Eventos detalhados (cards/injuries) podem ser persistidos seletivamente (ver §4) para limitar I/O.

---

## 4. Arquitetura & componentes

Princípio: **`engine/` permanece puro.** A orquestração (queries + loop) fica em `game-loop.ts`; novas funções puras ficam em módulos de engine sem React/Expo/DB.

### 4.1 `src/engine/simulation/match-runner.ts` (NOVO — orquestrador de simulação de uma semana)

Responsabilidade única: dado o conjunto de fixtures da semana e os elencos pré-carregados, rodar `simulateMatch` para cada uma e devolver resultados. **Puro** — recebe dados já carregados, não toca DB.

```ts
export interface ClubMatchData {
  clubId: number;
  reputation: number;
  squad: PlayerForStrength[];   // XI + reservas elegíveis (fitness>30, injury=0)
  bench: PlayerForStrength[];
  tactic: Tactic;               // ativa ou default
}

export interface FixtureSimInput {
  fixtureId: number;
  homeClubId: number;
  awayClubId: number;
}

export interface SimulatedFixture {
  fixtureId: number;
  result: MatchResult;          // do simulateMatch
}

export function simulateWeekFixtures(args: {
  fixtures: FixtureSimInput[];
  clubData: Map<number, ClubMatchData>;
  rng: SeededRng;
}): SimulatedFixture[];
```

A seleção de XI/bench reusa a lógica já existente em `game-loop.ts` (`pickStartingEleven`, `POSITION_GROUP`, `buildSquadFromSavedIds`). Para evitar duplicação, **extrair** essas funções para `src/engine/simulation/squad-selection.ts` (NOVO, puro) e importá-las tanto no caminho humano quanto no `match-runner`. Interface:

```ts
export function pickStartingEleven(players: PlayerForPick[], formation: string): PlayerForStrength[];
export function buildSquadFromSavedIds(savedIds: number[], raw: PlayerForPick[], formation: string): PlayerForStrength[];
export function buildBench(raw: PlayerForPick[], startIds: Set<number>, savedBenchIds?: number[]): PlayerForStrength[];
```

(`PlayerForPick` move para este módulo; `game-loop.ts` passa a importá-lo.)

### 4.2 `src/engine/game-loop.ts` — carga em lote + roteamento (MODIFICA)

- **Remove** `simulateAiMatch` inteiramente.
- **Nova helper de orquestração** `loadWeekClubData(db, fixtures)`: dado o conjunto de fixtures da semana, coleta os clubIds únicos, carrega **em lote** jogadores+atributos (`getPlayersWithAttributesByClub` por clube, ou uma query `WHERE club_id IN (...)`), táticas ativas e lineups salvos, e monta `Map<clubId, ClubMatchData>`. Cacheado por tick — cada clube carregado uma vez mesmo jogando liga+copa na mesma semana (ver §7 calendário).
- Roteia **todas** as fixtures por `simulateWeekFixtures`. A fixture do jogador continua usando exatamente o mesmo `simulateMatch` (mesma fonte), garantindo paridade.
- **Persistência:** para cada `SimulatedFixture`, `updateFixtureResult(db, fixtureId, homeGoals, awayGoals, attendance)`. Eventos e `persistMatchStats`:
  - Fixture do jogador: persiste eventos + stats completos (como hoje).
  - Fixtures da IA: persiste `persistMatchStats` (cards/ratings/minutos alimentam stats da liga e os siblings de consequência) mas **não** persiste o array completo de `match_events` por padrão (corte de I/O). Cards/injuries que precisam virar suspensão/lesão são tratados pelos siblings `match-consequences` lendo o `MatchResult` em memória, não a tabela de eventos — ver §9.

### 4.3 Finanças semanais multi-clube — `src/engine/finance/weekly-finance.ts` (NOVO, puro)

Consolida a lógica de `advanceWeek` (que será **deletada**) numa função pura por-clube reusada pelo humano e pela IA:

```ts
export interface ClubFinanceInput {
  clubId: number;
  reputation: number;
  budget: number;
  stadiumCapacity: number;
  trainingFacilities: number;
  youthAcademy: number;
  medicalDepartment: number;
  totalPlayerWages: number;
  totalStaffWages: number;
  hasHomeMatch: boolean;
  actualAttendance: number | null;  // real do fixture quando jogou em casa
  leaguePosition: number;            // 1 como hoje; refinável por sibling
}

export interface ClubFinanceResult {
  entries: FinanceEntry[];   // tv, sponsor, ticket, wages, maintenance
  newBudget: number;
}

export function computeWeeklyClubFinance(input: ClubFinanceInput, season: number, week: number): ClubFinanceResult;
```

Reusa `calculateWeeklyIncome`/`calculateWeeklyExpenses` (`src/engine/finance/finance-engine.ts:41,62`) sem alterá-las. `hasHomeMatch` para a IA é derivado do fixture real da semana (não da aproximação `week % 2` do código morto). `game-loop.ts` chama isso num loop sobre **todos** os clubes que têm fixture/elenco, escreve as `entries` via `addFinanceEntry` e atualiza cada budget via `updateClubBudget`. O bloco de finanças do jogador (`game-loop.ts:573-682`) passa a chamar a mesma função (mantendo o caso especial de assistant wages a cada 4 semanas, que continua só-humano).

### 4.4 Regeneração de fim de temporada — `src/engine/rollover/squad-regeneration.ts` (NOVO, puro)

Funções puras que decidem **o que** muda; a persistência fica no orquestrador (`game-loop.ts` no bloco `isSeasonEnd`, ou `EndOfSeasonScreen.handleContinue` — ver §5 sobre o ponto de execução).

```ts
// Progressão "barata" por clube da IA: aplica um delta médio aos atributos
// em vez de simular minutos jogo-a-jogo (que a IA não acumula em player_stats
// na mesma granularidade). Determinístico via rng.
export function regenerateAiSquadSeason(args: {
  players: AiPlayerProgressInput[];   // age, attrs avg, effectivePotential, basePotential, seasonAvgRating|null
  rng: SeededRng;
}): AiPlayerProgressDelta[];           // por player: attrDelta médio + newEffectivePotential + newMarketValue
```

- Usa `recalculatePotential` (`src/engine/training/potential.ts:17`) com `currentOverall` **real** (média dos atributos), corrigindo de passagem o achado "recalculatePotential fed currentOverall 70" para a IA.
- Usa `calculateMarketValue` (`market-value.ts:8`) para reavaliar `market_value` de cada jogador (corrige "Market value is frozen at seed" para a IA; o caso humano fica no sibling/economia, ver §9).
- Geração de base reusa `generateYouthPlayers` (`src/engine/youth/youth-academy.ts:96`) — já puro. O orquestrador chama uma vez por clube da IA com `academyLevel` real do clube, persistindo os jogadores (mesmo INSERT de `EndOfSeasonScreen.tsx:408-425`).

### 4.5 Ofertas IA→IA — `src/engine/transfer/ai-offer-generator.ts` (GENERALIZA)

Extrair o núcleo de `generateAiOffersForPlayerClub` para `generateAiOffersForSquad(db, targetClubId, rng, season, week)`, e adicionar `generateAiToAiOffers(db, rng, season, week)` que itera sobre uma amostra de clubes-alvo da IA (ex.: `ORDER BY RANDOM() LIMIT N`) e chama o núcleo. A avaliação de aceitação reusa o `evaluateOffer`/`processPendingOffers` já existente (`src/engine/transfer/offer-processor.ts`), que não distingue humano de IA na lógica de venda. `processAiTransfers` (`game-loop.ts:238-319`) é **substituído** por este caminho (elimina o `overall: 70` hardcoded e o mercado paralelo). Chamado em `advanceGameWeek` dentro de `isTransferWindow(week)`.

### 4.6 Schema: persistência de `training_focus` da IA

A IA usa `'balanced'` por padrão (não há tela de treino para ela). Nenhuma coluna nova é exigida **por este epic** para a IA. A coluna `training_focus` que o humano precisa é de `progression-wired` (ver §6/§9).

---

## 5. Fluxo de dados

**Tick semanal (`advanceGameWeek`):**

1. `getFixturesByWeek(db, season, week)` → todas as fixtures da semana (liga + copa + CL).
2. `loadWeekClubData(db, fixtures)` → `Map<clubId, ClubMatchData>` (carga em lote, cache por tick).
3. `simulateWeekFixtures({ fixtures, clubData, rng })` → resultados de **todas** as partidas (humano incluído, mesmo motor).
4. Persistência: `updateFixtureResult` para cada; eventos completos só do jogador; `persistMatchStats` para todas.
5. Progressão semanal do **clube humano** (inalterada; minutos/rating reais vêm de `progression-wired`).
6. Fitness/injury recovery do clube humano (inalterado neste epic; recovery multi-clube fica em `match-consequences`).
7. Transferências: `generateAiToAiOffers` + `generateAiOffersForSquad(playerClubId)` (em janela) + `processPendingOffers`.
8. **Finanças de TODOS os clubes:** loop sobre clubes com elenco → `computeWeeklyClubFinance` → `addFinanceEntry` + `updateClubBudget`. Caso humano usa a mesma função + assistant wages.
9. Fim de temporada (`isSeasonEnd`): aposentadorias (já global) + **regeneração de todos os clubes** (potencial, valor de mercado, base) via `squad-regeneration` + youth intake por clube.

**Tela:** `EndOfSeasonScreen.handleContinue` (`src/screens/EndOfSeasonScreen.tsx:325-530`) hoje faz aging global + recalc/base **só do humano**. A regeneração multi-clube é portada para uma função de engine chamada **uma vez** aqui (ou em `advanceGameWeek` no `isSeasonEnd`, decidido na implementação — ver Open Questions). O humano mantém o caminho de minutos reais; a IA usa o caminho barato. Resultado persiste em `players`/`player_attributes` com escopo de `save_id` (ver §6).

**Store:** nenhuma mudança de store própria deste epic. A simulação de IA é invisível ao store exceto pela tabela da liga, que já é lida das fixtures persistidas.

---

## 6. Schema changes

Este epic **não introduz tabelas novas próprias**. Depende de colunas de siblings:

- **`save_id` em tabelas de mundo** (`players`, `clubs`, `fixtures`, `competitions`, `competition_entries`, `club_finances`, `transfers`/`transfer_offers`, `player_stats`, `match_events`, `tactics`): **owned por `save-isolation`**. Todas as queries novas/modificadas deste epic (carga em lote de elencos, finanças multi-clube, ofertas IA→IA, regeneração) **devem** filtrar por `save_id`. Como simular toda a liga toca quase todo o mundo, este epic é o consumidor mais pesado do escopo por-save — assumimos o mecanismo de migração idempotente de `save-isolation`/`db-hardening`, sem inventar framework próprio.
- **Índices** em `players(club_id)`, `fixtures(season, week)`, `(save_id, ...)` compostos: **owned por `db-hardening`**. A carga em lote (`WHERE club_id IN (...)` por semana) depende desses índices para não fazer full-scan a cada tick — listado como dependência dura.
- **`training_focus` em `clubs`** (humano): **owned por `progression-wired`**. Não exigido para a IA (default `balanced`).
- **`suspension_weeks_left`** e recovery de lesão multi-clube: **owned por `match-consequences`**. Este epic produz os `MatchResult` da IA que aquele consome.

---

## 7. Error handling & edge cases

- **Clube sem elenco elegível** (todos lesionados/suspensos/vendidos): `pickStartingEleven` pode devolver <11. `simulateMatch` já tolera squads pequenos (`runBlock` checa `team.squad.length`). Garantir que `ClubMatchData.squad` nunca seja vazio para ambos os lados; se vazio, registrar resultado 0-0 sem crashar (fixture jogada). Teste cobre clube com 0 jogadores aptos.
- **Tática/lineup ausente:** usar `defaultTactic` (4-4-2 balanced), igual ao caminho humano (`game-loop.ts:422-435`).
- **Calendário colidindo (liga+copa+CL na mesma semana):** o loop de simulação processa **todas** as fixtures da semana, não "1 por clube" — corrige de passagem o achado de calendário colidindo no que tange à simulação (a geração de rodadas de copa é de `competitions-real`). O cache de `ClubMatchData` por tick é carregado **antes** da simulação; mutações de elenco (sub forçada por lesão) ficam no `MatchResult`, não corrompem o cache de outra fixture do mesmo clube na mesma semana (cada `makeTeam` clona o squad — `match-engine.ts:224` `[...squad]`).
- **Determinismo:** um único `SeededRng` percorre as fixtures em ordem estável (ordenar `fixtures` por `id` antes de simular) para resultados reproduzíveis. Documentar a ordem de consumo do RNG (humano vs IA) para não quebrar snapshots existentes — a fixture do jogador deve consumir o RNG na **mesma ordem relativa** de hoje para não regredir testes de partida humana. (Open Question 1.)
- **Budget negativo da IA:** este epic faz a IA **gastar** (salários) — orçamentos podem ficar negativos. Floor/consequência de falência é de `economy-depth`; aqui apenas persistimos o valor real (sem `Math.max(0,...)` artificial), deixando o gancho para o sibling.
- **Performance:** ~20 clubes/divisão × N divisões. Carga em lote = O(divisões) queries, não O(clubes). Se o tempo de tick exceder orçamento, `persistMatchStats` da IA pode ser reduzido a um upsert agregado (Open Question 2).
- **Regeneração com `seasonAvgRating` nulo** (jogador da IA sem `player_stats` porque não persistimos eventos completos): `regenerateAiSquadSeason` trata `null` como "minutos insuficientes" e congela potencial (igual a `recalculatePotential` com `qualifyingSeasons` vazio — `potential.ts:24`). Por isso a IA **deve** ter `persistMatchStats` (ratings/minutos), mesmo sem eventos detalhados.

---

## 8. Estratégia de testes (SQLite real, `better-sqlite3`, nunca mock)

Engine puro (`engine/`) é testado isoladamente; integração roda contra DB real em memória com seed.

**Unit (puro):**
- `squad-selection.test.ts` — `pickStartingEleven` devolve 11 para formação válida; respeita injury/fitness; fallback posicional.
- `weekly-finance.test.ts` — `computeWeeklyClubFinance`: clube com jogo em casa tem entrada `ticket`; visitante não; `newBudget = budget + income - expenses`; usa `actualAttendance` quando dado.
- `squad-regeneration.test.ts` — jovem com rating alto sobe `effective_potential`; veterano declina; `currentOverall` é a média real (não 70); `market_value` recomputado bate com `calculateMarketValue`; `seasonAvgRating=null` congela potencial.
- `match-runner.test.ts` — `simulateWeekFixtures` devolve um resultado por fixture; determinístico com mesmo seed; tolera squad vazio (0-0, sem throw).

**Integração (DB real):**
- `ai-real-sim.integration.test.ts` — seed 2 clubes da IA com elencos de força diferente; rodar uma semana; asserir que o clube mais forte vence **com frequência** ao longo de N seeds (não coin-flip de reputação) e que `player_stats` da IA foram persistidos (ratings/minutos).
- `ai-finance.integration.test.ts` — após uma semana, budget de **todos** os clubes mudou (não só o humano); clube sem jogo em casa não tem entrada `ticket`; `club_finances` tem linhas para clubes da IA. Edge: clube com folha alta + sem receita fica com budget menor.
- `ai-regeneration.integration.test.ts` — rodar 3 temporadas; asserir que o tamanho médio do elenco da IA **não** colapsa (base repõe aposentadorias) e que `market_value` de um jovem da IA que se desenvolveu subiu vs seed.
- `ai-to-ai-offers.integration.test.ts` — fora/dentro de janela: ofertas IA→IA só em janela; um jogador da IA muda de clube via `processPendingOffers` (não via o antigo `processAiTransfers`); `overall` real usado (jogador forte atrai mais).
- **Regressão:** suíte de `match-engine`/partida humana continua verde; `__tests__/engine/week-advance.test.ts` é **removido junto com o módulo** (consolidado em `weekly-finance.test.ts`) — confirmar que nenhum outro teste importa `advanceWeek`.

**Edges-chave:** clube com 0 jogadores aptos; semana com fixtures de 3 competições para o mesmo clube; orçamento da IA indo negativo (persistido, sem crash); determinismo cross-run.

---

## 9. Dependências & sequenciamento

**Devem aterrissar ANTES (hard):**
- **`save-isolation`** — `save_id` em todas as tabelas de mundo. Sem isso, simular a liga inteira de um save corrompe os outros. Toda query deste epic é escopada por `save_id`.
- **`db-hardening`** — índices em `players(club_id)` e `fixtures(season, week)` + composições por `save_id`; FK on em testes. A carga em lote semanal depende dos índices para performance.

**Coordenam (interface, podem aterrissar em paralelo/depois):**
- **`competitions-real`** — gera rodadas ≥2 de copa e mata-mata da CL. Este epic simula **as fixtures que existirem**; quando `competitions-real` cria mais fixtures, elas entram automaticamente no `simulateWeekFixtures`. Sem dependência de código, só de dados.
- **`match-consequences`** — consome os `MatchResult` da IA (cards→suspensão, injury→`injury_weeks_left` multi-clube). Este epic **produz** esses resultados e persiste `persistMatchStats`; a transformação em estado persistente de disciplina/lesão é do sibling. Decidir em conjunto se a IA persiste `match_events` completos (necessário se o sibling ler da tabela em vez do `MatchResult` em memória) — Open Question 3.
- **`economy-depth`** — floor de budget negativo, falência, embargo. Este epic faz a IA gastar de verdade (gera os negativos); a consequência é do sibling.
- **`progression-wired`** — minutos/rating reais e `training_focus` para o **humano**; `getStaffEffects` vivo. Este epic desenha o ponto de regeneração da IA para aceitar um `youthCoachBonus`/`trainingBonus` real quando `progression-wired` os fornecer (hoje a IA usa default).

**Sem dependência:** i18n (este epic não adiciona strings de UI — é pura lógica de loop/engine).

---

## 10. Fora de escopo (deferido)

- **Geração de rodadas de copa/CL** → `competitions-real`.
- **Suspensões e recovery de lesão multi-clube** → `match-consequences` (este epic só produz os `MatchResult`/stats).
- **Floor/falência/embargo de budget negativo** → `economy-depth`.
- **`training_focus` do humano, minutos/rating reais, `getStaffEffects` vivo** → `progression-wired`. A regeneração da IA aqui usa defaults (`balanced`, bônus de base default).
- **Reavaliação de `market_value` do clube humano em mid-season e o achado completo de mercado humano** → coordenado com `economy-depth`/`progression-wired`; este epic cobre a IA na virada.
- **Promoção/rebaixamento físico de clubes** (`UPDATE clubs SET league_id`) → epic de competição/temporada separado; não é pré-requisito da simulação.
- **`save_id` migração** → `save-isolation`/`db-hardening`. Este epic apenas **consome** o escopo.
- **Tabela da liga / standings ao vivo por posição real** alimentando `leaguePosition` nas finanças (hoje `1` fixo) — refinamento futuro; manter `1` como os dois caminhos (humano e IA) já fazem.

---

## Open Questions

1. **Ordem de consumo do RNG:** simular a fixture do jogador na mesma posição relativa de hoje vs simular em ordem de `id` junto com as demais. A segunda é mais limpa mas pode alterar snapshots de partidas humanas existentes. Decidir na implementação se isolamos o RNG do jogador num sub-seed dedicado para preservar regressões.
2. **Granularidade de `persistMatchStats` para a IA:** completo (por jogador, como o humano) vs upsert agregado, dependendo do custo medido do tick. A regeneração precisa de `avg_rating`/`minutes` — qualquer das duas serve, mas afeta perf.
3. **`match-consequences` lê `MatchResult` em memória ou `match_events` da tabela?** Se for da tabela, a IA precisa persistir eventos completos (mais I/O) e o corte de I/O da §4.2 some. Alinhar a interface com o sibling.
4. **Ponto de execução da regeneração de fim de temporada:** dentro de `advanceGameWeek` no `isSeasonEnd` (puramente no engine/loop) vs em `EndOfSeasonScreen.handleContinue` (onde o aging/recalc humano já vive). Preferência: mover a regeneração multi-clube para o loop e deixar a tela só com UI, mas isso depende de `save-isolation` ter movido a lógica de virada para fora da tela.

---

## Spec self-review

- ✅ Sem TBDs/placeholders. Toda função/arquivo citado foi verificado: `simulateAiMatch` (`game-loop.ts:187-208`), `advanceWeek` (`week-advance.ts:48`), `calculateWeeklyProgression` hardcoded (`game-loop.ts:483-491`), `generateAiOffersForPlayerClub` (`ai-offer-generator.ts:38`), `processAiTransfers` overall:70 (`game-loop.ts:272`), `calculateMarketValue` (`market-value.ts:8`), `recalculatePotential` (`potential.ts:17`), `generateYouthPlayers` (`youth-academy.ts:96`), `computeWeeklyClubFinance` reusa `calculateWeeklyIncome/Expenses` (`finance-engine.ts:41,62`), seleção de XI (`game-loop.ts:146-183`), `simulateMatch` tolera squad pequeno (`match-engine.ts:418,224`).
- ✅ Consistência: módulos novos são puros (`engine/`); persistência/queries ficam em `game-loop.ts`; `week-advance.ts` é deletado e consolidado, não revivido (resolve o achado #5).
- ✅ Dependências honestas: `save-isolation`+`db-hardening` são hard-before; `competitions-real`/`match-consequences`/`economy-depth`/`progression-wired` coordenam por interface, com o que é deste epic vs sibling explícito em cada um.
- ✅ Ambiguidades reais movidas para Open Questions (ordem de RNG, granularidade de stats, fonte de eventos para consequências, ponto de execução da regeneração) em vez de decididas sem base.
