# C1 — Dinastia & Legado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2-5 min). Sem placeholders — todo código aparece. **Subagents NÃO commitam** (o orquestrador commita o que o passo "Commit" descreve).

**Goal:** Transformar o histórico raso de temporada num arco de carreira persistente — Hall da Fama, recordes all-time, linha do tempo do técnico, sagas de temporada e rivalidades/clássicos com bônus de derby.

**Architecture:** Camada de legado **derivada e materializada**: 5 motores puros (`legends`, `records`, `rivalry`, `saga`, `derby-bonus`) + 1 orquestrador (`legacy-archiver`, padrão de `season-archiver.ts`). Hall/recordes são agregações materializadas em tabelas novas (`club_legends`, `club_records`), recalculadas idempotentemente a cada fim de temporada. Rivalidades geradas 1×/save via `SeededRng(saveId)` e reforçadas por head-to-head. Trilha do técnico append-only (`manager_career`). Sagas são derivadas read-only (sem tabela). Bônus de derby injetado no `match-engine` via campo opcional (neutro = sem regressão). Telas sobre o kit do Design System.

**Tech Stack:** TS 5.9 strict, Jest+ts-jest, better-sqlite3 REAL (nunca mock), SeededRng, expo-sqlite (runtime), Zustand, React Navigation v7, react-native-svg.

**Convenções:** TDD; engine puro em `src/engine/legacy` (ZERO React/Expo); colunas/tabelas novas em `schema.ts` **E** `store/database-store.ts`; toda query `(db, saveId, ...)` (save-isolation); `SeededRng` para tudo aleatório, ZERO `Math.random`/`Date.now`/`ORDER BY RANDOM`; desempates por `id ASC`; i18n pt/en paridade (chave plana dotted); tokens/kit de `@/theme`; branch `feat/c1-dynasty-legacy`; commits terminando com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- `src/engine/history/season-archiver.ts` — orquestrador `archiveSeason(db, saveId, season)`, helpers `INSERT OR IGNORE`, guards `home_goals==null`, picks determinísticos.
- `src/database/queries/history.ts` — `DbHandle` importado de `./players`, queries `(db, saveId, ...)`, `mapAward`.
- `src/engine/board/manager-reputation-engine.ts` + `season-end-eval.ts:198-210` — onde a rep do técnico é calculada/persistida.
- `src/engine/simulation/match-engine.ts:201-204,363-390,517-519` — `homeAdvantageMultiplier`, `simulateFirstHalf`, `simulateMatch`.
- `src/engine/simulation/match-runner.ts:44-80` — `simulateWeekFixtures` monta `MatchInput`.
- `src/engine/rng.ts` — `SeededRng` (`next`, `nextInt`, `pick`, `shuffle`).
- `src/screens/history/HistoryScreen.tsx` — tela a migrar (hoje placeholders crus `Club ${id}`).
- `__tests__/database/queries/history.test.ts` — padrão `createTestDb`/`seedTestDb`/`createTestDbHandle`.

---

## File Structure

- **Create** `src/types/legacy.ts` — tipos compartilhados (`Legend`, `ClubRecord`, `Rivalry`, `ManagerCareerEntry`, `SeasonSaga`, etc.).
- **Create** `src/engine/legacy/legends-engine.ts` — `rankLegends` (puro).
- **Create** `src/engine/legacy/records-engine.ts` — `computeClubRecords` (puro).
- **Create** `src/engine/legacy/rivalry-engine.ts` — `generateRivalries`, `reinforceIntensity` (puro).
- **Create** `src/engine/legacy/saga-engine.ts` — `classifySeasonSaga` (puro).
- **Create** `src/engine/legacy/derby-bonus.ts` — `deriveDerbyBonus` (puro).
- **Create** `src/engine/legacy/legacy-archiver.ts` — `archiveLegacy`, `bootstrapRivalries` (orquestrador).
- **Create** `src/database/queries/legacy.ts` — queries tipadas `(db, saveId, ...)`.
- **Modify** `src/database/schema.ts:1-37` (TABLE_NAMES), `:39-531` (SCHEMA_SQL: 4 tabelas + 4 índices).
- **Modify** `src/store/database-store.ts` (espelho runtime: bloco `execAsync` com as 4 tabelas + índices).
- **Modify** `src/engine/simulation/match-engine.ts:19-33` (MatchInput.derbyBonus), `:363-390` (aplicar atmosfera/moral).
- **Modify** `src/engine/simulation/match-runner.ts:6-13,44-80` (passar `derbyBonus` por fixture).
- **Modify** `src/engine/game-loop.ts:286-306,811-812` (montar derby por fixture; chamar `archiveLegacy`).
- **Modify** `src/engine/board/accept-job-offer.ts:42-45` (fechar carreira `resigned` antes do switch).
- **Modify** `src/engine/season/season-end-eval.ts:209-210` (gravar entrada de carreira + invocar via game-loop).
- **Modify** `src/screens/history/HistoryScreen.tsx` — migrar p/ kit DS + nomes reais + saga.
- **Create** `src/screens/career/HallOfFameScreen.tsx`, `RecordsScreen.tsx`, `ManagerTimelineScreen.tsx`, `RivalriesScreen.tsx`.
- **Modify** `src/navigation/RootNavigator.tsx`, `src/navigation/types.ts` (4 rotas novas).
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` (chaves `legacy.*`/`records.*`/`rivalry.*`/`saga.*`/`manager_career.*`).
- **Test** `__tests__/engine/legacy/{legends,records,rivalry,saga,derby-bonus}.test.ts`, `__tests__/database/queries/legacy.test.ts`, `__tests__/integration/legacy-archiver.test.ts`, `__tests__/integration/manager-career.test.ts`, `__tests__/engine/match-derby.test.ts`.

**Contract (assinaturas exatas):**

```ts
// src/types/legacy.ts
export interface Legend {
  playerId: number; clubId: number; legendScore: number;
  appearances: number; goals: number; trophies: number; individualAwards: number;
  firstSeason: number; lastSeason: number;
}
export type ClubRecordType =
  | 'all_time_top_scorer' | 'most_appearances' | 'biggest_win'
  | 'biggest_defeat' | 'most_trophies_in_season' | 'longest_unbeaten';
export interface ClubRecord {
  type: ClubRecordType; clubId: number; value: number;
  holderId: number | null; season: number | null; fixtureRef: number | null; detail: string;
}
export type RivalryOrigin = 'derby' | 'division' | 'regional' | 'historic';
export interface Rivalry { clubAId: number; clubBId: number; intensity: number; origin: RivalryOrigin; }
export type ManagerExitReason = 'stayed' | 'fired' | 'resigned';
export interface ManagerCareerEntry {
  season: number; clubId: number; divisionLevel: number;
  leaguePosition: number | null; totalTeams: number;
  trophies: number; managerReputation: number; exitReason: ManagerExitReason;
}
export type SeasonSagaArchetype =
  | 'historic_title' | 'title_race' | 'promotion' | 'relegation_fight'
  | 'relegated' | 'transition' | 'rebuild' | 'overachieved' | 'underachieved';
export interface SeasonSaga {
  season: number; archetype: SeasonSagaArchetype;
  titleKey: string; bodyKey: string; vars: Record<string, string | number>;
}

// src/engine/legacy/legends-engine.ts (PURO)
export interface LegendCandidate {
  playerId: number; clubId: number;
  appearances: number; goals: number; assists: number;
  trophies: number; individualAwards: number; firstSeason: number; lastSeason: number;
}
export function rankLegends(candidates: readonly LegendCandidate[], limit: number): Legend[];

// src/engine/legacy/records-engine.ts (PURO)
export interface RecordInputs {
  clubId: number;
  scorers: ReadonlyArray<{ playerId: number; goals: number }>;
  appearances: ReadonlyArray<{ playerId: number; games: number }>;
  results: ReadonlyArray<{ fixtureId: number; season: number; gf: number; ga: number; opponentId: number }>;
  trophiesBySeason: ReadonlyMap<number, number>;
}
export function computeClubRecords(inputs: RecordInputs): ClubRecord[];

// src/engine/legacy/rivalry-engine.ts (PURO)
export interface RivalryClub { id: number; leagueId: number; countryId: number; divisionLevel: number; reputation: number; }
export interface HeadToHead { clubAId: number; clubBId: number; meetings: number; finals: number; titleDeciders: number; }
export function generateRivalries(clubs: readonly RivalryClub[], rng: SeededRng): Rivalry[];
export function reinforceIntensity(base: Rivalry, h2h: HeadToHead): number;

// src/engine/legacy/derby-bonus.ts (PURO)
export interface DerbyBonus { atmosphereMult: number; homeMoraleBonus: number; awayMoraleBonus: number; }
export function deriveDerbyBonus(intensity: number | null): DerbyBonus;

// src/engine/legacy/saga-engine.ts (PURO)
export interface SagaInput {
  season: number; leaguePosition: number | null; totalTeams: number;
  expectedPosition: number | null;
  wonLeague: boolean; wonCup: boolean; wasPromoted: boolean; wasRelegated: boolean; trophies: number;
}
export function classifySeasonSaga(input: SagaInput): SeasonSaga;

// src/engine/legacy/legacy-archiver.ts (orquestrador)
export async function archiveLegacy(db: DbHandle, saveId: number, season: number, clubId: number): Promise<void>;
export async function bootstrapRivalries(db: DbHandle, saveId: number): Promise<void>;

