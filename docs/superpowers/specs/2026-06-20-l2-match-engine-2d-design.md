# Design (Épico): Motor de partida profundo + visual 2D

**Epic:** l2-match-2d · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9

**Goal:** Tornar visível a riqueza da simulação — eventos granulares (passes, desarmes, território) e uma visualização 2D opt-in (campo, replay de momentos, mapas de calor/passe/chute) — sem alterar o resultado numérico determinístico que casuais já consomem em modo resumo.

---

## 1. Visão & valor

Hoje a partida é simulada com profundidade real — `runBlock` em `src/engine/simulation/match-engine.ts:523` resolve ataque por xG, conversão por overall atacante vs. zaga (`defenderAvgOverall`, linha 153), defesa do goleiro (linha 582), escanteios de cabeça (linha 624), pênaltis, cartões com follow-up de falta/pênalti, lesões, substituições inteligentes e momentum (linha 537). Mas **nada disso é visível**: o jogador só vê um placar, barras de posse/chutes/faltas/escanteios e uma lista textual de gols (`MatchResultScreen.tsx:164-219`). A fantasia de "técnico que lê o jogo" morre na superfície.

A visão é cirúrgica: **surface da riqueza que já existe**. Para o hardcore/streamer, dar um campo 2D que reproduz os momentos-chave (gol, defesa, pênalti, cartão) com bolinhas se movendo, mais mapas agregados (calor de posse, rede de passes, mapa de chutes com xG). Para o casual, **nada muda**: o resumo textual continua sendo o default. O 2D é **opt-in** (toggle "Assistir em 2D" / preferência salva).

Diferencial competitivo: nenhum manager mobile leve entrega replay 2D determinístico. Como tudo é seedado (`SeededRng`, `src/engine/rng.ts`), um replay é 100% reproduzível — base para clipes compartilháveis ("mesma seed, mesmo gol") e para depuração de balanceamento.

Valor secundário: a **camada de eventos granulares** alimenta relatórios técnicos mais ricos (já existe `src/engine/reports/technical-report.ts`) e a narração do assistente (`src/engine/assistant/comment-generator.ts`).

---

## 2. Estado atual na base (fundação que serve)

- **Engine puro e determinístico.** `simulateMatch` (match-engine.ts:517) = `simulateFirstHalf` + `resumeSecondHalf`. Loop de 30 blocos × 3 min, `HALF_BLOCK=15` (linha 62-63). Zero `Math.random`/`Date.now` — tudo via `rng: SeededRng` no `MatchInput` (linha 32). **Esta é a fundação não-negociável**: o 2D e os eventos granulares precisam ser derivados sem perturbar a ordem de consumo do RNG.
- **Eventos já tipados e persistidos.** `MatchEvent` (`src/types/match.ts:17`) = `{fixtureId, minute, type, playerId, secondaryPlayerId}`. 14 tipos em `MatchEventType` (match.ts:1): goal, assist, yellow, red, substitution, injury, penalty_scored/missed, free_kick_scored/missed, shot_on_target, shot_off_target, save, penalty_shootout. Persistidos em `match_events` (`schema.ts:222-229`) **somente para a partida do usuário** (game-loop.ts:321-332 via `addMatchEvent`, `src/database/queries/fixtures.ts:117`). Leitura: `getMatchEvents` (fixtures.ts:123) ordena por `minute ASC`.
- **Stats agregados.** `MatchStats` (match-engine.ts:35) já carrega posse, chutes, chutes no alvo, faltas, escanteios e **xG por lado** (homeXG/awayXG, linha 46) — acumulado em `team.xG` (linha 570). O xG por chance individual (`xgChance`, linha 569) **existe em memória mas é descartado** — só o somatório sobrevive.
- **Ratings por jogador.** `calculatePlayerRatings` (`src/engine/simulation/player-rating.ts`) → `homeRatings/awayRatings` no `MatchResult` (match-engine.ts:54).
- **SVG já em uso.** `RadarChart.tsx` é o exemplo canônico de `react-native-svg` no projeto: `Svg/Polygon/Circle/Line/Text`, projeção polar com `toXY` (linha 30), labels e legenda. Mapas 2D reaproveitam esse vocabulário.
- **Halftime resumível.** `HalftimeState` (match-engine.ts:341) já snapshota `home/away/events/usedMinutes/rng` — prova de que o estado mid-match é capturável. `src/engine/match-day/halftime.ts` orquestra o "assistir o 1º tempo" com seed isolada (`halftimeSeed`, linha 18) e `orientResultToFixture` (linha 106) para reorientar home/away.
- **Save isolation.** `match_events` **não tem `save_id`** — o isolamento é transitivo: `fixture_id`→`fixtures(save_id)` e `player_id` já é stridado (`SAVE_ID_STRIDE=100_000_000`, `src/database/constants.ts:7`). Qualquer tabela nova de geometria seguirá o mesmo padrão (FK em `fixture_id`) ou receberá `save_id` explícito.
- **Tática influencia o jogo.** `attackFocus` (match-engine.ts:172) e `formationModifiers` (`src/engine/formations.ts`) já modulam ataque/posse — dados ricos para colorir o campo (ex.: `down_the_flanks` → mais ação nas pontas).

