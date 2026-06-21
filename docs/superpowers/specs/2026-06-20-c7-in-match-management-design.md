# Design: Gestão in-match + conselho tático

**Epic:** c7-in-match · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict
**Goal:** Estender o controle ao vivo do intervalo (já existente) para janelas de ajuste tático/substituição **durante** as duas etapas do jogo e adicionar um **engine de conselho** do assistente (sugestões de subs/tática por placar, adversário e banco), mantendo determinismo e surface casual-first com detalhe opt-in.

---

## 1. Problema / estado atual

Hoje o único ponto de intervenção ao vivo é o **intervalo**. O fluxo é:

1. `HomeScreen.handleWatchLive` (`src/screens/home/HomeScreen.tsx:393-423`) chama `startUserMatchHalftime(...)` (`src/engine/match-day/halftime.ts:48-99`), que simula **só** o 1º tempo do jogo do usuário com rng isolado (`halftimeSeed`, `halftime.ts:18-20`) e devolve `UserHalftimeContext`.
2. O snapshot vivo (`HalftimeState`, `match-engine.ts:341-349`) — que carrega a **própria instância de `SeededRng`** mid-stream — é guardado em memória no store (`game-store.ts:32-37, 208-227`) e a navegação vai pra `MatchHalftime`.
3. `MatchHalftimeScreen` (`src/screens/home/MatchHalftimeScreen.tsx`) deixa o usuário trocar **mentality/pressing/tempo** (`MatchHalftimeScreen.tsx:107-109, 410-433`) e enfileirar até **3 subs manuais** (`MAX_MANUAL_SUBS = 3`, `:34, :110, :189-198`).
4. `handleResume` (`:200-282`) monta `SecondHalfOverrides` (`match-engine.ts:351-355`) e chama `resumeSecondHalf(halftime, overrides)` (`match-engine.ts:434-510`), que aplica os overrides ao **time HOME** (sempre o usuário, por contrato — `halftime.ts:36-47`) via `applySecondHalfOverrides` (`match-engine.ts:395-427`), roda os blocos 15..29 com o **mesmo rng** e produz o `MatchResult`. O resultado é re-orientado pra moldura do fixture (`orientResultToFixture`, `halftime.ts:106-132`) e persistido via `advanceGameWeek({..., userMatchResultOverride})` (`game-loop.ts:285-...`, contrato em `:167-179`).

**Limitações concretas:**

- **Só um ponto de decisão (minuto 45).** O motor roda em 30 blocos de 3 min (`TOTAL_BLOCKS = 30`, `HALF_BLOCK = 15`, `match-engine.ts:62-63`). A pausa só existe na fronteira `block 15`. Se o usuário sofre o 2-1 no minuto 70, não tem como reagir — fica refém das auto-subs do motor (`runBlock` 2º tempo, `match-engine.ts:798-825`).
- **Zero conselho.** O assistente hoje só emite comentários **semanais espontâneos** fora da partida (`maybeGenerateComment`, `comment-generator.ts:155-174`, gateado por `ASSISTANT_COMMENT_CHANCE_PER_WEEK = 0.15`, `balance.ts:59`). Não há nenhuma função que olhe placar/adversário/banco e diga "troque para 5-3-2 para segurar o 2-0" ou "seu zagueiro está no amarelo, tire-o". Os arquétipos (`ALL_ARCHETYPES`, `assistant-engine.ts:19-27`; `AssistantArchetype`, `types/assistant.ts`) existem mas só pintam tom de texto.
- **A UI do intervalo é toda inline/legada.** `MatchHalftimeScreen.tsx` usa `StyleSheet` cru + `<Pressable>`/`<Text>` (`:478-605`), emojis como ícones de evento (`getIcon`, `:288-298`), e tokens diretos de `@/theme` (`:12`). Pós-Design System isso precisa migrar para o kit (Card/Button/Stat/Icon).
- **Persistência do snapshot é volátil.** O comentário em `game-store.ts:29-32` confirma: o `HalftimeState` vive só em memória; reload no meio descarta. Aceitável pro MVP; o engine de janelas múltiplas **herda** essa mesma limitação (sem novo schema).

---

## 2. Approach

### 2.1 Janelas de decisão: **por evento/etapa**, não "a qualquer minuto"

