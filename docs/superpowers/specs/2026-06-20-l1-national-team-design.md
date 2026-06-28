# Design (Épico): Seleção nacional (P9 completo)

**Epic:** l1-national · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9
**Goal:** Transformar a fatia atual lado-clube (detecção de janela FIFA + fadiga de viagem) numa carreira de seleção nacional paralela e gerida — convocações, eliminatórias e torneio — sem comprometer o determinismo nem o save-isolation do engine.

---

## 1. Visão & valor

Hoje a seleção nacional só "rouba" jogadores do elenco do usuário durante as janelas FIFA (`INTERNATIONAL_BREAK_WEEKS = [7, 15, 23, 31]`, `src/engine/national/international-duty.ts:11`) e devolve com fadiga (`TRAVEL_FATIGUE_PENALTY = 8`, idem `:17`). O técnico nunca *gere* uma seleção. Isso é metade da fantasia.

A visão deste épico é a outra metade: o usuário, além de comandar o clube, **dirige uma seleção nacional** num calendário internacional que corre em paralelo ao calendário do clube. Ele convoca, monta XI por janela, disputa **eliminatórias** ao longo de várias temporadas e, periodicamente, um **torneio final** (formato grupos → mata-mata). Os resultados alimentam prestígio do técnico (`manager_reputation`, `save_games`, `src/database/schema.ts:315`) e geram histórico de carreira.

Fantasia servida: "comecei dirigindo um clube médio, ganhei reputação e fui convidado para treinar minha seleção; levei-a do fracasso nas eliminatórias até o título continental". É um eixo de progressão de longo prazo que reusa quase toda a infra de competição já existente, mas num contexto novo (jogadores espalhados por vários clubes, calendário concentrado em janelas).

---

## 2. Estado atual na base (fundação aterrada em código)

O que **já existe** e serve de alicerce:

- **Detecção de janela FIFA + convocação determinística.** `isInternationalBreak(week)` e `selectCallUps(squad)` (`src/engine/national/international-duty.ts:29,43`) — módulo puro, zero React/DB, zero RNG. `selectCallUps` já agrupa o melhor jogador por nacionalidade e desempata por `id` (`:48-55`), padrão que vamos generalizar.
- **Integração no game-loop.** `src/engine/game-loop.ts:506-532` aplica fadiga e emite news (`category: 'callup'`, `:526`). `AdvanceWeekResult.internationalCallUps` (`:195`) já carrega os ids convocados para a UI. Esse é o ponto de extensão para rodar o calendário internacional.
- **UI lado-clube.** `InternationalsScreen.tsx` (`src/screens/national/InternationalsScreen.tsx`) lista, por nacionalidade, os jogadores elegíveis do elenco e marca os convocados na janela atual. Hoje usa estilos inline crus (`StyleSheet.create` + `@/theme`, `:126`) — será migrada para o kit do Design System (ver §5).
- **Infra de competição reutilizável (chave do épico):**
  - Tabelas `competitions` (`type`, `format`, `season`, `league_id` opcional — `src/database/schema.ts:188-196`), `competition_entries` (`group_name`, `seed` — `:198-205`) e `fixtures` (`competition_id`, `round`, `home/away_club_id` — `:207-220`). Tudo já com `save_id`.
  - `src/engine/competition/`: `calendar.ts`, `fixture-generator.ts`, `knockout.ts` (`resolveKnockoutTie`, `buildNextKnockoutRound`, `isKnockoutComplete`, `seedClChampionsKnockout` — `:52,75,110,122`), `standings.ts`, `round-progression.ts`, `promotion.ts`.
  - Match engine puro reaproveitável (`src/engine/simulation/match-engine.ts`).
- **Modelo de dados de jogador com nacionalidade.** `players.nationality TEXT NOT NULL` (`src/database/schema.ts:82`) e `countries` (`id`, `name`, `code`, `continent` — `:40-45`). É a base para mapear jogador → seleção e seleção → continente (define em qual torneio entra).
- **Determinismo & isolamento.** `SeededRng` (`nextInt/nextFloat/pick/shuffle`, `src/engine/rng.ts:5,21,26,31,36`); `SAVE_ID_STRIDE = 100_000_000` (`src/database/constants.ts:7`). Toda query nova segue `(db, saveId, ...)`.
- **Reputação do técnico.** `save_games.manager_reputation` (`src/database/schema.ts:315`) já consumida por job market (`src/engine/board/job-offers-engine.ts:26`) e achievements (`src/engine/achievements/achievements-engine.ts:42`). É o "prestígio" onde a carreira de seleção deposita ganhos.