**Gap central:** o engine produz **eventos pontuais com minuto**, mas **nenhuma posição espacial** e **nenhuma fase de jogo entre eventos**. O campo 2D precisa de coordenadas; o replay precisa de uma timeline contínua, não só 14 tipos de marcos.

---

## 3. Decomposição em sub-épicos

1. **L2.1 — xG por chance persistido.** Não descartar `xgChance` (match-engine.ts:569): emitir como campo do evento de chute/gol/defesa. Pré-requisito barato para o mapa de chutes; isolado, testável, baixo risco.
2. **L2.2 — Eventos granulares de fase.** Nova família de eventos não-marco (posse trocada, desarme, passe-chave, pressão recuperada) emitidos por `runBlock` sob flag, sem alterar probabilidades de gol/cartão. Aumenta densidade do feed textual e habilita estatísticas novas (desarmes, passes certos).
3. **L2.3 — Modelo de posições (coordenadas).** Derivar coordenadas normalizadas `(x,y)` para cada evento a partir de tipo + posição do jogador + `attackFocus` + lado, usando o **mesmo `rng`** ou um RNG derivado determinístico. Sem física — posicionamento estatístico plausível.
4. **L2.4 — Persistência de geometria.** Tabela/coluna para guardar `(x,y)` + xG + fase por evento da partida do usuário (espelha o que `match_events` já faz). Migration aditiva.
5. **L2.5 — Renderização 2D estática.** Componentes SVG: `Pitch2D` (campo), `ShotMap`, `PassNetwork`, `HeatMap`. Consomem geometria agregada. Tudo em `src/components/`, tokens de `@/theme`, kit do Design System.
6. **L2.6 — Replay temporal.** Player de timeline (play/pause/scrub/velocidade) que anima marcos sequencialmente sobre o `Pitch2D`. Reconstrói "momentos" a partir dos eventos ordenados.
7. **L2.7 — Integração opt-in na UX.** Toggle "Assistir em 2D" em `MatchResultScreen` + preferência persistida; casual continua no resumo. Paridade i18n pt/en.

---

## 4. Opções de arquitetura

### Onde as coordenadas nascem

**Opção A — Engine emite geometria inline (acoplado ao loop).**
`runBlock` calcula `(x,y)` e xG no momento de cada evento e empurra num `MatchEvent` estendido. Consome RNG dentro do loop atual.
- (+) Coordenadas usam o estado vivo (squad atual, momentum, tática) com máxima fidelidade.
- (−) **Risco máximo de quebrar determinismo**: qualquer `rng.next()` novo no caminho quente reordena toda a stream e invalida todos os baselines de balanceamento (`docs/.../w6` baselines). Toda a suíte de "mesma seed = mesmo placar" quebra.

