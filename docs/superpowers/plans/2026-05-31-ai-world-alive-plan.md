# AI World Alive — real sim, finances, regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tornar os clubes da IA cidadãos de primeira classe — toda fixture usa o `simulateMatch` real, todo clube paga salários e recebe receita semanal, e todo elenco regenera (base/potencial/valor/declínio) na virada, de modo que a qualidade da liga não colapse. Elimina o coin-flip de reputação (`simulateAiMatch`) e o código morto de `week-advance.ts`, consolidando-os em funções puras de engine reusadas pelo caminho humano e pelo da IA.

**Architecture:** `engine/` permanece **puro** (sem React/Expo/DB). Quatro módulos novos puros — `simulation/squad-selection.ts` (extração da seleção de XI/bench de `game-loop.ts`), `simulation/match-runner.ts` (orquestra `simulateMatch` para todas as fixtures da semana), `finance/weekly-finance.ts` (consolida `advanceWeek`), `rollover/squad-regeneration.ts` (potencial/valor/base da IA). A orquestração (queries + persistência) fica em `game-loop.ts`: uma carga em lote por semana (`loadWeekClubData`), roteamento de **todas** as fixtures pelo motor real, finanças multi-clube, ofertas IA→IA via mercado real (`offer-processor`), e regeneração no `isSeasonEnd`. `week-advance.ts` é **deletado**, não revivido.

**Tech Stack:** TypeScript 5.9 strict, Jest 29 + ts-jest, **better-sqlite3 real em memória (nunca mock)**, SQLite. Sem dependências novas. Sem strings de UI (epic é pura lógica de loop/engine).

**Spec:** `docs/superpowers/specs/2026-05-31-ai-world-alive-design.md`

---

## File Structure

| Arquivo | Ação | Porquê |
|---|---|---|
| `src/engine/simulation/squad-selection.ts` | **Create** | Extrai `pickStartingEleven`/`buildSquadFromSavedIds`/`buildBench`/`PlayerForPick`/`POSITION_GROUP` de `game-loop.ts` para reuso puro no caminho humano e no `match-runner`. |
| `src/engine/simulation/match-runner.ts` | **Create** | `simulateWeekFixtures` — puro; recebe fixtures + elencos pré-carregados, roda `simulateMatch` por fixture, devolve resultados. |
| `src/engine/finance/weekly-finance.ts` | **Create** | `computeWeeklyClubFinance` — puro; consolida a lógica de `advanceWeek`/bloco financeiro do humano numa função por-clube. |
| `src/engine/rollover/squad-regeneration.ts` | **Create** | `regenerateAiSquadSeason` — puro; potencial (via `recalculatePotential` com overall real), valor (via `calculateMarketValue`), por jogador da IA. |
| `src/engine/transfer/ai-offer-generator.ts` | **Modify** | Renomeia núcleo para `generateAiOffersForSquad`; adiciona `generateAiToAiOffers` que itera amostra de clubes-alvo da IA. |
| `src/engine/game-loop.ts` | **Modify** | Remove `simulateAiMatch` e `processAiTransfers`; adiciona `loadWeekClubData`; roteia todas as fixtures por `simulateWeekFixtures`; finanças multi-clube; ofertas IA→IA; regeneração no `isSeasonEnd`. |
| `src/engine/week-advance.ts` | **Delete** | Código morto, modelo divergente (`SEASON_LENGTH=46` local, `week % 2`). Consolidado em `weekly-finance.ts`. |
| `__tests__/engine/week-advance.test.ts` | **Delete** | Suíte do módulo deletado; coberta por `weekly-finance.test.ts`. |
| `__tests__/engine/simulation/squad-selection.test.ts` | **Create** | Unit puro. |
| `__tests__/engine/simulation/match-runner.test.ts` | **Create** | Unit puro. |
| `__tests__/engine/finance/weekly-finance.test.ts` | **Create** | Unit puro. |
| `__tests__/engine/rollover/squad-regeneration.test.ts` | **Create** | Unit puro. |
| `__tests__/engine/ai-real-sim.integration.test.ts` | **Create** | DB real: IA usa motor real, stats persistidos. |
| `__tests__/engine/ai-finance.integration.test.ts` | **Create** | DB real: budget de todos os clubes muda. |
| `__tests__/engine/ai-to-ai-offers.integration.test.ts` | **Create** | DB real: ofertas IA→IA via mercado real. |
| `__tests__/engine/ai-regeneration.integration.test.ts` | **Create** | DB real: elenco da IA não colapsa em 3 temporadas. |

**Schema changes (deste epic):** **nenhuma coluna/tabela nova**. Toda query nova/modificada **deve** filtrar por `save_id` quando `save-isolation` aterrissar (ver Dependencies); até lá, as queries seguem o padrão atual do repo (sem `save_id`), e os índices de `db-hardening` são pré-requisito de performance, não de correção.

---

### Task 1: Extrair seleção de elenco para módulo puro (`squad-selection.ts`)

Refactor sem mudança de comportamento: move `pickStartingEleven`, `buildSquadFromSavedIds`, `buildBench`, `PlayerForPick` e `POSITION_GROUP` de `game-loop.ts` para um módulo puro reusável. As funções internas de `game-loop.ts` (`buildSquadFromSavedIds`/`buildBenchFromSavedIds` nas linhas 348-417) viram as versões exportadas.

**Files:**
- Create: `src/engine/simulation/squad-selection.ts`
- Modify: `src/engine/game-loop.ts` (remove `PlayerForPick` linha 130-138, `POSITION_GROUP` 140-144, `pickStartingEleven` 146-183, as closures `buildSquadFromSavedIds` 348-380 / `buildBenchFromSavedIds` 393-404; importa do novo módulo)
- Test: `__tests__/engine/simulation/squad-selection.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `__tests__/engine/simulation/squad-selection.test.ts`:

```ts
import {
  pickStartingEleven,
  buildSquadFromSavedIds,
  buildBench,
  PlayerForPick,
} from '@/engine/simulation/squad-selection';
import { PlayerAttributes } from '@/types';

const ATTRS: PlayerAttributes = {
  finishing: 60, passing: 60, crossing: 60, dribbling: 60, heading: 60,
  longShots: 60, freeKicks: 60, vision: 60, composure: 60, decisions: 60,
  positioning: 60, aggression: 60, leadership: 60, pace: 60, stamina: 60,
  strength: 60, agility: 60, jumping: 60,
};

function mk(id: number, position: PlayerForPick['position'], over: Partial<PlayerForPick> = {}): PlayerForPick {
  return {
    id, position, secondaryPosition: null, attributes: ATTRS,
    morale: 70, fitness: 100, injuryWeeksLeft: 0, ...over,
  };
}

// 4-4-2 needs: 1 GK, 4 DEF, 4 MID, 2 FWD
const full = [
  mk(1, 'GK'),
  mk(2, 'CB'), mk(3, 'CB'), mk(4, 'LB'), mk(5, 'RB'),
  mk(6, 'CM'), mk(7, 'CM'), mk(8, 'LM'), mk(9, 'RM'),
  mk(10, 'ST'), mk(11, 'ST'),
  mk(12, 'CB'), mk(13, 'ST'), // extras for bench
];