**Conclusão do estado atual:** ~70% da plumbing de competição existe; o que falta é (a) modelar "seleção" como um agregado de jogadores cross-club, (b) um calendário internacional paralelo dentro das janelas FIFA, e (c) o ciclo de gestão (convocar / escalar / disputar).

---

## 3. Decomposição em sub-épicos

Cada peça é independente o suficiente para virar um plano próprio:

1. **L1.1 — Modelo de seleções nacionais.** Tabela `national_teams` (uma por país jogável) + derivação do pool de jogadores por `players.nationality`. Cálculo de força da seleção a partir do top-N elegíveis. Define qual seleção o usuário dirige.
2. **L1.2 — Calendário internacional paralelo.** `competitions.type = 'national'` agendadas dentro de `INTERNATIONAL_BREAK_WEEKS`, sem colidir com `SEASON_END_WEEK = 58`. Fixtures internacionais correm na mesma `advanceGameWeek`, mas em pista separada da liga.
3. **L1.3 — Convocações geridas.** Generalizar `selectCallUps` para "elenco da seleção": pré-convocação automática (IA) + override manual do usuário (lista de 23). Persistir a convocação por janela.
4. **L1.4 — XI e simulação de partidas internacionais.** Reusar match engine para jogos da seleção do usuário (com escalação real) e abstrair (resultado-only) as demais seleções.
5. **L1.5 — Eliminatórias.** Competição de liga/grupos por continente que corre ao longo de 1+ temporadas, com classificação para o torneio.
6. **L1.6 — Torneio final.** Grupos → mata-mata reusando `knockout.ts`. Premiação, histórico, troféu.
7. **L1.7 — Prestígio do técnico + caps dos jogadores.** Ganhos/perdas de `manager_reputation` por resultado internacional; contador de caps/gols por jogador na seleção.
8. **L1.8 — UI de gestão de seleção.** Novas telas (Convocação, XI da seleção, Calendário/Tabela internacional, Histórico) usando o kit do Design System.
9. **L1.9 — Sinergia C8 (congestionamento).** A carga das janelas FIFA + jogos da seleção alimenta o sistema de congestionamento/fadiga (ver §5).

---

## 4. Opções de arquitetura

### Opção A — "Seleção como competição reaproveitada" (recomendada)
Modelar seleções como **clubes virtuais** num namespace de `competition` dedicado (`type = 'national'`), reusando `fixtures`, `competition_entries`, `standings.ts`, `knockout.ts` quase sem mudança. A seleção do usuário tem escalação real (jogadores são derivados do pool por nacionalidade na hora de simular); as demais seleções têm força agregada e resultam por modelo abstrato (ou pelo match engine com um "elenco sintético").

- **Prós:** máximo reuso de `src/engine/competition/*`; fixtures, tabelas e mata-mata já testados; UI de tabela/calendário reaproveita componentes. Determinismo herdado.
- **Contras:** "seleção como clube" exige uma tabela `national_teams` separada de `clubs` (FKs de `fixtures.home_club_id` apontam para `clubs`). Decisão: criar `national_teams` com ids no mesmo espaço lógico e fixtures internacionais referenciando `national_team_id` via **colunas novas** em `fixtures` (`home_national_id`/`away_national_id`, nullable) OU uma tabela `national_fixtures` espelho. Recomendação: **tabela espelho `national_fixtures`** para não poluir o caminho quente da liga.

### Opção B — "Engine de seleção totalmente separado"
Um subsistema `src/engine/national/*` autônomo, com suas próprias tabelas (`national_teams`, `national_fixtures`, `national_callups`, `national_results`) e sua própria mini-lib de grupos+mata-mata.

- **Prós:** isolamento total; zero risco de regressão na liga; modelagem sob medida (caps, força agregada).
- **Contras:** duplica lógica de standings/knockout; mais código para testar; diverge do padrão do projeto (DRY na competição).

### Opção C — "Abstração total (sem gestão real)"
Manter tudo abstrato: o usuário vê resultados/convocações mas não escala nem comanda partidas; só ganha prestígio.

- **Prós:** baratíssimo; entrega valor narrativo rápido.
- **Contras:** não cumpre a visão ("gestão de seleção"). Vira só conteúdo de relatório. Rejeitada como destino final, mas serve como **Fase 1** (degrau).

### Recomendação
**A**, com tabela espelho `national_fixtures` e knockout/standings reaproveitados via adaptadores finos. Chega-se a A passando por C como Fase 1 (abstrato → gerido), de modo que cada fase é jogável. B só se a poluição de `competition` se mostrar inviável nos testes da Fase 2.

---

## 5. Pré-requisitos & dependências