**Opção B — Camada de derivação pós-evento (RNG derivado, desacoplada).** *(recomendada)*
O loop principal fica **byte-for-byte intacto**. Após `simulateMatch`, uma função pura `deriveMatchGeometry(result, input)` percorre `result.events` e, para cada um, calcula `(x,y)`/xG/fase com um **RNG derivado determinístico** semeado a partir de `(fixtureId, eventIndex)` — independente da stream principal. xG por chance (L2.1) é a exceção: como já é computado no loop, é exposto via canal lateral (ver L2.1) sem novo `rng.next()`.
- (+) Zero risco para os baselines existentes; geometria 100% determinística e reproduzível; testável isoladamente sem rodar a partida inteira.
- (+) Fácil de tornar opt-in — só roda quando o 2D é pedido.
- (−) Coordenadas são "plausíveis" e não "vividas" (não conhecem o instante exato do momentum). Aceitável: é visualização, não nova física.

**Opção C — Híbrido: marcos do loop + interpolação de fases na derivação.**
Loop emite marcos (intacto) + L2.2 emite eventos de fase **atrás de uma flag default-off** que, quando ligada, consome um RNG separado já dentro do loop mas **só quando a flag está ligada** (caminho default não toca a stream). A derivação (Opção B) faz o resto.
- (+) Permite fases reais (desarmes/passes) para quem quer profundidade, sem custo no caminho casual.
- (−) Duas portas de determinismo para guardar (flag on vs. off); exige teste de paridade "flag-off == legado".

**Recomendação:** **B como espinha dorsal** (geometria e xG derivados, zero risco), **C apenas para L2.2** quando/se os eventos de fase forem priorizados — com o invariante rígido "flag desligada produz stream idêntica ao legado", coberto por teste de igualdade contra baseline. Nunca a Opção A.

### Onde a geometria é persistida

- **Opção 1 — Coluna(s) novas em `match_events`.** Adicionar `x REAL`, `y REAL`, `xg REAL`, `phase TEXT` nullable. Simples, segue o índice `idx_match_events_fixture` (schema.ts:478). Bom se cada linha de geometria mapeia 1:1 a um evento existente.
- **Opção 2 — Tabela nova `match_event_geometry(fixture_id, event_seq, x, y, xg, phase)`.** Desacopla geometria do marco; suporta eventos de fase (L2.2) que não viram `match_event`. Mais flexível, custo de um JOIN.
- **Recomendação:** começar com **Opção 1** (colunas nullable em `match_events`) para L2.1/L2.3/L2.4 — casa exatamente com o fluxo `addMatchEvent` atual. Migrar para **Opção 2** só se L2.2 introduzir eventos de fase fora do conjunto de marcos. Migration sempre aditiva e idempotente (`ALTER TABLE ... ADD COLUMN`), espelhada em `schema.ts` **e** validada pelo path de `src/database/migration.ts`.

### Renderização: estática vs. animada

- Mapas (calor/passe/chute) são **estáticos** — SVG declarativo direto, como `RadarChart`.
- Replay é **animado** — `requestAnimationFrame`/`Animated` no componente React (fora do engine). A geometria é pré-computada (determinística); a animação só interpola visualmente. **Engine nunca importa React** (regra do projeto).

---

## 5. Pré-requisitos & dependências

- **L3 — decompor `match-engine`.** O brief aponta dependência de L3. As 826 linhas já estão parcialmente decompostas (`simulateFirstHalf`/`resumeSecondHalf`/`runBlock`), mas a derivação de geometria fica muito mais limpa se `runBlock` for fatiado em sub-resolvers nomeados (resolveOpenPlay, resolveCorner, resolvePenalty, resolveCards…). **L2 não exige L3 completo**, mas L2.2 (eventos de fase) se beneficia muito dele. Recomendação: L2.1/L2.3/L2.4/L2.5 podem prosseguir; L2.2 espera L3.
- **Design System** (`2026-06-20-design-system-premium-design.md`). A UI 2D (telas/toggles/legendas) **deve** usar o novo kit (Card/Button/Text semântico/Icon/EmptyState/Toast/useConfirm), não estilos inline crus. `MatchResultScreen` hoje é todo `StyleSheet` cru — a integração do toggle é boa oportunidade de migrar a tela para o kit.
- **react-native-svg** já instalado (usado por `RadarChart`). Sem nova dependência.
- **Baselines de balanceamento** (commit `933f2f1`, w6) — qualquer mudança no engine precisa rodar contra eles; a Opção B garante que não mudam.
- **i18n pt/en** com paridade (`src/i18n/pt.ts` + `en.ts`) — todos os rótulos novos (mapa de chutes, rede de passes, fases) em ambos.

