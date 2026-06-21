# Design: Dinastia & Legado

**Epic:** c1-dynasty · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict

**Goal:** Transformar o histórico raso de temporada num arco de carreira persistente — Hall da Fama, recordes all-time, linha do tempo do técnico, sagas de temporada e rivalidades/clássicos com bônus de derby — para sustentar a sessão diária de jogo (retention 1×/dia).

---

## 1. Problema / estado atual

O save já arquiva resultados de temporada, mas o legado é raso e disperso, e nada do que o jogador acumula ao longo dos anos é apresentado como "história do clube/carreira".

**O que existe hoje (aterrado no código):**

- **Arquivamento por temporada.** `archiveSeason(db, saveId, season)` (`src/engine/history/season-archiver.ts:434`) grava, a cada fim de temporada, em `season_competition_results`, `season_relegated`, `season_promoted`, `season_awards` (top 5 artilheiros/assistentes + `mvp`/`breakthrough`) e `season_player_titles` (snapshot do elenco campeão, `season-archiver.ts:295`). É chamado uma vez no fim de temporada por `game-loop.ts:811`. **Limitação:** é tudo *por temporada*. Não existe nenhuma agregação all-time (artilheiro histórico do clube, recorde de maior goleada, jogador com mais jogos).

- **Queries de histórico.** `src/database/queries/history.ts` expõe `getSeasonSummary` (`:84`), `getCompetitionHistory` (`:141`), `getClubTrophies` (`:167`, agrega títulos/vices por competição), `getPlayerAwards` (`:215`) e `getPlayerTitles` (`:233`). **Limitação:** `getClubTrophies` é o único agregador multi-temporada e só conta troféus; não há "Hall da Fama" (jogadores marcantes) nem recordes numéricos.

- **Reputação de técnico (carreira).** `save_games.manager_reputation` (`schema.ts:315`, default 50), lida/escrita por `getManagerReputation`/`setManagerReputation` (`src/database/queries/save.ts:38,45`), acumulada em fim de temporada por `computeManagerReputationDelta` (`src/engine/board/manager-reputation-engine.ts:26`) chamada em `season-end-eval.ts:199`. Ofertas de emprego e troca de clube existem: `acceptJobOffer` (`src/engine/board/accept-job-offer.ts:32`) troca `player_club_id`, reseta `board_trust`, mas **mantém** a reputação do técnico. **Limitação:** não há registro de *qual clube o técnico dirigiu em qual temporada*, nem de demissões/contratações. A "linha do tempo da carreira" é impossível de reconstruir — `acceptJobOffer` sobrescreve `player_club_id` sem deixar trilha.

- **Telas.** `HistoryScreen` (`src/screens/history/HistoryScreen.tsx`) mostra só o resumo de UMA temporada selecionada por chips, com placeholders crus tipo `Club ${entry.championClubId}` e `Player ${topScorer.playerId}` (`HistoryScreen.tsx:108,121`) — nem resolve nome de clube/jogador. `src/screens/career/` tem só `AchievementsScreen.tsx` e `JobOffersScreen.tsx`. **Não existe** tela de Hall da Fama, recordes, linha do tempo, nem rivalidades. A `HistoryScreen` usa estilos inline crus (`StyleSheet.create` com `colors`/`spacing` do tema), pré-Design System.

- **Rivalidades.** Inexistentes. O motor de partida aplica vantagem de casa escalada por público (`homeAdvantageMultiplier`, `src/engine/simulation/match-engine.ts:201`) mas não há conceito de derby/clássico, head-to-head, nem bônus de atmosfera/moral por rivalidade. Clubes têm `country_id` e `league_id` (`schema.ts:62,63`) — base para derivar proximidade — mas nenhuma tabela liga dois clubes como rivais.

**Por que é raso:** o jogador que joga 1×/dia por meses não tem nenhum artefato cumulativo que dê sentido de progressão de *legado* — só uma lista de temporadas isoladas. Falta a camada que transforma 30 temporadas arquivadas em "a dinastia do seu clube" e "a sua carreira como técnico".

