# Design (Épico): Saúde do engine & arquitetura

**Epic:** l3-engine-health · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9

**Goal:** Decompor os orquestradores monolíticos do engine em fases puras e testáveis por fase, e blindar a query-layer contra schema drift com validação de runtime, sem alterar comportamento observável nem determinismo.

---

## 1. Visão & valor

Este épico não entrega "fantasia de jogador" diretamente — é um **habilitador transversal**. Quase todo épico de profundidade de carreira (contratos, conselho, dinâmica de elenco, lesões com profundidade, scouting avançado) precisa **tocar** `game-loop.ts`. Hoje `advanceGameWeek` é uma função de ~550 linhas de corpo (`src/engine/game-loop.ts:285-833`) que entrelaça simulação, persistência de stats, progressão, fitness, lesões, suspensões, moral, convocações, scouting, mercado de transferências, finanças, aposentadoria e rollover de temporada numa única sequência imperativa com estado mutável compartilhado.

O custo disso é concreto e já se manifesta:

- **Risco de regressão a cada épico:** mexer numa fase (ex.: adicionar uma nova consequência de partida) exige reler 550 linhas para entender invariantes de ordem (a ordem decrementa-antes-de-aplicar de lesões em `:437-444` e suspensões em `:448-468` é load-bearing e está documentada só em comentário).
- **Testabilidade grossa:** não há um único teste que exercite `advanceGameWeek` isoladamente por fase. A cobertura existe via integração/e2e (`__tests__/engine/game-loop-news-scouting.test.ts`, `__tests__/e2e/full-season.e2e.test.ts`), que roda a semana inteira — bom para golden path, péssimo para iterar numa fase só.
- **Schema drift silencioso:** 21 dos 23 arquivos em `src/database/queries/` fazem `... as Array<{...}>` / `... as {...}` sobre o retorno do driver SQLite **sem validar**. Se uma coluna some, muda de tipo ou um `ALTER TABLE` esquece um save antigo, o cast mente e o erro só aparece páginas adiante (NaN em finanças, `undefined` em moral) — difícil de rastrear até a origem.

O valor é **velocidade e segurança de TODOS os épicos seguintes**: fases nomeadas e testáveis viram pontos de extensão claros; validação de runtime transforma drift em erro imediato e localizado.

**Fantasia indireta servida:** estabilidade. Um save de 10 temporadas não corrompe; um épico novo não quebra o anterior.

---

## 2. Estado atual na base (fundação aterrada em código)

A premissa do brief precisa de correção factual em dois dos três alvos — verifiquei no código:

### 2.1 `game-loop.ts` — É o monólito real (confirma o brief)

`src/engine/game-loop.ts` tem 833 linhas. `advanceGameWeek` (`:285-833`) executa, em ordem, blocos numerados em comentários:

1. **Fixtures + load** (`:289-290`): `getFixturesByWeek` + `loadWeekClubData`.
2. **Simulação** (`:302-310`): `simulateWeekFixtures` com suporte a `userMatchResultOverride` (halftime resume).
3. **Persistência de resultados + stats** (`:316-333`): `updateFixtureResult`, `persistMatchStats`, `addMatchEvent`.
4. **Consequências do clube humano** (`:337-499`): progressão (lê/escreve `*_progress` em `player_attributes`, `:393-417`), fitness (`:421-432`), lesões decrementa-antes-aplica (`:437-444`), suspensões (`:448-468`), moral pós-jogo (`:471-491`), arma press conference (`:496-498`).
5. **Convocações internacionais** (`:506-532`).
6. **Scouting** (`:538-562`).
7. **Knockout progression** (`:565`).
8. **Mercado** (`:569-579`): `generateAiToAiOffers`, `generateAiOffersForSquad`, `processPendingOffers`, `expireStaleOffers`, `prunExpiredBlocks`.
9. **Finanças semanais** (`:586-700`): bulk-load de clubs/wages/staff/competitions, `computeWeeklyClubFinance` por clube, INSERT/UPDATE batched, debt-weeks.
10. **Comentário de assistente** (`:703-719`).
11. **Drift de moral idle + streak de aposentadoria** (`:723-774`).
12. **Avanço de semana / fim de temporada** (`:777-820`): aposentadorias, `archiveSeason`, `distributePrizeMoney`, `updateSaveWeek`.

