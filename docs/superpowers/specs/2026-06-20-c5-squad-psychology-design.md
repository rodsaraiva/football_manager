# Design: Psicologia do elenco

**Epic:** c5-psychology · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict

**Goal:** Transformar a moral de um número opaco (1–100) num sistema explicável e dramático — com drivers rastreáveis, personalidades, química de grupo, conflitos e uma tela de "por quê" — em cima dos motores de team-talk e press já existentes, mantendo determinismo e save-isolation.

---

## 1. Problema / estado atual (aterrado no código real)

A moral hoje é um único inteiro `morale INTEGER CHECK (morale BETWEEN 1 AND 100)` em `src/database/schema.ts:92`, espelhado em `Player.morale` (`src/types/player.ts:42`). Ela se move por deltas calculados em motores puros, mas **o jogador nunca vê o porquê** — só o número final.

Pontos concretos do estado atual:

- **Motor de partida** `computeMatchMoraleDelta` (`src/engine/morale/morale-engine.ts:21-34`) combina resultado, minutos jogados, goleada e streak no banco, mas **devolve só `number`** — perde a decomposição. Em `game-loop.ts:480-490` o delta é aplicado e descartado; nada é persistido sobre a causa.
- **Drift de ociosidade** `computeWeeklyMoraleDrift` (`morale-engine.ts:37-39`) puxa para `MORALE_DRIFT_TARGET = 50` (`src/engine/balance.ts:94`) em semanas sem jogo (`game-loop.ts:721-731`). Outro driver invisível.
- **Interações individuais** `evaluatePraise`/`evaluateCriticism` (`src/engine/morale/interactions.ts:25-52`) já retornam `{ delta, reaction }` — mas a reação é efêmera (UI em `PlayerDetailScreen.tsx`), com cooldown semanal via `last_interaction_season/week` (`schema.ts:106-107`, queries em `src/database/queries/interactions.ts`).
- **Team-talk de elenco** `computeSquadTeamTalk` (`src/engine/morale/squad-team-talk.ts:32-44`) e **press** `computePressConference` (`src/engine/press/press-engine.ts:71-95`) modulam o delta por forma recente, retornam só `nextMorale` por jogador + sumário improved/worsened/unchanged. A press também move `board_trust` via `confidenceDelta` (`press-engine.ts:92`; persistência em `src/database/queries/board.ts:111-117`).
- **Streak de moral baixa** `consecutive_low_morale_weeks` (`schema.ts:103`) já existe e alimenta aposentadoria precoce (`game-loop.ts:735-742`), com `RETIREMENT_MORALE_THRESHOLD = 50` (`balance.ts:39`).

**Por que é raso:** (a) zero atributo de **personalidade** — todos reagem idêntico ao mesmo estímulo; (b) zero **química/cliques** — o elenco é um saco de inteiros independentes; (c) zero **conflito/fallout** — não existe drama de vestiário levando a venda forçada; (d) zero **histórico** — o jogador não sabe que criticou o camisa 10 há 3 semanas; (e) **nenhuma tela explica** de onde veio a moral. A constante `RETIREMENT_LOW_MORALE_STREAK_THRESHOLD = 3` (`balance.ts:41`) é o único uso "dramático" da moral hoje.

---

## 2. Approach

**Abordagem escolhida: ledger de drivers + camada de personalidade/química como modificadores puros, sem reescrever os motores existentes.**