---

## 2. Approach

Construir uma **camada de legado derivada e materializada**, em três motores puros novos + um orquestrador de fim de temporada, mais cinco telas sobre o kit do Design System.

Princípios:

1. **Derivar do que já é arquivado, não duplicar.** Hall da Fama e recordes all-time são *agregações* de `season_awards`, `season_player_titles`, `match_events`/`fixtures` e `season_competition_results` — dados já gravados por `archiveSeason`. Materializamos snapshots em tabelas novas (`club_legends`, `club_records`) por performance de leitura na tela (evita varrer todo o histórico a cada abertura), recalculados de forma idempotente a cada fim de temporada.

2. **Trilha de carreira do técnico via append-only.** Nova tabela `manager_career` com uma linha por (save, temporada): clube dirigido, divisão, posição final, troféus, reputação ao fim, e `exit_reason` (`stayed`/`fired`/`resigned`). Preenchida em `season-end-eval` (retenção/demissão já são conhecidas ali via `board.consequence`/`isManagerDismissed`) e em `acceptJobOffer` (resignação). Reconstrói a linha do tempo sem precisar inferir.

3. **Rivalidades determinísticas geradas uma vez por save.** Nova tabela `rivalries` (par ordenado de clubes + `intensity` + `origin`). Geradas deterministicamente no início do save a partir de: mesma liga (clássico de divisão), mesmo país e divisões adjacentes (rivalidade regional), e reforçadas ao longo do jogo por histórico de confrontos decisivos (head-to-head em finais/títulos disputados). Usar `SeededRng` semeado por `saveId` para qualquer desempate. Bônus de derby (atmosfera/moral) aplicado no motor de partida quando o confronto é entre rivais.

4. **Sagas de temporada** = narrativa derivada read-only (sem tabela nova): um motor puro que, dado o histórico arquivado de uma temporada do clube do jogador, classifica a temporada num arquétipo ("título histórico", "luta contra o rebaixamento", "ano de transição", "ascensão") com texto i18n. Renderizada na linha do tempo.

**Alternativa descartada — calcular Hall/recordes on-the-fly nas queries (sem tabelas materializadas).**
Mais simples e sem schema novo, mas as queries de Hall da Fama / recordes all-time fazem JOIN+GROUP BY sobre `match_events` (que cresce ~milhares de linhas/temporada) cruzado com `season_player_titles`/`season_awards`. Numa carreira de 20+ temporadas a tela ficaria lenta no SQLite do dispositivo, e a regra de negócio "lenda do clube" (peso composto de títulos+aparições+gols+prêmios) ficaria espalhada em SQL difícil de testar. Materializar permite um motor puro testável (`legends-engine.ts`) e leitura O(linhas exibidas). O custo — recalcular no fim de temporada — é amortizado (1×/temporada) e idempotente.

**Alternativa descartada — rivalidades 100% estáticas no seed.**
Geração no seed (`scripts/generate-seed-data.ts`) fixaria os clássicos antes do jogador interagir e não capturaria rivalidades *emergentes* (dois clubes que sempre decidem o título). Optamos por geração determinística no início do save + reforço por head-to-head, mantendo determinismo via `SeededRng(saveId)`.

---

## 3. Architecture & components