Tudo numa função, com `db` mutado em cada passo e variáveis vivas atravessando blocos (`updatedBudget`, `playerMatchResult`, `internationalCallUps`, `resultByFixture`). **Não há teste que chame `advanceGameWeek` validando uma fase isolada** — só integração/e2e de semana cheia.

Observação de determinismo já presente: `commentRng = new SeededRng(saveId * season * (week + 1))` (`:706`) cria um RNG derivado dentro do loop — correto, mas é o tipo de detalhe que a decomposição precisa preservar byte-a-byte.

### 2.2 `match-engine.ts` — JÁ está decomposto (corrige o brief)

`src/engine/simulation/match-engine.ts` (826 linhas) **não é um monólito de uma função**. Já está fatiado:

- `simulateFirstHalf(input)` → roda blocks 0..14 e retorna `HalftimeState` com o RNG vivo (`:363-390`).
- `resumeSecondHalf(state, overrides?)` → roda blocks 15..29, computa stats/ratings/attendance, retorna `MatchResult` (`:434-510`).
- `simulateMatch(input) = resumeSecondHalf(simulateFirstHalf(input))` (`:517-519`).
- `runBlock(...)` → toda a lógica de um bloco para um time (`:523-826`).

A invariante crítica ("compor as metades = simulação inteira, mesmo RNG") **já tem teste**: `__tests__/engine/simulation/halftime-resume.test.ts`. O ganho restante aqui é **fino**: `runBlock` ainda é grande (~300 linhas) e mistura ataque/escanteio/pênalti/cartões/lesão/substituição num só corpo. Decompor `runBlock` em sub-resolvedores (`resolveOpenPlay`, `resolveCorner`, `resolvePenalty`, `resolveCards`, `resolveInjury`, `resolveSubstitution`) é desejável mas **baixa prioridade** — a função já é determinística e bem testada (`__tests__/engine/simulation/match-engine.test.ts`).

### 2.3 `news-generator.ts` — JÁ está decomposto (corrige o brief)

`src/engine/news/news-generator.ts` (784 linhas) **já é um conjunto de funções puras por história**, não um monólito: `generateHeadlines` (`:67`), `generateHighScoringMatches` (`:163`), `generateComeback` (`:206`), `generateLeagueStories` (`:285`), `generateRelevantTransfers` (`:395`), `generateMatchStar` (`:434`), `generateStreaks` (`:503`), `generateSeasonRecap` (`:623`), `generateRetirementNews` (`:754`), `sortNews` (`:782`). Cada uma recebe input tipado e retorna `NewsItem[]` — zero dependência de React/DB. A **orquestração** vive em `src/screens/news/NewsScreen.tsx:23-32` (a tela importa e combina). O tamanho é só pela quantidade de histórias, não por acoplamento. **Refatoração mínima ou nenhuma necessária** — no máximo extrair a orquestração de `NewsScreen.tsx` para um agregador puro em `engine/news/` se um épico futuro precisar gerar notícias fora da tela.

### 2.4 Query-layer — o problema de cast é real e generalizado

`src/database/queries/players.ts:1-9` define `DbHandle` (a interface usada por TODO o engine: `prepare().all/get/run` async, retornando `unknown[]`/`unknown`). O padrão em todo arquivo é castar o `unknown` direto:

- `season-archiver.ts:31-40` — `... as CompetitionRow[]`, `:42-46` `as LeagueRow | undefined`, `:54-60` `as FixtureRow[]`.
- `offer-processor.ts:159-172`, `:227-241`, `:262-268`, `:342-356` — casts inline grandes sobre `transfer_offers`/`players`.
- `players.ts:62-90` — `rowToPlayer` mapeia `PlayerRow` campo a campo com fallbacks defensivos (`?? 0`, `?? 3`, `=== 1`) que **já são uma forma manual e parcial de validação** — indício de que o time sente a dor do drift.