**Decisão recomendada: janelas discretas disparadas por gatilho** (intervalo + janelas opt-in no 2º tempo), **não** controle a qualquer minuto.

Motivo (custo de UX casual): "a qualquer minuto" exige um *match engine reativo* — ou tick visual em tempo real (caro, e o motor é batch por blocos, não event-loop), ou pausa a cada bloco (30 interrupções por jogo = fricção brutal pro casual). O motor atual **não tem** um loop pausável bloco-a-bloco exposto; só tem o split de meio-tempo (`simulateFirstHalf` / `resumeSecondHalf`). Reaproveitar esse split é barato e já é determinístico (a mesma `SeededRng` é threaded pela pausa — `match-engine.ts:341-349, 389, 435`).

**Modelo escolhido — "etapas pausáveis com gatilhos":**

- Generalizar o split de 2 etapas (1º/2º tempo) para **N segmentos**. Em vez de `simulateFirstHalf` + `resumeSecondHalf` fixos em `HALF_BLOCK`, introduzir `simulateSegment(state, untilBlock)` que roda do bloco corrente até `untilBlock` exclusivo, **threadando o mesmo rng**, e devolve um `LiveMatchState` (evolução do `HalftimeState`).
- **Pontos de pausa padrão (casual-first):** intervalo (bloco 15) — mantém o comportamento atual — e **uma janela tática no 2º tempo** por padrão (≈ bloco 22, ~minuto 66), o "horário clássico de mexer". Casual joga com 2 pausas no máximo.
- **Gatilhos opt-in (detalhe):** o usuário pode habilitar "pausar quando levar gol" / "pausar em cartão vermelho meu" / "pausar quando entrar na reta final (bloco 25)". Esses gatilhos fazem o segmento parar **no bloco do evento** em vez de rodar até o próximo ponto fixo. Sem opt-in, o jogo só para nos 2 pontos padrão.
- **Limite de janelas** para não virar 30 pausas: `MAX_LIVE_WINDOWS` (intervalo + até 2 no 2º tempo). O cap de subs continua sendo o do motor (`MAX_SUBS = 5`, `match-engine.ts:74`), agora distribuído pelas janelas em vez de só no intervalo (`MatchHalftimeScreen.tsx:33-34` hoje limita 3 no intervalo — o limite passa a ser por-janela mas o teto agregado é 5).

### 2.2 Engine de conselho do assistente (`src/engine/assistant/match-advisor.ts`)

Função **pura** que recebe um snapshot do estado vivo (placar, minuto/bloco, força relativa, banco disponível, cartões, fadiga, tática atual, adversário) + o arquétipo do assistente de `squad` e devolve uma lista ordenada de `MatchAdvice` (descritores i18n + ação aplicável opcional). O **arquétipo** modula o conselho: `tactician`/`pragmatic` priorizam proteger placar (recuar formação, sub defensivo); `motivator`/`old_school` empurram pra frente; `analytics` cita números (xG, fadiga). Reusa o vocabulário de arquétipos já estabelecido em `comment-generator.ts:18-147`.

O conselho é **sugestão**, nunca aplicação automática: o usuário aceita (preenche a janela com a ação proposta) ou ignora. Determinismo: o advisor é determinístico por construção (regras sobre o estado) e, quando precisar desempatar entre sugestões equivalentes, usa a `SeededRng` do `LiveMatchState` (mesma instância — não cria nova). **Zero** `Math.random`/`Date.now`.

### 2.3 Alternativa descartada

**Tick em tempo real (event-loop ao vivo, estilo FM "comprehensive highlights").** Exigiria reescrever o motor de batch-por-blocos (`runBlock`, `match-engine.ts:523-826`) para um loop assíncrono com renderização incremental, timer e estado reativo na UI. Quebra o contrato "compose-equals-whole" que hoje garante que `simulateMatch === simulateFirstHalf + resumeSecondHalf` (`match-engine.ts:512-519` e o teste que o guarda, citado no doc comment `:514`). Custo alto, risco de não-determinismo (timers), e contra a diretriz casual-first. Descartada.

---

## 3. Architecture & components