describe('squad-selection', () => {
  it('pickStartingEleven returns 11 for a valid formation', () => {
    expect(pickStartingEleven(full, '4-4-2')).toHaveLength(11);
  });

  it('excludes injured and low-fitness players', () => {
    const squad = [...full];
    squad[0] = mk(1, 'GK', { injuryWeeksLeft: 2 });
    squad[1] = mk(2, 'CB', { fitness: 25 });
    const eleven = pickStartingEleven(squad, '4-4-2');
    expect(eleven.find(p => p.id === 1)).toBeUndefined();
    expect(eleven.find(p => p.id === 2)).toBeUndefined();
  });

  it('buildSquadFromSavedIds honours saved starter ids and falls back when ineligible', () => {
    const saved = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const built = buildSquadFromSavedIds(saved, full, '4-4-2');
    expect(built).toHaveLength(11);
    expect(built.map(p => p.id).sort((a, b) => a - b)).toEqual(saved);
  });

  it('buildBench excludes starters and caps at 8', () => {
    const eleven = pickStartingEleven(full, '4-4-2');
    const startIds = new Set(eleven.map(p => p.id));
    const bench = buildBench(full, startIds);
    expect(bench.length).toBeLessThanOrEqual(8);
    for (const b of bench) expect(startIds.has(b.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/engine/simulation/squad-selection.test.ts`
Expected: FAIL — `Cannot find module '@/engine/simulation/squad-selection'`.

- [ ] **Step 3: Implementação mínima**

Create `src/engine/simulation/squad-selection.ts` (move o código real de `game-loop.ts`, sem alterar a lógica). `buildBench` generaliza o trecho de bench de `game-loop.ts:406-417` num único helper (saved ou best-available):

```ts
import { Position, PlayerAttributes } from '@/types';
import { PlayerForStrength } from './team-strength';
import { formationToSlots } from '../formations';
import { calculateOverall } from '@/utils/overall';

export interface PlayerForPick {
  id: number;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
  morale: number;
  fitness: number;
  injuryWeeksLeft: number;
}

export const POSITION_GROUP: Record<string, string> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', ST: 'FWD',
};

function isEligible(p: PlayerForPick): boolean {
  return p.fitness > 30 && p.injuryWeeksLeft === 0;
}

export function pickStartingEleven(players: PlayerForPick[], formation: string): PlayerForStrength[] {
  const slots = formationToSlots(formation);
  const selected = new Set<number>();
  const eleven: PlayerForStrength[] = [];

  for (const slot of slots) {
    const targetGroup = POSITION_GROUP[slot] ?? 'MID';
    const candidates = players
      .filter(p => !selected.has(p.id) && isEligible(p))
      .map(p => {
        const base = calculateOverall(p.attributes, slot);
        let bonus = 0;
        if (p.position === slot) bonus = 15;
        else if (p.secondaryPosition === slot) bonus = 8;
        else if (POSITION_GROUP[p.position] === targetGroup) bonus = 3;
        else if (slot === 'GK' && p.position !== 'GK') bonus = -30;
        else if (p.position === 'GK' && slot !== 'GK') bonus = -30;
        else bonus = -10;
        return { player: p, score: base + bonus };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const pick = candidates[0].player;
      selected.add(pick.id);
      eleven.push({
        id: pick.id,
        position: slot,
        secondaryPosition: pick.secondaryPosition,
        attributes: pick.attributes,
        morale: pick.morale,
        fitness: pick.fitness,
      });
    }
  }
  return eleven;
}

export function buildSquadFromSavedIds(
  savedIds: number[],
  rawPlayers: PlayerForPick[],
  formation: string,
): PlayerForStrength[] {
  const byId = new Map(rawPlayers.map(p => [p.id, p]));
  const slots = formationToSlots(formation);
  const result: PlayerForStrength[] = [];
  const usedIds = new Set<number>();
  for (let i = 0; i < slots.length; i++) {
    const pid = savedIds[i];
    const p = pid != null ? byId.get(pid) : undefined;
    if (p && isEligible(p) && !usedIds.has(p.id)) {
      usedIds.add(p.id);
      result.push({ id: p.id, position: slots[i], secondaryPosition: p.secondaryPosition, attributes: p.attributes, morale: p.morale, fitness: p.fitness });
    } else {
      const target = POSITION_GROUP[slots[i]] ?? 'MID';
      const fallback = rawPlayers
        .filter(q => !usedIds.has(q.id) && isEligible(q))
        .sort((a, b) => {
          const scoreA = calculateOverall(a.attributes, slots[i]) + (a.position === slots[i] ? 15 : POSITION_GROUP[a.position] === target ? 3 : -10);
          const scoreB = calculateOverall(b.attributes, slots[i]) + (b.position === slots[i] ? 15 : POSITION_GROUP[b.position] === target ? 3 : -10);
          return scoreB - scoreA;
        })[0];
      if (fallback) {
        usedIds.add(fallback.id);
        result.push({ id: fallback.id, position: slots[i], secondaryPosition: fallback.secondaryPosition, attributes: fallback.attributes, morale: fallback.morale, fitness: fallback.fitness });
      }
    }
  }
  return result;
}

/** Bench: saved ids (if given) or best available, excluding starters. Cap 8. */
export function buildBench(
  rawPlayers: PlayerForPick[],
  startIds: Set<number>,
  savedBenchIds?: number[],
): PlayerForStrength[] {
  const toBench = (p: PlayerForPick): PlayerForStrength => ({
    id: p.id, position: p.position, secondaryPosition: p.secondaryPosition,
    attributes: p.attributes, morale: p.morale, fitness: p.fitness,
  });
  if (savedBenchIds) {
    const byId = new Map(rawPlayers.map(p => [p.id, p]));
    return savedBenchIds
      .map(id => byId.get(id))
      .filter((p): p is PlayerForPick => p != null && !startIds.has(p.id) && isEligible(p))
      .slice(0, 8)
      .map(toBench);
  }
  return rawPlayers
    .filter(p => !startIds.has(p.id) && isEligible(p))
    .slice(0, 8)
    .map(toBench);
}
```

Then in `src/engine/game-loop.ts`: delete the now-moved `PlayerForPick` (130-138), `POSITION_GROUP` (140-144), `pickStartingEleven` (146-183), and the two closures `buildSquadFromSavedIds` (348-380) and `buildBenchFromSavedIds` (393-404). Add the import near the top:

```ts
import {
  pickStartingEleven,
  buildSquadFromSavedIds,
  buildBench,
  PlayerForPick,
} from './simulation/squad-selection';
```

Update the bench construction at `game-loop.ts:406-417` to call the new `buildBench`:

```ts
    const homeBench: PlayerForStrength[] = buildBench(
      homeSquadRaw, homeStartIds, homeLineupSaved?.benchIds,
    );
    const awayBench: PlayerForStrength[] = buildBench(
      awaySquadRaw, awayStartIds, awayLineupSaved?.benchIds,
    );
```

(`loadSquadWithAttributes` at `game-loop.ts:212-230` already returns `PlayerForPick[]` shape — its return type annotation now references the imported `PlayerForPick`. `calculateOverall` import at `game-loop.ts:26` stays — still used by progression block.)

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx jest __tests__/engine/simulation/squad-selection.test.ts && npx jest __tests__/engine/game-loop.test.ts && npx tsc --noEmit`
Expected: PASS (4 novos) + game-loop intacto + tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulation/squad-selection.ts src/engine/game-loop.ts __tests__/engine/simulation/squad-selection.test.ts
git commit -m "refactor(engine): extrai seleção de XI/bench para módulo puro reusável"
```

---

### Task 2: Orquestrador de simulação da semana (`match-runner.ts`)

Função pura que, dadas as fixtures da semana e os elencos pré-carregados, roda `simulateMatch` para **todas** elas (humano incluído, mesmo motor). Mata o coin-flip de reputação (achado #1).

**Files:**
- Create: `src/engine/simulation/match-runner.ts`
- Test: `__tests__/engine/simulation/match-runner.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `__tests__/engine/simulation/match-runner.test.ts`:

```ts
import { simulateWeekFixtures, ClubMatchData, FixtureSimInput } from '@/engine/simulation/match-runner';
import { pickStartingEleven, buildBench, PlayerForPick } from '@/engine/simulation/squad-selection';
import { SeededRng } from '@/engine/rng';
import { PlayerAttributes } from '@/types';
import { Tactic } from '@/types/tactic';

const ATTRS = (o: number): PlayerAttributes => ({
  finishing: o, passing: o, crossing: o, dribbling: o, heading: o,
  longShots: o, freeKicks: o, vision: o, composure: o, decisions: o,
  positioning: o, aggression: o, leadership: o, pace: o, stamina: o,
  strength: o, agility: o, jumping: o,
});

const DEFAULT_TACTIC: Tactic = {
  id: 0, clubId: 0, name: 'D', isActive: true, formation: '4-4-2',
  mentality: 'balanced', pressing: 'medium', passingStyle: 'mixed',
  tempo: 'normal', width: 'normal', attackFocus: 'balanced', subStrategy: 'balanced',
};

function squadOf(clubId: number, overall: number): PlayerForPick[] {
  const slots: PlayerForPick['position'][] = ['GK','CB','CB','LB','RB','CM','CM','LM','RM','ST','ST','CB','ST'];
  return slots.map((position, i) => ({
    id: clubId * 100 + i, position, secondaryPosition: null,
    attributes: ATTRS(overall), morale: 70, fitness: 100, injuryWeeksLeft: 0,
  }));
}

function clubData(clubId: number, overall: number, reputation: number): ClubMatchData {
  const raw = squadOf(clubId, overall);
  const squad = pickStartingEleven(raw, '4-4-2');
  const startIds = new Set(squad.map(p => p.id));
  return { clubId, reputation, squad, bench: buildBench(raw, startIds), tactic: { ...DEFAULT_TACTIC, clubId } };
}

describe('simulateWeekFixtures', () => {
  it('returns exactly one result per fixture', () => {
    const fixtures: FixtureSimInput[] = [
      { fixtureId: 1, homeClubId: 10, awayClubId: 20 },
      { fixtureId: 2, homeClubId: 30, awayClubId: 40 },
    ];
    const clubMap = new Map<number, ClubMatchData>([
      [10, clubData(10, 70, 60)], [20, clubData(20, 70, 60)],
      [30, clubData(30, 70, 60)], [40, clubData(40, 70, 60)],
    ]);
    const out = simulateWeekFixtures({ fixtures, clubData: clubMap, rng: new SeededRng(42) });
    expect(out).toHaveLength(2);
    expect(out.map(r => r.fixtureId).sort()).toEqual([1, 2]);
    expect(out[0].result.homeRatings.length).toBe(11);
  });

  it('is deterministic with the same seed', () => {
    const fixtures: FixtureSimInput[] = [{ fixtureId: 1, homeClubId: 10, awayClubId: 20 }];
    const map = () => new Map<number, ClubMatchData>([[10, clubData(10, 70, 60)], [20, clubData(20, 70, 60)]]);
    const a = simulateWeekFixtures({ fixtures, clubData: map(), rng: new SeededRng(99) });
    const b = simulateWeekFixtures({ fixtures, clubData: map(), rng: new SeededRng(99) });
    expect(a[0].result.homeGoals).toBe(b[0].result.homeGoals);
    expect(a[0].result.awayGoals).toBe(b[0].result.awayGoals);
  });

  it('the stronger club wins more often across many seeds (not a rep coin-flip)', () => {
    let strongWins = 0;
    const N = 60;
    for (let s = 0; s < N; s++) {
      const fixtures: FixtureSimInput[] = [{ fixtureId: 1, homeClubId: 10, awayClubId: 20 }];
      const map = new Map<number, ClubMatchData>([
        [10, clubData(10, 82, 55)], // strong squad, modest reputation
        [20, clubData(20, 55, 75)], // weak squad, high reputation
      ]);
      const out = simulateWeekFixtures({ fixtures, clubData: map, rng: new SeededRng(s + 1) });
      if (out[0].result.homeGoals > out[0].result.awayGoals) strongWins++;
    }
    // If it were a reputation coin-flip, the high-rep club (away, 75) would win;
    // with the real engine the higher-overall squad (home, 82) must win the majority.
    expect(strongWins).toBeGreaterThan(N / 2);
  });

  it('tolerates an empty squad (records 0-0, does not throw)', () => {
    const fixtures: FixtureSimInput[] = [{ fixtureId: 1, homeClubId: 10, awayClubId: 20 }];
    const empty: ClubMatchData = { clubId: 10, reputation: 50, squad: [], bench: [], tactic: { ...DEFAULT_TACTIC, clubId: 10 } };
    const map = new Map<number, ClubMatchData>([[10, empty], [20, clubData(20, 70, 60)]]);
    expect(() => simulateWeekFixtures({ fixtures, clubData: map, rng: new SeededRng(1) })).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/engine/simulation/match-runner.test.ts`
Expected: FAIL — `Cannot find module '@/engine/simulation/match-runner'`.

- [ ] **Step 3: Implementação mínima**

Create `src/engine/simulation/match-runner.ts`. Ordena fixtures por `fixtureId` antes de simular (determinismo, §7 da spec). Quando um clube falta no mapa ou tem squad vazio dos dois lados, registra 0-0 com `MatchResult` vazio sem chamar `simulateMatch`:

```ts
import { SeededRng } from '@/engine/rng';
import { Tactic } from '@/types/tactic';
import { PlayerForStrength } from './team-strength';
import { simulateMatch, MatchResult } from './match-engine';

export interface ClubMatchData {
  clubId: number;
  reputation: number;
  squad: PlayerForStrength[];   // XI elegível
  bench: PlayerForStrength[];
  tactic: Tactic;
}

export interface FixtureSimInput {
  fixtureId: number;
  homeClubId: number;
  awayClubId: number;
}

export interface SimulatedFixture {
  fixtureId: number;
  result: MatchResult;
}

function emptyResult(): MatchResult {
  return {
    homeGoals: 0, awayGoals: 0, events: [],
    homeRatings: [], awayRatings: [],
    stats: {
      homePossession: 50, awayPossession: 50, homeShots: 0, awayShots: 0,
      homeShotsOnTarget: 0, awayShotsOnTarget: 0, homeFouls: 0, awayFouls: 0,
      homeCorners: 0, awayCorners: 0, homeXG: 0, awayXG: 0,
    },
    attendance: 0,
  };
}

export function simulateWeekFixtures(args: {
  fixtures: FixtureSimInput[];
  clubData: Map<number, ClubMatchData>;
  rng: SeededRng;
}): SimulatedFixture[] {
  const { clubData, rng } = args;
  const fixtures = [...args.fixtures].sort((a, b) => a.fixtureId - b.fixtureId);
  const out: SimulatedFixture[] = [];

  for (const fx of fixtures) {
    const home = clubData.get(fx.homeClubId);
    const away = clubData.get(fx.awayClubId);

    // Both empty (or missing) → walkover 0-0, no RNG consumed, no throw.
    if ((!home || home.squad.length === 0) && (!away || away.squad.length === 0)) {
      out.push({ fixtureId: fx.fixtureId, result: emptyResult() });
      continue;
    }

    const result = simulateMatch({
      fixtureId: fx.fixtureId,
      homeSquad: home?.squad ?? [],
      awaySquad: away?.squad ?? [],
      homeBench: home?.bench ?? [],
      awayBench: away?.bench ?? [],
      homeTactic: home?.tactic ?? away!.tactic,
      awayTactic: away?.tactic ?? home!.tactic,
      homeClubReputation: home?.reputation ?? 50,
      awayClubReputation: away?.reputation ?? 50,
      rng,
    });
    out.push({ fixtureId: fx.fixtureId, result });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx jest __tests__/engine/simulation/match-runner.test.ts && npx tsc --noEmit`
Expected: PASS (4) + tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulation/match-runner.ts __tests__/engine/simulation/match-runner.test.ts
git commit -m "feat(engine): match-runner roda simulateMatch real para todas as fixtures da semana"
```

---

### Task 3: Finanças semanais multi-clube (`weekly-finance.ts`)

Consolida `advanceWeek` (que será deletado) numa função pura por-clube, reusada pelo humano e pela IA. Reusa `calculateWeeklyIncome`/`calculateWeeklyExpenses` sem alterá-las.

**Files:**
- Create: `src/engine/finance/weekly-finance.ts`
- Test: `__tests__/engine/finance/weekly-finance.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `__tests__/engine/finance/weekly-finance.test.ts`:

```ts
import { computeWeeklyClubFinance, ClubFinanceInput } from '@/engine/finance/weekly-finance';

const base: ClubFinanceInput = {
  clubId: 7,
  reputation: 60,
  budget: 10_000_000,
  stadiumCapacity: 40_000,
  trainingFacilities: 3,
  youthAcademy: 3,
  medicalDepartment: 3,
  totalPlayerWages: 200_000,
  totalStaffWages: 20_000,
  hasHomeMatch: true,
  actualAttendance: 35_000,
  leaguePosition: 1,
};

describe('computeWeeklyClubFinance', () => {
  it('produces tv, sponsor, ticket, wages, maintenance entries for a home match', () => {
    const out = computeWeeklyClubFinance(base, 1, 5);
    const types = out.entries.map(e => e.type).sort();
    expect(types).toEqual(['maintenance', 'sponsor', 'ticket', 'tv', 'wages']);
    expect(out.entries.every(e => e.clubId === 7 && e.season === 1 && e.week === 5)).toBe(true);
  });

  it('omits ticket entry when no home match', () => {
    const out = computeWeeklyClubFinance({ ...base, hasHomeMatch: false, actualAttendance: null }, 1, 5);
    expect(out.entries.find(e => e.type === 'ticket')).toBeUndefined();
  });

  it('newBudget = budget + income - expenses', () => {
    const out = computeWeeklyClubFinance(base, 1, 5);
    const income = out.entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const expense = out.entries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
    expect(out.newBudget).toBe(base.budget + income + expense);
  });

  it('can drive the budget negative (no artificial floor)', () => {
    const out = computeWeeklyClubFinance(
      { ...base, budget: 0, totalPlayerWages: 5_000_000, hasHomeMatch: false, actualAttendance: null },
      1, 5,
    );
    expect(out.newBudget).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/engine/finance/weekly-finance.test.ts`
Expected: FAIL — `Cannot find module '@/engine/finance/weekly-finance'`.

- [ ] **Step 3: Implementação mínima**

Create `src/engine/finance/weekly-finance.ts`. `FinanceEntry` é exatamente o `AddFinanceEntryInput` (`src/database/queries/finances.ts:25-32`) — **`type` deve ser `FinanceType`** (`src/types/finance.ts:1`), não `string`, senão o `addFinanceEntry(db, e)` da Task 6 falha no tsc strict:

```ts
import { calculateWeeklyIncome, calculateWeeklyExpenses } from './finance-engine';
import { FinanceType } from '@/types/finance';

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
  actualAttendance: number | null;
  leaguePosition: number;
}

export interface FinanceEntry {
  clubId: number;
  season: number;
  week: number;
  type: FinanceType;
  amount: number;
  description: string;
}

export interface ClubFinanceResult {
  entries: FinanceEntry[];
  newBudget: number;
}

export function computeWeeklyClubFinance(
  input: ClubFinanceInput,
  season: number,
  week: number,
): ClubFinanceResult {
  const income = calculateWeeklyIncome({
    clubReputation: input.reputation,
    stadiumCapacity: input.stadiumCapacity,
    hasHomeMatch: input.hasHomeMatch,
    leaguePosition: input.leaguePosition,
    season,
    week,
    actualAttendance: input.actualAttendance,
  });

  const expenses = calculateWeeklyExpenses({
    totalPlayerWages: input.totalPlayerWages,
    totalStaffWages: input.totalStaffWages,
    stadiumCapacity: input.stadiumCapacity,
    trainingFacilities: input.trainingFacilities,
    youthAcademy: input.youthAcademy,
    medicalDepartment: input.medicalDepartment,
  });

  const entries: FinanceEntry[] = [
    { clubId: input.clubId, season, week, type: 'tv', amount: income.tv, description: 'Weekly TV rights income' },
    { clubId: input.clubId, season, week, type: 'sponsor', amount: income.sponsor, description: 'Weekly sponsorship income' },
  ];

  if (input.hasHomeMatch && income.ticket > 0) {
    entries.push({ clubId: input.clubId, season, week, type: 'ticket', amount: income.ticket, description: 'Home match ticket sales' });
  }

  entries.push(
    { clubId: input.clubId, season, week, type: 'wages', amount: -expenses.wages, description: 'Weekly wages (players + staff)' },
    { clubId: input.clubId, season, week, type: 'maintenance', amount: -expenses.maintenance, description: 'Stadium and facility maintenance' },
  );

  const totalIncome = income.tv + income.sponsor + (input.hasHomeMatch ? income.ticket : 0);
  const totalExpenses = expenses.wages + expenses.maintenance;
  const newBudget = input.budget + totalIncome - totalExpenses;

  return { entries, newBudget };
}
```

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx jest __tests__/engine/finance/weekly-finance.test.ts && npx tsc --noEmit`
Expected: PASS (4) + tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/finance/weekly-finance.ts __tests__/engine/finance/weekly-finance.test.ts
git commit -m "feat(engine): computeWeeklyClubFinance puro por-clube (consolida advanceWeek)"
```

---

### Task 4: Regeneração de elenco da IA (`squad-regeneration.ts`)

Função pura que decide os deltas por jogador da IA na virada: recalcula potencial com `currentOverall` **real** (corrige o `currentOverall: 70` hardcoded do achado), reavalia `market_value` com `calculateMarketValue`. Geração de base reusa `generateYouthPlayers` (chamada pelo orquestrador, não aqui).

**Files:**
- Create: `src/engine/rollover/squad-regeneration.ts`
- Test: `__tests__/engine/rollover/squad-regeneration.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `__tests__/engine/rollover/squad-regeneration.test.ts`:

```ts
import { regenerateAiSquadSeason, AiPlayerProgressInput } from '@/engine/rollover/squad-regeneration';
import { calculateMarketValue } from '@/engine/transfer/market-value';
import { SeededRng } from '@/engine/rng';

function mk(over: Partial<AiPlayerProgressInput>): AiPlayerProgressInput {
  return {
    playerId: 1, age: 24, currentOverall: 65, basePotential: 80,
    effectivePotential: 75, contractYearsLeft: 3, seasonAvgRating: 7.4,
    minutesPercent: 80, ...over,
  };
}

describe('regenerateAiSquadSeason', () => {
  it('raises effective potential for a high-rating young player', () => {
    const [d] = regenerateAiSquadSeason({ players: [mk({ age: 20, seasonAvgRating: 7.8, minutesPercent: 90 })], rng: new SeededRng(1) });
    expect(d.newEffectivePotential).toBeGreaterThanOrEqual(75);
  });

  it('freezes potential when seasonAvgRating is null (insufficient minutes)', () => {
    const [d] = regenerateAiSquadSeason({ players: [mk({ seasonAvgRating: null, minutesPercent: 0 })], rng: new SeededRng(1) });
    expect(d.newEffectivePotential).toBe(75);
  });

  it('recomputes market value from real overall (not frozen, not 70)', () => {
    const input = mk({ age: 20, currentOverall: 68, effectivePotential: 82, contractYearsLeft: 4 });
    const [d] = regenerateAiSquadSeason({ players: [input], rng: new SeededRng(1) });
    const expected = calculateMarketValue({
      overall: 68,
      effectivePotential: d.newEffectivePotential,
      age: 21, // age advanced by one season
      contractYearsLeft: 4,
    });
    expect(d.newMarketValue).toBe(expected);
  });

  it('declines effective potential for an underperforming veteran', () => {
    const [d] = regenerateAiSquadSeason({ players: [mk({ age: 33, currentOverall: 60, effectivePotential: 70, basePotential: 75, seasonAvgRating: 4.5, minutesPercent: 60 })], rng: new SeededRng(1) });
    expect(d.newEffectivePotential).toBeLessThan(70);
  });

  it('returns one delta per input player in the same order', () => {
    const out = regenerateAiSquadSeason({ players: [mk({ playerId: 1 }), mk({ playerId: 2 }), mk({ playerId: 3 })], rng: new SeededRng(1) });
    expect(out.map(d => d.playerId)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/engine/rollover/squad-regeneration.test.ts`
Expected: FAIL — `Cannot find module '@/engine/rollover/squad-regeneration'`.

- [ ] **Step 3: Implementação mínima**

Create `src/engine/rollover/squad-regeneration.ts`. Usa `recalculatePotential` (rating real ou congela se null) e `calculateMarketValue` com a idade já avançada (a virada faz `age+1`). O `rng` fica na assinatura para futura variância (determinismo/extensão), consumido aqui só de forma estável:

```ts
import { SeededRng } from '@/engine/rng';
import { recalculatePotential } from '@/engine/training/potential';
import { calculateMarketValue } from '@/engine/transfer/market-value';

export interface AiPlayerProgressInput {
  playerId: number;
  age: number;                 // idade ANTES da virada
  currentOverall: number;      // média real dos atributos
  basePotential: number;
  effectivePotential: number;
  contractYearsLeft: number;
  seasonAvgRating: number | null;
  minutesPercent: number;      // 0-100
}

export interface AiPlayerProgressDelta {
  playerId: number;
  newEffectivePotential: number;
  newMarketValue: number;
}

export function regenerateAiSquadSeason(args: {
  players: AiPlayerProgressInput[];
  rng: SeededRng;
}): AiPlayerProgressDelta[] {
  const { players } = args;
  void args.rng; // reservado para variância futura; consumo estável evita regressões
  return players.map((p) => {
    const seasonRatings =
      p.seasonAvgRating == null
        ? []
        : [{ avgRating: p.seasonAvgRating, minutesPercent: p.minutesPercent }];

    const { newEffectivePotential } = recalculatePotential({
      basePotential: p.basePotential,
      effectivePotential: p.effectivePotential,
      currentOverall: p.currentOverall,
      seasonRatings,
    });

    const newMarketValue = calculateMarketValue({
      overall: p.currentOverall,
      effectivePotential: newEffectivePotential,
      age: p.age + 1, // virada avança a idade
      contractYearsLeft: p.contractYearsLeft,
    });

    return { playerId: p.playerId, newEffectivePotential, newMarketValue };
  });
}
```

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx jest __tests__/engine/rollover/squad-regeneration.test.ts && npx tsc --noEmit`
Expected: PASS (5) + tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/rollover/squad-regeneration.ts __tests__/engine/rollover/squad-regeneration.test.ts
git commit -m "feat(engine): regeneração de potencial/valor da IA com overall real"
```

---

### Task 5: Ofertas IA→IA via mercado real (`ai-offer-generator.ts`)

Generaliza `generateAiOffersForPlayerClub` para qualquer clube-alvo e adiciona `generateAiToAiOffers` que itera uma amostra de clubes da IA. Substitui o `processAiTransfers` (overall:70 hardcoded, mercado paralelo) pelo caminho real de ofertas → `processPendingOffers` (que já vende sem distinguir humano/IA).

**Files:**
- Modify: `src/engine/transfer/ai-offer-generator.ts` (renomeia `generateAiOffersForPlayerClub`→`generateAiOffersForSquad`; adiciona `generateAiToAiOffers`)
- Test: `__tests__/engine/ai-to-ai-offers.integration.test.ts` (criado na Task 8; aqui só o rename + a nova função compilam)
- Modify (caller): `src/engine/game-loop.ts:563` troca o nome chamado.

- [ ] **Step 1: Escrever o teste que falha (integração, criado agora)**

Create `__tests__/engine/ai-to-ai-offers.integration.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { generateAiToAiOffers, generateAiOffersForSquad } from '@/engine/transfer/ai-offer-generator';
import { SeededRng } from '@/engine/rng';

describe('AI→AI offers', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('generateAiOffersForSquad creates offers for an arbitrary (non-player) AI club', async () => {
    // Run many weeks-worth of attempts to overcome the per-week probability gate.
    let total = 0;
    for (let i = 0; i < 30; i++) {
      total += await generateAiOffersForSquad(db, 5, new SeededRng(1000 + i), 1, 3);
    }
    expect(total).toBeGreaterThan(0);
    const rows = (await db
      .prepare("SELECT COUNT(*) as c FROM transfer_offers WHERE selling_club_id = 5")
      .get()) as { c: number };
    expect(rows.c).toBeGreaterThan(0);
  });

  it('generateAiToAiOffers samples multiple target clubs and creates offers', async () => {
    let total = 0;
    for (let i = 0; i < 30; i++) {
      total += await generateAiToAiOffers(db, new SeededRng(2000 + i), 1, 3);
    }
    expect(total).toBeGreaterThan(0);
    const distinct = (await db
      .prepare('SELECT COUNT(DISTINCT selling_club_id) as c FROM transfer_offers')
      .get()) as { c: number };
    expect(distinct.c).toBeGreaterThan(1); // offers target more than one club
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/engine/ai-to-ai-offers.integration.test.ts`
Expected: FAIL — `generateAiToAiOffers`/`generateAiOffersForSquad` não existem em `ai-offer-generator.ts`.

- [ ] **Step 3: Implementação mínima**

In `src/engine/transfer/ai-offer-generator.ts`, rename the existing exported function (`generateAiOffersForPlayerClub`, line 38) to `generateAiOffersForSquad` — its body is already club-agnostic (it takes `playerClubId` and uses it only as "the squad being shopped"; rename the param to `targetClubId` for clarity, replacing every `playerClubId` usage inside the body, including `sellingClubId: playerClubId` at line 199 and 247). Keep a thin backward-compat alias so `game-loop.ts`'s player-window call still reads naturally:

```ts
export async function generateAiOffersForSquad(
  db: DbHandle,
  targetClubId: number,
  rng: SeededRng,
  season: number = 0,
  week: number = 0,
): Promise<number> {
  // ... existing body, with playerClubId → targetClubId throughout ...
}

/** Back-compat alias used by the human-window path. */
export const generateAiOffersForPlayerClub = generateAiOffersForSquad;
```

Then append `generateAiToAiOffers`, which samples AI target clubs (excluding the human club) and shops each squad. `processPendingOffers` later decides acceptance:

```ts
/**
 * AI clubs bid for *each other's* players. Samples a handful of target clubs and
 * runs the same squad-shopping core for each. Offer acceptance is handled by
 * processPendingOffers (which already sells without distinguishing human/AI).
 */
export async function generateAiToAiOffers(
  db: DbHandle,
  rng: SeededRng,
  season: number = 0,
  week: number = 0,
  excludeClubId: number | null = null,
  sampleSize: number = 6,
): Promise<number> {
  const targets = (await db
    .prepare(
      `SELECT id FROM clubs
       WHERE (? IS NULL OR id != ?)
       ORDER BY RANDOM() LIMIT ?`,
    )
    .all(excludeClubId, excludeClubId, sampleSize)) as Array<{ id: number }>;

  let created = 0;
  for (const t of targets) {
    created += await generateAiOffersForSquad(db, t.id, rng, season, week);
  }
  return created;
}
```

In `src/engine/game-loop.ts`: leave the player-window call at line 563 as `generateAiOffersForPlayerClub(db, playerClubId, rng, season, week)` (alias still works) **or** rename to `generateAiOffersForSquad`. Add the AI→AI call right after it (the `processAiTransfers` deletion happens in Task 6). Update the import on line 8:

```ts
import { generateAiOffersForSquad, generateAiToAiOffers } from './transfer/ai-offer-generator';
```

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx jest __tests__/engine/ai-to-ai-offers.integration.test.ts && npx jest __tests__/engine/transfer/ && npx tsc --noEmit`
Expected: PASS (2 novos) + transfer suite verde + tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/transfer/ai-offer-generator.ts __tests__/engine/ai-to-ai-offers.integration.test.ts
git commit -m "feat(engine): ofertas IA→IA via mercado real (generateAiToAiOffers + generateAiOffersForSquad)"
```

---

### Task 6: Orquestração no `game-loop.ts` — carga em lote + sim real + finanças multi-clube

Junta tudo: remove `simulateAiMatch` e `processAiTransfers`; adiciona `loadWeekClubData`; roteia **todas** as fixtures por `simulateWeekFixtures`; persiste resultados (eventos completos só do humano, `persistMatchStats` para todas); finanças de todos os clubes via `computeWeeklyClubFinance`; ofertas IA→IA. Esta é a task central — toca o loop. A progressão/fitness semanal do clube humano (`game-loop.ts:474-549`) fica **inalterada** (escopo de `progression-wired`).

**Files:**
- Modify: `src/engine/game-loop.ts`
  - Delete `simulateAiMatch` (187-208) e o loop de AI matches (551-556).
  - Delete `processAiTransfers` (238-319) e sua chamada (559).
  - Add helper `loadWeekClubData`.
  - Replace player-match block (329-549 simula só o player) by: carregar todas, simular todas, persistir; manter progressão/fitness do humano usando o `MatchResult` do humano.
  - Replace player-finance block (573-682) por loop multi-clube + caso especial humano (assistant wages).
- Test: `__tests__/engine/ai-real-sim.integration.test.ts` e `__tests__/engine/ai-finance.integration.test.ts` (Task 7).

- [ ] **Step 1: Escrever os testes de integração que falham (criados na Task 7)** — esta task implementa contra eles; rode-os ao final. Para o ciclo TDD imediato, use o `game-loop.test.ts` existente como guarda de não-regressão.

- [ ] **Step 2: Add `loadWeekClubData`**

In `src/engine/game-loop.ts`, add a pure-ish orchestration helper (touches DB, lives in loop file — not in `engine/` pure modules). Carrega cada clube uma vez por tick:

```ts
import { simulateWeekFixtures, ClubMatchData, FixtureSimInput } from './simulation/match-runner';
// squad-selection já importado na Task 1

async function loadWeekClubData(
  db: DbHandle,
  fixtures: Fixture[],
): Promise<Map<number, ClubMatchData>> {
  const clubIds = new Set<number>();
  for (const f of fixtures) { clubIds.add(f.homeClubId); clubIds.add(f.awayClubId); }

  const map = new Map<number, ClubMatchData>();
  for (const clubId of clubIds) {
    const raw = await loadSquadWithAttributes(db, clubId); // PlayerForPick[]
    const club = await getClubById(db, clubId);
    const tactic = await getActiveTactic(db, clubId);
    const formation = tactic?.formation ?? '4-4-2';
    const lineup = tactic ? await getTacticLineup(db, tactic.id) : null;

    const squad = lineup
      ? buildSquadFromSavedIds(lineup.starterIds, raw, formation)
      : pickStartingEleven(raw, formation);
    const startIds = new Set(squad.map(p => p.id));
    const bench = buildBench(raw, startIds, lineup?.benchIds);

    const resolvedTactic = tactic ?? {
      id: 0, clubId, name: 'Default', isActive: true,
      formation: '4-4-2' as const, mentality: 'balanced' as const,
      pressing: 'medium' as const, passingStyle: 'mixed' as const,
      tempo: 'normal' as const, width: 'normal' as const,
      attackFocus: 'balanced' as const, subStrategy: 'balanced' as const,
    };

    map.set(clubId, { clubId, reputation: club?.reputation ?? 50, squad, bench, tactic: resolvedTactic });
  }
  return map;
}
```

- [ ] **Step 3: Substituir a simulação por carga+sim de todas as fixtures**

Replace the player-only simulation block. Sim de todas, persistência seletiva de eventos, `persistMatchStats` para todas:

```ts
  // 1. Fixtures + batch load
  const fixtures = await getFixturesByWeek(db, season, week);
  const clubData = await loadWeekClubData(db, fixtures);

  // 2. Simulate ALL fixtures with the real engine (human + AI, same engine)
  const simInputs: FixtureSimInput[] = fixtures.map(f => ({
    fixtureId: f.id, homeClubId: f.homeClubId, awayClubId: f.awayClubId,
  }));
  const simulated = simulateWeekFixtures({ fixtures: simInputs, clubData, rng });
  const resultByFixture = new Map(simulated.map(s => [s.fixtureId, s.result]));

  const playerFixture = fixtures.find(
    f => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  );
  let playerMatchResult: MatchResult | null = null;

  // 3. Persist every fixture; full events only for the human match; stats for all.
  for (const fixture of fixtures) {
    const result = resultByFixture.get(fixture.id);
    if (!result) continue;
    await updateFixtureResult(db, fixture.id, result.homeGoals, result.awayGoals, result.attendance);
    await persistMatchStats(db, fixture, result);
    if (playerFixture && fixture.id === playerFixture.id) {
      playerMatchResult = result;
      for (const event of result.events) {
        await addMatchEvent(db, {
          fixtureId: fixture.id, minute: event.minute, type: event.type,
          playerId: event.playerId, secondaryPlayerId: event.secondaryPlayerId,
        });
      }
    }
  }
```

Then keep the **existing** human progression (474-525) and fitness/injury (527-549) blocks, but source `playerSquadRaw` from the batch cache instead of re-querying:

```ts
  if (playerFixture) {
    const homeData = clubData.get(playerFixture.homeClubId);
    const awayData = clubData.get(playerFixture.awayClubId);
    const playerSquad =
      playerFixture.homeClubId === playerClubId ? homeData?.squad ?? [] : awayData?.squad ?? [];
    // ... existing progression loop, iterating playerSquad (PlayerForStrength has id+attributes+fitness) ...
  }
```

(Note: the existing progression loop reads `p.attributes`/`p.fitness`/`p.id` — all present on `PlayerForStrength`. `fullPlayer` lookup via `getPlayersByClub(playerClubId)` stays for `age`/`effectivePotential`.) Delete the old `simulateAiMatch` definition and the `// 3. Simulate other AI vs AI matches` loop.

- [ ] **Step 4: Finanças multi-clube**

Replace the player-only finance block (573-682) with a loop over every club that has a fixture this week, using `computeWeeklyClubFinance`; keep the human's assistant-wage special case:

```ts
import { computeWeeklyClubFinance } from './finance/weekly-finance';

  // 4. Weekly finances for ALL clubs with a fixture this week
  let updatedBudget = 0;
  const financeClubIds = new Set<number>();
  for (const f of fixtures) { financeClubIds.add(f.homeClubId); financeClubIds.add(f.awayClubId); }

  for (const clubId of financeClubIds) {
    const club = await getClubById(db, clubId);
    if (!club) continue;
    const players = await getPlayersByClub(db, clubId);
    const totalPlayerWages = players.reduce((sum, p) => sum + p.wage, 0);
    const staffList = await getStaffByClub(db, clubId);
    const totalStaffWages = staffList.reduce((sum, s) => sum + s.wage, 0);

    const homeFixture = fixtures.find(f => f.homeClubId === clubId);
    const hasHomeMatch = homeFixture != null;
    const actualAttendance = hasHomeMatch
      ? (resultByFixture.get(homeFixture!.id)?.attendance ?? homeFixture!.attendance ?? null)
      : null;

    const fin = computeWeeklyClubFinance({
      clubId, reputation: club.reputation, budget: club.budget,
      stadiumCapacity: club.stadiumCapacity, trainingFacilities: club.trainingFacilities,
      youthAcademy: club.youthAcademy, medicalDepartment: club.medicalDepartment,
      totalPlayerWages, totalStaffWages, hasHomeMatch, actualAttendance, leaguePosition: 1,
    }, season, week);

    for (const e of fin.entries) await addFinanceEntry(db, e);
    let budget = fin.newBudget;

    // Human-only: monthly assistant wages every 4 weeks
    if (clubId === playerClubId && saveId >= 0 && week % 4 === 0) {
      const assistants = await getAssistantsBySave(db, saveId);
      const totalAssistantWages = assistants.reduce((s, a) => s + a.wagePerMonth, 0);
      if (totalAssistantWages > 0) {
        await addFinanceEntry(db, { clubId, season, week, type: 'assistant_wage', amount: -totalAssistantWages, description: 'Monthly assistant staff wages' });
        budget -= totalAssistantWages;
      }
    }

    await updateClubBudget(db, clubId, budget);
    if (clubId === playerClubId) updatedBudget = budget;
  }
```

Replace the transfer block (559-564): delete `processAiTransfers` call, add AI→AI, keep human-window + processing:

```ts
  // Transfers
  if (isTransferWindow(week)) {
    await generateAiToAiOffers(db, rng, season, week, playerClubId);
    await generateAiOffersForSquad(db, playerClubId, rng, season, week);
  }
  await processPendingOffers(db, season, week, playerClubId);
  await expireStaleOffers(db, season, week);
  await prunExpiredBlocks(db, season, week);
```

Finally delete the `processAiTransfers` function body (238-319) and the unused `generateAiTransfer` import (line 6) if nothing else references it (grep first).

- [ ] **Step 5: Rodar regressão + tsc**

Run: `npx jest __tests__/engine/game-loop.test.ts && npx tsc --noEmit`
Expected: game-loop suite verde (resultados mudam de valor, mas as asserções de shape/range continuam) + tsc exit 0. Se um teste asserir um placar exato de IA antigo, ajustar para range (era coin-flip; agora é motor real).

- [ ] **Step 6: Commit**

```bash
git add src/engine/game-loop.ts
git commit -m "feat(engine): loop roteia todas as fixtures pelo motor real + finanças multi-clube"
```

---

### Task 7: Integração — sim real da IA + finanças da IA

Prova que a IA usa o motor real (não coin-flip) e que **todos** os clubes movem o orçamento.

**Files:**
- Create: `__tests__/engine/ai-real-sim.integration.test.ts`, `__tests__/engine/ai-finance.integration.test.ts`

(Estes testes dependem do `game-loop` já ligado na Task 6. Mesmo setup de calendário do `game-loop.test.ts:17-58`.)

- [ ] **Step 1: Escrever `ai-real-sim.integration.test.ts`**

```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';

async function seedCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const l of leagues) {
    const clubs = await getClubsByLeague(db, l.id);
    clubsByLeague[l.id] = clubs.map(c => c.id);
  }
  const cal = generateSeasonCalendar({ season: 1, leagues, clubsByLeague, championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24] });
  for (const c of cal.competitions) await createCompetition(db, c);
  for (const e of cal.entries) await addCompetitionEntry(db, e);
  for (const f of cal.fixtures) await createFixture(db, { id: f.id, competitionId: f.competitionId, season: f.season, week: f.week, round: f.round as string | null, homeClubId: f.homeClubId, awayClubId: f.awayClubId });
}

describe('AI real simulation', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await seedCalendar(db);
  });
  afterEach(() => rawDb.close());

  it('persists player_stats for AI clubs (not just the human club)', async () => {
    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(7) });
    // A club that did NOT belong to the human (id 1) still has stats rows.
    const row = (await db.prepare(
      `SELECT COUNT(*) as c FROM player_stats ps
       JOIN players p ON p.id = ps.player_id
       WHERE p.club_id NOT IN (1) AND ps.season = 1`,
    ).get()) as { c: number };
    expect(row.c).toBeGreaterThan(0);
  });

  it('AI fixtures are decided by squad strength, not reputation coin-flip', async () => {
    // Boost one AI club's whole squad far above its opponents, keep rep low.
    await db.prepare('UPDATE clubs SET reputation = 40 WHERE id = 3').run();
    await db.prepare(
      `UPDATE player_attributes SET finishing=92, passing=92, dribbling=92, pace=92, positioning=92,
        composure=92, decisions=92, vision=92, stamina=92, strength=92, heading=92, agility=92, jumping=92,
        crossing=92, long_shots=92, free_kicks=92, aggression=92, leadership=92
       WHERE player_id IN (SELECT id FROM players WHERE club_id = 3)`,
    ).run();

    let wins = 0, games = 0;
    for (let wk = 7; wk <= 16; wk++) {
      await advanceGameWeek({ dbHandle: db, season: 1, week: wk, playerClubId: 1, saveId: -1, rng: new SeededRng(wk * 13) });
      const fx = (await db.prepare(
        `SELECT home_club_id, away_club_id, home_goals, away_goals FROM fixtures
         WHERE season = 1 AND week = ? AND played = 1 AND (home_club_id = 3 OR away_club_id = 3)`,
      ).all(wk)) as Array<{ home_club_id: number; away_club_id: number; home_goals: number; away_goals: number }>;
      for (const f of fx) {
        games++;
        const club3Goals = f.home_club_id === 3 ? f.home_goals : f.away_goals;
        const oppGoals = f.home_club_id === 3 ? f.away_goals : f.home_goals;
        if (club3Goals > oppGoals) wins++;
      }
    }
    expect(games).toBeGreaterThan(0);
    expect(wins / games).toBeGreaterThan(0.5); // dominant squad wins despite low rep
  });
});
```

- [ ] **Step 2: Escrever `ai-finance.integration.test.ts`**

```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';

async function seedCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const l of leagues) {
    const clubs = await getClubsByLeague(db, l.id);
    clubsByLeague[l.id] = clubs.map(c => c.id);
  }
  const cal = generateSeasonCalendar({ season: 1, leagues, clubsByLeague, championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24] });
  for (const c of cal.competitions) await createCompetition(db, c);
  for (const e of cal.entries) await addCompetitionEntry(db, e);
  for (const f of cal.fixtures) await createFixture(db, { id: f.id, competitionId: f.competitionId, season: f.season, week: f.week, round: f.round as string | null, homeClubId: f.homeClubId, awayClubId: f.awayClubId });
}

describe('AI weekly finances', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await seedCalendar(db);
  });
  afterEach(() => rawDb.close());

  it('moves the budget of AI clubs that played, and writes club_finances rows for them', async () => {
    // Snapshot budgets of two AI clubs that have a week-7 fixture.
    const fx = (await db.prepare(
      'SELECT home_club_id, away_club_id FROM fixtures WHERE season = 1 AND week = 7 AND home_club_id != 1 AND away_club_id != 1 LIMIT 1',
    ).get()) as { home_club_id: number; away_club_id: number };
    const before = (await db.prepare('SELECT id, budget FROM clubs WHERE id IN (?, ?)').all(fx.home_club_id, fx.away_club_id)) as Array<{ id: number; budget: number }>;

    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(7) });

    const after = (await db.prepare('SELECT id, budget FROM clubs WHERE id IN (?, ?)').all(fx.home_club_id, fx.away_club_id)) as Array<{ id: number; budget: number }>;
    for (const a of after) {
      const b = before.find(x => x.id === a.id)!;
      expect(a.budget).not.toBe(b.budget); // budget changed for an AI club
    }
    const entries = (await db.prepare(
      'SELECT COUNT(*) as c FROM club_finances WHERE club_id = ? AND season = 1 AND week = 7',
    ).get(fx.home_club_id)) as { c: number };
    expect(entries.c).toBeGreaterThan(0);
  });

  it('home club gets a ticket entry, away club does not', async () => {
    const fx = (await db.prepare(
      'SELECT home_club_id, away_club_id FROM fixtures WHERE season = 1 AND week = 7 AND home_club_id != 1 AND away_club_id != 1 LIMIT 1',
    ).get()) as { home_club_id: number; away_club_id: number };
    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: -1, rng: new SeededRng(7) });

    const homeTicket = (await db.prepare(
      "SELECT COUNT(*) as c FROM club_finances WHERE club_id = ? AND type = 'ticket' AND season = 1 AND week = 7",
    ).get(fx.home_club_id)) as { c: number };
    const awayTicket = (await db.prepare(
      "SELECT COUNT(*) as c FROM club_finances WHERE club_id = ? AND type = 'ticket' AND season = 1 AND week = 7",
    ).get(fx.away_club_id)) as { c: number };
    expect(homeTicket.c).toBeGreaterThan(0);
    expect(awayTicket.c).toBe(0);
  });
});
```

> Antes de rodar: confirmar o nome real da tabela de finanças e da coluna de tipo com `grep -n "club_finances\|CREATE TABLE" src/database/schema.ts` e `grep -n "addFinanceEntry" src/database/queries/finances.ts`. Ajustar `club_finances`/`type` se o schema usar outro nome.

- [ ] **Step 3: Rodar e ver passar**

Run: `npx jest __tests__/engine/ai-real-sim.integration.test.ts __tests__/engine/ai-finance.integration.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add __tests__/engine/ai-real-sim.integration.test.ts __tests__/engine/ai-finance.integration.test.ts
git commit -m "test(engine): integração de sim real + finanças multi-clube da IA"
```

---

### Task 8: Regeneração no fim de temporada (loop) + integração anti-colapso

Liga a regeneração da IA no `isSeasonEnd` de `advanceGameWeek` (decisão das Open Questions 4 da spec: rodar no loop, não na tela): para cada clube com elenco, calcula `currentOverall` real (média dos atributos), chama `regenerateAiSquadSeason`, persiste `effective_potential`/`market_value`, e gera base via `generateYouthPlayers`. O caminho humano continua na tela (`EndOfSeasonScreen`) **inalterado** — a regeneração do loop pula `playerClubId` para não duplicar.

**Files:**
- Modify: `src/engine/game-loop.ts` (bloco `isSeasonEnd`, após `archiveSeason` na linha 781)
- Test: `__tests__/engine/ai-regeneration.integration.test.ts`

- [ ] **Step 1: Escrever `ai-regeneration.integration.test.ts`**

```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';

async function seedCalendar(db: DbHandle, season: number): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const l of leagues) {
    const clubs = await getClubsByLeague(db, l.id);
    clubsByLeague[l.id] = clubs.map(c => c.id);
  }
  const cal = generateSeasonCalendar({ season, leagues, clubsByLeague, championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24] });
  for (const c of cal.competitions) { try { await createCompetition(db, c); } catch { /* exists */ } }
  for (const e of cal.entries) { try { await addCompetitionEntry(db, e); } catch { /* exists */ } }
  for (const f of cal.fixtures) { try { await createFixture(db, { id: f.id, competitionId: f.competitionId, season: f.season, week: f.week, round: f.round as string | null, homeClubId: f.homeClubId, awayClubId: f.awayClubId }); } catch { /* exists */ } }
}

describe('AI regeneration across seasons', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await seedCalendar(db, 1);
  });
  afterEach(() => rawDb.close());

  it('AI squad size does not collapse after a season rollover (youth intake replenishes)', async () => {
    const aiClub = 5;
    const sizeBefore = ((await db.prepare('SELECT COUNT(*) as c FROM players WHERE club_id = ?').get(aiClub)) as { c: number }).c;

    // Advance to the final week to trigger isSeasonEnd regeneration.
    const rng = new SeededRng(123);
    for (let wk = 1; wk <= 46; wk++) {
      const res = await advanceGameWeek({ dbHandle: db, season: 1, week: wk, playerClubId: 1, saveId: -1, rng });
      if (res.isSeasonEnd) break;
    }

    const sizeAfter = ((await db.prepare('SELECT COUNT(*) as c FROM players WHERE club_id = ?').get(aiClub)) as { c: number }).c;
    // Some players may retire; youth intake must keep the squad from shrinking to nothing.
    expect(sizeAfter).toBeGreaterThanOrEqual(Math.max(1, sizeBefore - 3));
    // At least one new youth player was inserted for the AI club.
    const youthCount = ((await db.prepare('SELECT COUNT(*) as c FROM players WHERE club_id = ? AND age <= 18').get(aiClub)) as { c: number }).c;
    expect(youthCount).toBeGreaterThan(0);
  });

  it('market_value of AI players is re-evaluated at rollover (not frozen at seed)', async () => {
    const aiClub = 5;
    const sample = (await db.prepare('SELECT id, market_value FROM players WHERE club_id = ? LIMIT 5').all(aiClub)) as Array<{ id: number; market_value: number }>;
    const rng = new SeededRng(321);
    for (let wk = 1; wk <= 46; wk++) {
      const res = await advanceGameWeek({ dbHandle: db, season: 1, week: wk, playerClubId: 1, saveId: -1, rng });
      if (res.isSeasonEnd) break;
    }
    const after = (await db.prepare('SELECT id, market_value FROM players WHERE id IN (' + sample.map(() => '?').join(',') + ')').all(...sample.map(s => s.id))) as Array<{ id: number; market_value: number }>;
    const changed = after.some(a => a.market_value !== sample.find(s => s.id === a.id)!.market_value);
    expect(changed).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest __tests__/engine/ai-regeneration.integration.test.ts`
Expected: FAIL — market_value frozen / no youth for AI club.

- [ ] **Step 3: Implementação — bloco de regeneração no `isSeasonEnd`**

In `src/engine/game-loop.ts`, after `await archiveSeason(db, season);` (line 781), add the AI regeneration loop. Reusa `calculateOverall` (já importado, line 26) para o overall real e `generateYouthPlayers`/`recalculatePotential` via `regenerateAiSquadSeason`:

```ts
import { regenerateAiSquadSeason } from './rollover/squad-regeneration';
import { generateYouthPlayers } from './youth/youth-academy';
import { getPlayerStatsForPlayer } from '@/database/queries/player-stats';
// calculateOverall já importado

    // ── AI squad regeneration (human club handled by EndOfSeasonScreen) ──
    const aiClubs = (await db.prepare(
      'SELECT id, youth_academy FROM clubs WHERE id != ?',
    ).all(playerClubId)) as Array<{ id: number; youth_academy: number }>;

    for (const club of aiClubs) {
      const squad = await getPlayersWithAttributesByClub(db, club.id); // (Player & {attributes})[]
      const inputs = [];
      for (const p of squad) {
        const stats = (await db.prepare(
          'SELECT avg_rating, minutes_played FROM player_stats WHERE player_id = ? AND season = ?',
        ).get(p.id, season)) as { avg_rating: number; minutes_played: number } | undefined;
        const minutesPercent = stats ? Math.min(100, (stats.minutes_played / (38 * 90)) * 100) : 0;
        inputs.push({
          playerId: p.id,
          age: p.age, // age before rollover (EndOfSeason aging is human-tela; loop adds none for AI yet)
          currentOverall: Math.round(calculateOverall(p.attributes, p.position)),
          basePotential: p.basePotential,
          effectivePotential: p.effectivePotential,
          contractYearsLeft: Math.max(0, p.contractEnd - season),
          seasonAvgRating: stats ? stats.avg_rating : null,
          minutesPercent,
        });
      }
      const deltas = regenerateAiSquadSeason({ players: inputs, rng });
      for (const d of deltas) {
        await db.prepare('UPDATE players SET effective_potential = ?, market_value = ? WHERE id = ?')
          .run(d.newEffectivePotential, d.newMarketValue, d.playerId);
      }

      // Youth intake for this AI club
      const youth = generateYouthPlayers({
        clubId: club.id,
        academyLevel: Math.max(1, Math.min(5, club.youth_academy)),
        youthCoachBonus: 5,       // default; progression-wired will supply real bonus
        countryCode: 'EN',
        rng,
      });
      const maxIdRow = (await db.prepare('SELECT MAX(id) as maxId FROM players').get()) as { maxId: number };
      let nextId = (maxIdRow?.maxId ?? 0) + 1;
      for (const y of youth) {
        await db.prepare(
          'INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(nextId, y.name, 'Local', y.age, y.position, null, club.id, 5000, season + 3, 100000, y.basePotential, y.basePotential, 70, 100, 0, 0);
        const a = y.attributes;
        await db.prepare(
          'INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(nextId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading, a.longShots, a.freeKicks, a.vision, a.composure, a.decisions, a.positioning, a.aggression, a.leadership, a.pace, a.stamina, a.strength, a.agility, a.jumping);
        nextId++;
      }
    }
```

(`getPlayerStatsForPlayer` import only if used; the inline query above is fine and avoids an unused import — drop the import line if not referenced. `getPlayersWithAttributesByClub` is already exported from `@/database/queries/players` — add it to the existing import on line 2.)

- [ ] **Step 4: Rodar e ver passar + tsc + suíte engine**

Run: `npx jest __tests__/engine/ai-regeneration.integration.test.ts && npx jest __tests__/engine/ && npx tsc --noEmit`
Expected: PASS + engine suite verde + tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game-loop.ts __tests__/engine/ai-regeneration.integration.test.ts
git commit -m "feat(engine): regeneração de potencial/valor/base da IA na virada de temporada"
```

---

### Task 9: Deletar `week-advance.ts` (código morto) + sua suíte

Consolidado em `weekly-finance.ts`. Confirmar que nada além do teste importa `advanceWeek`.

**Files:**
- Delete: `src/engine/week-advance.ts`, `__tests__/engine/week-advance.test.ts`

- [ ] **Step 1: Confirmar zero referências fora do teste**

Run: `grep -rn "week-advance\|advanceWeek\b" src/ __tests__/ | grep -v "advanceGameWeek"`
Expected: somente `__tests__/engine/week-advance.test.ts` e o próprio módulo aparecem. Se algo de produção importar, **parar** e investigar (não deletar às cegas).

- [ ] **Step 2: Deletar**

```bash
git rm src/engine/week-advance.ts __tests__/engine/week-advance.test.ts
```

- [ ] **Step 3: Rodar suíte cheia + tsc**

Run: `npx tsc --noEmit && npx jest 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: tsc exit 0; todas as suítes verdes (62 anteriores − 1 removida + 4 novas unit + 4 novas integração = ~69 suítes; ~536 − antigos de week-advance + ~25 novos).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(engine): remove week-advance.ts (código morto consolidado em weekly-finance)"
```

---

### Task 10: Verificação final + browser

- [ ] **Step 1: Suíte completa + type-check**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"` → tudo verde.
Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 2: Browser validation (Playwright MCP) — não há UI nova, mas a simulação alimenta as telas existentes**

Subir o web server (modo CI do harness, `localhost:8082`). Validar que o **loop não regrediu** a experiência:
- Novo jogo → avançar várias semanas. A tela de Home/News/Tabela não trava nem mostra erro.
- Tabela da liga reflete resultados variados (não placares de coin-flip uniforme).
- Avançar até a virada de temporada (`EndOfSeasonScreen`) → continuar sem crash; nova temporada inicia.
- Confirmar no console que não há exceção lançada durante o tick (sim real de toda a liga + finanças multi-clube).

- [ ] **Step 3: Push (com autorização do usuário)**

```bash
git push origin main
```

---

## Sequencing & dependencies

**Ordem interna obrigatória:** 1 (squad-selection, refactor base) → 2 (match-runner usa squad-selection) e 3 (weekly-finance) e 4 (squad-regeneration) podem ir em paralelo após a 1 → 5 (ofertas IA→IA, independente) → **6 (orquestração no game-loop, depende de 1/2/3/5)** → 7 (integração sim+finanças, depende de 6) → 8 (regeneração no loop, depende de 4 e 6) → 9 (delete week-advance, depende de 3 ter consolidado) → 10 (verificação).

**Dependências de outros epics (honestas):**
- **HARD, deve aterrissar ANTES:** `save-isolation` (`save_id` em todas as tabelas de mundo — sem isso, simular a liga inteira de um save corrompe os outros; toda query nova/modificada deste epic deve passar a filtrar por `save_id`) e `db-hardening` (índices em `players(club_id)`, `fixtures(season, week)` e compostos por `save_id` — a carga em lote semanal e a regeneração varrem quase todo o mundo a cada tick/virada e precisam dos índices para não fazer full-scan; FK on em testes). Implementar este epic **assumindo** o mecanismo de migração idempotente desses siblings; **não** inventar framework de migração próprio. Quando `save_id` existir, adicionar o filtro em: `loadWeekClubData`, o loop de finanças multi-clube, `generateAiToAiOffers`/`generateAiOffersForSquad`, e o bloco de regeneração (`SELECT ... FROM clubs WHERE save_id = ?`, `players` idem).
- **COORDENAM por interface (paralelo/depois):** `competitions-real` (gera rodadas ≥2 de copa/CL; este epic simula as fixtures que existirem — sem dependência de código, só de dados), `match-consequences` (consome os `MatchResult`/`persistMatchStats` da IA para suspensão/lesão multi-clube; alinhar Open Question 3 da spec se o sibling ler `match_events` da tabela em vez do `MatchResult` em memória — hoje só persistimos eventos completos do humano), `economy-depth` (floor/falência de budget negativo — este epic gera os negativos sem `Math.max(0,...)` artificial), `progression-wired` (minutos/rating reais e `training_focus`/`getStaffEffects` para o humano; a regeneração da IA aqui usa defaults `balanced`/`youthCoachBonus: 5` e aceita um bônus real quando o sibling o fornecer).
- **Sem dependência:** i18n (epic é pura lógica de loop/engine, sem strings de UI).

## Definition of done

1. `npx tsc --noEmit` limpo (exit 0).
2. `npx jest` verde — todas as suítes (incluindo os 4 unit + 4 integração novos; `week-advance.test.ts` removido).
3. Cobertura dos 5 achados do epic: sim real para IA (Task 2+6), finanças multi-clube (Task 3+6), regeneração/base da IA (Task 4+8), ofertas IA→IA (Task 5+6), `week-advance.ts` consolidado e deletado (Task 3+9).
4. Browser-validado: avançar semanas e a virada de temporada sem crash, tabela com resultados de motor real (Task 10).
5. `git diff` revisado; commits pequenos por task; sem `simulateAiMatch`/`processAiTransfers`/`week-advance.ts` remanescentes (`grep` limpo).