// src/database/queries/legacy.ts (todas (db, saveId, ...))
export async function getClubLegends(db: DbHandle, saveId: number, clubId: number): Promise<Legend[]>;
export async function getClubRecords(db: DbHandle, saveId: number, clubId: number): Promise<ClubRecord[]>;
export async function getRivalries(db: DbHandle, saveId: number, clubId: number): Promise<Rivalry[]>;
export async function getRivalry(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<Rivalry | null>;
export async function getHeadToHead(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<HeadToHead>;
export async function getManagerCareer(db: DbHandle, saveId: number): Promise<ManagerCareerEntry[]>;
export async function upsertManagerCareerEntry(db: DbHandle, saveId: number, entry: ManagerCareerEntry): Promise<void>;
export async function setManagerExitReason(db: DbHandle, saveId: number, season: number, reason: ManagerExitReason): Promise<void>;
export async function upsertRivalry(db: DbHandle, saveId: number, r: Rivalry): Promise<void>;
export async function replaceClubLegends(db: DbHandle, saveId: number, clubId: number, legends: Legend[]): Promise<void>;
export async function replaceClubRecords(db: DbHandle, saveId: number, clubId: number, records: ClubRecord[]): Promise<void>;
```

`DbHandle` é importado de `@/database/queries/players` (igual `history.ts:1`).

---

## Task 1: Tipos compartilhados `src/types/legacy.ts`

**Files:** Create `src/types/legacy.ts`.
**Interfaces:** Produces: todos os tipos do bloco "src/types/legacy.ts" do Contract. Consumes: nada.

- [ ] **Step 1 — escrever o módulo** (copiar o bloco `src/types/legacy.ts` do Contract verbatim para o arquivo). É um arquivo só de tipos, sem runtime.
- [ ] **Step 2 — type-check:** `npx tsc --noEmit` → exit 0 (nenhum import quebrado; tipos isolados).
- [ ] **Step 3 — commit:** `git add src/types/legacy.ts` · msg `feat(c1): tipos compartilhados de legado (Legend/ClubRecord/Rivalry/ManagerCareerEntry/SeasonSaga)`.

---

## Task 2: Motor puro `legends-engine.ts` (TDD)

**Files:** Create `src/engine/legacy/legends-engine.ts`, `__tests__/engine/legacy/legends.test.ts`.
**Interfaces:** Consumes: `Legend` (Task 1). Produces: `rankLegends`, `LegendCandidate`.

Regra de score (pesos fixos, documentados no código): `raw = appearances*1 + goals*3 + assists*1 + trophies*25 + individualAwards*15`. Normaliza dividindo pelo maior `raw` do conjunto e escala 0..100 (`Math.round(raw/maxRaw*100)`); conjunto vazio → `[]`. Exclui candidatos com `appearances === 0`. Ordena por `legendScore DESC`, desempate `playerId ASC`; aplica `limit`.

- [ ] **Step 1 — teste falhando** `__tests__/engine/legacy/legends.test.ts`:
```ts
import { rankLegends, LegendCandidate } from '@/engine/legacy/legends-engine';

const c = (over: Partial<LegendCandidate>): LegendCandidate => ({
  playerId: 1, clubId: 10, appearances: 0, goals: 0, assists: 0,
  trophies: 0, individualAwards: 0, firstSeason: 1, lastSeason: 1, ...over,
});

describe('rankLegends', () => {
  it('rankeia por score composto (títulos+gols+aparições+prêmios) e normaliza 0..100', () => {
    const top = c({ playerId: 1, appearances: 200, goals: 100, trophies: 5, individualAwards: 3 });
    const mid = c({ playerId: 2, appearances: 150, goals: 40, trophies: 1 });
    const out = rankLegends([mid, top], 10);
    expect(out[0].playerId).toBe(1);
    expect(out[0].legendScore).toBe(100);          // maior raw → 100
    expect(out[1].playerId).toBe(2);
    expect(out[1].legendScore).toBeLessThan(100);
    expect(out[0].appearances).toBe(200);          // campos espelhados
  });

  it('exclui jogadores com 0 aparições', () => {
    const played = c({ playerId: 1, appearances: 10, goals: 1 });
    const ghost = c({ playerId: 2, appearances: 0, goals: 5, trophies: 9 });
    const out = rankLegends([played, ghost], 10);
    expect(out.map((l) => l.playerId)).toEqual([1]);
  });

  it('desempata por playerId ASC e respeita limit', () => {
    const a = c({ playerId: 9, appearances: 50, goals: 10 });
    const b = c({ playerId: 3, appearances: 50, goals: 10 }); // mesmo raw
    const out = rankLegends([a, b], 1);
    expect(out).toHaveLength(1);
    expect(out[0].playerId).toBe(3);
  });

  it('conjunto vazio → []', () => {
    expect(rankLegends([], 5)).toEqual([]);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/legacy/legends.test.ts` → "Cannot find module '@/engine/legacy/legends-engine'".
- [ ] **Step 3 — implementar** `src/engine/legacy/legends-engine.ts`:
```ts
import { Legend } from '@/types/legacy';

export interface LegendCandidate {
  playerId: number; clubId: number;
  appearances: number; goals: number; assists: number;
  trophies: number; individualAwards: number; firstSeason: number; lastSeason: number;
}

const W_APP = 1, W_GOAL = 3, W_ASSIST = 1, W_TROPHY = 25, W_AWARD = 15;

function rawScore(c: LegendCandidate): number {
  return c.appearances * W_APP + c.goals * W_GOAL + c.assists * W_ASSIST
    + c.trophies * W_TROPHY + c.individualAwards * W_AWARD;
}

export function rankLegends(candidates: readonly LegendCandidate[], limit: number): Legend[] {
  const played = candidates.filter((c) => c.appearances > 0);
  if (played.length === 0) return [];
  const maxRaw = Math.max(...played.map(rawScore));
  const safeMax = maxRaw > 0 ? maxRaw : 1;
  const legends: Legend[] = played.map((c) => ({
    playerId: c.playerId, clubId: c.clubId,
    legendScore: Math.round((rawScore(c) / safeMax) * 100),
    appearances: c.appearances, goals: c.goals,
    trophies: c.trophies, individualAwards: c.individualAwards,
    firstSeason: c.firstSeason, lastSeason: c.lastSeason,
  }));
  legends.sort((x, y) => (y.legendScore - x.legendScore) || (x.playerId - y.playerId));
  return legends.slice(0, limit);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/legacy/legends.test.ts` → 4 passing.
- [ ] **Step 5 — commit:** `git add src/engine/legacy/legends-engine.ts __tests__/engine/legacy/legends.test.ts` · msg `feat(c1): legends-engine — legend score composto normalizado`.

---

## Task 3: Motor puro `records-engine.ts` (TDD)

**Files:** Create `src/engine/legacy/records-engine.ts`, `__tests__/engine/legacy/records.test.ts`.
**Interfaces:** Consumes: `ClubRecord`/`ClubRecordType` (Task 1). Produces: `computeClubRecords`, `RecordInputs`.

Regras: `all_time_top_scorer` = maior `goals` (holder=playerId, desempate menor playerId); `most_appearances` = maior `games`; `biggest_win` = fixture com maior `gf-ga > 0` (value=saldo, fixtureRef, detail `${gf}-${ga} vs Club ${opponentId}`, desempate menor fixtureId); `biggest_defeat` = maior `ga-gf > 0`; `most_trophies_in_season` = maior valor em `trophiesBySeason` (value=nº, season; >0 só); `longest_unbeaten` = maior sequência de fixtures (ordenados por season ASC, fixtureId ASC) sem derrota (gf>=ga). Cada record só entra se houver dado; conjunto vazio de jogos → sem records de placar/sequência.

- [ ] **Step 1 — teste falhando** `__tests__/engine/legacy/records.test.ts`:
```ts
import { computeClubRecords, RecordInputs } from '@/engine/legacy/records-engine';

const base: RecordInputs = {
  clubId: 10,
  scorers: [{ playerId: 1, goals: 80 }, { playerId: 2, goals: 80 }, { playerId: 3, goals: 40 }],
  appearances: [{ playerId: 2, games: 300 }, { playerId: 1, games: 250 }],
  results: [
    { fixtureId: 1, season: 1, gf: 5, ga: 0, opponentId: 12 }, // win +5
    { fixtureId: 2, season: 1, gf: 0, ga: 4, opponentId: 13 }, // loss -4
    { fixtureId: 3, season: 1, gf: 5, ga: 0, opponentId: 14 }, // win +5 (later id)
    { fixtureId: 4, season: 2, gf: 1, ga: 1, opponentId: 15 }, // draw
    { fixtureId: 5, season: 2, gf: 2, ga: 0, opponentId: 16 }, // win
  ],
  trophiesBySeason: new Map([[1, 2], [2, 0]]),
};

const byType = (rs: ReturnType<typeof computeClubRecords>, t: string) => rs.find((r) => r.type === t)!;

describe('computeClubRecords', () => {
  it('artilheiro histórico = maior gols, desempate menor playerId', () => {
    const r = byType(computeClubRecords(base), 'all_time_top_scorer');
    expect(r.value).toBe(80); expect(r.holderId).toBe(1);
  });
  it('mais jogos', () => {
    const r = byType(computeClubRecords(base), 'most_appearances');
    expect(r.value).toBe(300); expect(r.holderId).toBe(2);
  });
  it('maior goleada = maior saldo positivo, desempate menor fixtureId', () => {
    const r = byType(computeClubRecords(base), 'biggest_win');
    expect(r.value).toBe(5); expect(r.fixtureRef).toBe(1);
    expect(r.detail).toBe('5-0 vs Club 12');
  });
  it('maior derrota', () => {
    const r = byType(computeClubRecords(base), 'biggest_defeat');
    expect(r.value).toBe(4); expect(r.fixtureRef).toBe(2);
  });
  it('mais troféus numa temporada', () => {
    const r = byType(computeClubRecords(base), 'most_trophies_in_season');
    expect(r.value).toBe(2); expect(r.season).toBe(1);
  });
  it('maior sequência invicta (não derrota) cruzando temporadas', () => {
    // f3(win) f4(draw) f5(win) = 3; f1(win) isolado antes da derrota f2 = 1
    const r = byType(computeClubRecords(base), 'longest_unbeaten');
    expect(r.value).toBe(3);
  });
  it('clube sem jogos → sem records de placar/sequência', () => {
    const out = computeClubRecords({ ...base, results: [] });
    expect(out.find((r) => r.type === 'biggest_win')).toBeUndefined();
    expect(out.find((r) => r.type === 'longest_unbeaten')).toBeUndefined();
    expect(out.find((r) => r.type === 'all_time_top_scorer')).toBeDefined();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/legacy/records.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar** `src/engine/legacy/records-engine.ts`:
```ts
import { ClubRecord } from '@/types/legacy';

export interface RecordInputs {
  clubId: number;
  scorers: ReadonlyArray<{ playerId: number; goals: number }>;
  appearances: ReadonlyArray<{ playerId: number; games: number }>;
  results: ReadonlyArray<{ fixtureId: number; season: number; gf: number; ga: number; opponentId: number }>;
  trophiesBySeason: ReadonlyMap<number, number>;
}

export function computeClubRecords(inputs: RecordInputs): ClubRecord[] {
  const { clubId } = inputs;
  const out: ClubRecord[] = [];

  const topScorer = [...inputs.scorers].sort((a, b) => (b.goals - a.goals) || (a.playerId - b.playerId))[0];
  if (topScorer && topScorer.goals > 0) {
    out.push({ type: 'all_time_top_scorer', clubId, value: topScorer.goals,
      holderId: topScorer.playerId, season: null, fixtureRef: null, detail: '' });
  }

  const mostApps = [...inputs.appearances].sort((a, b) => (b.games - a.games) || (a.playerId - b.playerId))[0];
  if (mostApps && mostApps.games > 0) {
    out.push({ type: 'most_appearances', clubId, value: mostApps.games,
      holderId: mostApps.playerId, season: null, fixtureRef: null, detail: '' });
  }

  const wins = inputs.results.filter((r) => r.gf - r.ga > 0)
    .sort((a, b) => ((b.gf - b.ga) - (a.gf - a.ga)) || (a.fixtureId - b.fixtureId));
  if (wins[0]) {
    const w = wins[0];
    out.push({ type: 'biggest_win', clubId, value: w.gf - w.ga, holderId: null,
      season: w.season, fixtureRef: w.fixtureId, detail: `${w.gf}-${w.ga} vs Club ${w.opponentId}` });
  }

  const defeats = inputs.results.filter((r) => r.ga - r.gf > 0)
    .sort((a, b) => ((b.ga - b.gf) - (a.ga - a.gf)) || (a.fixtureId - b.fixtureId));
  if (defeats[0]) {
    const d = defeats[0];
    out.push({ type: 'biggest_defeat', clubId, value: d.ga - d.gf, holderId: null,
      season: d.season, fixtureRef: d.fixtureId, detail: `${d.gf}-${d.ga} vs Club ${d.opponentId}` });
  }

  let bestSeason: number | null = null, bestTrophies = 0;
  for (const [season, n] of inputs.trophiesBySeason) {
    if (n > bestTrophies || (n === bestTrophies && bestSeason != null && season < bestSeason)) {
      bestTrophies = n; bestSeason = season;
    }
  }
  if (bestSeason != null && bestTrophies > 0) {
    out.push({ type: 'most_trophies_in_season', clubId, value: bestTrophies,
      holderId: null, season: bestSeason, fixtureRef: null, detail: '' });
  }

  const ordered = [...inputs.results].sort((a, b) => (a.season - b.season) || (a.fixtureId - b.fixtureId));
  let run = 0, longest = 0;
  for (const r of ordered) {
    if (r.gf >= r.ga) { run += 1; if (run > longest) longest = run; }
    else run = 0;
  }
  if (longest > 0) {
    out.push({ type: 'longest_unbeaten', clubId, value: longest,
      holderId: null, season: null, fixtureRef: null, detail: '' });
  }

  return out;
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/legacy/records.test.ts` → 7 passing.
- [ ] **Step 5 — commit:** `git add src/engine/legacy/records-engine.ts __tests__/engine/legacy/records.test.ts` · msg `feat(c1): records-engine — recordes all-time do clube`.

---

## Task 4: Motor puro `rivalry-engine.ts` (TDD, determinístico)

**Files:** Create `src/engine/legacy/rivalry-engine.ts`, `__tests__/engine/legacy/rivalry.test.ts`.
**Interfaces:** Consumes: `Rivalry`/`RivalryOrigin` (Task 1), `SeededRng` (`@/engine/rng`). Produces: `generateRivalries`, `reinforceIntensity`, `RivalryClub`, `HeadToHead`.

Regras: para cada par `(a,b)` com `a.id < b.id` e `a.id !== b.id`: mesma `leagueId` → `origin='division'`; senão mesmo `countryId` e `|divLevel diff| === 1` → `origin='regional'`; senão sem rivalidade. Para limitar volume, cada clube guarda no máx. 2 rivais de maior `intensity` (poda determinística). `intensity` base = `clamp(50 + round((repA+repB)/2 - 50)/2 + rng.nextInt(-5,5), 1, 100)` para `division`; `regional` parte de base 35. `reinforceIntensity(base, h2h)` = `clamp(base.intensity + h2h.finals*4 + h2h.titleDeciders*8, 1, 100)`. **Determinismo:** mesma seed + mesmos clubes → array idêntico.

- [ ] **Step 1 — teste falhando** `__tests__/engine/legacy/rivalry.test.ts`:
```ts
import { generateRivalries, reinforceIntensity, RivalryClub } from '@/engine/legacy/rivalry-engine';
import { SeededRng } from '@/engine/rng';

const clubs: RivalryClub[] = [
  { id: 1, leagueId: 100, countryId: 1, divisionLevel: 1, reputation: 80 },
  { id: 2, leagueId: 100, countryId: 1, divisionLevel: 1, reputation: 78 },
  { id: 3, leagueId: 200, countryId: 1, divisionLevel: 2, reputation: 60 }, // div adjacente, mesmo país
  { id: 4, leagueId: 300, countryId: 2, divisionLevel: 5, reputation: 50 }, // longe → sem rival
];

describe('rivalry-engine', () => {
  it('é determinístico: mesma seed + mesmos clubes → array idêntico', () => {
    const a = generateRivalries(clubs, new SeededRng(42));
    const b = generateRivalries(clubs, new SeededRng(42));
    expect(a).toEqual(b);
  });

  it('mesma liga → division; mesmo país + div adjacente → regional', () => {
    const out = generateRivalries(clubs, new SeededRng(42));
    const div = out.find((r) => r.clubAId === 1 && r.clubBId === 2);
    expect(div?.origin).toBe('division');
    const reg = out.find((r) => (r.clubAId === 1 || r.clubAId === 2 || r.clubAId === 3));
    expect(out.some((r) => r.origin === 'regional')).toBe(true);
    // par canônico: clubAId sempre < clubBId
    for (const r of out) expect(r.clubAId).toBeLessThan(r.clubBId);
  });

  it('clube isolado (país/divisão distantes) não vira rival', () => {
    const out = generateRivalries(clubs, new SeededRng(42));
    expect(out.some((r) => r.clubAId === 4 || r.clubBId === 4)).toBe(false);
  });

  it('intensity em [1,100]', () => {
    for (const r of generateRivalries(clubs, new SeededRng(7))) {
      expect(r.intensity).toBeGreaterThanOrEqual(1);
      expect(r.intensity).toBeLessThanOrEqual(100);
    }
  });

  it('reinforceIntensity cresce com finais/title-deciders e satura em 100', () => {
    const base = { clubAId: 1, clubBId: 2, intensity: 50, origin: 'division' as const };
    expect(reinforceIntensity(base, { clubAId: 1, clubBId: 2, meetings: 4, finals: 2, titleDeciders: 1 }))
      .toBe(50 + 2 * 4 + 1 * 8);
    expect(reinforceIntensity({ ...base, intensity: 98 },
      { clubAId: 1, clubBId: 2, meetings: 10, finals: 5, titleDeciders: 5 })).toBe(100);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/legacy/rivalry.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar** `src/engine/legacy/rivalry-engine.ts`:
```ts
import { Rivalry, RivalryOrigin } from '@/types/legacy';
import { SeededRng } from '@/engine/rng';

export interface RivalryClub { id: number; leagueId: number; countryId: number; divisionLevel: number; reputation: number; }
export interface HeadToHead { clubAId: number; clubBId: number; meetings: number; finals: number; titleDeciders: number; }

const MAX_RIVALS_PER_CLUB = 2;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function classifyPair(a: RivalryClub, b: RivalryClub): RivalryOrigin | null {
  if (a.leagueId === b.leagueId) return 'division';
  if (a.countryId === b.countryId && Math.abs(a.divisionLevel - b.divisionLevel) === 1) return 'regional';
  return null;
}

export function generateRivalries(clubs: readonly RivalryClub[], rng: SeededRng): Rivalry[] {
  const byId = new Map(clubs.map((c) => [c.id, c]));
  const sorted = [...clubs].sort((x, y) => x.id - y.id);
  const all: Rivalry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (a.id === b.id) continue;
      const origin = classifyPair(a, b);
      if (!origin) continue;
      const repAvg = (a.reputation + b.reputation) / 2;
      const floor = origin === 'division' ? 50 : 35;
      const intensity = clamp(Math.round(floor + (repAvg - 50) / 2) + rng.nextInt(-5, 5), 1, 100);
      all.push({ clubAId: a.id, clubBId: b.id, intensity, origin });
    }
  }
  // Poda determinística: cada clube fica com seus MAX_RIVALS_PER_CLUB mais intensos.
  const ranked = [...all].sort((x, y) => (y.intensity - x.intensity)
    || (x.clubAId - y.clubAId) || (x.clubBId - y.clubBId));
  const count = new Map<number, number>();
  const kept: Rivalry[] = [];
  for (const r of ranked) {
    const ca = count.get(r.clubAId) ?? 0, cb = count.get(r.clubBId) ?? 0;
    if (ca >= MAX_RIVALS_PER_CLUB || cb >= MAX_RIVALS_PER_CLUB) continue;
    if (!byId.has(r.clubAId) || !byId.has(r.clubBId)) continue;
    kept.push(r); count.set(r.clubAId, ca + 1); count.set(r.clubBId, cb + 1);
  }
  return kept.sort((x, y) => (x.clubAId - y.clubAId) || (x.clubBId - y.clubBId));
}

export function reinforceIntensity(base: Rivalry, h2h: HeadToHead): number {
  return clamp(base.intensity + h2h.finals * 4 + h2h.titleDeciders * 8, 1, 100);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/legacy/rivalry.test.ts` → 5 passing.
- [ ] **Step 5 — commit:** `git add src/engine/legacy/rivalry-engine.ts __tests__/engine/legacy/rivalry.test.ts` · msg `feat(c1): rivalry-engine — geração determinística + reforço por head-to-head`.

---

## Task 5: Motor puro `derby-bonus.ts` (TDD)

**Files:** Create `src/engine/legacy/derby-bonus.ts`, `__tests__/engine/legacy/derby-bonus.test.ts`.
**Interfaces:** Consumes: nada. Produces: `deriveDerbyBonus`, `DerbyBonus`.

Regra: `intensity` null → neutro `{ atmosphereMult: 1, homeMoraleBonus: 0, awayMoraleBonus: 0 }`. Senão `f = clamp(intensity,1,100)/100`: `atmosphereMult = 1 + 0.05*f` (até +5% de vantagem de casa em clássico), `homeMoraleBonus = round(4*f)`, `awayMoraleBonus = round(2*f)` (visitante também sobe um pouco — jogo grande). Monotônico em `intensity`.

- [ ] **Step 1 — teste falhando** `__tests__/engine/legacy/derby-bonus.test.ts`:
```ts
import { deriveDerbyBonus } from '@/engine/legacy/derby-bonus';

describe('deriveDerbyBonus', () => {
  it('intensity null → neutro', () => {
    expect(deriveDerbyBonus(null)).toEqual({ atmosphereMult: 1, homeMoraleBonus: 0, awayMoraleBonus: 0 });
  });
  it('intensity alta → atmosfera > 1 e bônus de moral > 0', () => {
    const b = deriveDerbyBonus(100);
    expect(b.atmosphereMult).toBeGreaterThan(1);
    expect(b.homeMoraleBonus).toBeGreaterThan(0);
    expect(b.awayMoraleBonus).toBeGreaterThanOrEqual(0);
    expect(b.homeMoraleBonus).toBeGreaterThanOrEqual(b.awayMoraleBonus);
  });
  it('monotônico: intensity maior ⇒ atmosfera/bônus ≥', () => {
    const lo = deriveDerbyBonus(20), hi = deriveDerbyBonus(80);
    expect(hi.atmosphereMult).toBeGreaterThanOrEqual(lo.atmosphereMult);
    expect(hi.homeMoraleBonus).toBeGreaterThanOrEqual(lo.homeMoraleBonus);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/legacy/derby-bonus.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar** `src/engine/legacy/derby-bonus.ts`:
```ts
export interface DerbyBonus { atmosphereMult: number; homeMoraleBonus: number; awayMoraleBonus: number; }

export function deriveDerbyBonus(intensity: number | null): DerbyBonus {
  if (intensity == null) return { atmosphereMult: 1, homeMoraleBonus: 0, awayMoraleBonus: 0 };
  const f = Math.max(1, Math.min(100, intensity)) / 100;
  return {
    atmosphereMult: 1 + 0.05 * f,
    homeMoraleBonus: Math.round(4 * f),
    awayMoraleBonus: Math.round(2 * f),
  };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/legacy/derby-bonus.test.ts` → 3 passing.
- [ ] **Step 5 — commit:** `git add src/engine/legacy/derby-bonus.ts __tests__/engine/legacy/derby-bonus.test.ts` · msg `feat(c1): derby-bonus — multiplicador de atmosfera + bônus de moral por intensidade`.

---

## Task 6: Motor puro `saga-engine.ts` (TDD)

**Files:** Create `src/engine/legacy/saga-engine.ts`, `__tests__/engine/legacy/saga.test.ts`.
**Interfaces:** Consumes: `SeasonSaga`/`SeasonSagaArchetype` (Task 1). Produces: `classifySeasonSaga`, `SagaInput`.

Ordem de classificação (primeiro match vence): `wonLeague && !anyLoss?` — não temos derrotas aqui, então `historic_title` = `wonLeague && trophies >= 2`; `title_race` = `leaguePosition===2 || (wonLeague)`; `relegated` = `wasRelegated`; `relegation_fight` = `leaguePosition!=null && leaguePosition > totalTeams*0.75`; `promotion` = `wasPromoted`; `overachieved` = `expectedPosition!=null && leaguePosition!=null && leaguePosition + 3 <= expectedPosition`; `underachieved` = `expectedPosition!=null && leaguePosition!=null && leaguePosition >= expectedPosition + 4`; `rebuild`/`transition` default por posição mediana. `titleKey='saga.<arch>.title'`, `bodyKey='saga.<arch>.body'`, `vars` inclui `season`, `position`, `totalTeams`, `trophies`.

- [ ] **Step 1 — teste falhando** `__tests__/engine/legacy/saga.test.ts`:
```ts
import { classifySeasonSaga, SagaInput } from '@/engine/legacy/saga-engine';

const inp = (over: Partial<SagaInput>): SagaInput => ({
  season: 3, leaguePosition: 8, totalTeams: 20, expectedPosition: 8,
  wonLeague: false, wonCup: false, wasPromoted: false, wasRelegated: false, trophies: 0, ...over,
});

describe('classifySeasonSaga', () => {
  it('campeão com 2+ troféus → historic_title e chaves i18n', () => {
    const s = classifySeasonSaga(inp({ leaguePosition: 1, wonLeague: true, trophies: 2 }));
    expect(s.archetype).toBe('historic_title');
    expect(s.titleKey).toBe('saga.historic_title.title');
    expect(s.bodyKey).toBe('saga.historic_title.body');
    expect(s.vars.season).toBe(3);
  });
  it('rebaixado → relegated', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 19, wasRelegated: true })).archetype).toBe('relegated');
  });
  it('alvo do board superado por folga → overachieved', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 3, expectedPosition: 10 })).archetype).toBe('overachieved');
  });
  it('muito abaixo do alvo → underachieved', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 15, expectedPosition: 6 })).archetype).toBe('underachieved');
  });
  it('promovido → promotion', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 2, wasPromoted: true, expectedPosition: null })).archetype).toBe('promotion');
  });
  it('briga contra rebaixamento (parte de baixo da tabela)', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 17, totalTeams: 20, expectedPosition: null })).archetype).toBe('relegation_fight');
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/legacy/saga.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar** `src/engine/legacy/saga-engine.ts`:
```ts
import { SeasonSaga, SeasonSagaArchetype } from '@/types/legacy';

export interface SagaInput {
  season: number; leaguePosition: number | null; totalTeams: number;
  expectedPosition: number | null;
  wonLeague: boolean; wonCup: boolean; wasPromoted: boolean; wasRelegated: boolean; trophies: number;
}

function pickArchetype(i: SagaInput): SeasonSagaArchetype {
  if (i.wonLeague && i.trophies >= 2) return 'historic_title';
  if (i.wasRelegated) return 'relegated';
  if (i.wonLeague || i.leaguePosition === 2) return 'title_race';
  if (i.wasPromoted) return 'promotion';
  if (i.expectedPosition != null && i.leaguePosition != null) {
    if (i.leaguePosition + 3 <= i.expectedPosition) return 'overachieved';
    if (i.leaguePosition >= i.expectedPosition + 4) return 'underachieved';
  }
  if (i.leaguePosition != null && i.leaguePosition > i.totalTeams * 0.75) return 'relegation_fight';
  if (i.leaguePosition != null && i.leaguePosition <= i.totalTeams * 0.4) return 'transition';
  return 'rebuild';
}

export function classifySeasonSaga(input: SagaInput): SeasonSaga {
  const archetype = pickArchetype(input);
  return {
    season: input.season,
    archetype,
    titleKey: `saga.${archetype}.title`,
    bodyKey: `saga.${archetype}.body`,
    vars: {
      season: input.season,
      position: input.leaguePosition ?? 0,
      totalTeams: input.totalTeams,
      trophies: input.trophies,
    },
  };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/legacy/saga.test.ts` → 6 passing.
- [ ] **Step 5 — commit:** `git add src/engine/legacy/saga-engine.ts __tests__/engine/legacy/saga.test.ts` · msg `feat(c1): saga-engine — classifica temporada em arquétipo narrativo`.

---

## Task 7: Schema — 4 tabelas novas em `schema.ts` + espelho em `database-store.ts`

**Files:** Modify `src/database/schema.ts:1-37` (TABLE_NAMES) e `:39-531` (SCHEMA_SQL); Modify `src/store/database-store.ts` (bloco `execAsync`). Test: coberto pela Task 9 (queries) — aqui só DDL.
**Interfaces:** Produces: tabelas `club_legends`, `club_records`, `rivalries`, `manager_career` + índices.

- [ ] **Step 1 — TABLE_NAMES:** em `src/database/schema.ts`, no array `TABLE_NAMES` (`:1-37`), adicionar antes do `]` final:
```ts
  'club_legends',
  'club_records',
  'rivalries',
  'manager_career',
```
- [ ] **Step 2 — SCHEMA_SQL (DDL):** em `SCHEMA_SQL`, **antes** da última linha `` `; `` (`schema.ts:531`), inserir o bloco do §5 do spec verbatim:
```sql
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
CREATE TABLE IF NOT EXISTS club_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  club_id     INTEGER NOT NULL REFERENCES clubs(id),
  record_type TEXT    NOT NULL,
  value       INTEGER NOT NULL,
  holder_id   INTEGER,
  season      INTEGER,
  fixture_ref INTEGER,
  detail      TEXT    NOT NULL DEFAULT '',
  UNIQUE(save_id, club_id, record_type)
);
CREATE TABLE IF NOT EXISTS rivalries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  club_a_id   INTEGER NOT NULL REFERENCES clubs(id),
  club_b_id   INTEGER NOT NULL REFERENCES clubs(id),
  intensity   INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 100),
  origin      TEXT    NOT NULL,
  UNIQUE(save_id, club_a_id, club_b_id)
);
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
- [ ] **Step 3 — espelho runtime em `database-store.ts`:** após o bloco de migração idempotente existente (depois de `season_player_titles` / índices em `:262-275`), adicionar um `await db.execAsync(` com **exatamente o mesmo DDL** do Step 2 (as 4 tabelas + 4 índices, todas `IF NOT EXISTS`). Isso garante saves antigos ganharem as tabelas (spec §6: tabelas `IF NOT EXISTS`, sem reconstrução histórica).
- [ ] **Step 4 — type-check + smoke:** `npx tsc --noEmit` → exit 0. Rodar `npx jest __tests__/database/queries/history.test.ts` (usa `createTestDb` que aplica `SCHEMA_SQL`) → ainda verde (DDL não quebra schema existente).
- [ ] **Step 5 — commit:** `git add src/database/schema.ts src/store/database-store.ts` · msg `feat(c1): schema — club_legends/club_records/rivalries/manager_career (+ espelho runtime)`.

---

## Task 8: Queries `src/database/queries/legacy.ts` — manager_career + rivalries (TDD, SQLite real)

**Files:** Create `src/database/queries/legacy.ts`, `__tests__/database/queries/legacy.test.ts`.
**Interfaces:** Consumes: tipos (Task 1), tabelas (Task 7). Produces: `upsertManagerCareerEntry`, `setManagerExitReason`, `getManagerCareer`, `upsertRivalry`, `getRivalry`, `getRivalries`, `getHeadToHead`, `replaceClubLegends`, `replaceClubRecords`, `getClubLegends`, `getClubRecords`. (Esta task entrega manager_career + rivalries + legends/records readers; head-to-head fica em Task 9.)

`getRivalry` normaliza o par para `(min,max)`. `upsertRivalry` exige `clubAId < clubBId` (garantido pelo engine). Todas filtram por `save_id` (save-isolation).

- [ ] **Step 1 — teste falhando** `__tests__/database/queries/legacy.test.ts` (espelha `history.test.ts` setup):
```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import {
  upsertManagerCareerEntry, setManagerExitReason, getManagerCareer,
  upsertRivalry, getRivalry, getRivalries,
  replaceClubLegends, getClubLegends, replaceClubRecords, getClubRecords,
} from '../../../src/database/queries/legacy';

describe('legacy queries', () => {
  let rawDb: Database.Database; let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb);
    rawDb.pragma('foreign_keys = OFF');
  });
  afterEach(() => rawDb.close());

  it('manager_career: upsert, sobrescreve exit_reason, ordena por temporada', async () => {
    await upsertManagerCareerEntry(db, 1, { season: 1, clubId: 1, divisionLevel: 1, leaguePosition: 3, totalTeams: 20, trophies: 1, managerReputation: 55, exitReason: 'stayed' });
    await upsertManagerCareerEntry(db, 1, { season: 2, clubId: 1, divisionLevel: 1, leaguePosition: 1, totalTeams: 20, trophies: 2, managerReputation: 70, exitReason: 'stayed' });
    await setManagerExitReason(db, 1, 1, 'resigned');
    const career = await getManagerCareer(db, 1);
    expect(career.map((e) => e.season)).toEqual([1, 2]);
    expect(career[0].exitReason).toBe('resigned');
    expect(career[1].trophies).toBe(2);
  });

  it('rivalries: upsert par canônico, getRivalry normaliza (a,b)/(b,a)', async () => {
    await upsertRivalry(db, 1, { clubAId: 2, clubBId: 5, intensity: 70, origin: 'division' });
    expect((await getRivalry(db, 1, 5, 2))?.intensity).toBe(70);     // ordem invertida
    expect((await getRivalry(db, 1, 2, 5))?.origin).toBe('division');
    await upsertRivalry(db, 1, { clubAId: 2, clubBId: 5, intensity: 85, origin: 'division' }); // replace
    expect((await getRivalry(db, 1, 2, 5))?.intensity).toBe(85);
    const list = await getRivalries(db, 1, 2);
    expect(list.some((r) => r.clubAId === 2 && r.clubBId === 5)).toBe(true);
  });

  it('legends/records: replace é idempotente (snapshot completo)', async () => {
    await replaceClubLegends(db, 1, 1, [
      { playerId: 100, clubId: 1, legendScore: 100, appearances: 200, goals: 90, trophies: 3, individualAwards: 2, firstSeason: 1, lastSeason: 5 },
    ]);
    await replaceClubLegends(db, 1, 1, [
      { playerId: 100, clubId: 1, legendScore: 100, appearances: 220, goals: 95, trophies: 3, individualAwards: 2, firstSeason: 1, lastSeason: 6 },
    ]);
    const legs = await getClubLegends(db, 1, 1);
    expect(legs).toHaveLength(1);
    expect(legs[0].appearances).toBe(220);

    await replaceClubRecords(db, 1, 1, [
      { type: 'all_time_top_scorer', clubId: 1, value: 90, holderId: 100, season: null, fixtureRef: null, detail: '' },
    ]);
    const recs = await getClubRecords(db, 1, 1);
    expect(recs[0].type).toBe('all_time_top_scorer');
    expect(recs[0].holderId).toBe(100);
  });

  it('save-isolation: save 2 não vê dados do save 1', async () => {
    await upsertRivalry(db, 1, { clubAId: 2, clubBId: 5, intensity: 70, origin: 'division' });
    expect(await getRivalry(db, 2, 2, 5)).toBeNull();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/queries/legacy.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar** `src/database/queries/legacy.ts` (head-to-head e leitura de legends/records ranqueada por `legend_score DESC, player_id ASC`):
```ts
import { DbHandle } from './players';
import { Legend, ClubRecord, ClubRecordType, Rivalry, RivalryOrigin, ManagerCareerEntry, ManagerExitReason } from '@/types/legacy';

export async function upsertManagerCareerEntry(db: DbHandle, saveId: number, e: ManagerCareerEntry): Promise<void> {
  await db.prepare(
    `INSERT OR REPLACE INTO manager_career
       (save_id, season, club_id, division_level, league_position, total_teams, trophies, manager_reputation, exit_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(saveId, e.season, e.clubId, e.divisionLevel, e.leaguePosition, e.totalTeams, e.trophies, e.managerReputation, e.exitReason);
}

export async function setManagerExitReason(db: DbHandle, saveId: number, season: number, reason: ManagerExitReason): Promise<void> {
  await db.prepare('UPDATE manager_career SET exit_reason = ? WHERE save_id = ? AND season = ?').run(reason, saveId, season);
}

export async function getManagerCareer(db: DbHandle, saveId: number): Promise<ManagerCareerEntry[]> {
  const rows = (await db.prepare(
    `SELECT season, club_id, division_level, league_position, total_teams, trophies, manager_reputation, exit_reason
     FROM manager_career WHERE save_id = ? ORDER BY season ASC`,
  ).all(saveId)) as Array<{
    season: number; club_id: number; division_level: number; league_position: number | null;
    total_teams: number; trophies: number; manager_reputation: number; exit_reason: ManagerExitReason;
  }>;
  return rows.map((r) => ({
    season: r.season, clubId: r.club_id, divisionLevel: r.division_level,
    leaguePosition: r.league_position, totalTeams: r.total_teams, trophies: r.trophies,
    managerReputation: r.manager_reputation, exitReason: r.exit_reason,
  }));
}

export async function upsertRivalry(db: DbHandle, saveId: number, r: Rivalry): Promise<void> {
  const a = Math.min(r.clubAId, r.clubBId), b = Math.max(r.clubAId, r.clubBId);
  await db.prepare(
    `INSERT OR REPLACE INTO rivalries (save_id, club_a_id, club_b_id, intensity, origin) VALUES (?, ?, ?, ?, ?)`,
  ).run(saveId, a, b, r.intensity, r.origin);
}

function mapRivalry(row: { club_a_id: number; club_b_id: number; intensity: number; origin: RivalryOrigin }): Rivalry {
  return { clubAId: row.club_a_id, clubBId: row.club_b_id, intensity: row.intensity, origin: row.origin };
}

export async function getRivalry(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<Rivalry | null> {
  const a = Math.min(clubAId, clubBId), b = Math.max(clubAId, clubBId);
  const row = (await db.prepare(
    'SELECT club_a_id, club_b_id, intensity, origin FROM rivalries WHERE save_id = ? AND club_a_id = ? AND club_b_id = ?',
  ).get(saveId, a, b)) as { club_a_id: number; club_b_id: number; intensity: number; origin: RivalryOrigin } | undefined;
  return row ? mapRivalry(row) : null;
}

export async function getRivalries(db: DbHandle, saveId: number, clubId: number): Promise<Rivalry[]> {
  const rows = (await db.prepare(
    `SELECT club_a_id, club_b_id, intensity, origin FROM rivalries
     WHERE save_id = ? AND (club_a_id = ? OR club_b_id = ?) ORDER BY intensity DESC, club_a_id ASC, club_b_id ASC`,
  ).all(saveId, clubId, clubId)) as Array<{ club_a_id: number; club_b_id: number; intensity: number; origin: RivalryOrigin }>;
  return rows.map(mapRivalry);
}

export async function replaceClubLegends(db: DbHandle, saveId: number, clubId: number, legends: Legend[]): Promise<void> {
  await db.prepare('DELETE FROM club_legends WHERE save_id = ? AND club_id = ?').run(saveId, clubId);
  for (const l of legends) {
    await db.prepare(
      `INSERT INTO club_legends
         (save_id, club_id, player_id, legend_score, appearances, goals, trophies, individual_awards, first_season, last_season)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(saveId, clubId, l.playerId, l.legendScore, l.appearances, l.goals, l.trophies, l.individualAwards, l.firstSeason, l.lastSeason);
  }
}

export async function getClubLegends(db: DbHandle, saveId: number, clubId: number): Promise<Legend[]> {
  const rows = (await db.prepare(
    `SELECT player_id, club_id, legend_score, appearances, goals, trophies, individual_awards, first_season, last_season
     FROM club_legends WHERE save_id = ? AND club_id = ? ORDER BY legend_score DESC, player_id ASC`,
  ).all(saveId, clubId)) as Array<{
    player_id: number; club_id: number; legend_score: number; appearances: number; goals: number;
    trophies: number; individual_awards: number; first_season: number; last_season: number;
  }>;
  return rows.map((r) => ({
    playerId: r.player_id, clubId: r.club_id, legendScore: r.legend_score,
    appearances: r.appearances, goals: r.goals, trophies: r.trophies,
    individualAwards: r.individual_awards, firstSeason: r.first_season, lastSeason: r.last_season,
  }));
}

export async function replaceClubRecords(db: DbHandle, saveId: number, clubId: number, records: ClubRecord[]): Promise<void> {
  await db.prepare('DELETE FROM club_records WHERE save_id = ? AND club_id = ?').run(saveId, clubId);
  for (const r of records) {
    await db.prepare(
      `INSERT INTO club_records (save_id, club_id, record_type, value, holder_id, season, fixture_ref, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(saveId, clubId, r.type, r.value, r.holderId, r.season, r.fixtureRef, r.detail);
  }
}

export async function getClubRecords(db: DbHandle, saveId: number, clubId: number): Promise<ClubRecord[]> {
  const rows = (await db.prepare(
    'SELECT record_type, club_id, value, holder_id, season, fixture_ref, detail FROM club_records WHERE save_id = ? AND club_id = ? ORDER BY record_type ASC',
  ).all(saveId, clubId)) as Array<{
    record_type: ClubRecordType; club_id: number; value: number;
    holder_id: number | null; season: number | null; fixture_ref: number | null; detail: string;
  }>;
  return rows.map((r) => ({
    type: r.record_type, clubId: r.club_id, value: r.value,
    holderId: r.holder_id, season: r.season, fixtureRef: r.fixture_ref, detail: r.detail,
  }));
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/queries/legacy.test.ts` → 4 passing. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/database/queries/legacy.ts __tests__/database/queries/legacy.test.ts` · msg `feat(c1): queries de legado — manager_career, rivalries, legends/records (save-isolated)`.

---

## Task 9: Head-to-head query + orquestrador `legacy-archiver.ts` (TDD, integração)

**Files:** Create `src/engine/legacy/legacy-archiver.ts`; Modify `src/database/queries/legacy.ts` (add `getHeadToHead`); Create `__tests__/integration/legacy-archiver.test.ts`.
**Interfaces:** Consumes: motores (Tasks 2-6), queries (Task 8), `DbHandle`, `SeededRng`. Produces: `archiveLegacy`, `bootstrapRivalries`, `getHeadToHead`.

`getHeadToHead(db, saveId, a, b)` conta fixtures jogadas entre os dois clubes (`meetings`), `finals` (fixtures de cup/continental no maior round — aproximação: fixtures com `round` numérico ≥ ao máximo daquela competição/temporada não é trivial; para V1 usar `finals` = nº de `season_competition_results` onde {champ,runnerUp} = {a,b}) e `titleDeciders` = nº de temporadas em que ambos terminaram 1º/2º na mesma liga (via `season_competition_results`). `archiveLegacy` agrega para o clube do jogador: scorers/appearances (de `match_events`+`player_stats`), results (fixtures do clube), trophiesBySeason (de `season_competition_results`), individualAwards/trophies por jogador (de `season_awards`+`season_player_titles`), roda `rankLegends`/`computeClubRecords`, persiste via `replace*`; depois reforça rivalidades dos confrontos da temporada. `bootstrapRivalries` lê clubes, monta `RivalryClub[]`, roda `generateRivalries(clubs, new SeededRng(saveId))`, persiste via `upsertRivalry`.

- [ ] **Step 1 — teste falhando** `__tests__/integration/legacy-archiver.test.ts`:
```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../database/test-helpers';
import { DbHandle } from '../../src/database/queries/players';
import { archiveLegacy, bootstrapRivalries } from '../../src/engine/legacy/legacy-archiver';
import { getClubLegends, getClubRecords, getRivalries } from '../../src/database/queries/legacy';

const CLUB = 1;

function seedArchivedSeason(rawDb: Database.Database) {
  rawDb.pragma('foreign_keys = OFF');
  rawDb.prepare(`INSERT INTO competitions (id, save_id, name, type, format, season, league_id)
                 VALUES (1, 1, 'League', 'league', 'round_robin', 1, 1)`).run();
  // 2 fixtures do clube 1: 5-0 (win) e 0-2 (loss)
  rawDb.prepare(`INSERT INTO fixtures (id, save_id, competition_id, season, week, home_club_id, away_club_id, home_goals, away_goals, played)
                 VALUES (1,1,1,1,1,1,12,5,0,1),(2,1,1,1,2,13,1,2,0,1)`).run();
  // goals do jogador 100 (clube 1)
  rawDb.prepare(`INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id)
                 VALUES (1,10,'goal',100,NULL),(1,20,'goal',100,NULL)`).run();
  rawDb.prepare(`INSERT INTO player_stats (save_id, player_id, season, competition_id, appearances, goals, assists)
                 VALUES (1,100,1,1,2,2,0)`).run();
  rawDb.prepare(`INSERT INTO season_competition_results (save_id, season, competition_id, champion_club_id, runner_up_club_id)
                 VALUES (1,1,1,1,2)`).run();
  rawDb.prepare(`INSERT INTO season_player_titles (save_id, season, competition_id, club_id, player_id)
                 VALUES (1,1,1,1,100)`).run();
  rawDb.pragma('foreign_keys = ON');
}

describe('legacy-archiver (integração)', () => {
  let rawDb: Database.Database; let db: DbHandle;
  beforeEach(() => { rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb); seedArchivedSeason(rawDb); });
  afterEach(() => rawDb.close());

  it('materializa legends e records do clube e é idempotente', async () => {
    await archiveLegacy(db, 1, 1, CLUB);
    const legs1 = await getClubLegends(db, 1, CLUB);
    const recs1 = await getClubRecords(db, 1, CLUB);
    expect(legs1.some((l) => l.playerId === 100 && l.goals === 2)).toBe(true);
    expect(recs1.find((r) => r.type === 'biggest_win')?.value).toBe(5);
    await archiveLegacy(db, 1, 1, CLUB); // 2ª vez
    const legs2 = await getClubLegends(db, 1, CLUB);
    expect(legs2).toEqual(legs1); // idempotente
  });

  it('bootstrapRivalries é determinístico por saveId', async () => {
    await bootstrapRivalries(db, 1);
    const r1 = await getRivalries(db, 1, CLUB);
    // rodar de novo (INSERT OR REPLACE) → mesmo conteúdo
    await bootstrapRivalries(db, 1);
    const r2 = await getRivalries(db, 1, CLUB);
    expect(r2).toEqual(r1);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/integration/legacy-archiver.test.ts` → módulo inexistente.
- [ ] **Step 3a — implementar `getHeadToHead`** em `src/database/queries/legacy.ts`:
```ts
import { HeadToHead } from '@/engine/legacy/rivalry-engine';

export async function getHeadToHead(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<HeadToHead> {
  const a = Math.min(clubAId, clubBId), b = Math.max(clubAId, clubBId);
  const meet = (await db.prepare(
    `SELECT COUNT(*) AS c FROM fixtures WHERE save_id = ? AND played = 1
       AND ((home_club_id = ? AND away_club_id = ?) OR (home_club_id = ? AND away_club_id = ?))`,
  ).get(saveId, a, b, b, a)) as { c: number };
  const deciders = (await db.prepare(
    `SELECT COUNT(*) AS c FROM season_competition_results
     WHERE save_id = ? AND ((champion_club_id = ? AND runner_up_club_id = ?) OR (champion_club_id = ? AND runner_up_club_id = ?))`,
  ).get(saveId, a, b, b, a)) as { c: number };
  return { clubAId: a, clubBId: b, meetings: meet.c, finals: deciders.c, titleDeciders: deciders.c };
}
```
- [ ] **Step 3b — implementar `legacy-archiver.ts`**:
```ts
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { rankLegends, LegendCandidate } from './legends-engine';
import { computeClubRecords } from './records-engine';
import { generateRivalries, reinforceIntensity, RivalryClub } from './rivalry-engine';
import {
  replaceClubLegends, replaceClubRecords, upsertRivalry, getRivalry, getHeadToHead,
} from '@/database/queries/legacy';
import { LEGENDS_LIMIT } from '@/engine/balance';

interface AggRow { player_id: number; appearances: number; goals: number; assists: number; first_season: number; last_season: number; }

async function loadLegendCandidates(db: DbHandle, saveId: number, clubId: number): Promise<LegendCandidate[]> {
  // aparições/gols/assist all-time dos jogadores que pertencem ao clube
  const stats = (await db.prepare(
    `SELECT ps.player_id AS player_id,
            SUM(ps.appearances) AS appearances, SUM(ps.goals) AS goals, SUM(ps.assists) AS assists,
            MIN(ps.season) AS first_season, MAX(ps.season) AS last_season
     FROM player_stats ps JOIN players p ON p.id = ps.player_id AND p.save_id = ps.save_id
     WHERE ps.save_id = ? AND p.club_id = ? GROUP BY ps.player_id`,
  ).all(saveId, clubId)) as AggRow[];
  // títulos por jogador (season_player_titles) e prêmios individuais (season_awards rank 1 + mvp/breakthrough)
  const titles = (await db.prepare(
    'SELECT player_id, COUNT(*) AS n FROM season_player_titles WHERE save_id = ? AND club_id = ? GROUP BY player_id',
  ).all(saveId, clubId)) as Array<{ player_id: number; n: number }>;
  const awards = (await db.prepare(
    `SELECT player_id, COUNT(*) AS n FROM season_awards
     WHERE save_id = ? AND club_id = ? AND ((award_type IN ('mvp','breakthrough')) OR (award_type IN ('top_scorer','top_assister') AND rank = 1))
     GROUP BY player_id`,
  ).all(saveId, clubId)) as Array<{ player_id: number; n: number }>;
  const tMap = new Map(titles.map((t) => [t.player_id, t.n]));
  const aMap = new Map(awards.map((a) => [a.player_id, a.n]));
  return stats.map((s) => ({
    playerId: s.player_id, clubId,
    appearances: s.appearances ?? 0, goals: s.goals ?? 0, assists: s.assists ?? 0,
    trophies: tMap.get(s.player_id) ?? 0, individualAwards: aMap.get(s.player_id) ?? 0,
    firstSeason: s.first_season ?? 0, lastSeason: s.last_season ?? 0,
  }));
}

export async function archiveLegacy(db: DbHandle, saveId: number, season: number, clubId: number): Promise<void> {
  // 1. Legends
  const candidates = await loadLegendCandidates(db, saveId, clubId);
  await replaceClubLegends(db, saveId, clubId, rankLegends(candidates, LEGENDS_LIMIT));

  // 2. Records (scorers, appearances, results, trophiesBySeason)
  const scorers = candidates.map((c) => ({ playerId: c.playerId, goals: c.goals }));
  const appearances = candidates.map((c) => ({ playerId: c.playerId, games: c.appearances }));
  const fixtures = (await db.prepare(
    `SELECT id, season, home_club_id, away_club_id, home_goals, away_goals
     FROM fixtures WHERE save_id = ? AND played = 1 AND (home_club_id = ? OR away_club_id = ?)
       AND home_goals IS NOT NULL AND away_goals IS NOT NULL`,
  ).all(saveId, clubId, clubId)) as Array<{ id: number; season: number; home_club_id: number; away_club_id: number; home_goals: number; away_goals: number }>;
  const results = fixtures.map((f) => {
    const home = f.home_club_id === clubId;
    return { fixtureId: f.id, season: f.season,
      gf: home ? f.home_goals : f.away_goals, ga: home ? f.away_goals : f.home_goals,
      opponentId: home ? f.away_club_id : f.home_club_id };
  });
  const trophyRows = (await db.prepare(
    'SELECT season, COUNT(*) AS n FROM season_competition_results WHERE save_id = ? AND champion_club_id = ? GROUP BY season',
  ).all(saveId, clubId)) as Array<{ season: number; n: number }>;
  const trophiesBySeason = new Map(trophyRows.map((t) => [t.season, t.n]));
  await replaceClubRecords(db, saveId, clubId, computeClubRecords({ clubId, scorers, appearances, results, trophiesBySeason }));

  // 3. Reforço de rivalidades nos confrontos desta temporada
  const opponents = (await db.prepare(
    `SELECT DISTINCT CASE WHEN home_club_id = ? THEN away_club_id ELSE home_club_id END AS opp
     FROM fixtures WHERE save_id = ? AND season = ? AND played = 1 AND (home_club_id = ? OR away_club_id = ?)`,
  ).all(clubId, saveId, season, clubId, clubId)) as Array<{ opp: number }>;
  for (const { opp } of opponents) {
    const base = await getRivalry(db, saveId, clubId, opp);
    if (!base) continue;
    const h2h = await getHeadToHead(db, saveId, clubId, opp);
    const next = reinforceIntensity(base, h2h);
    await upsertRivalry(db, saveId, { ...base, intensity: next });
  }
}

export async function bootstrapRivalries(db: DbHandle, saveId: number): Promise<void> {
  const rows = (await db.prepare(
    `SELECT c.id AS id, c.league_id AS leagueId, c.country_id AS countryId, c.reputation AS reputation, l.division_level AS divisionLevel
     FROM clubs c JOIN leagues l ON l.id = c.league_id WHERE c.save_id = ?`,
  ).all(saveId)) as RivalryClub[];
  const rivalries = generateRivalries(rows, new SeededRng(saveId));
  for (const r of rivalries) await upsertRivalry(db, saveId, r);
}
```
- [ ] **Step 3c — constante:** em `src/engine/balance.ts` adicionar `export const LEGENDS_LIMIT = 12;`.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/integration/legacy-archiver.test.ts` → 2 passing. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/legacy/legacy-archiver.ts src/database/queries/legacy.ts src/engine/balance.ts __tests__/integration/legacy-archiver.test.ts` · msg `feat(c1): legacy-archiver — materializa legends/records + reforça rivalidades; getHeadToHead`.

---

## Task 10: `match-engine` aceita `derbyBonus` (TDD não-regressão)

**Files:** Modify `src/engine/simulation/match-engine.ts:19-33` (MatchInput), `:363-390` (aplicar); Create `__tests__/engine/match-derby.test.ts`.
**Interfaces:** Consumes: `DerbyBonus` (Task 5). Produces: `MatchInput.derbyBonus?`.

Aplicação: em `simulateFirstHalf`, multiplicar a vantagem de casa pelo `atmosphereMult` e somar `homeMoraleBonus`/`awayMoraleBonus` à moral dos jogadores antes de `makeTeam` (campos `morale` existem em `PlayerForStrength`? — se não, aplicar só no `homeAdv` por `atmosphereMult`, mantendo bônus de moral como no-op até existir o campo; **verificar** `PlayerForStrength` em `team-strength.ts` ao implementar). **Não-regressão:** `derbyBonus` ausente ou neutro ⇒ resultado idêntico a hoje (mesma seed).

- [ ] **Step 1 — teste falhando** `__tests__/engine/match-derby.test.ts`:
```ts
import { simulateMatch, MatchInput } from '@/engine/simulation/match-engine';
import { SeededRng } from '@/engine/rng';
import { deriveDerbyBonus } from '@/engine/legacy/derby-bonus';
import { Tactic } from '@/types/tactic';

// usa o helper de squad de outro teste do match-engine como molde
import { makeSquad, baseTactic } from './match-fixtures'; // ver nota

function input(derby?: ReturnType<typeof deriveDerbyBonus>): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeSquad(1), awaySquad: makeSquad(100),
    homeTactic: baseTactic(), awayTactic: baseTactic(),
    homeClubReputation: 70, awayClubReputation: 70,
    derbyBonus: derby, rng: new SeededRng(123),
  };
}

it('bônus neutro == sem bônus (não-regressão, mesma seed)', () => {
  const a = simulateMatch(input(undefined));
  const b = simulateMatch(input(deriveDerbyBonus(null)));
  expect(b.homeGoals).toBe(a.homeGoals);
  expect(b.awayGoals).toBe(a.awayGoals);
  expect(b.stats.homeXG).toBe(a.stats.homeXG);
});

it('bônus de clássico altera o jogo de forma determinística', () => {
  const a = simulateMatch(input(deriveDerbyBonus(100)));
  const b = simulateMatch(input(deriveDerbyBonus(100)));
  expect(a.homeGoals).toBe(b.homeGoals); // determinístico
});
```
> Nota: se não existir `./match-fixtures`, criar um helper mínimo no próprio arquivo de teste construindo `PlayerForStrength[]` (11 jogadores) e um `Tactic` default — espelhar o setup já usado em `__tests__/engine/match-engine*.test.ts` (grep antes de escrever).
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/match-derby.test.ts` → `derbyBonus` não existe em MatchInput (TS) / falha.
- [ ] **Step 3 — implementar** em `match-engine.ts`:
  - Em `MatchInput` (`:19-33`) adicionar `derbyBonus?: { atmosphereMult: number; homeMoraleBonus: number; awayMoraleBonus: number };`.
  - Em `simulateFirstHalf` (`:368-375`), após `const homeAdv = homeAdvantageMultiplier(attendanceForAdv);` aplicar:
```ts
    const atmosphere = input.derbyBonus?.atmosphereMult ?? 1;
    const homeAdvWithDerby = homeAdv * atmosphere;
```
  e usar `homeAdvWithDerby` no lugar de `homeAdv` nas chamadas `makeTeam(...)` e nos `runBlock(...)` deste método e no `HalftimeState` retornado (`homeAdv: homeAdvWithDerby`). Bônus de moral: se `PlayerForStrength` tiver campo de moral, mapear os squads somando `homeMoraleBonus`/`awayMoraleBonus` (clamp 0..100) antes de `makeTeam`; senão deixar como no-op documentado (atmosfera já é o vetor principal). **A não-regressão exige que `atmosphereMult===1` ⇒ `homeAdvWithDerby===homeAdv` — garantido pelo `?? 1`.**
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/match-derby.test.ts` → 2 passing. Rodar a suíte de balanceamento: `npx jest __tests__/engine/match` → tudo verde (não-regressão dos baselines).
- [ ] **Step 5 — commit:** `git add src/engine/simulation/match-engine.ts __tests__/engine/match-derby.test.ts` · msg `feat(c1): match-engine aceita derbyBonus (atmosfera) — neutro == sem regressão`.

---

## Task 11: `match-runner` propaga `derbyBonus` por fixture

**Files:** Modify `src/engine/simulation/match-runner.ts:15-19` (FixtureSimInput), `:44-80` (passar p/ MatchInput).
**Interfaces:** Consumes: `DerbyBonus`. Produces: `FixtureSimInput.derbyBonus?`.

- [ ] **Step 1 — teste falhando:** estender `__tests__/engine/match-derby.test.ts` (ou criar `__tests__/engine/match-runner-derby.test.ts`):
```ts
import { simulateWeekFixtures } from '@/engine/simulation/match-runner';
import { SeededRng } from '@/engine/rng';
import { deriveDerbyBonus } from '@/engine/legacy/derby-bonus';
// reaproveitar makeSquad/baseTactic + montar clubData Map<number, ClubMatchData>

it('runner aceita derbyBonus por fixture (neutro == sem campo)', () => {
  const clubData = new Map([
    [1, { clubId: 1, reputation: 70, squad: makeSquad(1), bench: [], tactic: baseTactic() }],
    [2, { clubId: 2, reputation: 70, squad: makeSquad(100), bench: [], tactic: baseTactic() }],
  ]);
  const plain = simulateWeekFixtures({ fixtures: [{ fixtureId: 1, homeClubId: 1, awayClubId: 2 }], clubData, rng: new SeededRng(9) });
  const neutral = simulateWeekFixtures({ fixtures: [{ fixtureId: 1, homeClubId: 1, awayClubId: 2, derbyBonus: deriveDerbyBonus(null) }], clubData, rng: new SeededRng(9) });
  expect(neutral[0].result.homeGoals).toBe(plain[0].result.homeGoals);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest match-runner-derby` → `derbyBonus` não existe em FixtureSimInput.
- [ ] **Step 3 — implementar** em `match-runner.ts`: adicionar `derbyBonus?: DerbyBonus;` em `FixtureSimInput` (importar `DerbyBonus` de `@/engine/legacy/derby-bonus`); no `simulateMatch({...})` (`:63-76`) passar `derbyBonus: fx.derbyBonus`.
- [ ] **Step 4 — rodar (passa):** `npx jest match-runner-derby` → passing. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/simulation/match-runner.ts __tests__/engine/match-runner-derby.test.ts` · msg `feat(c1): match-runner propaga derbyBonus por fixture`.

---

## Task 12: Wiring no `game-loop` — derby por fixture + `archiveLegacy` no fim de temporada

**Files:** Modify `src/engine/game-loop.ts:286-306` (montar derby) e `:811-812` (chamar archiveLegacy + bootstrap).
**Interfaces:** Consumes: `getRivalry`, `deriveDerbyBonus`, `archiveLegacy`, `bootstrapRivalries`.

- [ ] **Step 1 — teste falhando** (integração): `__tests__/integration/legacy-game-loop.test.ts` — montar save com rivalidade conhecida entre o clube do jogador e um adversário na semana, rodar `processWeek` (entrypoint do game-loop; grep o nome real) até o fim de temporada e assertar que `getClubLegends(db, saveId, playerClub)` não é vazio após `isSeasonEnd`. (Espelhar `__tests__/integration/end-of-season-progression.test.ts` para o setup do loop.)
```ts
// esqueleto — ajustar ao entrypoint real do game-loop encontrado por grep
it('fim de temporada materializa legado do clube do jogador', async () => {
  // ... seed save com 1 temporada de fixtures jogadas + awards arquivados via archiveSeason ...
  await runSeasonToEnd(db, saveId, playerClubId); // helper local que chama o loop semana a semana
  const legs = await getClubLegends(db, saveId, playerClubId);
  expect(legs.length).toBeGreaterThan(0);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest legacy-game-loop` → legends vazio (archiveLegacy ainda não chamado).
- [ ] **Step 3a — derby por fixture** (`game-loop.ts:303-306`): antes de `simulateWeekFixtures`, mapear cada `simInput` para incluir `derbyBonus`:
```ts
import { getRivalry } from '@/database/queries/legacy';
import { deriveDerbyBonus } from '@/engine/legacy/derby-bonus';
// ...
const simInputsWithDerby: FixtureSimInput[] = [];
for (const f of simInputs) {
  const rivalry = await getRivalry(db, saveId, f.homeClubId, f.awayClubId);
  simInputsWithDerby.push({ ...f, derbyBonus: deriveDerbyBonus(rivalry?.intensity ?? null) });
}
const simulated = simulateWeekFixtures({ fixtures: simInputsWithDerby, clubData, rng });
```
  > Determinismo: `getRivalry` não consome o `rng`; a ordem das fixtures não muda (mesmo array). O stream de RNG do match é idêntico ao de hoje quando não há rival (atmosfera neutra).
- [ ] **Step 3b — archiveLegacy no fim de temporada** (`game-loop.ts:811`): após `await distributePrizeMoney(...)` (`:812`), adicionar:
```ts
import { archiveLegacy } from '@/engine/legacy/legacy-archiver';
// dentro do bloco isSeasonEnd, após distributePrizeMoney:
await archiveLegacy(db, saveId, season, playerClubId);
```
- [ ] **Step 3c — bootstrapRivalries na criação do save:** localizar o ponto onde o save é criado/seedado (grep `bootstrapRivalries` candidatos: `new-game`/`createSave`/`NewGameScreen` chama um setup do save). Chamar `await bootstrapRivalries(db, saveId)` uma vez após o seed inserir clubes. (Se o setup do save for em store/screen, expor via função em `legacy-archiver` já criada; o passo só fia a chamada.)
- [ ] **Step 4 — rodar (passa):** `npx jest legacy-game-loop` → passing. `npx jest __tests__/integration` → suíte verde (não-regressão do loop). `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/game-loop.ts __tests__/integration/legacy-game-loop.test.ts` · msg `feat(c1): wiring game-loop — derby por fixture + archiveLegacy no fim de temporada + bootstrap de rivalidades`.

---

## Task 13: `manager_career` — gravação no fim de temporada + resignação em `acceptJobOffer`

**Files:** Modify `src/engine/season/season-end-eval.ts:209-246` (gravar entrada) e `src/engine/board/accept-job-offer.ts:42-45` (resigned); Create `__tests__/integration/manager-career.test.ts`.
**Interfaces:** Consumes: `upsertManagerCareerEntry`, `setManagerExitReason`, `isManagerDismissed`. Produces: trilha de carreira completa.

`season-end-eval` já tem `leaguePosition`, `totalTeams`, `managerRepDelta.next`, `board.consequence`, `wonCup`, `wasPromoted`. Falta `divisionLevel` (resolver via league do clube — já busca `allClubs`/`leaguesForDiv`) e `trophies` da temporada (count de `season_competition_results` onde champion = playerClubId).

- [ ] **Step 1 — teste falhando** `__tests__/integration/manager-career.test.ts`:
```ts
// 1) evaluateSeasonEndBoard grava manager_career com exit_reason coerente
// 2) acceptJobOffer sobrescreve a entrada da temporada que terminou para 'resigned'
it('fim de temporada grava stayed; aceitar oferta vira resigned', async () => {
  // ... seed save + 1 temporada jogada + objetivo do board ...
  await evaluateSeasonEndBoard(db, { saveId, playerClubId, clubReputation, endedSeason: 1, newSeason: 2, competitions, offerRng: new SeededRng(1) });
  let career = await getManagerCareer(db, saveId);
  expect(career[0].season).toBe(1);
  expect(['stayed', 'fired']).toContain(career[0].exitReason);
  await acceptJobOffer({ db, saveId, offeringClubId: rivalClubId, offerSeason: 1, newSeason: 2, rng: new SeededRng(2) });
  career = await getManagerCareer(db, saveId);
  expect(career.find((e) => e.season === 1)?.exitReason).toBe('resigned');
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest manager-career` → entrada não existe / exit_reason não vira resigned.
- [ ] **Step 3a — season-end-eval:** após `await setManagerReputation(db, saveId, managerRepDelta.next);` (`:209`), gravar a entrada:
```ts
import { upsertManagerCareerEntry } from '@/database/queries/legacy';
import type { ManagerExitReason } from '@/types/legacy';
// ...
const divisionLevel = (leaguesForDiv.find((l) => l.id === playerLeagueId)?.divisionLevel) ?? 1;
const trophiesRow = (await db
  .prepare('SELECT COUNT(*) AS n FROM season_competition_results WHERE save_id = ? AND season = ? AND champion_club_id = ?')
  .get(saveId, endedSeason, playerClubId)) as { n: number };
const exitReason: ManagerExitReason = isManagerDismissed(board.consequence) ? 'fired' : 'stayed';
await upsertManagerCareerEntry(db, saveId, {
  season: endedSeason, clubId: playerClubId, divisionLevel,
  leaguePosition, totalTeams, trophies: trophiesRow.n,
  managerReputation: managerRepDelta.next, exitReason,
});
```
  > `leaguesForDiv` é montado dentro do bloco de job offers (`:216`); mover a leitura `getAllLeagues` para antes, ou reusar `getAllClubs`/`getClubsByLeague` já carregados. Aterrar na execução (a query é barata; pode-se chamar `getAllLeagues` uma vez no topo).
- [ ] **Step 3b — accept-job-offer:** antes do `UPDATE save_games SET player_club_id` (`:43-45`), fechar a carreira como resignada:
```ts
import { setManagerExitReason } from '@/database/queries/legacy';
// offerSeason é a temporada que terminou — a entrada de carreira foi gravada por season-end-eval.
await setManagerExitReason(db, saveId, offerSeason, 'resigned');
```
- [ ] **Step 4 — rodar (passa):** `npx jest manager-career` → passing. `npx jest __tests__/integration/accept-job-offer.test.ts` → ainda verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/season/season-end-eval.ts src/engine/board/accept-job-offer.ts __tests__/integration/manager-career.test.ts` · msg `feat(c1): trilha de carreira do técnico — stayed/fired no fim de temporada, resigned ao trocar de clube`.

---

## Task 14: i18n — chaves `legacy.*`/`records.*`/`rivalry.*`/`saga.*`/`manager_career.*` (pt/en paridade)

**Files:** Modify `src/i18n/pt.ts`, `src/i18n/en.ts`.
**Interfaces:** Produces: chaves consumidas pelas telas (Tasks 15-19) e pelo `saga-engine` (`saga.<arch>.title`/`.body`).

Chaves mínimas (formato plano dotted, espelhando `history.champion` etc.):
- `legacy.hall_of_fame_title`, `legacy.records_title`, `legacy.timeline_title`, `legacy.rivalries_title`, `legacy.empty`, `legacy.legend_score`, `legacy.appearances`, `legacy.goals`, `legacy.trophies`.
- `records.all_time_top_scorer`, `records.most_appearances`, `records.biggest_win`, `records.biggest_defeat`, `records.most_trophies_in_season`, `records.longest_unbeaten`.
- `rivalry.origin_derby`, `rivalry.origin_division`, `rivalry.origin_regional`, `rivalry.origin_historic`, `rivalry.intensity`, `rivalry.head_to_head`, `rivalry.meetings`.
- `manager_career.position`, `manager_career.exit_stayed`, `manager_career.exit_fired`, `manager_career.exit_resigned`, `manager_career.in_progress`, `manager_career.no_club`.
- `saga.<arch>.title` e `saga.<arch>.body` para os 9 arquétipos (`historic_title, title_race, promotion, relegation_fight, relegated, transition, rebuild, overachieved, underachieved`). Body usa `{position}`/`{totalTeams}`/`{trophies}`/`{season}`.
- Rotas (Task 18): `nav.hall_of_fame`, `nav.records`, `nav.manager_timeline`, `nav.rivalries`.

- [ ] **Step 1 — adicionar** todas as chaves acima em `pt.ts` (pt-BR) e `en.ts` (en), **mesmo conjunto de chaves** nos dois (paridade).
- [ ] **Step 2 — guard de paridade:** rodar o teste de paridade i18n existente (grep `i18n` em `__tests__/`; ex.: `__tests__/i18n/*`) → verde. Se não houver, `npx tsc --noEmit` (as chaves são tipadas via `TKey`).
- [ ] **Step 3 — commit:** `git add src/i18n/pt.ts src/i18n/en.ts` · msg `feat(c1): i18n pt/en — chaves de legado/recordes/rivalidades/sagas/carreira`.

---

## Task 15: Tela `HallOfFameScreen` (kit DS)

**Files:** Create `src/screens/career/HallOfFameScreen.tsx`.
**Interfaces:** Consumes: `getClubLegends`, kit DS (`Card`, `EmptyState`, `StatBar`, `Text`), `useGameStore`/`useDatabaseStore`, resolução de nome de jogador via query existente (grep `getPlayerById`/`getPlayersByClub`).

- [ ] **Step 1 — implementar:** ler `currentSave.id` + clube do jogador; `getClubLegends(dbHandle, saveId, clubId)`; resolver nomes reais dos jogadores (não `Player ${id}`); renderizar lista rankeada com `Card`, `legendScore` numa `StatBar` (label `legacy.legend_score`), aparições/gols/troféus. Lista vazia → `EmptyState` (`legacy.empty`). Tokens só de `@/theme` (zero literal). Espelhar a estrutura de `HistoryScreen` migrada (Task 19) e telas DS já migradas (grep `from '@/components/Card'`).
- [ ] **Step 2 — type-check:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 3 — commit:** `git add src/screens/career/HallOfFameScreen.tsx` · msg `feat(c1): HallOfFameScreen — lendas do clube rankeadas (kit DS)`.

---

## Task 16: Tela `RecordsScreen` (kit DS)

**Files:** Create `src/screens/career/RecordsScreen.tsx`.
**Interfaces:** Consumes: `getClubRecords`, kit DS.

- [ ] **Step 1 — implementar:** `getClubRecords(dbHandle, saveId, clubId)`; um `Card` por recorde com label i18n `records.<type>`, `value`, e `detail`/holder resolvido (nome de jogador quando `holderId`, nome de clube no `detail` do placar). Vazio → `EmptyState`. Tokens de `@/theme`.
- [ ] **Step 2 — type-check:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 3 — commit:** `git add src/screens/career/RecordsScreen.tsx` · msg `feat(c1): RecordsScreen — recordes all-time do clube (kit DS)`.

---

## Task 17: Tela `ManagerTimelineScreen` + sagas (kit DS)

**Files:** Create `src/screens/career/ManagerTimelineScreen.tsx`.
**Interfaces:** Consumes: `getManagerCareer`, `classifySeasonSaga`, kit DS.

- [ ] **Step 1 — implementar:** `getManagerCareer(dbHandle, saveId)`; para cada entrada, resolver nome do clube + `t('manager_career.exit_<reason>')`, posição/total, troféus, rep; rodar `classifySeasonSaga` (mapeando `ManagerCareerEntry` → `SagaInput`; `expectedPosition` desconhecido aqui → `null`) e renderizar `t(saga.titleKey, saga.vars)` + `t(saga.bodyKey, saga.vars)` como narrativa da temporada. Temporada corrente sem entrada → `manager_career.in_progress`. Vazio → `EmptyState`. Tokens de `@/theme`.
- [ ] **Step 2 — type-check:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 3 — commit:** `git add src/screens/career/ManagerTimelineScreen.tsx` · msg `feat(c1): ManagerTimelineScreen — linha do tempo da carreira + sagas (kit DS)`.

---

## Task 18: Tela `RivalriesScreen` + head-to-head (kit DS)

**Files:** Create `src/screens/career/RivalriesScreen.tsx`.
**Interfaces:** Consumes: `getRivalries`, `getHeadToHead`, kit DS.

- [ ] **Step 1 — implementar:** `getRivalries(dbHandle, saveId, clubId)`; por rival, nome do clube oponente, `t('rivalry.origin_<origin>')`, `intensity` numa `StatBar` (max 100), e `getHeadToHead` (meetings/títulos disputados). Vazio → `EmptyState`. Tokens de `@/theme`.
- [ ] **Step 2 — type-check:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 3 — commit:** `git add src/screens/career/RivalriesScreen.tsx` · msg `feat(c1): RivalriesScreen — rivalidades do clube + head-to-head (kit DS)`.

---

## Task 19: Navegação (4 rotas) + migração da `HistoryScreen`

**Files:** Modify `src/navigation/types.ts` (RootStackParamList), `src/navigation/RootNavigator.tsx` (imports + `Stack.Screen`); Modify `src/screens/history/HistoryScreen.tsx`.
**Interfaces:** Consumes: telas (Tasks 15-18), `getSeasonSummary`, resolução de nomes, `classifySeasonSaga`.

- [ ] **Step 1 — rotas em `types.ts`:** após `Achievements: undefined;` (`:55`) adicionar:
```ts
  HallOfFame: undefined;
  Records: undefined;
  ManagerTimeline: undefined;
  Rivalries: undefined;
```
- [ ] **Step 2 — registrar em `RootNavigator.tsx`:** importar as 4 telas (espelhar imports `career/*` em `:42-43`) e adicionar após `Achievements` (`:111`):
```tsx
      <Stack.Screen name="HallOfFame" component={HallOfFameScreen} options={{ title: t('nav.hall_of_fame') }} />
      <Stack.Screen name="Records" component={RecordsScreen} options={{ title: t('nav.records') }} />
      <Stack.Screen name="ManagerTimeline" component={ManagerTimelineScreen} options={{ title: t('nav.manager_timeline') }} />
      <Stack.Screen name="Rivalries" component={RivalriesScreen} options={{ title: t('nav.rivalries') }} />
```
  E adicionar entradas de acesso (botões) onde `SeasonHistory`/`Achievements` são alcançados (hub de carreira/history) — grep `navigate('Achievements'` para achar o local e espelhar 4 botões novos.
- [ ] **Step 3 — migrar `HistoryScreen`:** trocar `StyleSheet`/`colors` crus pelo kit DS (`Card`, `Text` semânticos, `EmptyState`); resolver `championClubId`/`runnerUpClubId` em nomes reais de clube (grep `getClubById`/`getAllClubs`) e `playerId` em nome de jogador (substituir `Club ${id}`/`Player ${id}`); adicionar a saga da temporada selecionada via `classifySeasonSaga` (derivar `wonLeague`/posição da própria `SeasonCompetitionSummary` + `getManagerCareer` para posição/total). Tokens só de `@/theme`.
- [ ] **Step 4 — type-check + suíte:** `npx tsc --noEmit` → exit 0; `npx jest` → tudo verde.
- [ ] **Step 5 — commit:** `git add src/navigation/types.ts src/navigation/RootNavigator.tsx src/screens/history/HistoryScreen.tsx` · msg `feat(c1): rotas de legado + HistoryScreen migrada ao kit DS com nomes reais e saga`.

---

## Task 20: Verificação final (DoD)

**Files:** nenhum (gate).

- [ ] **Step 1 — suíte + type-check:** `npx jest && npx tsc --noEmit` — tudo verde (motores, queries, archiver, manager-career, derby não-regressão, baselines de balanceamento intactos).
- [ ] **Step 2 — browser (Playwright MCP):** subir web (`npm run web`), abrir Hall da Fama / Recordes / Linha do Tempo / Rivalidades + History migrada; confirmar nomes reais (não `Club N`/`Player N`), `EmptyState` em carreira nova, 0 erros de console.
- [ ] **Step 3 — DoD:** schema espelhado (schema.ts + database-store.ts); todas as queries `(db, saveId, ...)`; rivalry determinístico por `saveId`; derby neutro == sem regressão; i18n pt/en em paridade; 4 telas + History no kit DS; sem `Math.random`/`Date.now` em engine; `git diff` revisado.

---

## Self-Review

1. **Cobertura do spec:** §3 tabelas → Task 7; motores puros (legends/records/rivalry/saga/derby) → Tasks 2-6; orquestrador `legacy-archiver` + `getHeadToHead` → Task 9; queries save-isolated → Tasks 8-9; derby no match-engine → Tasks 10-11; wiring game-loop (derby + archiveLegacy + bootstrap) → Task 12; manager_career (fim de temporada + resigned) → Task 13; i18n → Task 14; 4 telas + nav + HistoryScreen → Tasks 15-19; verificação/DoD → Task 20. §6 edge cases cobertos: idempotência (Tasks 8/9), save-isolation (Task 8), derby neutro (Task 10), resignação sobrescreve (Task 13), placar nulo guard (Task 9 filtra `home_goals IS NOT NULL`), empate por id (Tasks 2/3). §9 out-of-scope respeitado (sem nemesis, sem Hall global, sem persistência de saga).
2. **Placeholder scan:** sem "TBD"/"FIXME". Pontos a aterrar-na-execução explicitados: campo de moral em `PlayerForStrength` (Task 10 — verificar `team-strength.ts`, fallback no-op documentado, não muda comportamento neutro), entrypoint real do game-loop e ponto de criação do save para `bootstrapRivalries` (Task 12 — grep antes), helper de squad nos testes de match (Task 10 — grep `match-engine*.test.ts`), local dos botões de navegação (Task 19 — grep `navigate('Achievements'`). Nenhum desses é placeholder de comportamento: as assinaturas e o DDL são concretos.
3. **Consistência de tipos:** `Legend↔club_legends`, `ClubRecord↔club_records`, `Rivalry↔rivalries`, `ManagerCareerEntry↔manager_career` batem coluna a coluna (Task 7 vs Contract). `DerbyBonus` produzido na Task 5 é consumido por MatchInput (Task 10) e FixtureSimInput (Task 11) com a mesma forma. `HeadToHead`/`RivalryClub` definidos no `rivalry-engine` (Task 4) e reimportados em `legacy.ts` (Task 9) sem divergência. `archiveLegacy(db, saveId, season, clubId)` — assinatura com `clubId` (refinamento do spec, que materializa só o clube do jogador, §9) usada consistentemente nas Tasks 9 e 12.