1. **Driver ledger.** Toda mudança de moral passa a produzir um array de `MoraleDriver` `{ kind, delta, season, week }` em vez de só um `number`. Refatoramos os motores puros (`computeMatchMoraleDelta`, `computeWeeklyMoraleDrift`, team-talk, press, interactions) para devolver **breakdown** + total. Um novo módulo `src/engine/morale/driver-ledger.ts` define o tipo e o agregador. As linhas são persistidas numa tabela `morale_events` (append-only, podada por janela). A **tela "Por quê"** lê esse ledger.
2. **Personalidade como arquétipo derivado de atributos mentais + seed** — não uma nova rolagem por semana. `derivePersonality(attrs, seedComponent)` em `src/engine/morale/personality.ts` mapeia `leadership`, `composure`, `aggression`, `decisions` (`src/types/player.ts:12-18`) + um componente determinístico da seed do save para um `PersonalityArchetype` estável (`leader | professional | mercenary | temperamental | dressingRoomProblem | balanced`). O arquétipo **modula os deltas** (líder sofre menos com banco; mercenário reage forte a salário; temperamental amplifica criticism).
3. **Química/cliques** como grafo leve: `computeChemistryGroups(members, rng)` agrupa jogadores por afinidade (nacionalidade, faixa etária, tempo de casa) num punhado de cliques. Grupos coesos dão um **bônus de drift** (puxam para cima quando o grupo está feliz; arrastam para baixo quando há um membro infeliz). Persistido em `chemistry_links`.
4. **Conflito/fallout** como máquina de estados por jogador: moral cronicamente baixa + arquétipo de risco + gatilho (criticism repetida, banco prolongado) escala um `fallout_state` (`none → unsettled → wantsOut`). Em `wantsOut`, o jogador é auto-`is_transfer_listed` e gera news — reusando o pipe de news (`insertNewsItem`).
5. **Histórico jogador-técnico** já tem a base (`last_interaction_*`); estendemos para um **log** das últimas N interações por jogador (dentro de `morale_events` com `kind` de interação), exibido na tela "Por quê".

**Alternativa descartada: trocar `morale` por um vetor multidimensional (felicidade/confiança/relação-com-clube) substituindo o inteiro.** Daria mais fidelidade, mas (a) quebraria todo consumidor atual de `Player.morale` (retirement, seleção de elenco, UI, IA de transferência), (b) exigiria migração destrutiva da coluna `morale`, e (c) explodiria o escopo P2. O ledger entrega 100% da *explicabilidade* pedida mantendo o inteiro como verdade canônica — o vetor fica como possível P3.

---

## 3. Architecture & components

### Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/engine/morale/driver-ledger.ts` | Criar | Tipos `MoraleDriver`/`MoraleDriverKind`; `sumDrivers()`; helper `driver()` puro |
| `src/engine/morale/personality.ts` | Criar | `derivePersonality()`, `personalityMoraleModifier()` puros |
| `src/engine/morale/chemistry.ts` | Criar | `computeChemistryGroups()`, `chemistryDriftBonus()` puros (RNG seedado) |
| `src/engine/morale/fallout.ts` | Criar | `nextFalloutState()` puro: máquina de estados de conflito |
| `src/engine/morale/morale-engine.ts` | Alterar | `computeMatchMoraleDelta` passa a retornar `MoraleDriver[]`; `computeWeeklyMoraleDrift` idem; manter `applyMoraleDelta` |
| `src/engine/morale/interactions.ts` | Alterar | `evaluatePraise/Criticism` recebem `personality` e retornam driver tipado |
| `src/engine/morale/squad-team-talk.ts` | Alterar | Encaixar personalidade no `computeTeamTalkDelta` por membro |
| `src/engine/press/press-engine.ts` | Alterar | `pressMoraleDelta` modulado por personalidade |
| `src/engine/balance.ts` | Alterar | Novas levers (modifiers de personalidade, limiar de fallout, bônus de química) |
| `src/database/schema.ts` | Alterar | Tabelas `morale_events`, `chemistry_links`; colunas `players.personality`, `players.fallout_state`; índices |
| `src/store/database-store.ts` | Alterar | `addColumnIfMissing` + `CREATE TABLE IF NOT EXISTS` das novas tabelas (migração de saves antigos) |
| `src/database/queries/morale.ts` | Criar | CRUD do ledger e de chemistry/fallout, save-isolado |
| `src/engine/morale/psychology-orchestrator.ts` | Criar | Orquestrador que toca DB (padrão `game-loop.ts`): grava drivers, recalcula química, escala fallout |
| `src/engine/game-loop.ts` | Alterar | Chamar o orquestrador nos pontos 9/7a/7b (substituindo os deltas crus) |
| `src/types/player.ts` | Alterar | Adicionar `personality: PersonalityArchetype`, `falloutState: FalloutState` em `Player` |
| `src/screens/squad/MoraleBreakdownScreen.tsx` | Criar | Tela "Por quê" da moral (kit de Design System) |
| `src/screens/squad/PlayerDetailScreen.tsx` | Alterar | Linkar para a tela e mostrar badge de personalidade |
| `src/navigation/*` | Alterar | Registrar a rota da tela "Por quê" |
| `src/i18n/pt.ts` + `src/i18n/en.ts` | Alterar | Chaves de drivers, arquétipos, química, fallout, tela |