| Arquivo | Criar/Alterar | Responsabilidade |
|---|---|---|
| `src/engine/simulation/match-engine.ts` | Alterar | Generalizar split: novo `LiveMatchState` + `simulateSegment` (roda do bloco corrente até `untilBlock`, threadando rng). `simulateFirstHalf`/`resumeSecondHalf` viram wrappers finos sobre `simulateSegment` (preserva compose-equals-whole). Adicionar `currentBlock` ao state. |
| `src/engine/match-day/live-match.ts` | Criar | Orquestrador (toca DB) — evolui `halftime.ts`. `startUserMatchLive` (substitui/estende `startUserMatchHalftime`), `advanceToNextWindow(state, triggers)`, `finishLiveMatch(state, overrides)`. Reusa `loadClubMatchData` (`game-loop.ts:223-255`), `liveSeed`, `orientResultToFixture`. |
| `src/engine/match-day/halftime.ts` | Alterar | Manter `halftimeSeed`/`orientResultToFixture` (re-export ou mover p/ live-match). Marcar `startUserMatchHalftime` como wrapper de `startUserMatchLive` p/ não quebrar `HomeScreen.tsx:397`. |
| `src/engine/assistant/match-advisor.ts` | Criar | Engine **puro** de conselho: `generateMatchAdvice(input): MatchAdvice[]`. Regras por placar/banco/cartão/fadiga moduladas por `AssistantArchetype`. Descritores i18n. |
| `src/engine/assistant/match-advisor.test.ts` | Criar | TDD do advisor (golden + edge). |
| `src/engine/match-day/live-match.test.ts` | Criar | TDD do orquestrador com better-sqlite3 real + determinismo de janelas. |
| `src/engine/simulation/match-engine.test.ts` | Alterar | Novo caso: `simulateSegment` em N cortes === `simulateMatch` (estende compose-equals-whole). |
| `src/types/match-advice.ts` | Criar | `MatchAdvice`, `MatchAdviceKind`, `LiveWindowKind`, `LiveTrigger`. |
| `src/screens/home/MatchHalftimeScreen.tsx` | Alterar/renomear | Vira `MatchLiveWindowScreen` (genérica p/ qualquer janela) ou recebe `windowKind`. Migra UI pro kit do Design System (Card/Button/Stat/Icon/EmptyState). Renderiza o painel de conselho do assistente. |
| `src/store/game-store.ts` | Alterar | Renomear/estender campos `halftime*` → `live*` (`liveState`, `liveWindowKind`, `liveAdvice`). Mantém volátil em memória (sem schema). |
| `src/navigation/types.ts` | Alterar | `MatchHalftime: undefined` → `MatchLiveWindow: { windowKind: LiveWindowKind }` (`navigation/types.ts:6`). |
| `src/screens/home/HomeScreen.tsx` | Alterar | `handleWatchLive` (`:393-423`) chama `startUserMatchLive`; loop de janelas: enquanto houver próxima janela, navega; senão `finishLiveMatch`. |
| `src/store/settings-store.ts` | Alterar | Toggles opt-in de gatilhos ao vivo (criado no Design System D7 — `2026-06-20-design-system-premium-design.md:234`). |
| `src/engine/balance.ts` | Alterar | `LIVE_MATCH` constants (blocos de janela padrão, `MAX_LIVE_WINDOWS`). |
| `src/i18n/pt.ts` + `src/i18n/en.ts` | Alterar | Chaves `advice.*` e `live.*` (paridade pt/en). |

### Contract (assinaturas TS exatas)