### Arquivos a criar/alterar

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/engine/legacy/legends-engine.ts` | Criar | Puro. Calcula o "legend score" de cada jogador do clube a partir de aparições, gols, prêmios e títulos; retorna ranking. Zero DB. |
| `src/engine/legacy/records-engine.ts` | Criar | Puro. Dados brutos all-time → recordes (artilheiro histórico, mais jogos, maior goleada, mais títulos numa temporada, maior sequência invicta). Zero DB. |
| `src/engine/legacy/rivalry-engine.ts` | Criar | Puro. Gera pares de rivalidade determinísticos (proximidade/divisão/país) e calcula `intensity` + reforço por head-to-head. Recebe `SeededRng`. Zero DB. |
| `src/engine/legacy/saga-engine.ts` | Criar | Puro. Classifica uma temporada do clube num arquétipo de saga + chave i18n. Zero DB. |
| `src/engine/legacy/derby-bonus.ts` | Criar | Puro. Dado (homeClubId, awayClubId, intensity), retorna multiplicador de atmosfera e bônus de moral aplicáveis. Zero DB. |
| `src/engine/legacy/legacy-archiver.ts` | Criar | Orquestrador (padrão `season-archiver.ts`): lê histórico via queries, roda os motores puros, materializa `club_legends`/`club_records`, reforça `rivalries`. `(db, saveId, season)`. |
| `src/database/queries/legacy.ts` | Criar | Queries tipadas (todas `(db, saveId, ...)`): legends, records, rivalries, manager_career, head-to-head. |
| `src/database/schema.ts` | Alterar | Novas tabelas + `TABLE_NAMES` + índices. |
| `src/store/database-store.ts` | Alterar | Espelhar `CREATE TABLE`/índices novos (runtime expo-sqlite), igual ao bloco existente em `:229`. |
| `src/types/legacy.ts` | Criar | Tipos compartilhados (`Legend`, `ClubRecord`, `Rivalry`, `ManagerCareerEntry`, `SeasonSaga`). |
| `src/engine/board/accept-job-offer.ts` | Alterar | Antes de trocar `player_club_id`, fechar a entrada `manager_career` da temporada com `exit_reason='resigned'`. |
| `src/engine/season/season-end-eval.ts` | Alterar | Gravar/fechar a entrada `manager_career` da temporada (clube, posição, troféus, rep, `stayed`/`fired`); chamar `legacy-archiver` após `archiveSeason`. |
| `src/engine/game-loop.ts` | Alterar | Após `archiveSeason` (`:811`), chamar `archiveLegacy(db, saveId, season)`. |
| `src/engine/simulation/match-engine.ts` | Alterar | Aceitar `derbyBonus` opcional e aplicá-lo junto da vantagem de casa (`:201`/`:372`). |
| `src/screens/career/HallOfFameScreen.tsx` | Criar | Hall da Fama do clube (lendas rankeadas). Kit DS. |
| `src/screens/career/RecordsScreen.tsx` | Criar | Recordes all-time do clube. Kit DS. |
| `src/screens/career/ManagerTimelineScreen.tsx` | Criar | Linha do tempo da carreira do técnico + sagas. Kit DS. |
| `src/screens/career/RivalriesScreen.tsx` | Criar | Rivalidades do clube + head-to-head. Kit DS. |
| `src/screens/history/HistoryScreen.tsx` | Alterar | Migrar para o kit DS; resolver nomes reais; adicionar saga da temporada. |
| `src/navigation/*` | Alterar | Registrar as 4 telas novas (sub-stack de "Legado" / "Carreira"). |
| `src/i18n/pt.ts` + `src/i18n/en.ts` | Alterar | Chaves `legacy.*`, `records.*`, `rivalry.*`, `saga.*`, `manager_career.*` (paridade pt/en). |

### Contract (assinaturas TS exatas)

```ts
// src/types/legacy.ts
export interface Legend {
  playerId: number;
  clubId: number;
  legendScore: number;        // 0..100 normalizado
  appearances: number;
  goals: number;
  trophies: number;
  individualAwards: number;    // mvp + breakthrough + top_scorer(rank1) + top_assister(rank1)
  firstSeason: number;
  lastSeason: number;
}

export type ClubRecordType =
  | 'all_time_top_scorer'      // valor = gols, holderId = playerId
  | 'most_appearances'         // valor = jogos, holderId = playerId
  | 'biggest_win'              // valor = saldo, fixtureRef = fixtureId
  | 'biggest_defeat'
  | 'most_trophies_in_season'  // valor = nº de troféus, season = temporada
  | 'longest_unbeaten';        // valor = nº de jogos

export interface ClubRecord {
  type: ClubRecordType;
  clubId: number;
  value: number;
  holderId: number | null;     // playerId quando aplicável
  season: number | null;       // temporada do feito
  fixtureRef: number | null;   // fixture quando o recorde é um placar
  detail: string;              // ex.: "5-0 vs Club 12" (cru; tela resolve nomes)
}

export type RivalryOrigin = 'derby' | 'division' | 'regional' | 'historic';

export interface Rivalry {
  clubAId: number;             // sempre o menor id (par ordenado canônico)
  clubBId: number;
  intensity: number;           // 1..100
  origin: RivalryOrigin;
}

export type ManagerExitReason = 'stayed' | 'fired' | 'resigned';

export interface ManagerCareerEntry {
  season: number;
  clubId: number;
  divisionLevel: number;
  leaguePosition: number | null;
  totalTeams: number;
  trophies: number;            // títulos conquistados naquela temporada com esse clube
  managerReputation: number;   // rep ao FIM da temporada
  exitReason: ManagerExitReason;
}

export type SeasonSagaArchetype =
  | 'historic_title' | 'title_race' | 'promotion' | 'relegation_fight'
  | 'relegated' | 'transition' | 'rebuild' | 'overachieved' | 'underachieved';

export interface SeasonSaga {
  season: number;
  archetype: SeasonSagaArchetype;
  titleKey: string;            // chave i18n 'saga.<archetype>.title'
  bodyKey: string;             // chave i18n 'saga.<archetype>.body'
  vars: Record<string, string | number>;
}
```

```ts
// src/engine/legacy/legends-engine.ts  (PURO)
export interface LegendCandidate {
  playerId: number; clubId: number;
  appearances: number; goals: number; assists: number;
  trophies: number; individualAwards: number;
  firstSeason: number; lastSeason: number;
}
export function rankLegends(candidates: readonly LegendCandidate[], limit: number): Legend[];

// src/engine/legacy/records-engine.ts  (PURO)
export interface RecordInputs {
  clubId: number;
  scorers: ReadonlyArray<{ playerId: number; goals: number }>;
  appearances: ReadonlyArray<{ playerId: number; games: number }>;
  results: ReadonlyArray<{ fixtureId: number; season: number; gf: number; ga: number; opponentId: number }>;
  trophiesBySeason: ReadonlyMap<number, number>;
}
export function computeClubRecords(inputs: RecordInputs): ClubRecord[];

// src/engine/legacy/rivalry-engine.ts  (PURO)
export interface RivalryClub { id: number; leagueId: number; countryId: number; divisionLevel: number; reputation: number; }
export interface HeadToHead { clubAId: number; clubBId: number; meetings: number; finals: number; titleDeciders: number; }
export function generateRivalries(clubs: readonly RivalryClub[], rng: SeededRng): Rivalry[];
export function reinforceIntensity(base: Rivalry, h2h: HeadToHead): number; // nova intensity 1..100

// src/engine/legacy/derby-bonus.ts  (PURO)
export interface DerbyBonus { atmosphereMult: number; homeMoraleBonus: number; awayMoraleBonus: number; }
export function deriveDerbyBonus(intensity: number | null): DerbyBonus; // intensity null → neutro (mult 1, bônus 0)

// src/engine/legacy/saga-engine.ts  (PURO)
export interface SagaInput {
  season: number; leaguePosition: number | null; totalTeams: number;
  expectedPosition: number | null;     // alvo do board, p/ over/underachieve
  wonLeague: boolean; wonCup: boolean; wasPromoted: boolean; wasRelegated: boolean;
  trophies: number;
}
export function classifySeasonSaga(input: SagaInput): SeasonSaga;

// src/engine/legacy/legacy-archiver.ts  (orquestrador, padrão season-archiver)
export async function archiveLegacy(db: DbHandle, saveId: number, season: number): Promise<void>;
```

```ts
// src/database/queries/legacy.ts  (todas (db, saveId, ...))
export async function getClubLegends(db: DbHandle, saveId: number, clubId: number): Promise<Legend[]>;
export async function getClubRecords(db: DbHandle, saveId: number, clubId: number): Promise<ClubRecord[]>;
export async function getRivalries(db: DbHandle, saveId: number, clubId: number): Promise<Rivalry[]>;
export async function getRivalry(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<Rivalry | null>;
export async function getHeadToHead(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<HeadToHead>;
export async function getManagerCareer(db: DbHandle, saveId: number): Promise<ManagerCareerEntry[]>;
export async function upsertManagerCareerEntry(db: DbHandle, saveId: number, entry: ManagerCareerEntry): Promise<void>;
export async function upsertRivalry(db: DbHandle, saveId: number, r: Rivalry): Promise<void>;
export async function replaceClubLegends(db: DbHandle, saveId: number, clubId: number, legends: Legend[]): Promise<void>;
export async function replaceClubRecords(db: DbHandle, saveId: number, clubId: number, records: ClubRecord[]): Promise<void>;
```

`DbHandle` é o tipo importado de `@/database/queries/players` (igual `history.ts:1`, `board.ts:2`).

---

## 4. Data flow

**Geração inicial de rivalidades (1× por save):** ao criar o save (após o seed inserir clubes), um passo de bootstrap lê todos os clubes, monta `RivalryClub[]`, chama `generateRivalries(clubs, new SeededRng(saveId))` e persiste via `upsertRivalry`. Determinístico: mesmo save → mesmas rivalidades.

**Durante a partida:** quando o motor monta uma fixture, o orquestrador de match-day busca `getRivalry(db, saveId, home, away)`; se existir, deriva `deriveDerbyBonus(intensity)` e passa `derbyBonus` para `simulateMatch` em `match-engine.ts`, que o combina com a vantagem de casa existente (`:372`) e injeta o bônus de moral nos elencos antes de calcular força. Não-rival → `intensity = null` → bônus neutro (sem mudança de comportamento).

**Fim de temporada (`game-loop.ts:811`, dentro do bloco `isSeasonEnd`):**
1. `archiveSeason(...)` grava o histórico bruto da temporada (já existe).
2. `archiveLegacy(db, saveId, season)` (novo) roda em seguida:
   - lê agregados via queries de `history.ts` + novas queries de aparições/gols all-time;
   - `rankLegends` → `replaceClubLegends` (do clube do jogador);
   - `computeClubRecords` → `replaceClubRecords`;
   - recalcula head-to-head dos confrontos da temporada e `reinforceIntensity` nas rivalidades afetadas → `upsertRivalry`.
3. `season-end-eval.ts` (após resolver board/manager-rep, `:199`) chama `upsertManagerCareerEntry` com a entrada da temporada: clube, posição, troféus, rep final, e `exit_reason = isManagerDismissed(board.consequence) ? 'fired' : 'stayed'`.

**Troca de clube (`acceptJobOffer.ts:32`):** antes do `UPDATE save_games SET player_club_id` (`:44`), fechar a entrada de carreira da temporada que termina com `exit_reason='resigned'` (sobrescreve o `'stayed'` se já gravado). A trilha fica completa: cada temporada tem clube + motivo de saída.

**Leitura nas telas:** Hall/Records/Rivalries leem os snapshots materializados (rápido); ManagerTimeline lê `getManagerCareer` + roda `classifySeasonSaga` por temporada (derivado, sem tabela).

---

## 5. Schema changes

Adicionar a `schema.ts` (e espelhar em `src/store/database-store.ts`, bloco `CREATE TABLE`, igual ao padrão `:229`), e incluir os nomes em `TABLE_NAMES` (`schema.ts:1`).

```sql
-- Snapshot materializado: lendas por clube. Recalculado idempotentemente a cada fim de temporada.
CREATE TABLE IF NOT EXISTS club_legends (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id       INTEGER NOT NULL REFERENCES save_games(id),
  club_id       INTEGER NOT NULL REFERENCES clubs(id),
  player_id     INTEGER NOT NULL REFERENCES players(id),
  legend_score  INTEGER NOT NULL,
  appearances   INTEGER NOT NULL,
  goals         INTEGER NOT NULL,
  trophies      INTEGER NOT NULL,
  individual_awards INTEGER NOT NULL,
  first_season  INTEGER NOT NULL,
  last_season   INTEGER NOT NULL,
  UNIQUE(save_id, club_id, player_id)
);

-- Snapshot materializado: recordes all-time por clube.
CREATE TABLE IF NOT EXISTS club_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  club_id     INTEGER NOT NULL REFERENCES clubs(id),
  record_type TEXT    NOT NULL,
  value       INTEGER NOT NULL,
  holder_id   INTEGER,            -- player_id quando aplicável
  season      INTEGER,
  fixture_ref INTEGER,            -- fixture do placar recorde
  detail      TEXT    NOT NULL DEFAULT '',
  UNIQUE(save_id, club_id, record_type)
);

-- Rivalidades: par ordenado canônico (club_a_id < club_b_id). Geradas 1×/save, reforçadas por h2h.
CREATE TABLE IF NOT EXISTS rivalries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  club_a_id   INTEGER NOT NULL REFERENCES clubs(id),
  club_b_id   INTEGER NOT NULL REFERENCES clubs(id),
  intensity   INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 100),
  origin      TEXT    NOT NULL,
  UNIQUE(save_id, club_a_id, club_b_id)
);

-- Trilha append-only da carreira do técnico. Uma linha por (save, temporada).
CREATE TABLE IF NOT EXISTS manager_career (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id       INTEGER NOT NULL REFERENCES save_games(id),
  season        INTEGER NOT NULL,
  club_id       INTEGER NOT NULL REFERENCES clubs(id),
  division_level INTEGER NOT NULL,
  league_position INTEGER,
  total_teams   INTEGER NOT NULL,
  trophies      INTEGER NOT NULL DEFAULT 0,
  manager_reputation INTEGER NOT NULL,
  exit_reason   TEXT    NOT NULL DEFAULT 'stayed',
  UNIQUE(save_id, season)
);

CREATE INDEX IF NOT EXISTS idx_legends_club   ON club_legends(save_id, club_id);
CREATE INDEX IF NOT EXISTS idx_records_club   ON club_records(save_id, club_id);
CREATE INDEX IF NOT EXISTS idx_rivalries_save ON rivalries(save_id, club_a_id, club_b_id);
CREATE INDEX IF NOT EXISTS idx_mgr_career     ON manager_career(save_id, season);
```

**Notas de save-isolation:** todas as tabelas têm `save_id` e toda query recebe `(db, saveId, ...)` — segue o padrão de `history.ts`/`board.ts`. IDs de clube/jogador já vivem no espaço disjunto `[saveId*SAVE_ID_STRIDE, ...)` (`src/database/constants.ts:7`), então não há colisão entre saves. `manager_career` é por save (não por clube): a unicidade é `(save_id, season)` porque numa temporada o técnico dirige um clube só. `rivalries` usa par canônico `club_a_id < club_b_id` para evitar duplicar (A,B)/(B,A) — invariante garantida no `upsertRivalry` e no `rivalry-engine`.

---

## 6. Error handling & edge cases

- **Carreira nova (temporada 1, sem histórico):** `archiveLegacy` é chamado só em `isSeasonEnd`, então roda a partir do fim da temporada 1. Hall/Records ficam vazios até lá → telas usam `EmptyState` do kit DS. `ManagerTimeline` mostra a temporada corrente como "em andamento" (sem `exit_reason` ainda).
- **Idempotência:** `replaceClubLegends`/`replaceClubRecords` fazem `DELETE` do clube + reinsert (snapshot completo), e `upsertManagerCareerEntry`/`upsertRivalry` usam `INSERT OR REPLACE` na chave única. Rodar o fim de temporada duas vezes (advance-reload) produz o mesmo estado — espelha a disciplina `INSERT OR IGNORE` do `season-archiver`.
- **Técnico demitido e desempregado:** `save_games.unemployed` (`schema.ts:317`). Numa temporada sem clube não se grava `manager_career` (não há clube dirigido); a linha do tempo mostra um gap "sem clube".
- **Resignação sobrescreve retenção:** se `season-end-eval` já gravou `'stayed'` e o jogador aceita oferta, `acceptJobOffer` sobrescreve para `'resigned'` via `INSERT OR REPLACE` (chave `(save_id, season)`). Ordem garantida: aceitar oferta acontece *após* o fim de temporada.
- **Final empatado / placar recorde:** `biggest_win`/`biggest_defeat` só consideram fixtures com `home_goals`/`away_goals` não-nulos (igual aos guards de `season-archiver.ts:73`).
- **Empate de legend_score / record:** desempate determinístico por `playerId ASC` (sem `ORDER BY RANDOM`).
- **Rivalidade entre clube do jogador e ele mesmo / clube inexistente:** `generateRivalries` ignora `id` igual; queries por par normalizam para `min,max`.
- **Sem rival na partida:** `getRivalry` → `null` → `deriveDerbyBonus(null)` retorna `{ atmosphereMult: 1, homeMoraleBonus: 0, awayMoraleBonus: 0 }` — comportamento de partida inalterado (sem regressão nos baselines de balanceamento).

---

## 7. Testing strategy

TDD obrigatório (toca engine/database) com **better-sqlite3 real em memória**, nunca mock — segue `.claude/rules/testing.md` e o padrão dos testes de `season-archiver`/`board`.

**Motores puros (unit, sem DB):**
- `legends-engine`: golden — ranking por score composto (títulos+aparições+gols+prêmios) com pesos conhecidos; edge — empate resolvido por `playerId`, jogador com 0 aparições excluído, `limit` respeitado.
- `records-engine`: golden — artilheiro histórico, mais jogos, maior goleada (saldo) e maior sequência invicta sobre conjunto fixo; edge — clube sem jogos, empate de placar (mantém o de menor `fixtureId`).
- `rivalry-engine`: **determinismo** — mesmo `SeededRng(seed)` + mesmos clubes → array idêntico (igualdade profunda, duas execuções); golden — clubes da mesma liga viram `division`, mesmo país + divisão adjacente viram `regional`; `reinforceIntensity` cresce com `titleDeciders` e satura em 100.
- `derby-bonus`: golden — `intensity` alta → `atmosphereMult > 1` e bônus de moral > 0; `null` → neutro; monotonicidade (intensity maior ⇒ bônus ≥).
- `saga-engine`: golden — campeão invicto vira `historic_title`; alvo do board superado vira `overachieved`; rebaixado vira `relegated`; classificação cobre os 9 arquétipos.

**Orquestrador + queries (integração, DB real):**
- `legacy-archiver`: montar um save com 2–3 temporadas de fixtures/eventos/awards arquivados, rodar `archiveLegacy` e assertar linhas em `club_legends`/`club_records`; rodar 2× e confirmar idempotência (mesmo conteúdo).
- `manager_career`: fim de temporada grava `'stayed'`; `acceptJobOffer` sobrescreve para `'resigned'`; `getManagerCareer` retorna ordenado por temporada.
- save-isolation: dois saves com `archiveLegacy` não vazam lendas/recordes/rivalidades entre si.
- `match-engine` com `derbyBonus`: partida idêntica com bônus neutro == sem bônus (não-regressão); bônus positivo aumenta força/moral do mandante de forma determinística (mesma seed).

**Antes de declarar pronto:** `npm test`, `npx tsc --noEmit`, e validar as 4 telas novas + HistoryScreen no browser (Playwright MCP), conforme CLAUDE.md do subprojeto.

---

## 8. Dependencies & sequencing

**Precede este épico:**
- **Design System Premium** (`2026-06-20-design-system-premium-design.md`, etapas D3/D4): as 4 telas novas e a migração da `HistoryScreen` consomem o novo kit (`Card`, `Button`, `StatBar`, `Text` semânticos, `Icon`, `EmptyState`, `Toast`, `useConfirm`). A camada de dados (motores + schema + queries) **não** depende do DS e pode ser implementada em paralelo; só a parte de UI bloqueia em D3/D4. Sequenciar: (1) schema+motores+queries+archiver (independente), (2) wiring em game-loop/season-end-eval/accept-job-offer, (3) telas após DS pronto.
- Base já existente: `season-history` (`2026-04-14-feature-a-season-history-design.md`) e `reputation-board-integration` (`2026-05-12-reputation-board-integration-design.md`) — fornecem `season_*`, `manager_reputation`, `acceptJobOffer`. Sem eles este épico não tem dados-fonte.

**Relação com outros épicos de carreira:** é o C1 (profundidade de carreira #1) e estabelece as tabelas de legado que épicos posteriores (ex.: narrativa de imprensa sobre rivalidades, conquistas baseadas em recordes) podem consumir. `rivalries` + `derby-bonus` interagem com o épico AI-World-Alive (`2026-05-31-ai-world-alive-design.md`) caso este passe a gerar manchetes de clássicos.

---

## 9. Out of scope

- Rivalidades **entre técnicos** (nemesis pessoal) — só clube×clube nesta entrega.
- Hall da Fama **global/da liga** (apenas do clube do jogador é materializado; o motor é genérico, mas só materializamos o clube do save por custo).
- Recordes **negativos cômicos** além de `biggest_defeat` (ex.: pior sequência) — fora.
- **Aposentadoria de números de camisa**, estátuas, e qualquer cosmético 3D.
- Edição manual de rivalidades pelo jogador.
- Migração de saves antigos para preencher `manager_career` retroativamente — saves criados antes do épico começam a trilha a partir da temporada corrente (as tabelas são `IF NOT EXISTS`; histórico passado não é reconstruído).
- Persistência de `SeasonSaga` em tabela — fica derivada read-only.

## 10. Spec self-review

- **Placeholder scan:** sem "TBD"/"FIXME"/"???". Todos os nomes de tabela, coluna e função são concretos.
- **Consistência interna:** tipos do Contract (§3) batem com as colunas do schema (§5) — `Legend↔club_legends`, `ClubRecord↔club_records`, `Rivalry↔rivalries`, `ManagerCareerEntry↔manager_career`. Fluxo (§4) e error cases (§6) referenciam as mesmas funções do Contract (`archiveLegacy`, `deriveDerbyBonus`, `upsertManagerCareerEntry`).
- **Refs de código verificadas (lidas neste trabalho):** `season-archiver.ts:295,434` (snapshot/entry-point), `game-loop.ts:811` (chamada de archive), `history.ts:84,167,215,233` (queries existentes), `board.ts:2` (DbHandle), `accept-job-offer.ts:32,44` (troca de clube), `manager-reputation-engine.ts:26` + `season-end-eval.ts:199` (manager rep), `save.ts:38,45` (get/set manager rep), `schema.ts:1,57,62,207,304,315,317,349-431,464` (TABLE_NAMES, clubs, fixtures, save_games, tabelas season/board, índices), `store/database-store.ts:229` (espelho runtime), `constants.ts:7` (SAVE_ID_STRIDE), `rng.ts:5` (SeededRng), `match-engine.ts:201,372` (vantagem de casa), `HistoryScreen.tsx:108,121` (placeholders crus), `types/board.ts` (padrão de tipos).
- **Determinismo:** rivalry-engine recebe `SeededRng` (semeado por `saveId`); nenhum `Math.random`/`Date.now`/`ORDER BY RANDOM` introduzido; desempates por id. Espelha a disciplina de `season-archiver` (picks determinísticos).
- **i18n:** todas as strings de tela via chaves `legacy.*`/`records.*`/`rivalry.*`/`saga.*`/`manager_career.*`, com paridade pt/en — formato de chave plana dotted confirmado em `pt.ts` (ex.: `history.champion`, `pt.ts:738`).