Confirmado: **21 de 23** arquivos em `src/database/queries/` usam `as Array<` ou `as {`. Nenhuma validação de runtime. Sem Zod no `package.json` (ainda não é dependência).

### 2.5 Infra de determinismo e save-isolation (fundação a preservar)

- `SeededRng` (`src/engine/rng.ts`): `next/nextInt/nextFloat/pick/shuffle/weightedPick`. Toda fase decomposta deve receber o **mesmo** `rng` e consumi-lo na **mesma ordem**.
- `SAVE_ID_STRIDE = 100_000_000` (`src/database/constants.ts:7`) + `idBase(saveId)` (`:10`): cada save tem espaço de IDs disjunto. Toda query recebe `(db, saveId, ...)`.
- Padrão de orquestrador que toca DB: `rolloverSeason` (`src/engine/season-rollover.ts:36`) é o exemplo canônico — params tipados, retorno tipado, async, recebe `db`+`saveId`.

---

## 3. Decomposição em sub-épicos

1. **EH-1 — Extrair fases de `advanceGameWeek`.** Quebrar o corpo em funções `async` nomeadas por fase (`simulateAndPersistWeek`, `applyHumanMatchConsequences`, `runInternationalDuty`, `advanceScoutingPhase`, `runTransferMarket`, `processWeeklyFinances`, `runRetirementPhase`, `advanceCalendar`), cada uma recebendo um `WeekContext` explícito (db, saveId, season, week, rng, clubData, resultByFixture...) e retornando deltas tipados. `advanceGameWeek` vira o sequenciador fino que encadeia as fases.

2. **EH-2 — Suite de testes por fase.** Para cada fase extraída em EH-1, um teste de integração com `better-sqlite3` real que monta o mínimo de DB e valida a fase isolada (entrada → efeito no DB). Pré-condição para EH-1 ser seguro (caracterização antes de refatorar).

3. **EH-3 — Validação de runtime na query-layer (Zod).** Introduzir `zod`, criar um helper `parseRows(schema, rows)` / `parseRow(schema, row)` e migrar os 21 arquivos de cast para schemas Zod por linha. Falha de validação vira erro localizado com nome da query.

4. **EH-4 — Schemas Zod ↔ `schema.ts` em sincronia.** Garantir que cada schema Zod de linha corresponde a uma tabela em `src/database/schema.ts` (e ao mirror em `database-store.ts`). Teste que detecta divergência coluna↔schema.

5. **EH-5 (opcional, fino) — Sub-resolvedores de `runBlock`.** Fatiar `runBlock` (`match-engine.ts:523`) em resolvedores por tipo de evento, preservando ordem de consumo do RNG. Guardado pelo `halftime-resume.test.ts` + um snapshot de eventos por seed.

6. **EH-6 (opcional) — Agregador de notícias puro.** Extrair a orquestração de `NewsScreen.tsx:23-32` para `engine/news/aggregate-news.ts` puro, se algum épico precisar gerar notícias server-side/persistidas. Só sob demanda.

---

## 4. Opções de arquitetura

### 4.1 Decomposição de `advanceGameWeek`

**Opção A — Fases como funções livres recebendo `WeekContext` (recomendada).**
Um objeto `WeekContext` montado no topo de `advanceGameWeek` carrega o estado compartilhado (db, saveId, season, week, playerClubId, rng, fixtures, clubData, resultByFixture, playerMatchResult). Cada fase é `async function phase(ctx: WeekContext): Promise<PhaseDelta>`. O sequenciador agrega os deltas no `AdvanceWeekResult`.
*Trade-offs:* aterrissa no padrão já usado (`rolloverSeason` recebe params, retorna result); fácil de testar fase a fase; sem classes/estado oculto. Risco: o `WeekContext` pode virar um "god object" se não disciplinar o que entra.