```ts
// ── src/engine/simulation/match-engine.ts ──────────────────────────────────
// Evolução de HalftimeState: snapshot vivo em QUALQUER fronteira de bloco.
export interface LiveMatchState {
  home: TeamState;
  away: TeamState;
  events: MatchEvent[];
  usedMinutes: Set<number>;
  homeAdv: number;
  rng: SeededRng;        // MESMA instância threaded — nunca serializada
  input: MatchInput;
  currentBlock: number;  // próximo bloco a rodar (0..TOTAL_BLOCKS)
}

/** Roda do currentBlock até untilBlock (exclusivo), threadando o rng.
 *  untilBlock ∈ (currentBlock, TOTAL_BLOCKS]. Muta e devolve o mesmo state. */
export function simulateSegment(state: LiveMatchState, untilBlock: number): LiveMatchState;

/** Cria o LiveMatchState inicial sem rodar bloco algum (currentBlock = 0). */
export function initLiveMatch(input: MatchInput): LiveMatchState;

/** Computa o MatchResult final a partir de um state já em currentBlock === TOTAL_BLOCKS. */
export function finalizeMatchResult(state: LiveMatchState): MatchResult;

// applySecondHalfOverrides generaliza p/ applyWindowOverrides(state, overrides)
export function applyWindowOverrides(state: LiveMatchState, overrides: SecondHalfOverrides): void;

// Wrappers preservados (compose-equals-whole intacto):
export function simulateFirstHalf(input: MatchInput): LiveMatchState;        // = initLiveMatch + simulateSegment(_, HALF_BLOCK)
export function resumeSecondHalf(state: LiveMatchState, o?: SecondHalfOverrides): MatchResult;

// ── src/types/match-advice.ts ──────────────────────────────────────────────
export type LiveWindowKind = 'halftime' | 'second_half' | 'final_stretch';

export type LiveTrigger = 'conceded_goal' | 'own_red_card' | 'final_stretch';

export type MatchAdviceKind =
  | 'change_formation'   // ação: novo formation
  | 'change_mentality'   // ação: novo mentality
  | 'change_pressing'
  | 'sub_off'            // ação: tirar playerId (cartão/fadiga)
  | 'sub_attacker'       // ação: reforço ofensivo (chase)
  | 'sub_defender'       // ação: reforço defensivo (proteger placar)
  | 'hold';              // sem ação: "está bom, mantenha"

export interface MatchAdvice {
  kind: MatchAdviceKind;
  text: import('@/i18n/translate').TextDescriptor;  // i18n, igual a AssistantComment.comment
  priority: number;            // 0..100, ordena a lista
  // Ação sugerida (opcional) que a janela pode pré-preencher ao "aceitar":
  suggestedFormation?: Formation;
  suggestedMentality?: Mentality;
  suggestedPressing?: Pressing;
  suggestedSubOutId?: number;
  suggestedSubInId?: number;
}

// ── src/engine/assistant/match-advisor.ts ──────────────────────────────────
export interface MatchAdviceInput {
  archetype: AssistantArchetype;     // arquétipo do assistente de squad
  qualityStars: number;              // 1..5 — modula nº/precisão de conselhos
  userGoals: number;
  oppGoals: number;
  currentBlock: number;              // p/ derivar minuto/urgência
  userTactic: Tactic;
  onPitch: PlayerForStrength[];
  bench: PlayerForStrength[];
  yellowCardedIds: ReadonlySet<number>;  // home.yellows
  fatigueByPlayer: ReadonlyMap<number, number>; // home.fatigueByPlayer
  subsRemaining: number;
  opponentName: string;
  rng: SeededRng;                    // a MESMA do LiveMatchState (desempate determinístico)
}

export function generateMatchAdvice(input: MatchAdviceInput): MatchAdvice[];

// ── src/engine/match-day/live-match.ts ─────────────────────────────────────
export function liveSeed(season: number, week: number, fixtureId: number): number; // = halftimeSeed

export interface UserLiveContext {
  state: LiveMatchState;
  isHome: boolean;
  opponentName: string;
  windowKind: LiveWindowKind;
  advice: MatchAdvice[];
  homeBench: PlayerForStrength[];
  homeTactic: Tactic;
  fixtureId: number;
}

export function startUserMatchLive(params: {
  dbHandle: DbHandle; season: number; week: number; playerClubId: number; saveId: number;
}): Promise<UserLiveContext | null>;

/** Aplica overrides da janela atual, roda até a PRÓXIMA fronteira de janela
 *  (respeitando triggers opt-in) e devolve o próximo contexto, ou null se o jogo
 *  chegou ao fim (chamador então usa finishLiveMatch). */
export function advanceToNextWindow(params: {
  state: LiveMatchState; isHome: boolean; opponentName: string;
  overrides: SecondHalfOverrides; triggers: LiveTrigger[];
  archetype: AssistantArchetype; qualityStars: number;
}): UserLiveContext | null;

/** Aplica os últimos overrides, roda até o fim e produz o MatchResult orientado. */
export function finishLiveMatch(params: {
  state: LiveMatchState; isHome: boolean; overrides: SecondHalfOverrides;
}): MatchResult;
```