### Contract (assinaturas TS exatas)

```ts
// src/engine/morale/driver-ledger.ts
export type MoraleDriverKind =
  | 'matchWin' | 'matchLoss' | 'matchDraw' | 'heavyDefeat'
  | 'benched' | 'benchStreak' | 'idleDrift'
  | 'praise' | 'criticism' | 'teamTalk' | 'press'
  | 'wage' | 'chemistry' | 'positionUnhappy';

export interface MoraleDriver {
  kind: MoraleDriverKind;
  delta: number;            // já arredondado p/ exibição? NÃO — float; arredondar só no apply
  season: number;
  week: number;
}
export function sumDrivers(drivers: readonly MoraleDriver[]): number;

// src/engine/morale/personality.ts
export type PersonalityArchetype =
  | 'leader' | 'professional' | 'mercenary'
  | 'temperamental' | 'dressingRoomProblem' | 'balanced';

export interface PersonalityInput {
  leadership: number; composure: number; aggression: number; decisions: number;
}
export function derivePersonality(input: PersonalityInput, seedComponent: number): PersonalityArchetype;
/** Multiplica/clampa um delta de driver conforme arquétipo. Pure. */
export function personalityMoraleModifier(
  archetype: PersonalityArchetype, kind: MoraleDriverKind, baseDelta: number,
): number;

// src/engine/morale/chemistry.ts
export interface ChemistryMember {
  id: number; nationality: string; age: number; seasonsAtClub: number; morale: number;
}
export interface ChemistryGroup { memberIds: number[]; cohesion: number; } // cohesion 0..1
export function computeChemistryGroups(members: readonly ChemistryMember[], rng: SeededRng): ChemistryGroup[];
/** Bônus/penalidade de drift que um grupo aplica ao membro nesta semana. Pure. */
export function chemistryDriftBonus(group: ChemistryGroup, member: ChemistryMember): number;

// src/engine/morale/fallout.ts
export type FalloutState = 'none' | 'unsettled' | 'wantsOut';
export interface FalloutInput {
  current: FalloutState; morale: number; lowStreakWeeks: number;
  archetype: PersonalityArchetype; recentCriticisms: number;
}
export function nextFalloutState(input: FalloutInput): FalloutState;

// src/engine/morale/morale-engine.ts (alterado)
export function computeMatchMoraleDelta(input: MatchMoraleInput, ctx: DriverCtx): MoraleDriver[];
export function computeWeeklyMoraleDrift(currentMorale: number, ctx: DriverCtx): MoraleDriver | null;
export interface DriverCtx { season: number; week: number; archetype: PersonalityArchetype; }
export function applyMoraleDelta(current: number, delta: number): number; // INALTERADO

// src/database/queries/morale.ts
export async function appendMoraleEvents(db: DbHandle, saveId: number, playerId: number, drivers: readonly MoraleDriver[]): Promise<void>;
export async function getMoraleEvents(db: DbHandle, saveId: number, playerId: number, limit: number): Promise<MoraleDriver[]>;
export async function pruneMoraleEvents(db: DbHandle, saveId: number, keepSeasons: number, currentSeason: number): Promise<void>;
export async function setPlayerPersonality(db: DbHandle, saveId: number, playerId: number, p: PersonalityArchetype): Promise<void>;
export async function setFalloutState(db: DbHandle, saveId: number, playerId: number, s: FalloutState): Promise<void>;
export async function replaceChemistryLinks(db: DbHandle, saveId: number, clubId: number, groups: readonly ChemistryGroup[]): Promise<void>;
export async function getChemistryGroups(db: DbHandle, saveId: number, clubId: number): Promise<ChemistryGroup[]>;
```