- **Design System (`2026-06-20-design-system-premium-design.md`).** Todas as telas novas e a migração de `InternationalsScreen` usam o novo kit (Card / Button / StatBar / Text semânticos / Icon / EmptyState / Toast / useConfirm). `Alert.alert` é no-op no RN Web — confirmações de convocação devem usar `useConfirm`, nunca `Alert`.
- **C7 (in-match management) e a infra de match engine** estabilizados — os jogos da seleção do usuário reusam o mesmo pipeline de simulação.
- **C8 (congestionamento) — sinergia central.** A carga internacional (viagem + minutos na seleção) deve alimentar o sistema de fadiga/rodízio do C8. Hoje o único efeito é `applyTravelFatigue` (`international-duty.ts:62`); com L1 os convocados também *jogam*, então o custo de fitness passa a depender de minutos. L1 e C8 dividem a fonte de verdade de fadiga acumulada — definir a interface antes de implementar L1.4.
- **i18n pt/en com paridade** (`src/i18n/pt.ts` + `en.ts`): novas chaves `national.*` em ambos.
- **Determinismo:** sorteio de grupos, seeding de mata-mata e resultados abstratos de seleções rivais **todos** via `SeededRng` derivado da seed do save. Zero `Math.random`/`Date.now`/`ORDER BY RANDOM`.

---

## 6. Faseamento

**Fase 1 — Seleções como dados + calendário abstrato (degrau, Opção C).**
Tabela `national_teams` (uma por `countries` jogável) e derivação determinística do pool por `players.nationality`. Calendário internacional abstrato: nas janelas FIFA o engine gera resultados de jogos da seleção do usuário (resultado-only, sem escalação) e atualiza uma tabela internacional.
*Entregável testável:* teste de integração (better-sqlite3) onde, avançando 2 temporadas com seed fixa, a tabela das eliminatórias é idêntica em duas execuções e a seleção do usuário tem N jogos registrados.

**Fase 2 — Competição internacional real (Opção A).**
`national_fixtures` + adaptadores para `standings.ts`/`knockout.ts`. Eliminatórias em formato de grupo/liga continental e classificação. Sorteio determinístico via `SeededRng`.
*Entregável:* teste que valida classificação correta para o torneio dado um conjunto de resultados; mata-mata gerado por `buildNextKnockoutRound`.

**Fase 3 — Convocação e XI geridos.**
Generalizar `selectCallUps` → pré-convocação IA + override do usuário (lista persistida por janela). Tela de Convocação e XI da seleção. Os jogos da seleção do usuário passam a usar escalação real no match engine (substitui o resultado-only da Fase 1 para a seleção dirigida).
*Entregável:* teste cobrindo override manual respeitado na simulação + golden path (convocação automática estável por seed).

**Fase 4 — Torneio final + premiação.**
Grupos → mata-mata completo, troféu, registro em histórico de carreira, news.
*Entregável:* teste de torneio completo determinístico (mesma seed = mesmo campeão).

**Fase 5 — Prestígio, caps e sinergia C8.**
Ganhos de `manager_reputation` por resultado; caps/gols por jogador; carga internacional integrada ao congestionamento.
*Entregável:* teste de que vencer o torneio aumenta `manager_reputation` deterministicamente e que minutos na seleção elevam a fadiga acumulada consumida por C8.

**Fase 6 — Polimento de UI + i18n.**
Migração de `InternationalsScreen` ao kit, telas novas finalizadas, paridade pt/en, validação no browser (Playwright MCP).

---

## 7. Schema/infra changes (alto nível)

Todas as colunas/tabelas novas vão em `src/database/schema.ts` **e** `src/database/database-store.ts`; todas as queries recebem `(db, saveId, ...)` e respeitam `SAVE_ID_STRIDE`.

- **`national_teams`** — `id`, `save_id`, `country_id` (FK `countries`), `name`, `continent`, `reputation`/`strength` (derivado), `is_user_managed INTEGER DEFAULT 0`.
- **`national_competitions`** — ou reuso de `competitions` com `type='national'` + `format` (`'qualifier' | 'tournament'`). Recomendação Fase 2: reusar `competitions` para metadados e usar tabela espelho para fixtures.
- **`national_fixtures`** — espelho de `fixtures`, mas com `home_national_id`/`away_national_id` (FK `national_teams`), `competition_id`, `season`, `week`, `round`, gols, `played`. Mantém o caminho quente da liga intocado.
- **`national_callups`** — `save_id`, `national_team_id`, `season`, `window` (índice da janela FIFA), `player_id`, `is_starter`, `source` (`'auto' | 'manual'`). Persiste a convocação gerida.
- **`national_caps`** — `save_id`, `player_id`, `caps`, `goals` (acumulado de carreira na seleção).
- **`save_games`** — sem coluna nova obrigatória; `manager_reputation` (`:315`) já existe e recebe deltas internacionais.
- **Constantes (`src/engine/balance.ts`)** — limites de janela, tamanho de convocação (23), N do pool para força, deltas de reputação por resultado, custo de fadiga por minuto internacional (compartilhado com C8).