---

## 4. Data flow

1. **Início (Home).** `handleWatchLive` → `startUserMatchLive` carrega ambos os clubes (`loadClubMatchData`, `game-loop.ts:223-255`), monta `MatchInput` com o usuário como HOME e rng `new SeededRng(liveSeed(season,week,fixtureId))` (idêntico ao `halftime.ts:71-86`), faz `initLiveMatch` + `simulateSegment(state, HALF_BLOCK)` → primeira janela = intervalo. Carrega o assistente de `squad` (via `assistant-store`/query existente) e chama `generateMatchAdvice`. Guarda no store (`liveState`, `liveWindowKind='halftime'`, `liveAdvice`). Navega `MatchLiveWindow`.
2. **Janela (UI).** Tela mostra placar parcial, stats do segmento, eventos, **painel de conselho** (lista `MatchAdvice` ordenada por `priority`, cada item com botão "aplicar" que pré-preenche a sub/tática), e os controles de sub/tática (kit do Design System). Usuário decide.
3. **Avançar.** Ao confirmar, UI monta `SecondHalfOverrides` (igual a `MatchHalftimeScreen.tsx:204-213`) + lê os `triggers` opt-in de `settings-store`. Chama `advanceToNextWindow`:
   - `applyWindowOverrides(state, overrides)` (generaliza `applySecondHalfOverrides`, `match-engine.ts:395-427`).
   - `simulateSegment` até o próximo ponto de parada: o menor entre o próximo ponto fixo (bloco 22 / 25) e o bloco onde um trigger opt-in dispara (gol sofrido / vermelho). Se nenhuma janela resta → devolve `null`.
   - Se devolveu contexto: re-gera `advice`, atualiza store, navega de novo p/ `MatchLiveWindow`.
   - Se `null`: chamador chama `finishLiveMatch` → roda até `TOTAL_BLOCKS`, `finalizeMatchResult`, `orientResultToFixture`.
4. **Fim.** Igual ao fluxo atual de `handleResume` (`MatchHalftimeScreen.tsx:217-277`): `advanceGameWeek({..., userMatchResultOverride: fixtureResult})`, achievement checkpoint, comentário semanal, navega `MatchResult`.

**Detecção de trigger dentro do segmento:** `simulateSegment` roda bloco-a-bloco; após cada par `runBlock(home)/runBlock(away)`, se um trigger opt-in está ativo e a condição passou nesse bloco (ex.: `home.goals` ou `away.goals` mudou; novo id em `home.reds`), para **no fim daquele bloco** (incrementa `currentBlock` e retorna). Isso é deterministicamente reproduzível porque o rng já avançou os mesmos passos.

---

## 5. Schema changes

**Nenhuma tabela/coluna nova.** O `LiveMatchState` é volátil em memória (mesma decisão do `HalftimeState` — `game-store.ts:29-32`), incluindo a `SeededRng` mid-stream que **nunca** é serializada (`match-engine.ts:341-349` doc). Reload no meio descarta a partida ao vivo (aceitável; o usuário cai no advance instantâneo).

Os toggles de gatilho opt-in vivem em `settings-store` (Zustand, criado no Design System D7 — `2026-06-20-design-system-premium-design.md:234`). Se persistência de settings exigir DB, ela é responsabilidade do épico de Design System (D7), não deste. Aqui só **lemos** os toggles.

**Save-isolation:** todas as queries usadas (`loadClubMatchData`, `getFixturesByWeek`, `getClubById`, `getPlayerById`) já recebem `(db, saveId, ...)` e seguem o padrão `SAVE_ID_STRIDE` — nada novo a adicionar. O advisor e o match-engine são puros (não tocam DB).

---

## 6. Error handling & edge cases