O orquestrador segue o padrão de `game-loop.ts` (recebe `db, saveId, ...`, sem React):

```ts
// src/engine/morale/psychology-orchestrator.ts
export async function applyMatchPsychology(
  db: DbHandle, saveId: number, clubId: number,
  matchInput: { outcome: 'win'|'draw'|'loss'; goalDiff: number; startingIds: Set<number> },
  season: number, week: number,
): Promise<void>;
export async function applyWeeklyPsychology(  // drift + química + fallout em semana ociosa/qualquer
  db: DbHandle, saveId: number, clubId: number, season: number, week: number, rng: SeededRng,
): Promise<{ newlyWantsOut: number[] }>;
```

---

## 4. Data flow

**Partida (substitui `game-loop.ts:477-491`):** `applyMatchPsychology` carrega elenco via `getPlayersByClub`, lê personalidade por jogador, chama `computeMatchMoraleDelta(input, ctx)` → `MoraleDriver[]`, aplica `personalityMoraleModifier` por driver, soma via `sumDrivers`, `applyMoraleDelta` no inteiro, `updatePlayerMorale`, e `appendMoraleEvents`. Os drivers individuais ficam no ledger para a tela "Por quê".

**Semana (substitui `game-loop.ts:721-742` para o clube humano):** `applyWeeklyPsychology` → (1) drift por jogador com `computeWeeklyMoraleDrift`; (2) `computeChemistryGroups` (RNG seedado por save+season+week) → `replaceChemistryLinks`; (3) por jogador, `chemistryDriftBonus` vira driver `chemistry`; (4) recalcula `consecutive_low_morale_weeks` (mantém SQL atual) e então `nextFalloutState`; (5) quem entra em `wantsOut` é `is_transfer_listed = 1` + `insertNewsItem`. Retorna `newlyWantsOut` para o game-loop emitir news/agregação.

**Geração de elenco:** `derivePersonality` roda no seed/criação de save (em `scripts/generate-seed-data.ts` ou no carregamento), gravando `players.personality`. Determinístico: mesma seed → mesmos arquétipos.

**Tela "Por quê":** `MoraleBreakdownScreen` lê `getMoraleEvents(db, saveId, playerId, N)` + personalidade + grupo de química + `falloutState` e renderiza a decomposição com o kit do Design System (Card/StatBar/Text/Icon/EmptyState).

---

## 5. Schema changes

**`src/database/schema.ts`** — base para saves novos:

```sql
-- novas colunas em players
personality   TEXT NOT NULL DEFAULT 'balanced',
fallout_state TEXT NOT NULL DEFAULT 'none'

CREATE TABLE IF NOT EXISTS morale_events (
  id        INTEGER PRIMARY KEY,
  save_id   INTEGER NOT NULL REFERENCES save_games(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  kind      TEXT    NOT NULL,
  delta     REAL    NOT NULL,
  season    INTEGER NOT NULL,
  week      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chemistry_links (
  id        INTEGER PRIMARY KEY,
  save_id   INTEGER NOT NULL REFERENCES save_games(id),
  club_id   INTEGER NOT NULL REFERENCES clubs(id),
  group_idx INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(id),
  cohesion  REAL    NOT NULL
);
```

Índices (junto ao bloco `SAVE_ID_INDEXES_SQL`/índices em `schema.ts:468+`):

```sql
CREATE INDEX IF NOT EXISTS idx_morale_events_player ON morale_events(save_id, player_id, season, week);
CREATE INDEX IF NOT EXISTS idx_chem_links_club      ON chemistry_links(save_id, club_id);
```