---

## 6. Faseamento (entregável testável por fase)

**Fase 1 — xG por chance (L2.1).**
Expor `xgChance` já calculado (match-engine.ts:569) sem novo consumo de RNG: estender `MatchEvent` com `xg?: number` opcional e preenchê-lo nos eventos de chute/gol/defesa. *Entregável testável:* teste de integração com `better-sqlite3` real verificando que (a) `sum(xg)` dos eventos ≈ `stats.homeXG/awayXG` e (b) a stream/placar é idêntica ao baseline (nenhum `rng.next()` novo). Migration aditiva da coluna `xg`.

**Fase 2 — Modelo de posições (L2.3) + persistência (L2.4).**
`deriveMatchGeometry(result, input): GeometricEvent[]` puro em `src/engine/simulation/`, RNG derivado por `(fixtureId, eventIndex)`. Coordenadas normalizadas `[0,1]×[0,1]` por tipo+posição+attackFocus+lado. Persistir `x,y` nas colunas novas de `match_events`. *Entregável:* mesma seed → mesmas coordenadas (teste determinístico); `derive` rodado duas vezes dá output idêntico; coordenadas dentro do campo; gols caem no terço ofensivo correto por lado.

**Fase 3 — Renderização estática (L2.5).**
`Pitch2D`, `ShotMap` (raio ∝ xG, cor por resultado), `PassNetwork`, `HeatMap` em `src/components/`, tokens `@/theme`, kit Design System. *Entregável:* snapshot/render test dos componentes com dados fixos + validação no browser (Playwright MCP) sobre a partida do usuário.

**Fase 4 — Integração opt-in (L2.7).**
Toggle "Assistir em 2D" em `MatchResultScreen` (migrada para o kit), preferência persistida (store/ui-store ou tabela de prefs), nova aba/seção 2D abaixo do resumo. Casual default = resumo. *Entregável:* com toggle off, tela idêntica à atual; com on, mapas renderizam; preferência sobrevive a reload. i18n completo.

**Fase 5 — Replay temporal (L2.6).**
Player de timeline animando marcos em ordem sobre `Pitch2D` (play/pause/scrub/velocidade). *Entregável:* replay reproduz a sequência de gols/defesas na ordem dos minutos; scrub determinístico; validação no browser.

**Fase 6 (condicional a L3) — Eventos de fase (L2.2).**
Sob flag default-off (Opção C), emitir desarmes/passes-chave/recuperações. *Entregável:* teste de paridade "flag-off == baseline byte-a-byte"; com flag-on, novas estatísticas aparecem e são determinísticas.

---

## 7. Schema/infra changes (alto nível)

- **Migration aditiva em `match_events`** (Fases 1-2), espelhada em `src/database/schema.ts` **e** no path de migração `src/database/migration.ts`:
  - `xg REAL` (nullable) — qualidade da chance.
  - `x REAL`, `y REAL` (nullable, `[0,1]`) — coordenada normalizada.
  - `phase TEXT` (nullable) — fase do evento (open_play, corner, set_piece…), antecipa L2.2.
  - Isolamento mantido via `fixture_id` (sem `save_id` próprio, igual ao padrão atual).
- **`addMatchEvent`/`getMatchEvents`** (`queries/fixtures.ts:117,123`) estendidos para ler/gravar os campos novos; `rowToMatchEvent` (linha 43) mapeia as colunas nullable.
- **Tipos:** estender `MatchEvent` (`src/types/match.ts:17`) com `xg?`, `x?`, `y?`, `phase?` opcionais — backward-compatible (eventos AI sem geometria continuam válidos).
- **Possível tabela `match_event_geometry`** só se L2.2 exigir (ver §4, Opção 2).
- **Preferência de UI** "2D opt-in": começar no `ui-store` (Zustand) persistido; promover a coluna em tabela de settings se precisar sobreviver entre saves.
- **`season-archiver.ts`** lê `match_events` — confirmar que o arquivamento ignora/preserva colunas novas sem quebrar.