- **Sem fixture do usuário na semana:** `startUserMatchLive` devolve `null` (igual `halftime.ts:61`) → Home cai no advance instantâneo (`HomeScreen.tsx:404-408`).
- **Banco vazio:** advisor não emite `sub_*` (filtra `bench.length === 0`); UI esconde o controle de sub (já existe: `MatchHalftimeScreen.tsx:352-353`).
- **Subs esgotados (`subsRemaining === 0`):** advisor só emite `change_*`/`hold`; `applyWindowOverrides` já ignora subs inválidos defensivamente (`match-engine.ts:411-414`).
- **Ids de sub inválidos** (out não em campo / in não no banco): pulados sem crash (`match-engine.ts:411-414`). UI filtra ids já usados (`MatchHalftimeScreen.tsx:179-187`).
- **Player sugerido foi expulso/lesionado** entre janelas: advisor opera sobre o `onPitch`/`bench` correntes do state; quem saiu não aparece. Sugestão de tirar um `yellowCardedId` que já levou o 2º amarelo (virou vermelho) some porque saiu de `home.squad`.
- **Trigger dispara no último bloco:** `simulateSegment` clampa `untilBlock` em `TOTAL_BLOCKS`; se o gol sofrido é no bloco 29, não abre janela inútil — `advanceToNextWindow` detecta `currentBlock === TOTAL_BLOCKS` e devolve `null`.
- **Múltiplos triggers no mesmo bloco:** para uma vez; a UI mostra qual gatilho abriu a janela (`windowKind`/motivo).
- **`MAX_LIVE_WINDOWS` atingido:** sem mais paradas; o motor roda direto até o fim (auto-subs do motor continuam, `match-engine.ts:798-825`).
- **Conselho contraditório com o estado** (ex.: "ataque" estando 3-0 à frente): regras de placar previnem — vencendo confortável → `hold`/defensivo; o arquétipo só desempata, não inverte a leitura de placar.
- **Determinismo:** mesma seed + mesmas decisões do usuário = mesmo resultado. Se o usuário **não** mexe em nada, N janelas devem produzir resultado **idêntico** ao `simulateMatch` direto (guardado por teste — ver §7).

---

## 7. Testing strategy

TDD (skill `superpowers:test-driven-development`), better-sqlite3 **real** em memória para o orquestrador; advisor e match-engine testáveis puros.

**`match-engine.test.ts` (estende compose-equals-whole):**
- Golden: `simulateMatch(input)` === rodar `initLiveMatch` + `simulateSegment` em cortes arbitrários (ex.: 15, 22, 25, 30) **sem overrides** → `MatchResult` byte-idêntico (goals, events, ratings, stats). Garante que multi-janela não altera o motor.
- Edge: corte em bloco 0 e em `TOTAL_BLOCKS` (no-op / tudo); `untilBlock` fora de range deve clampar/lançar.
- Determinismo: mesma seed, dois runs → idêntico.

**`match-advisor.test.ts` (puro):**
- Golden por placar: vencendo 2-0 com `tactician` → top advice é defensivo (`change_formation` p/ formação mais recuada ou `sub_defender`), `priority` alto. Perdendo 0-1 com `motivator` → `sub_attacker`/`change_mentality='attacking'`. Empate tardio → `hold` ou ajuste leve.
- Modulação por arquétipo: mesmo estado, `analytics` vs `old_school` → mesma *direção* (defender/atacar) mas textos i18n distintos; `tactician`/`pragmatic` mais propensos a `change_formation`.
- Edge: banco vazio → nenhum `sub_*`; subs esgotados → só `change_*`/`hold`; jogador no amarelo + alta fadiga → `sub_off` com `suggestedSubOutId` correto.
- Determinismo: mesma `SeededRng` + mesmo input → mesma lista (ordem e ids).
- `qualityStars` baixo → menos/menos precisos conselhos; alto → lista mais completa.

**`live-match.test.ts` (integração, better-sqlite3 real):**
- Seed save com 2 clubes + fixture do usuário; `startUserMatchLive` devolve contexto de intervalo com `advice` não-vazio.
- Fluxo multi-janela com overrides reais (sub + troca de mentality) → resultado persistível; re-orientação correta quando usuário é AWAY (`orientResultToFixture`).
- Trigger opt-in `conceded_goal`: forçar (via seed) um cenário onde o usuário sofre gol no 2º tempo → `advanceToNextWindow` para no bloco do gol.
- **Sanidade de não-determinismo:** rodar o mesmo save/seed duas vezes com as mesmas decisões → mesmo placar/eventos.

---

## 8. Dependencies & sequencing