**`src/store/database-store.ts`** — migração de saves existentes (mesmo padrão de `addColumnIfMissing` em `:91-160` e `CREATE TABLE IF NOT EXISTS` em `:77-148`):

```ts
await addColumnIfMissing(db, 'players', 'personality',   "TEXT NOT NULL DEFAULT 'balanced'");
await addColumnIfMissing(db, 'players', 'fallout_state', "TEXT NOT NULL DEFAULT 'none'");
await db.execAsync(`CREATE TABLE IF NOT EXISTS morale_events (...);`);
await db.execAsync(`CREATE TABLE IF NOT EXISTS chemistry_links (...);`);
await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_morale_events_player ...;`);
```

**Save-isolation:** todas as queries em `morale.ts` recebem `(db, saveId, ...)` e filtram `WHERE save_id = ?`, igual a `interactions.ts:18-49`. Ids de jogador continuam globais com offset por save (convenção atual). `morale_events` é podada por `keepSeasons` no rollover de temporada (`game-loop.ts:805-809`) para não crescer sem limite.

---

## 6. Error handling & edge cases

- **Saves antigos sem personalidade:** colunas têm DEFAULT; uma rotina lazy no carregamento atribui `derivePersonality` a quem está com `'balanced'` default (idempotente, determinística pela seed do save).
- **Clamp:** o inteiro `morale` permanece a verdade; `applyMoraleDelta` (`morale-engine.ts:42-44`) já clampa [1,100]. O ledger guarda deltas pré-clamp — a tela mostra "efetivo vs. solicitado" quando bateu no teto/piso (espelha a lógica de `effective` em `squad-team-talk.ts:37`).
- **Elenco vazio / sem forma recente:** `computeChemistryGroups([])` → `[]`; `getRecentForm` já devolve `avgRating: 0` sem jogos (`player-stats.ts:152`).
- **Fallout em loop:** `nextFalloutState` é monotônico com histerese — só regride para `none` quando moral sobe acima de `MORALE_DRIFT_TARGET` por X semanas, evitando flip-flop e venda forçada acidental.
- **wantsOut e jogador essencial:** auto-transfer-list **não** vende sozinho; só sinaliza + reusa `processPendingOffers` existente. Sem deadlock com a IA de transferências.
- **Determinismo:** química usa `SeededRng` derivado de `(saveSeed, season, week)`; personalidade de `(saveSeed, playerId)`. Zero `Math.random/Date.now/ORDER BY RANDOM`. Ledger ordena por `(season, week, id)` — `id` autoincrement determinístico na sequência de escrita.
- **Cooldown de interação:** mantém `hasInteractedThisWeek` (`interactions.ts:28-37`); criticism repetida só conta para fallout quando legitimamente registrada.

---

## 7. Testing strategy (TDD, better-sqlite3 real, nunca mock)

**Motor puro (unit):**
- `personality.test.ts` — golden: `leadership` alto + `composure` alto → `leader`; `aggression` alto + `composure` baixo → `temperamental`; mesma seed → mesmo arquétipo (determinismo). Edge: empate de atributos resolve estável.
- `personalityMoraleModifier` — líder amortece `benched`; mercenário amplifica `wage`; temperamental amplifica `criticism`; `professional` ~neutro.
- `driver-ledger.test.ts` — `sumDrivers` soma e ignora vazio; tipos cobrem todos os `kind`.
- `morale-engine.test.ts` (atualizado) — `computeMatchMoraleDelta` agora devolve drivers cuja soma == delta antigo para `archetype: 'balanced'` (não-regressão dos valores de `balance.ts:88-95`).
- `chemistry.test.ts` — mesmos membros + mesma seed → mesmos grupos; coesão sobe com nacionalidade/idade compartilhadas; `chemistryDriftBonus` positivo em grupo feliz, negativo com membro infeliz.
- `fallout.test.ts` — máquina: `none→unsettled` em streak baixo + arquétipo de risco; `unsettled→wantsOut` com criticism repetida; histerese de volta a `none`.

**Orquestrador + queries (integração, SQLite real):**
- `psychology-orchestrator.test.ts` — cria save em memória (`better-sqlite3`), popula elenco, roda `applyMatchPsychology` e verifica: `morale` atualizada **e** `morale_events` contém os drivers somando ao delta; `applyWeeklyPsychology` grava `chemistry_links`, escala fallout, marca `is_transfer_listed` e retorna `newlyWantsOut`.
- `morale-queries.test.ts` — append/get/prune respeitando `save_id` (dois saves não vazam); `pruneMoraleEvents` mantém só `keepSeasons`.
- **Save-isolation:** asserts cruzados entre dois `saveId` em todos os testes de query.

**UI:** validar `MoraleBreakdownScreen` no browser (Playwright MCP) — drivers listados, badge de personalidade, EmptyState sem eventos.

---

## 8. Dependencies & sequencing

- **Precede:** nada bloqueia o motor puro (independe de UI). A tela "Por quê" depende do **Design System** (`2026-06-20-design-system-premium-design.md`) D3/D4 — usa Card/StatBar/Text/Icon/EmptyState/Toast do novo kit, não estilos inline (o `PlayerDetailScreen.tsx` atual ainda usa `StyleSheet` cru e `StatBar` legado em `:65` — a migração visual vem do épico D).
- **Reusa, não reescreve:** team-talk (`squad-team-talk.ts`), press (`press-engine.ts`), interações (`interactions.ts`), retirement por streak (`game-loop.ts:735-742`), news (`insertNewsItem`), board trust (`board.ts:111-117`).
- **Ordem sugerida:** (1) `driver-ledger` + refactor `morale-engine` retornando drivers (não-regressão); (2) `personality` + schema/migração; (3) queries `morale.ts`; (4) `chemistry` + `fallout`; (5) `psychology-orchestrator` + wiring no `game-loop`; (6) tela "Por quê" (após Design System). Sinergia direta com **board-stakes** (`2026-05-31-board-stakes-design.md`) via `confidenceDelta` da press.

---

## 9. Out of scope

- Vetor multidimensional de moral (felicidade/confiança/relação) — fica P3.
- Psicologia para clubes da **IA** (escopo atual de low-morale é o clube humano, `game-loop.ts:745`); a IA mantém moral simples até um épico dedicado.
- Negociação de "happiness" estilo FM (promessas de reforço, ultimatos) — futuro.
- Briga física/cartão por conflito dentro de partida (motor de match intocado).
- Reescrita visual do `PlayerDetailScreen` além do link + badge (vem do Design System).
- Tradução de novas levers em UI de ajuste — `balance.ts` permanece código.

## 10. Spec self-review

- **Placeholder scan:** sem "TBD"/"FIXME"/`???`. Todas as levers nomeadas (modifiers de personalidade, limiar de fallout, bônus de química) entram em `balance.ts` junto às `MORALE_*` existentes (`balance.ts:88-95`).
- **Consistência interna:** tipos do Contract (§3) batem com data flow (§4), schema (§5) e testes (§7); `MoraleDriverKind` usado uniformemente; orquestrador segue assinatura `(db, saveId, ...)` como `game-loop.ts`.
- **Refs de código verificadas (file:line reais):** `schema.ts:92,103,106-107`; `player.ts:12-18,42`; `morale-engine.ts:21-44`; `interactions.ts` (engine) `25-52`; `squad-team-talk.ts:32-44`; `press-engine.ts:71-95`; `game-loop.ts:477-491,721-742,805-809`; `balance.ts:39,41,88-95`; `interactions.ts` (queries) `18-49`; `board.ts:111-117`; `save.ts:25-33`; `database-store.ts:77-160`; `player-stats.ts:152`; `rng.ts` (`SeededRng`). Determinismo e save-isolation conferidos contra a convenção existente.