**Opção B — Pipeline declarativo (`phases.reduce(...)`).**
Lista de fases iteradas por um runner genérico.
*Trade-offs:* elegante no papel, mas as fases têm dependências de ordem e de dados heterogêneos (finanças precisa de `resultByFixture`; aposentadoria precisa do estado pós-moral). Um pipeline genérico esconde essas dependências e dificulta o type-check. **Rejeitada** — over-engineering para 8 fases com ordem fixa.

**Opção C — Classe `WeekAdvancer` com métodos privados.**
*Trade-offs:* viola a convenção do projeto ("Componentes funcionais. Evitar classes" em `.claude/rules/typescript.md`; "engine puro" em `CLAUDE.md`). Estado em `this` reintroduz o acoplamento que queremos eliminar. **Rejeitada.**

**Recomendação: A.** Preserva determinismo (mesmo `rng` passado por referência no `ctx`, mesma ordem de chamadas), casa com o codebase e maximiza testabilidade.

### 4.2 Validação de runtime

**Opção A — Zod por linha, opt-in incremental (recomendada).**
Helper `parseRows(schema, rows, queryName)` que valida e, em falha, lança erro com `queryName` + `zodError`. Migração arquivo a arquivo (PR pequeno por arquivo, como manda o git rule).
*Trade-offs:* +1 dependência (~12kb), custo de runtime por linha. Em hot paths (finanças bulk-load de ~40 clubes/semana em `game-loop.ts:592-624`) validar cada linha pode pesar no web. Mitigação: schema com `.passthrough()` e validação só dos campos consumidos; ou flag para pular validação em hot paths já cobertos por teste.

**Opção B — Type guards manuais (sem dependência).**
*Trade-offs:* reinventa Zod com mais código e menos mensagens de erro. O `rowToPlayer` (`players.ts:62-90`) já mostra que guards manuais viram boilerplate frágil. **Rejeitada.**

**Opção C — `assert`-based em dev, no-op em prod.**
*Trade-offs:* drift em prod continua silencioso — exatamente o que queremos pegar (saves longos de jogador real). **Rejeitada** para a query-layer; aceitável só como complemento em hot paths.

**Recomendação: A**, com escape hatch para hot paths.

---

## 5. Pré-requisitos & dependências

- **Sem dependências de épicos de gameplay.** Este épico é fundação; idealmente roda **antes** de C1-C8 (carreira). Se a sequência não permitir, ver §8 (antecipação parcial).
- **Caracterização antes de refatorar (EH-2 antes de EH-1).** A cobertura atual de `advanceGameWeek` é só integração/e2e (`full-season.e2e.test.ts`, `week-advance.e2e.test.ts`). Antes de extrair fases, escrever testes que travem o comportamento por fase — TDD obrigatório em `engine/` (`CLAUDE.md`).
- **Nova dependência `zod`** (EH-3): `npm install zod` (local, não global). Validar bundle web no Expo após adicionar.
- **`schema.ts` + `database-store.ts` como fonte da verdade** (EH-4): qualquer schema Zod deve espelhar ambos.
- **Determinismo guardado por teste** (EH-1/EH-5): um teste "mesma seed → mesmo `AdvanceWeekResult` e mesmo estado de DB" antes e depois da refatoração. O `halftime-resume.test.ts` já cobre o match-engine.
- **i18n:** nenhuma string nova esperada (refatoração interna). Se EH-6 for adiante, paridade pt/en dos `titleKey`/`bodyKey` já existentes deve ser mantida.

---

## 6. Faseamento

**Fase 1 — Caracterização de `advanceGameWeek` (EH-2).**
*Entregável testável:* nova suite `__tests__/engine/game-loop-phases.test.ts` que, com DB `better-sqlite3` real, exercita o comportamento de cada bloco atual (resultados+stats persistidos, progressão acumulando `*_progress`, ordem decrementa-antes-aplica de lesões/suspensões, finanças, debt-weeks, fim de temporada). Roda verde contra o código atual sem mudá-lo. Critério: cobre as 12 fases do §2.1.