- **Precede:** o split de meio-tempo já existe (`simulateFirstHalf`/`resumeSecondHalf`, `HalftimeState`, rng resumível) — este épico **generaliza**, não cria do zero. Sem isso, seria muito maior.
- **Design System (`2026-06-20-design-system-premium-design.md`):** a tela de janela ao vivo deve usar o **kit novo** (Card/Button/Stat/Icon/EmptyState/Toast) e `useConfirm` (D3, `:103-117, 266-302`) no lugar dos `Pressable`/`StyleSheet` crus e dos emojis de `MatchHalftimeScreen.tsx:288-298, 478-605`. Os **toggles de gatilho opt-in** dependem do `settings-store` (D7, `:234`). Recomendado **sequenciar após D3 (kit) e D7 (settings)**; se este épico vier antes, a tela nasce no estilo legado e migra depois (custo de retrabalho).
- **Engine de assistente:** reusa `AssistantArchetype` (`types/assistant.ts`), `AssistantWithQuality.qualityStars` e o padrão de descritores i18n de `comment-generator.ts`. Não depende de novos arquétipos.
- **Relação com C5 (Squad Psychology):** se C5 introduzir moral/forma in-match, o advisor pode incorporar depois (ponto de extensão em `MatchAdviceInput`), mas **não** é dependência — out of scope aqui.

---

## 9. Out of scope

- Tick/replay em tempo real ou highlights animados (alternativa descartada, §2.3).
- Persistir partida ao vivo entre reloads (snapshot continua volátil, §5).
- Conselho/janelas ao vivo para partidas **da IA** (só o jogo do usuário pausa, como hoje).
- Auto-aplicar o conselho (assistente joga sozinho) — fica como ideia futura ("delegar ao assistente").
- Instruções individuais de jogador (man-marking, papéis) — o escopo é formação/mentality/pressing/tempo + subs, igual ao intervalo atual.
- Novos arquétipos de assistente ou rebalance de `ASSISTANT_*` (`balance.ts:52-61`).
- Mudanças no modelo de fadiga/momentum/xG do motor (`match-engine.ts:82-91`) — só consumimos o que existe.

---

## 10. Spec self-review

- **Placeholder scan:** sem "TBD"/`???`/`FIXME`. Constantes citadas com valor real (`TOTAL_BLOCKS=30`, `HALF_BLOCK=15`, `MAX_SUBS=5`, `MAX_MANUAL_SUBS=3`, `ASSISTANT_COMMENT_CHANCE_PER_WEEK=0.15`).
- **Consistência interna:** janelas por gatilho (§2.1) coerentes com data flow (§4) e edge cases (§6 — clamp em `TOTAL_BLOCKS`, `MAX_LIVE_WINDOWS`). Determinismo afirmado em §2.2/§4/§6 e coberto por testes §7 (compose-equals-whole + sanidade). Contrato §3 alinhado às assinaturas reais (`SecondHalfOverrides`, `TeamState`, `PlayerForStrength`, `Tactic`, `SeededRng`).
- **Refs de código verificadas (lidas nesta sessão):** `match-engine.ts:62-63,74,341-355,363-390,395-427,434-519,798-825`; `halftime.ts:18-20,48-99,106-132`; `MatchHalftimeScreen.tsx:33-34,107-110,179-198,204-213,217-282,288-298,478-605`; `game-loop.ts:167-179,223-255,285`; `assistant-engine.ts:19-27`; `comment-generator.ts:18-147,155-174`; `types/assistant.ts`; `types/tactic.ts` (Formation/Mentality/Pressing); `game-store.ts:29-37,120-125,208-227`; `HomeScreen.tsx:393-434`; `navigation/types.ts:5-6`; `rng.ts:13-47`; `balance.ts:52-61`; `i18n/pt.ts:345-349`; `2026-06-20-design-system-premium-design.md:103-117,234,266-302`.
- **APIs não inventadas:** `simulateSegment`/`initLiveMatch`/`LiveMatchState`/`generateMatchAdvice` são **novos** (marcados Criar/Alterar em §3); todo o resto referencia símbolos existentes confirmados por leitura. `SeededRng` expõe `next/nextInt/nextFloat/pick/shuffle/weightedPick` (`rng.ts:13-47`) — sem `clone`/`fork`, por isso o advisor reusa a **mesma** instância (consistente com o threading do motor).