---

## 8. Riscos & decisões abertas

- **Determinismo é o risco-mãe.** Qualquer `rng.next()` adicionado ao caminho default reordena a stream e invalida placares e baselines. *Mitigação:* Opção B (RNG derivado fora do loop) + teste de igualdade contra baseline em cada PR que toca o engine.
- **Volume de eventos AI.** Persistir geometria para **todas** as partidas (≈20/semana × 22 jogadores) explodiria o DB. *Decisão tomada:* geometria/replay só para a **partida do usuário** (igual ao `match_events` hoje, game-loop.ts:321). AI fica só com placar/stats agregados.
- **Coordenadas plausíveis vs. "reais".** Sem física, `(x,y)` é estatístico. *Risco:* hardcore achar artificial. *Mitigação:* ancorar fortemente em posição do jogador + `attackFocus` + zona esperada do tipo de evento; iterar com feedback visual no browser.
- **Performance do replay em RN Web.** Muitos nós SVG animados podem travar. *Mitigação:* limitar a marcos-chave (não toda a fase), usar `Animated`/rAF, throttle de scrub.
- **`Alert.alert` é no-op no Web** (memória do projeto) — confirmações do toggle/replay devem usar `useConfirm`/Toast do kit, nunca `Alert`.
- **Decisão aberta:** rede de passes precisa de *pares* passador→recebedor. Hoje só `assist` carrega `secondaryPlayerId` (passador→artilheiro). L2.2 forneceria pares reais; até lá, a `PassNetwork` é aproximada (deriva de assists + posições). Decidir se entrega aproximada na Fase 3 ou espera L2.2.
- **Decisão aberta:** `phase` como coluna em `match_events` (Opção 1) vs. tabela própria (Opção 2) — depende de L2.2 virar escopo.

## 9. Não-objetivos / fora de escopo

- **Física/engine baseado em ticks contínuos.** Continua sendo simulação por blocos+probabilidade; o 2D **visualiza**, não substitui o motor.
- **Controle ao vivo da bola / jogo manual.** Sem input do jogador durante a animação além de play/pause/scrub.
- **Geometria para partidas de AI.** Só a do usuário (ver §8).
- **Multiplayer / streaming nativo / export de vídeo.** Reprodutibilidade por seed é a base, mas exportar clipe é épico futuro.
- **Mudar balanceamento/probabilidades.** Este épico não recalibra constantes (GOAL_BASE_PROB etc., match-engine.ts:65); só expõe o que já acontece.
- **Reescrever `player-rating`/`team-strength`.** Consumidos como estão.

## 10. Spec self-review

- **Aterrado em código real?** Sim — todas as referências citam arquivo:linha verificados (`match-engine.ts:517/523/569`, `match.ts:1/17`, `schema.ts:222`, `fixtures.ts:117/123`, `game-loop.ts:321`, `halftime.ts:18/106`, `RadarChart.tsx`, `constants.ts:7`). Confirmado que `match_events` não tem `save_id` e usa isolamento transitivo.
- **Determinismo protegido?** Sim — a recomendação central (Opção B + flag default-off na C) preserva a stream de RNG e os baselines; xG é exposto sem novo `rng.next()`.
- **Respeita arquitetura?** Engine puro (geometria derivada é função pura, zero React); renderização/animação no componente; persistência via queries tipadas com `(db, saveId, …)`.
- **Convenções?** i18n pt/en com paridade exigida; tokens `@/theme`; kit do Design System para UI nova; sem `Alert` no Web; migration aditiva espelhada em schema+migration.
- **Faseamento incremental e testável?** Sim — cada fase entrega algo verificável (xG soma ≈ stats; coordenadas determinísticas; render no browser; toggle reversível; replay ordenado), com TDD via `better-sqlite3` real onde toca DB/engine.
- **Lacunas honestas?** Sim — PassNetwork aproximada até L2.2; dependência parcial de L3; decisão coluna vs. tabela para `phase` em aberto. Sem placeholders "TBD" mascarando decisão.