**Fase 2 — Extração de fases (EH-1).**
*Entregável testável:* `advanceGameWeek` reduzido a um sequenciador (<120 linhas) chamando funções de fase; toda a suite da Fase 1 + os e2e existentes (`full-season`, `week-advance`, `career-loop`) passam **sem alteração**. Critério extra: teste de determinismo "estado de DB idêntico para a mesma seed antes/depois".

**Fase 3 — Helper de validação + 1ª migração (EH-3 piloto).**
*Entregável testável:* `src/database/parse-rows.ts` com `parseRows`/`parseRow` + teste que valida (linha boa passa, linha com coluna faltando/tipo errado lança erro nomeado). Migrar **um** arquivo piloto (sugestão: `season-archiver.ts`, casts bem delimitados em `:31-60`) e provar que a suite de history (`__tests__/integration/...`, `feature-a-season-history`) segue verde.

**Fase 4 — Rollout da validação (EH-3 + EH-4).**
*Entregável testável:* os 21 arquivos migrados (PR pequeno por arquivo conforme git rule), com escape hatch documentado nos hot paths de finanças. Teste de sincronia schema↔Zod (EH-4) que falha se uma coluna de `schema.ts` não tiver correspondente no Zod e vice-versa.

**Fase 5 (opcional) — `runBlock` + agregador de notícias (EH-5/EH-6).**
*Entregável testável:* `runBlock` fatiado com `halftime-resume.test.ts` + snapshot de eventos por seed verdes; agregador de notícias puro com teste que reproduz o output de `NewsScreen`. Só se houver demanda de épico C.

---

## 7. Schema/infra changes (alto nível)

- **Nenhuma alteração de schema SQL.** Este épico é puramente arquitetural. `schema.ts` e `database-store.ts` permanecem a fonte da verdade; os schemas Zod **derivam** deles, não os alteram.
- **Nova infra de código:**
  - `src/database/parse-rows.ts` — helpers `parseRows(schema, rows, queryName)` / `parseRow(schema, row, queryName)`.
  - Schemas Zod por tabela/linha, colocados junto às queries que os consomem (ex.: `players.ts`, `season-archiver.ts`) ou num `src/database/row-schemas.ts` central — decisão de EH-3 (preferir co-localização para reduzir distância de manutenção).
  - `src/engine/game-loop/` pode virar um diretório com `week-context.ts` + um arquivo por fase, com `index.ts` reexportando `advanceGameWeek` (preserva o import path atual; verificar consumidores antes).
- **Nova dependência:** `zod` em `dependencies` do `package.json`.
- **Determinismo:** zero mudança na semântica do `SeededRng`; ordem de consumo preservada por contrato e por teste.

---

## 8. Riscos & decisões abertas

- **Risco #1 — Mudar determinismo na extração.** Reordenar uma chamada de RNG entre fases muda toda a sequência (saves divergem). *Mitigação:* teste de determinismo na Fase 2 (estado de DB + `AdvanceWeekResult` idênticos por seed). O `commentRng` derivado (`game-loop.ts:706`) e a exclusão da fixture do usuário do stream (`:302-310`) são pontos sensíveis a preservar literalmente.
- **Risco #2 — Custo de validação Zod em hot paths.** Finanças bulk-loadam ~40 clubes/semana (`:592-624`); validar cada linha em todas as fases pode degradar o web. *Mitigação:* validar só campos consumidos; escape hatch documentado; medir antes/depois numa semana cheia.
- **Risco #3 — `WeekContext` virar god object.** *Mitigação:* tipar `WeekContext` como readonly no que é entrada e devolver deltas explícitos por fase em vez de mutar o contexto.
- **Risco #4 — Refator sem rede.** `advanceGameWeek` não tem teste dedicado hoje. *Mitigação:* Fase 1 (caracterização) é gate de entrada da Fase 2.
- **Decisão aberta #1 — Antecipação parcial.** **Recomendação:** quando um épico C exigir tocar `advanceGameWeek` (provável: contratos/conselho/dinâmica de elenco), **antecipar apenas EH-1 da(s) fase(s) tocada(s)** + sua caracterização (EH-2 parcial), em vez do épico inteiro. Decompor só a fatia necessária mantém o épico C focado e amortiza a dívida onde ela já está sendo paga. Os sub-épicos de validação (EH-3/EH-4) podem rodar independentemente, em qualquer momento.
- **Decisão aberta #2 — Co-localizar schemas Zod vs. arquivo central.** Preferência por co-localização (junto da query), a confirmar em EH-3.
- **Decisão aberta #3 — `game-loop/` diretório vs. arquivo único.** Verificar todos os importadores de `@/engine/game-loop` antes de mover; manter `index.ts` reexportando para não quebrar paths.