Nenhuma migração destrutiva: todas as tabelas são `CREATE TABLE IF NOT EXISTS` novas; nenhuma coluna existente muda de tipo.

---

## 8. Riscos & decisões abertas

- **`fixtures` vs `national_fixtures`.** A FK `fixtures.home_club_id → clubs` impede usar seleções no mesmo lugar. Decisão recomendada: tabela espelho. Aberto: confirmar nos testes da Fase 2 que adaptar `standings.ts`/`knockout.ts` para `national_fixtures` não exige reescrita (eles operam sobre estruturas, não diretamente sobre a tabela `fixtures`?). **Verificar antes de L1.5.**
- **Colisão de calendário.** Janelas FIFA atuais (`[7,15,23,31]`) podem não comportar grupos+mata-mata de torneio numa só temporada. Decisão: eliminatórias correm ao longo de várias temporadas; torneio final concentrado num bloco (possivelmente estendendo janelas só no ano de torneio). Aberto: definir o mapa exato de semanas sem colidir com `SEASON_END_WEEK = 58`.
- **Força das seleções rivais.** Resultado abstrato precisa ser cribível e determinístico. Aberto: usar match engine com elenco sintético (mais caro, mais coerente) vs modelo probabilístico por força agregada (mais barato). Recomendação inicial: modelo agregado via `SeededRng`, com match engine reservado à seleção do usuário.
- **Performance no expo-sqlite web.** Cada `await` é round-trip de worker. Derivar pools de várias seleções por nacionalidade em toda janela pode ser caro. Mitigar com queries em batch (padrão de `loadSquadWithAttributes`, `game-loop.ts:203-218`).
- **Quem dirige a seleção e quando.** Convite de seleção atrelado a `manager_reputation`? Decisão de design narrativo aberta — provável gatilho via inbox/job-offers (reusar `job-offers-engine`).
- **Dupla fadiga com C8.** Risco de punir o usuário duas vezes (viagem + minutos). A interface de fadiga compartilhada deve ser definida com C8 para evitar stacking acidental.

---

## 9. Não-objetivos / fora de escopo

- **Mercado de transferências internacional / naturalização** de jogadores — fora.
- **Categorias de base da seleção** (Sub-20, Sub-23, Olímpica) — fora; só seleção principal.
- **Editor de seleções / customização de bandeiras** — fora.
- **Simulação tática profunda das seleções rivais** — fora (resultado abstrato basta).
- **Múltiplas seleções simultâneas dirigidas pelo usuário** — fora; uma por vez.
- **Reescrita do match engine** — fora; L1 só o consome.
- **Amistosos internacionais geridos** (além dos já cobertos por `friendlies`, `schema.ts:337`) — fora desta primeira passada.

---

## 10. Spec self-review

- **Aterrado em código?** Sim — `international-duty.ts:11,17,29,43,62`, `game-loop.ts:195,203-218,506-532`, `schema.ts:40-45,82,188-220,315`, `constants.ts:7`, `rng.ts:5-36`, `knockout.ts:52-122`, `InternationalsScreen.tsx`. Nenhuma função/coluna inventada.
- **Determinismo coberto?** Sim — sorteios/seeding/resultados via `SeededRng`; §8 lista os pontos de risco. Zero `Math.random`/`Date.now`/`ORDER BY RANDOM`.
- **Save-isolation?** Sim — toda tabela nova com `save_id`, queries `(db, saveId, ...)`, `SAVE_ID_STRIDE` respeitado; schema + database-store espelhados.
- **Engine puro?** Sim — lógica de convocação/standings/knockout em `src/engine`, sem React/Expo; orquestração em `game-loop`-style.
- **Reuso > reescrita?** Sim — Opção A maximiza reaproveitamento de `src/engine/competition/*`.
- **Design System / i18n / kit?** Sim — telas novas e migração de `InternationalsScreen` usam o kit do `2026-06-20-design-system-premium-design.md`; `useConfirm` no lugar de `Alert` (no-op no web); paridade pt/en.
- **Sinergia C8 explícita?** Sim — §3 (L1.9), §5 e §8.
- **Faseável e testável?** Sim — 6 fases, cada uma com entregável de integração better-sqlite3 e degrau jogável (Fase 1 = Opção C).
- **Sem placeholders/TBD?** Confirmado.