---

## 9. Não-objetivos / fora de escopo

- **Mudança de comportamento/balanceamento.** Nada de retunar probabilidades, fórmulas de finanças ou progressão. Refator é byte-equivalente (guardado por teste de determinismo + baselines em `__tests__/e2e/balance-baselines.e2e.test.ts`).
- **Decomposição forçada de `news-generator.ts`.** Já é modular (§2.3); só EH-6 opcional sob demanda.
- **Reescrita do `match-engine.ts`.** Já decomposto e testado (§2.2); só EH-5 opcional e fino.
- **Migrar `DbHandle` para um ORM** ou trocar `expo-sqlite`/`better-sqlite3`. Fora de escopo — Zod valida o retorno do driver atual, não o substitui.
- **Validação na escrita (INSERT/UPDATE).** O foco é o **read path** (casts de `all`/`get`). Validar params de escrita é um possível épico futuro.
- **UI.** Nenhuma tela muda (exceto, se EH-6, a fonte de dados de `NewsScreen`, sem mudança visual). Sem necessidade do novo Design System kit (`2026-06-20-design-system-premium-design.md`) aqui — épico é backend-only. Specs de carreira (C*) é que devem referenciar o kit.

---

## 10. Spec self-review

- **Aterrado em código real?** Sim. `game-loop.ts:285-833` (monólito real), `match-engine.ts:363-519` (já decomposto — corrige o brief), `news-generator.ts:67-784` (já modular — corrige o brief), `offer-processor.ts` e `season-archiver.ts:31-60` (padrão de cast), `players.ts:1-9` (`DbHandle`), `constants.ts:7` (`SAVE_ID_STRIDE`), `rng.ts` (API do `SeededRng`), `halftime-resume.test.ts` (teste de composição existente). Contagem 21/23 arquivos de cast verificada por grep.
- **Correções factuais ao brief:** match-engine e news-generator **não** são monólitos de uma função; ambos já foram fatiados. O esforço real concentra-se em `game-loop.ts` (EH-1/EH-2) + validação de runtime (EH-3/EH-4). EH-5/EH-6 são opcionais e finos. Isso reduz o escopo previsto no brief e foi explicitado para evitar trabalho redundante.
- **Determinismo respeitado?** Sim — preservar `rng` e ordem de consumo é requisito explícito (Risco #1, Fase 2). Nenhum `Math.random`/`Date.now` introduzido.
- **Save-isolation?** Sim — fases continuam recebendo `(db, saveId, ...)`; `SAVE_ID_STRIDE` intocado.
- **Sem placeholders/TBD?** Sim. Decisões abertas são reais (co-localização de schema, diretório vs. arquivo, antecipação parcial), não lacunas.
- **Convenções (pt-BR, TS strict, engine puro, sem classes)?** Respeitadas; classe explicitamente rejeitada (Opção C em §4.1).
- **Risco residual:** custo de Zod em hot paths (Risco #2) precisa de medição empírica na Fase 4 — único ponto que pode forçar ajuste de estratégia (escape hatch já previsto).
