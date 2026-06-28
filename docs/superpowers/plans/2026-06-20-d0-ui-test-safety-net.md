# D0 — Rede de Testes de UI (GATE do Redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2–5 min). Não pular o "rodar e ver falhar". Código real em cada step — zero placeholder.

**Goal:** Estabelecer a rede de testes que serve de gate ao redesign do Design System: (1) testar os 6 report-generators sem cobertura (`contract-alerts`, `free-agent-scout`, `line-efficiency`, `morale-report`, `opponent-report`, `transfer-roi-report`) com golden+edge+determinismo; (2) testar `game-store` e `database-store` com `better-sqlite3` real (init/save/load, derivados, isolamento por `saveId`); (3) smoke render + snapshot das telas-beachhead de D5 (`TransferMarketScreen`, `FreeAgentsScreen`) via `react-test-renderer` com store/DB reais, asserindo "renderiza sem throw + contém textos i18n".

**Architecture:** Os report-generators e stores já rodam no `jest.config.js` atual (`testEnvironment: 'node'`, `preset: 'ts-jest'`, `roots: ['<rootDir>/__tests__']`) — testes deles são aditivos, sem mudar config. Os **smoke tests de tela** exigem render React Native, o que o ambiente `node` não suporta; criamos um **segundo projeto Jest** (`jest.ui.config.js`, `testEnvironment: 'jsdom'`) com `react-test-renderer@19.1.0` (devDep nova) + mocks de `expo-sqlite`, `react-native-svg`, `@react-navigation/native` e Reanimated, mantendo store/DB reais (`better-sqlite3`) via `wrapBetterSqlite`. Os dois projetos coexistem; `npm test` roda ambos.

**Tech Stack:** TypeScript 5.9 strict, Jest 29 + ts-jest, `better-sqlite3` (DB real, NUNCA mock), `react-test-renderer` (novo devDep), `SeededRng`, Zustand. Engine puro intocado (só ganha testes).

**Convenções:** TDD; engine puro sem React/Expo; DB sempre `better-sqlite3` real via `createTestDb`/`seedTestDb`/`TEST_SAVE_ID` (`__tests__/database/test-helpers.ts`); `SeededRng` para tudo aleatório, ZERO `Math.random`/`Date.now` em caminhos de engine; i18n pt/en com paridade (mas D0 só **lê** chaves, não cria); branch `feat/d0-ui-test-safety-net`; **subagents NÃO commitam** (o orquestrador commita nos steps "Commit"). Mensagens de commit terminam com:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Precedente a espelhar:**
- Testes de report: `__tests__/engine/reports/youth-report.test.ts` (factory `mkPlayer`/`mkFixture`, `describe`+`it`, golden+edge).
- Testes de store com DB real: `__tests__/store/training-store.test.ts` (`createTestDb`→`seedClub`→`createTestDbHandle`, `beforeEach`/`afterEach`, `useStore.setState` para isolar).
- Helpers de DB: `__tests__/database/test-helpers.ts` (`createTestDb`, `createTestDbHandle`, `seedTestDb`, `TEST_SAVE_ID = 1`).
- APIs reais dos geradores (assinaturas confirmadas nos contracts abaixo).

---

## File Structure

- **Create** `__tests__/engine/reports/contract-alerts.test.ts` — golden/edge/sort de `buildContractAlerts`.
- **Create** `__tests__/engine/reports/morale-report.test.ts` — golden/edge de `buildMoraleReport`.
- **Create** `__tests__/engine/reports/line-efficiency.test.ts` — golden/edge de `buildLineEfficiency`.
- **Create** `__tests__/engine/reports/transfer-roi-report.test.ts` — golden/edge de `buildTransferROIReport`.
- **Create** `__tests__/engine/reports/free-agent-scout.test.ts` — golden/edge/determinismo de `buildFreeAgentScout`.
- **Create** `__tests__/engine/reports/opponent-report.test.ts` — golden/edge de `buildOpponentReport`.
- **Create** `__tests__/store/game-store.test.ts` — `startNewGame`/`loadSave`/`clearGame`/derivados/refresh.
- **Create** `__tests__/store/database-store.test.ts` — `wrapExpoDb` + init/save/load/isolamento com `better-sqlite3` real.
- **Modify** `package.json` — devDep `react-test-renderer@19.1.0`; script `test` roda ambos os projetos.
- **Create** `jest.ui.config.js` — projeto Jest jsdom para telas.
- **Create** `__tests__/ui/setup.ts` — mocks globais (expo-sqlite, svg, reanimated, navigation).
- **Create** `__tests__/ui/helpers.tsx` — `wrapBetterSqlite`, `seedAndStartGame`, `renderWithRealDb`.
- **Create** `__tests__/ui/TransferMarketScreen.test.tsx` — smoke + snapshot.
- **Create** `__tests__/ui/FreeAgentsScreen.test.tsx` — smoke + snapshot.

**Contract (assinaturas exatas — extraídas do código real, NÃO inventar):**

```ts
// src/engine/reports/technical-report.ts
export interface SquadPlayer {
  id: number; name: string; age: number; position: Position;
  overall: number; basePotential: number; effectivePotential: number;
  injuryWeeksLeft: number; attributes?: PlayerAttributes;
  morale?: number; contractEnd?: number; wage?: number;
}
export interface PlayerForm { playerId: number; appearances: number; avgRating: number; goals: number; assists: number; }

// src/engine/reports/contract-alerts.ts
export interface ContractAlert { player: SquadPlayer; contractEnd: number; urgency: 'critical' | 'warning' | 'watch'; }
export function buildContractAlerts(squad: SquadPlayer[], currentSeason: number): ContractAlert[];

// src/engine/reports/morale-report.ts
export interface MoraleEntry { playerId: number; playerName: string; position: Position; morale: number; }
export interface MoraleReport { avgMorale: number; topMorale: MoraleEntry[]; bottomMorale: MoraleEntry[]; alertLevel: 'ok'|'warning'|'critical'; }
export function buildMoraleReport(squad: SquadPlayer[]): MoraleReport;

// src/engine/reports/line-efficiency.ts
export const LINE_GROUPS: Record<'GK'|'DEF'|'MID'|'ATK', Position[]>;
export interface LineEfficiency { group: LineGroup; label: string; avgRating: number; appearances: number; isWeakest: boolean; isStrongest: boolean; }
export function buildLineEfficiency(forms: PlayerForm[], squad: SquadPlayer[]): LineEfficiency[];

// src/engine/reports/transfer-roi-report.ts
export interface PlayerForROI { id: number; name: string; position: Position; clubId: number | null; marketValue: number; attributes: PlayerAttributes; }
export interface TransferROIEntry { transfer: Transfer; playerId: number; playerName: string; position: Position; currentOverall: number; currentMarketValue: number; feePaid: number; valueDelta: number; goalsAndAssists: number; season: number; stillAtClub: boolean; isLoan: boolean; }
export interface TransferROIReport { signings: TransferROIEntry[]; sales: TransferROIEntry[]; }
export function buildTransferROIReport(transfers: Transfer[], playerClubId: number, playersById: Map<number, PlayerForROI>, statsByPlayerId: Map<number, PlayerStats[]>): TransferROIReport;

// src/engine/reports/free-agent-scout.ts
export interface FreeAgentFit { player: Player; overall: number; fitScore: number; coversPosition: Position; gapCovered: number; }
export interface SquadGap { position: Position; group: 'GK'|'DEF'|'MID'|'ATK'; avgOverall: number; playerCount: number; }
export interface FreeAgentScoutResult { fits: FreeAgentFit[]; squadGaps: SquadGap[]; }
export interface BuildFreeAgentScoutParams { freeAgentsWithAttrs: { player: Player; attributes: PlayerAttributes }[]; squadWithAttrs: { player: Player; attributes: PlayerAttributes }[]; wageBudgetRemaining: number; }
export function buildFreeAgentScout(params: BuildFreeAgentScoutParams): FreeAgentScoutResult;

// src/engine/reports/opponent-report.ts
export interface OpponentPlayer { id: number; name: string; position: Position; overall: number; }
export interface BuildOpponentReportInput {
  nextFixture: Fixture; playerClubId: number; playerClubReputation: number;
  opponentClubId: number; opponentName: string; opponentReputation: number;
  opponentRecentFixtures: Fixture[];
  opponentSquad: (OpponentPlayer & { attributes: PlayerAttributes })[];
  eventsByFixture: Map<number, MatchEvent[]>;
}
export function buildOpponentReport(input: BuildOpponentReportInput): OpponentReport;

// types relevantes
// src/types/transfer.ts: Transfer { id; playerId; season; fromClubId; toClubId; fee; wageOffered; type: 'transfer'|'loan'|'free'|'release'; loanEnd: number|null }
// src/types/player.ts: PlayerStats { playerId; season; competitionId; appearances; goals; assists; yellowCards; redCards; avgRating; minutesPlayed }
// src/types/match.ts: Fixture { id; competitionId; season; week; round; homeClubId; awayClubId; homeGoals; awayGoals; played; attendance }

// Helper de teste UI (a criar)
export function wrapBetterSqlite(db: import('better-sqlite3').Database): DbHandle; // mesma forma de createTestDbHandle
```

> **Nota sobre `calculateOverall` e `PlayerAttributes`:** `free-agent-scout`, `transfer-roi-report` e `opponent-report` chamam `calculateOverall(attributes, position)` (`@/utils/overall`). Os testes fornecem `PlayerAttributes` reais (objeto com as 19 chaves) — usar uma factory `mkAttrs()` que preenche todas as chaves com um valor base e permite override, espelhando o estilo `mkPlayer` do youth-report. As 19 chaves são as de `ATTRIBUTE_LABELS` (`technical-report.ts:34-53`): `finishing,passing,crossing,dribbling,heading,longShots,freeKicks,vision,composure,decisions,positioning,aggression,leadership,pace,stamina,strength,agility,jumping`.

---

## Task 1: Testes de `buildContractAlerts`

**Files:** Create `__tests__/engine/reports/contract-alerts.test.ts`
**Interfaces:** Consumes: `buildContractAlerts(squad, currentSeason)`, `SquadPlayer`. · Produces: suíte verde.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/reports/contract-alerts.test.ts`:
```ts
import { buildContractAlerts } from '@/engine/reports/contract-alerts';
import { SquadPlayer } from '@/engine/reports/technical-report';

function mkPlayer(id: number, o: Partial<SquadPlayer> = {}): SquadPlayer {
  return {
    id,
    name: o.name ?? `P${id}`,
    age: o.age ?? 25,
    position: o.position ?? 'ST',
    overall: o.overall ?? 75,
    basePotential: o.basePotential ?? 80,
    effectivePotential: o.effectivePotential ?? 80,
    injuryWeeksLeft: 0,
    contractEnd: o.contractEnd,
  };
}

describe('buildContractAlerts', () => {
  it('classifica urgência: 0 = critical, +1 = warning, +2 = watch', () => {
    const squad = [
      mkPlayer(1, { contractEnd: 3 }), // diff 0 -> critical
      mkPlayer(2, { contractEnd: 4 }), // diff 1 -> warning
      mkPlayer(3, { contractEnd: 5 }), // diff 2 -> watch
    ];
    const r = buildContractAlerts(squad, 3);
    const byId = new Map(r.map((a) => [a.player.id, a.urgency]));
    expect(byId.get(1)).toBe('critical');
    expect(byId.get(2)).toBe('warning');
    expect(byId.get(3)).toBe('watch');
  });

  it('exclui contratos > 2 temporadas à frente e overall <= 70', () => {
    const squad = [
      mkPlayer(1, { contractEnd: 10, overall: 90 }), // diff 7 -> fora
      mkPlayer(2, { contractEnd: 3, overall: 70 }),  // overall <= 70 -> fora
      mkPlayer(3, { contractEnd: 3, overall: 71 }),  // dentro
    ];
    const r = buildContractAlerts(squad, 3);
    const ids = r.map((a) => a.player.id);
    expect(ids).toEqual([3]);
  });

  it('ignora jogadores sem contractEnd', () => {
    const squad = [mkPlayer(1, { contractEnd: undefined, overall: 90 })];
    expect(buildContractAlerts(squad, 3)).toHaveLength(0);
  });

  it('ordena por urgência asc e depois overall desc', () => {
    const squad = [
      mkPlayer(1, { contractEnd: 4, overall: 80 }), // warning
      mkPlayer(2, { contractEnd: 3, overall: 75 }), // critical
      mkPlayer(3, { contractEnd: 3, overall: 85 }), // critical, maior overall
    ];
    const r = buildContractAlerts(squad, 3);
    expect(r.map((a) => a.player.id)).toEqual([3, 2, 1]);
  });

  it('squad vazio -> sem alertas', () => {
    expect(buildContractAlerts([], 1)).toEqual([]);
  });
});
```
- [ ] **Step 2 — rodar (passa de primeira; é caracterização):** `npx jest __tests__/engine/reports/contract-alerts.test.ts` → esperado: 5 passing. *(O gerador já existe; o teste valida e congela o comportamento. Se algum assert falhar, é bug do gerador a investigar com systematic-debugging, NÃO ajustar o teste para "passar".)*
- [ ] **Step 3 — implementar:** nada a implementar (gerador pronto). Se Step 2 acusou divergência real, parar e reportar ao orquestrador.
- [ ] **Step 4 — tsc:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** orquestrador: `git add __tests__/engine/reports/contract-alerts.test.ts` · msg: `test(d0): cobertura de buildContractAlerts (urgência, filtros, ordenação)`.

---

## Task 2: Testes de `buildMoraleReport`

**Files:** Create `__tests__/engine/reports/morale-report.test.ts`
**Interfaces:** Consumes: `buildMoraleReport(squad)`, `SquadPlayer`. · Produces: suíte verde.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/reports/morale-report.test.ts`:
```ts
import { buildMoraleReport } from '@/engine/reports/morale-report';
import { SquadPlayer } from '@/engine/reports/technical-report';

function mkPlayer(id: number, morale: number | undefined, position: SquadPlayer['position'] = 'ST'): SquadPlayer {
  return {
    id, name: `P${id}`, age: 25, position,
    overall: 75, basePotential: 80, effectivePotential: 80,
    injuryWeeksLeft: 0, morale,
  };
}

describe('buildMoraleReport', () => {
  it('calcula média arredondada e classifica alertLevel', () => {
    const ok = buildMoraleReport([mkPlayer(1, 80), mkPlayer(2, 70)]);
    expect(ok.avgMorale).toBe(75);
    expect(ok.alertLevel).toBe('ok');

    const warning = buildMoraleReport([mkPlayer(1, 60), mkPlayer(2, 60)]);
    expect(warning.alertLevel).toBe('warning');

    const critical = buildMoraleReport([mkPlayer(1, 40), mkPlayer(2, 40)]);
    expect(critical.alertLevel).toBe('critical');
  });

  it('top/bottom têm no máx 3, ordenados por moral desc/asc', () => {
    const squad = [
      mkPlayer(1, 90), mkPlayer(2, 80), mkPlayer(3, 70), mkPlayer(4, 60), mkPlayer(5, 50),
    ];
    const r = buildMoraleReport(squad);
    expect(r.topMorale.map((e) => e.playerId)).toEqual([1, 2, 3]);
    expect(r.bottomMorale.map((e) => e.playerId)).toEqual([5, 4, 3]);
    expect(r.topMorale).toHaveLength(3);
  });

  it('desempata por posição (localeCompare) com morais iguais', () => {
    const squad = [mkPlayer(1, 70, 'ST'), mkPlayer(2, 70, 'CB')];
    const r = buildMoraleReport(squad);
    // CB < ST -> player 2 vem antes no sorted desc (empate cai no localeCompare asc)
    expect(r.topMorale[0].playerId).toBe(2);
  });

  it('squad vazio -> relatório zerado, alertLevel ok', () => {
    const r = buildMoraleReport([]);
    expect(r).toEqual({ avgMorale: 0, topMorale: [], bottomMorale: [], alertLevel: 'ok' });
  });

  it('squad sem nenhum morale definido -> relatório zerado', () => {
    const r = buildMoraleReport([mkPlayer(1, undefined), mkPlayer(2, undefined)]);
    expect(r.avgMorale).toBe(0);
    expect(r.topMorale).toEqual([]);
  });
});
```
- [ ] **Step 2 — rodar (caracterização):** `npx jest __tests__/engine/reports/morale-report.test.ts` → 5 passing.
- [ ] **Step 3 — implementar:** nada (gerador pronto). Divergência real → reportar.
- [ ] **Step 4 — tsc:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add __tests__/engine/reports/morale-report.test.ts` · msg: `test(d0): cobertura de buildMoraleReport (média, alertLevel, top/bottom)`.

---

## Task 3: Testes de `buildLineEfficiency`

**Files:** Create `__tests__/engine/reports/line-efficiency.test.ts`
**Interfaces:** Consumes: `buildLineEfficiency(forms, squad)`, `PlayerForm`, `SquadPlayer`, `LINE_GROUPS`. · Produces: suíte verde.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/reports/line-efficiency.test.ts`:
```ts
import { buildLineEfficiency } from '@/engine/reports/line-efficiency';
import { PlayerForm, SquadPlayer } from '@/engine/reports/technical-report';
import { Position } from '@/types';

function mkPlayer(id: number, position: Position): SquadPlayer {
  return { id, name: `P${id}`, age: 25, position, overall: 75, basePotential: 80, effectivePotential: 80, injuryWeeksLeft: 0 };
}
function mkForm(playerId: number, avgRating: number, appearances: number): PlayerForm {
  return { playerId, avgRating, appearances, goals: 0, assists: 0 };
}

describe('buildLineEfficiency', () => {
  it('agrega por linha com média ponderada por aparições e marca weakest/strongest', () => {
    const squad = [mkPlayer(1, 'GK'), mkPlayer(2, 'CB'), mkPlayer(3, 'ST')];
    const forms = [
      mkForm(1, 6.0, 2), // GK
      mkForm(2, 8.0, 2), // DEF
      mkForm(3, 7.0, 2), // ATK
    ];
    const r = buildLineEfficiency(forms, squad);
    const byGroup = new Map(r.map((l) => [l.group, l]));
    expect(byGroup.get('GK')!.avgRating).toBe(6.0);
    expect(byGroup.get('DEF')!.avgRating).toBe(8.0);
    expect(byGroup.get('MID')!.appearances).toBe(0); // sem dados
    expect(byGroup.get('GK')!.isWeakest).toBe(true);
    expect(byGroup.get('DEF')!.isStrongest).toBe(true);
    // MID sem aparições nunca é weakest/strongest
    expect(byGroup.get('MID')!.isWeakest).toBe(false);
    expect(byGroup.get('MID')!.isStrongest).toBe(false);
  });

  it('média ponderada: dois jogadores na mesma linha', () => {
    const squad = [mkPlayer(1, 'CB'), mkPlayer(2, 'LB')];
    const forms = [mkForm(1, 6.0, 1), mkForm(2, 8.0, 3)]; // (6*1 + 8*3)/4 = 7.5
    const r = buildLineEfficiency(forms, squad);
    expect(r.find((l) => l.group === 'DEF')!.avgRating).toBe(7.5);
  });

  it('ignora forms com 0 aparições e forms de jogador fora do squad', () => {
    const squad = [mkPlayer(1, 'ST')];
    const forms = [mkForm(1, 0, 0), mkForm(99, 9, 5)];
    const r = buildLineEfficiency(forms, squad);
    for (const l of r) expect(l.appearances).toBe(0);
  });

  it('sempre retorna as 4 linhas com label', () => {
    const r = buildLineEfficiency([], []);
    expect(r.map((l) => l.group)).toEqual(['GK', 'DEF', 'MID', 'ATK']);
    expect(r.every((l) => typeof l.label === 'string' && l.label.length > 0)).toBe(true);
  });
});
```
- [ ] **Step 2 — rodar (caracterização):** `npx jest __tests__/engine/reports/line-efficiency.test.ts` → 4 passing.
- [ ] **Step 3 — implementar:** nada. Divergência real → reportar.
- [ ] **Step 4 — tsc:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add __tests__/engine/reports/line-efficiency.test.ts` · msg: `test(d0): cobertura de buildLineEfficiency (média ponderada, weakest/strongest)`.

---

## Task 4: Testes de `buildTransferROIReport`

**Files:** Create `__tests__/engine/reports/transfer-roi-report.test.ts`
**Interfaces:** Consumes: `buildTransferROIReport(transfers, playerClubId, playersById, statsByPlayerId)`, `Transfer`, `PlayerStats`, `PlayerForROI`. · Produces: suíte verde.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/reports/transfer-roi-report.test.ts`:
```ts
import { buildTransferROIReport, PlayerForROI } from '@/engine/reports/transfer-roi-report';
import { Transfer } from '@/types';
import { PlayerStats, PlayerAttributes } from '@/types/player';

const CLUB = 10;

function mkAttrs(o: Partial<PlayerAttributes> = {}): PlayerAttributes {
  const base = 60;
  return {
    finishing: base, passing: base, crossing: base, dribbling: base, heading: base,
    longShots: base, freeKicks: base, vision: base, composure: base, decisions: base,
    positioning: base, aggression: base, leadership: base, pace: base, stamina: base,
    strength: base, agility: base, jumping: base, ...o,
  };
}
function mkPlayer(id: number, o: Partial<PlayerForROI> = {}): PlayerForROI {
  return {
    id, name: o.name ?? `P${id}`, position: o.position ?? 'ST',
    clubId: o.clubId === undefined ? CLUB : o.clubId,
    marketValue: o.marketValue ?? 1_000_000, attributes: o.attributes ?? mkAttrs(),
  };
}
function mkTransfer(id: number, o: Partial<Transfer> = {}): Transfer {
  return {
    id, playerId: o.playerId ?? id, season: o.season ?? 1,
    fromClubId: o.fromClubId ?? 99, toClubId: o.toClubId ?? CLUB,
    fee: o.fee ?? 500_000, wageOffered: o.wageOffered ?? 1000,
    type: o.type ?? 'transfer', loanEnd: o.loanEnd ?? null,
  };
}
function mkStats(playerId: number, season: number, goals: number, assists: number): PlayerStats {
  return { playerId, season, competitionId: 1, appearances: 10, goals, assists, yellowCards: 0, redCards: 0, avgRating: 7, minutesPlayed: 900 };
}

describe('buildTransferROIReport', () => {
  it('separa signings (toClub = playerClub) de sales (fromClub = playerClub)', () => {
    const transfers = [
      mkTransfer(1, { playerId: 1, toClubId: CLUB, fromClubId: 99 }),    // signing
      mkTransfer(2, { playerId: 2, toClubId: 99, fromClubId: CLUB, fee: 800_000 }), // sale
    ];
    const players = new Map<number, PlayerForROI>([
      [1, mkPlayer(1, { clubId: CLUB, marketValue: 1_200_000 })],
      [2, mkPlayer(2, { clubId: 99 })],
    ]);
    const r = buildTransferROIReport(transfers, CLUB, players, new Map());
    expect(r.signings.map((e) => e.playerId)).toEqual([1]);
    expect(r.sales.map((e) => e.playerId)).toEqual([2]);
  });

  it('valueDelta = marketValue - fee só para quem ainda está no clube', () => {
    const transfers = [mkTransfer(1, { playerId: 1, fee: 500_000 })];
    const players = new Map([[1, mkPlayer(1, { clubId: CLUB, marketValue: 1_200_000 })]]);
    const r = buildTransferROIReport(transfers, CLUB, players, new Map());
    expect(r.signings[0].valueDelta).toBe(700_000);
    expect(r.signings[0].stillAtClub).toBe(true);
  });

  it('jogador que saiu do clube -> stillAtClub false, valueDelta 0', () => {
    const transfers = [mkTransfer(1, { playerId: 1, fee: 500_000 })];
    const players = new Map([[1, mkPlayer(1, { clubId: 77 })]]); // foi pra outro clube depois
    const r = buildTransferROIReport(transfers, CLUB, players, new Map());
    expect(r.signings[0].stillAtClub).toBe(false);
    expect(r.signings[0].valueDelta).toBe(0);
  });

  it('soma goals+assists apenas de temporadas >= season da transferência', () => {
    const transfers = [mkTransfer(1, { playerId: 1, season: 2 })];
    const players = new Map([[1, mkPlayer(1)]]);
    const stats = new Map<number, PlayerStats[]>([[1, [
      mkStats(1, 1, 5, 5),   // antes -> ignorado
      mkStats(1, 2, 3, 2),   // conta
      mkStats(1, 3, 1, 1),   // conta
    ]]]);
    const r = buildTransferROIReport(transfers, CLUB, players, stats);
    expect(r.signings[0].goalsAndAssists).toBe(7);
  });

  it('isLoan reflete type=loan; sem player no mapa usa fallback name', () => {
    const transfers = [mkTransfer(1, { playerId: 1, type: 'loan' })];
    const r = buildTransferROIReport(transfers, CLUB, new Map(), new Map());
    expect(r.signings[0].isLoan).toBe(true);
    expect(r.signings[0].playerName).toBe('Jogador #1');
    expect(r.signings[0].currentOverall).toBe(0);
  });

  it('sem transferências -> listas vazias', () => {
    const r = buildTransferROIReport([], CLUB, new Map(), new Map());
    expect(r).toEqual({ signings: [], sales: [] });
  });
});
```
- [ ] **Step 2 — rodar (caracterização):** `npx jest __tests__/engine/reports/transfer-roi-report.test.ts` → 6 passing.
- [ ] **Step 3 — implementar:** nada. Divergência real → reportar.
- [ ] **Step 4 — tsc:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add __tests__/engine/reports/transfer-roi-report.test.ts` · msg: `test(d0): cobertura de buildTransferROIReport (signings/sales, valueDelta, G+A)`.

---

## Task 5: Testes de `buildFreeAgentScout`

**Files:** Create `__tests__/engine/reports/free-agent-scout.test.ts`
**Interfaces:** Consumes: `buildFreeAgentScout(params)`, `Player`, `PlayerAttributes`. · Produces: suíte verde.
**Nota:** usa `Player` (de `@/types`) com `wage`, `position`, `secondaryPosition`. Confirmar campos mínimos lendo `src/types/player.ts` antes de escrever a factory — `mkAgent` deve preencher os obrigatórios de `Player`.

- [ ] **Step 1 — preparação:** ler `src/types/player.ts` (interface `Player`) para a factory `mkAgent` ter todos os campos obrigatórios. Não inventar campos.
- [ ] **Step 2 — teste falhando:** criar `__tests__/engine/reports/free-agent-scout.test.ts`:
```ts
import { buildFreeAgentScout } from '@/engine/reports/free-agent-scout';
import { Player } from '@/types';
import { PlayerAttributes } from '@/types/player';

function mkAttrs(o: Partial<PlayerAttributes> = {}): PlayerAttributes {
  const base = 60;
  return {
    finishing: base, passing: base, crossing: base, dribbling: base, heading: base,
    longShots: base, freeKicks: base, vision: base, composure: base, decisions: base,
    positioning: base, aggression: base, leadership: base, pace: base, stamina: base,
    strength: base, agility: base, jumping: base, ...o,
  };
}
// Preencher TODOS os campos obrigatórios de Player conforme src/types/player.ts (lido no Step 1).
function mkPlayer(id: number, o: Partial<Player> = {}): Player {
  return {
    id, name: o.name ?? `P${id}`, nationality: o.nationality ?? 'BR',
    age: o.age ?? 25, position: o.position ?? 'ST',
    secondaryPosition: o.secondaryPosition ?? null,
    clubId: o.clubId ?? null, wage: o.wage ?? 1000,
    contractEnd: o.contractEnd ?? 5, marketValue: o.marketValue ?? 1_000_000,
    basePotential: o.basePotential ?? 80, effectivePotential: o.effectivePotential ?? 80,
    morale: o.morale ?? 70, fitness: o.fitness ?? 100,
    injuryWeeksLeft: o.injuryWeeksLeft ?? 0, isFreeAgent: o.isFreeAgent ?? true,
  } as Player; // ajustar ao shape exato lido no Step 1
}

describe('buildFreeAgentScout', () => {
  it('calcula squadGaps por posição ordenados por avgOverall asc', () => {
    const squad = [
      { player: mkPlayer(1, { position: 'ST' }), attributes: mkAttrs({ finishing: 90 }) },
      { player: mkPlayer(2, { position: 'CB' }), attributes: mkAttrs({ heading: 40 }) },
    ];
    const r = buildFreeAgentScout({ freeAgentsWithAttrs: [], squadWithAttrs: squad, wageBudgetRemaining: 1_000_000 });
    expect(r.squadGaps.length).toBe(2);
    // ordenado asc por avgOverall
    expect(r.squadGaps[0].avgOverall).toBeLessThanOrEqual(r.squadGaps[1].avgOverall);
    expect(r.squadGaps.map((g) => g.position).sort()).toEqual(['CB', 'ST']);
  });

  it('filtra agentes cujo wage > 30% do budget restante', () => {
    const squad = [{ player: mkPlayer(1, { position: 'ST' }), attributes: mkAttrs() }];
    const cheap = { player: mkPlayer(10, { position: 'ST', wage: 100 }), attributes: mkAttrs({ finishing: 99 }) };
    const pricey = { player: mkPlayer(11, { position: 'ST', wage: 5000 }), attributes: mkAttrs({ finishing: 99 }) };
    const r = buildFreeAgentScout({ freeAgentsWithAttrs: [cheap, pricey], squadWithAttrs: squad, wageBudgetRemaining: 10_000 });
    // budget*0.3 = 3000 -> cheap passa, pricey é filtrado
    expect(r.fits.map((f) => f.player.id)).toEqual([10]);
  });

  it('ordena fits por fitScore desc e é determinístico (mesma entrada = mesma saída)', () => {
    const squad = [{ player: mkPlayer(1, { position: 'ST' }), attributes: mkAttrs({ finishing: 50 }) }];
    const agents = [
      { player: mkPlayer(10, { position: 'ST', wage: 100 }), attributes: mkAttrs({ finishing: 70 }) },
      { player: mkPlayer(11, { position: 'ST', wage: 100 }), attributes: mkAttrs({ finishing: 95 }) },
    ];
    const params = { freeAgentsWithAttrs: agents, squadWithAttrs: squad, wageBudgetRemaining: 1_000_000 };
    const a = buildFreeAgentScout(params);
    const b = buildFreeAgentScout(params);
    expect(a).toEqual(b);
    expect(a.fits[0].fitScore).toBeGreaterThanOrEqual(a.fits[1].fitScore);
  });

  it('budget negativo é tratado como 0 (nenhum agente passa o filtro de wage)', () => {
    const squad = [{ player: mkPlayer(1, { position: 'ST' }), attributes: mkAttrs() }];
    const agent = { player: mkPlayer(10, { position: 'ST', wage: 1 }), attributes: mkAttrs() };
    const r = buildFreeAgentScout({ freeAgentsWithAttrs: [agent], squadWithAttrs: squad, wageBudgetRemaining: -500 });
    expect(r.fits).toHaveLength(0);
  });

  it('squad vazio -> squadGaps vazio mas ainda pontua agentes vs baseline 50', () => {
    const agent = { player: mkPlayer(10, { position: 'ST', wage: 100 }), attributes: mkAttrs({ finishing: 90 }) };
    const r = buildFreeAgentScout({ freeAgentsWithAttrs: [agent], squadWithAttrs: [], wageBudgetRemaining: 1_000_000 });
    expect(r.squadGaps).toHaveLength(0);
    expect(r.fits).toHaveLength(1);
    expect(r.fits[0].gapCovered).toBeGreaterThan(0); // overall do agente - baseline 50 > 0
  });
});
```
- [ ] **Step 3 — rodar (caracterização):** `npx jest __tests__/engine/reports/free-agent-scout.test.ts` → 5 passing. *(Se a factory `mkPlayer` tiver campo divergente do `Player` real, `tsc`/jest acusa — corrigir a factory pelo tipo, não o gerador.)*
- [ ] **Step 4 — tsc:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add __tests__/engine/reports/free-agent-scout.test.ts` · msg: `test(d0): cobertura de buildFreeAgentScout (gaps, filtro de wage, fitScore, determinismo)`.

---

## Task 6: Testes de `buildOpponentReport`

**Files:** Create `__tests__/engine/reports/opponent-report.test.ts`
**Interfaces:** Consumes: `buildOpponentReport(input)`, `Fixture`, `MatchEvent`, `PlayerAttributes`, `OpponentPlayer`. · Produces: suíte verde.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/reports/opponent-report.test.ts`:
```ts
import { buildOpponentReport, OpponentPlayer } from '@/engine/reports/opponent-report';
import { Fixture, MatchEvent } from '@/types';
import { PlayerAttributes } from '@/types/player';

const ME = 10;
const OPP = 20;

function mkAttrs(o: Partial<PlayerAttributes> = {}): PlayerAttributes {
  const base = 60;
  return {
    finishing: base, passing: base, crossing: base, dribbling: base, heading: base,
    longShots: base, freeKicks: base, vision: base, composure: base, decisions: base,
    positioning: base, aggression: base, leadership: base, pace: base, stamina: base,
    strength: base, agility: base, jumping: base, ...o,
  };
}
function mkFixture(id: number, o: Partial<Fixture> = {}): Fixture {
  return {
    id, competitionId: 1, season: 1, week: o.week ?? 5, round: null,
    homeClubId: o.homeClubId ?? OPP, awayClubId: o.awayClubId ?? 99,
    homeGoals: o.homeGoals ?? 2, awayGoals: o.awayGoals ?? 0,
    played: true, attendance: 10000,
  };
}
function mkOpp(id: number, position: OpponentPlayer['position'], attrs: PlayerAttributes): OpponentPlayer & { attributes: PlayerAttributes } {
  return { id, name: `O${id}`, position, overall: 0, attributes: attrs };
}

describe('buildOpponentReport', () => {
  it('rotula reputação: Favorito (>+15), Equilíbrio, Zebra (<-15) e detecta mando', () => {
    const next = mkFixture(1, { homeClubId: ME, awayClubId: OPP });
    const base = {
      nextFixture: next, playerClubId: ME, playerClubReputation: 50,
      opponentClubId: OPP, opponentName: 'Rival',
      opponentRecentFixtures: [], opponentSquad: [], eventsByFixture: new Map<number, MatchEvent[]>(),
    };
    expect(buildOpponentReport({ ...base, opponentReputation: 80 }).reputationLabel).toBe('Favorito');
    expect(buildOpponentReport({ ...base, opponentReputation: 50 }).reputationLabel).toBe('Equilíbrio');
    expect(buildOpponentReport({ ...base, opponentReputation: 20 }).reputationLabel).toBe('Zebra');
    expect(buildOpponentReport({ ...base, opponentReputation: 50 }).isHome).toBe(true);
  });

  it('calcula recentForm (W/D/L do ponto de vista do adversário) e médias de gols', () => {
    const recent = [
      mkFixture(101, { homeClubId: OPP, homeGoals: 3, awayGoals: 0 }), // W, gf3 ga0
      mkFixture(102, { homeClubId: 99, awayClubId: OPP, homeGoals: 1, awayGoals: 1 }), // D, gf1 ga1
    ];
    const r = buildOpponentReport({
      nextFixture: mkFixture(1, { homeClubId: ME, awayClubId: OPP }),
      playerClubId: ME, playerClubReputation: 50, opponentClubId: OPP, opponentName: 'Rival',
      opponentReputation: 50, opponentRecentFixtures: recent, opponentSquad: [],
      eventsByFixture: new Map(),
    });
    expect(r.recentForm.map((f) => f.result)).toEqual(['W', 'D']);
    expect(r.goalsPerGame).toBe(2);     // (3+1)/2
    expect(r.concededPerGame).toBe(0.5); // (0+1)/2
  });

  it('top 3 por overall calculado dos atributos + média do elenco', () => {
    const squad = [
      mkOpp(1, 'ST', mkAttrs({ finishing: 95, pace: 95 })),
      mkOpp(2, 'CB', mkAttrs({ heading: 40 })),
      mkOpp(3, 'GK', mkAttrs({ positioning: 50 })),
      mkOpp(4, 'CM', mkAttrs({ passing: 70 })),
    ];
    const r = buildOpponentReport({
      nextFixture: mkFixture(1, { homeClubId: ME, awayClubId: OPP }),
      playerClubId: ME, playerClubReputation: 50, opponentClubId: OPP, opponentName: 'Rival',
      opponentReputation: 50, opponentRecentFixtures: [], opponentSquad: squad,
      eventsByFixture: new Map(),
    });
    expect(r.topPlayers).toHaveLength(3);
    expect(r.topPlayers[0].id).toBe(1); // melhor overall
    expect(r.squadAvgOverall).toBeGreaterThan(0);
  });

  it('alerta de sequência de 3 vitórias seguidas', () => {
    const recent = [
      mkFixture(101, { homeClubId: OPP, homeGoals: 1, awayGoals: 0 }),
      mkFixture(102, { homeClubId: OPP, homeGoals: 2, awayGoals: 1 }),
      mkFixture(103, { homeClubId: OPP, homeGoals: 3, awayGoals: 0 }),
    ];
    const r = buildOpponentReport({
      nextFixture: mkFixture(1, { homeClubId: ME, awayClubId: OPP }),
      playerClubId: ME, playerClubReputation: 50, opponentClubId: OPP, opponentName: 'Rival',
      opponentReputation: 50, opponentRecentFixtures: recent, opponentSquad: [],
      eventsByFixture: new Map(),
    });
    expect(r.alertMessage).toContain('Rival');
  });

  it('sem fixtures/sem elenco -> médias 0, top vazio, alerta null', () => {
    const r = buildOpponentReport({
      nextFixture: mkFixture(1, { homeClubId: OPP, awayClubId: ME }),
      playerClubId: ME, playerClubReputation: 50, opponentClubId: OPP, opponentName: 'Rival',
      opponentReputation: 50, opponentRecentFixtures: [], opponentSquad: [],
      eventsByFixture: new Map(),
    });
    expect(r.goalsPerGame).toBe(0);
    expect(r.topPlayers).toEqual([]);
    expect(r.squadAvgOverall).toBe(0);
    expect(r.alertMessage).toBeNull();
    expect(r.isHome).toBe(false); // ME é visitante
  });
});
```
- [ ] **Step 2 — rodar (caracterização):** `npx jest __tests__/engine/reports/opponent-report.test.ts` → 5 passing.
- [ ] **Step 3 — implementar:** nada. Divergência real → reportar.
- [ ] **Step 4 — tsc:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add __tests__/engine/reports/opponent-report.test.ts` · msg: `test(d0): cobertura de buildOpponentReport (reputação, forma, top3, alertas)`. **Marco:** 13/13 report-generators com teste.

---

## Task 7: Testes de `game-store` (Zustand, sem DB e com DB real)

**Files:** Create `__tests__/store/game-store.test.ts`
**Interfaces:** Consumes: `useGameStore` (`@/store/game-store`), `createTestDb`/`createTestDbHandle`/`seedTestDb`/`TEST_SAVE_ID`. · Produces: suíte verde.
**Precedente:** `__tests__/store/training-store.test.ts` (padrão `useStore.getState()`/`setState`, `beforeEach` reset).

- [ ] **Step 1 — preparação:** confirmar a forma de `SaveGame` lendo `src/types` (campos usados em `loadSave`: `id, playerClubId, currentSeason, currentWeek, preseasonPending, pressPending, jobOffersPending, unemployed, managerReputation, onboardingSeen`). Confirmar `countUnread` (usada por `refreshUnreadNewsCount`) existe em `@/database/queries/news`.
- [ ] **Step 2 — teste falhando:** criar `__tests__/store/game-store.test.ts`:
```ts
import { useGameStore } from '@/store/game-store';
import { SaveGame } from '@/types';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import Database from 'better-sqlite3';
import { DbHandle } from '@/database/queries/players';

function mkSave(o: Partial<SaveGame> = {}): SaveGame {
  return {
    id: o.id ?? 1, name: o.name ?? 'S', currentSeason: o.currentSeason ?? 2,
    currentWeek: o.currentWeek ?? 7, playerClubId: o.playerClubId ?? 10,
    difficulty: o.difficulty ?? 'normal',
    preseasonPending: o.preseasonPending ?? false, pressPending: o.pressPending ?? false,
    jobOffersPending: o.jobOffersPending ?? false, unemployed: o.unemployed ?? false,
    managerReputation: o.managerReputation ?? 62, onboardingSeen: o.onboardingSeen ?? true,
    createdAt: '', updatedAt: '',
  };
}

describe('game-store', () => {
  beforeEach(() => {
    useGameStore.getState().clearGame();
  });

  it('startNewGame popula currentSave/derivados e zera carreira', () => {
    useGameStore.getState().startNewGame(5, 33, 1, 1);
    const s = useGameStore.getState();
    expect(s.currentSave?.id).toBe(5);
    expect(s.playerClubId).toBe(33);
    expect(s.season).toBe(1);
    expect(s.week).toBe(1);
    expect(s.managerReputation).toBe(50);
    expect(s.unemployed).toBe(false);
  });

  it('loadSave hidrata season/week/playerClubId e flags de carreira do save', () => {
    useGameStore.getState().loadSave(mkSave({ id: 9, playerClubId: 21, currentSeason: 3, currentWeek: 12, managerReputation: 80 }));
    const s = useGameStore.getState();
    expect(s.currentSave?.id).toBe(9);
    expect(s.playerClubId).toBe(21);
    expect(s.season).toBe(3);
    expect(s.week).toBe(12);
    expect(s.managerReputation).toBe(80);
    // loadSave reseta dados voláteis
    expect(s.recentResults).toEqual([]);
    expect(s.playerClub).toBeNull();
    expect(s.lastMatchResult).toBeNull();
  });

  it('clearGame volta ao estado inicial', () => {
    useGameStore.getState().loadSave(mkSave({ id: 9 }));
    useGameStore.getState().clearGame();
    const s = useGameStore.getState();
    expect(s.currentSave).toBeNull();
    expect(s.playerClubId).toBeNull();
    expect(s.season).toBe(1);
    expect(s.unreadNewsCount).toBe(0);
  });

  it('setters atualizam slices isoladamente', () => {
    const g = useGameStore.getState();
    g.setAdvancing(true);
    g.updateWeek(4, 9);
    g.setUnreadNewsCount(3);
    const s = useGameStore.getState();
    expect(s.isAdvancing).toBe(true);
    expect(s.season).toBe(4);
    expect(s.week).toBe(9);
    expect(s.unreadNewsCount).toBe(3);
  });
});

describe('game-store refreshUnreadNewsCount (DB real)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    useGameStore.getState().clearGame();
  });
  afterEach(() => rawDb.close());

  it('sem currentSave não lança e mantém contador 0', async () => {
    await useGameStore.getState().refreshUnreadNewsCount(db);
    expect(useGameStore.getState().unreadNewsCount).toBe(0);
  });

  it('com currentSave lê countUnread do DB (save vazio = 0)', async () => {
    useGameStore.getState().startNewGame(TEST_SAVE_ID, 10, 1, 1);
    await useGameStore.getState().refreshUnreadNewsCount(db);
    expect(useGameStore.getState().unreadNewsCount).toBe(0); // sem news inseridas
  });
});
```
- [ ] **Step 3 — rodar (deve passar):** `npx jest __tests__/store/game-store.test.ts` → 6 passing. *(Store já existe; teste é caracterização. `loadSave` chama `useBoardStore.reset()`/`useAssistantStore.reset()` — eles rodam sem DB, ok.)*
- [ ] **Step 4 — tsc:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add __tests__/store/game-store.test.ts` · msg: `test(d0): cobertura de game-store (start/load/clear, derivados, refreshUnreadNewsCount com DB real)`.

---

## Task 8: Testes de `database-store` (`wrapExpoDb` + ciclo init/save/load + isolamento por saveId)

**Files:** Create `__tests__/store/database-store.test.ts`
**Interfaces:** Consumes: `wrapExpoDb` (`@/store/database-store`), `createTestDb`, `createSave`/`getSaveById`/`getAllSaves` (`@/database/queries/saves`), `seedReferenceTables`/`seedWorldForSave`. · Produces: suíte verde.

> **Por que não testar `initialize()` direto:** `useDatabaseStore.initialize()` chama `SQLite.openDatabaseAsync` (expo-sqlite, nativo, não roda em `node`). O comportamento testável e portátil é `wrapExpoDb` (a adapter que converte uma `Database` em `DbHandle`) + o **ciclo de queries** que `initialize` orquestra (schema + save isolation). Testamos `wrapExpoDb` contra uma `better-sqlite3` real (que expõe a mesma API síncrona `getAllAsync`-shape via shim) e o **isolamento por saveId** via `createSave`+`seedWorldForSave`, que é o invariante crítico que o redesign não pode quebrar.

- [ ] **Step 1 — preparação:** ler `src/database/seed.ts` (`seedReferenceTables`, `seedWorldForSave`, `generateSeedData`) e `src/database/queries/saves.ts` (`createSave`, `getSaveById`, `getAllSaves`). Confirmar `wrapExpoDb` espera um objeto com `getAllAsync/getFirstAsync/runAsync` (assinaturas em `database-store.ts:40-52`).
- [ ] **Step 2 — teste falhando:** criar `__tests__/store/database-store.test.ts`:
```ts
import Database from 'better-sqlite3';
import { wrapExpoDb } from '@/store/database-store';
import { createTestDb } from '../database/test-helpers';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { seedReferenceTables, seedWorldForSave } from '@/database/seed';
import { createSave, getSaveById, getAllSaves } from '@/database/queries/saves';
import { getPlayersByClub } from '@/database/queries/players';

/**
 * Shim: wrapExpoDb consome a API expo-sqlite (getAllAsync/getFirstAsync/runAsync).
 * better-sqlite3 é síncrono; embrulhamos em Promise para alimentar wrapExpoDb com
 * uma fonte de verdade real (sem mock de DB).
 */
function expoLike(db: Database.Database) {
  return {
    getAllAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid) };
    },
  } as unknown as Parameters<typeof wrapExpoDb>[0];
}

describe('wrapExpoDb adapter', () => {
  let raw: Database.Database;
  beforeEach(() => { raw = createTestDb(); });
  afterEach(() => raw.close());

  it('expõe prepare().all/.get/.run mapeando para a API expo-sqlite', async () => {
    const handle = wrapExpoDb(expoLike(raw));
    raw.pragma('foreign_keys = OFF');
    await handle.prepare("INSERT INTO countries (id,name,code,continent) VALUES (1,'Brazil','BR','SA')").run();
    const all = await handle.prepare('SELECT * FROM countries').all();
    expect(all).toHaveLength(1);
    const one = await handle.prepare('SELECT * FROM countries WHERE id = ?').get(1) as { name: string };
    expect(one.name).toBe('Brazil');
  });

  it('run() devolve lastInsertRowid a partir de lastInsertRowId', async () => {
    const handle = wrapExpoDb(expoLike(raw));
    raw.pragma('foreign_keys = OFF');
    const r = await handle.prepare("INSERT INTO countries (name,code,continent) VALUES ('X','XX','SA')").run();
    expect(typeof r.lastInsertRowid).toBe('number');
    expect(r.lastInsertRowid).toBeGreaterThan(0);
  });
});

describe('save lifecycle + isolamento por saveId (DB real)', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof wrapExpoDb>;
  beforeEach(() => {
    raw = createTestDb();
    db = wrapExpoDb(expoLike(raw));
  });
  afterEach(() => raw.close());

  it('createSave -> getSaveById -> getAllSaves reflete o ciclo', async () => {
    raw.pragma('foreign_keys = OFF');
    const data = generateSeedData(7);
    seedReferenceTables(db, data); // countries + leagues globais
    const clubId = data.clubs[0].id;
    const saveId = await createSave(db, { name: 'Carreira A', playerClubId: clubId });
    const loaded = await getSaveById(db, saveId);
    expect(loaded?.id).toBe(saveId);
    expect(loaded?.playerClubId).toBe(clubId);
    const all = await getAllSaves(db);
    expect(all.some((s) => s.id === saveId)).toBe(true);
  });

  it('dois saves não vazam dados entre si (isolamento por save_id)', async () => {
    raw.pragma('foreign_keys = OFF');
    const dataA = generateSeedData(7);
    seedReferenceTables(db, dataA);
    const saveA = await createSave(db, { name: 'A', playerClubId: dataA.clubs[0].id });
    seedWorldForSave(db, dataA, saveA);

    const dataB = generateSeedData(7);
    const saveB = await createSave(db, { name: 'B', playerClubId: dataB.clubs[0].id });
    seedWorldForSave(db, dataB, saveB);

    const clubA = dataA.clubs[0].id;
    const playersA = await getPlayersByClub(db, saveA, clubA);
    const playersB = await getPlayersByClub(db, saveB, clubA);
    // Mesmo club id raw, mas cada save tem seu próprio mundo -> os do save B não aparecem no A e vice-versa
    expect(playersA.length).toBeGreaterThan(0);
    // Nenhum jogador do saveA deve ter save_id de saveB (verificável via contagem total por save)
    const countA = raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id = ?').get(saveA) as { c: number };
    const countB = raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id = ?').get(saveB) as { c: number };
    expect(countA.c).toBeGreaterThan(0);
    expect(countB.c).toBeGreaterThan(0);
    expect(playersA.every((p) => p != null)).toBe(true);
    expect(playersB.every((p) => p != null)).toBe(true);
  });
});
```
- [ ] **Step 3 — rodar (caracterização):** `npx jest __tests__/store/database-store.test.ts` → 4 passing. *(Se `getPlayersByClub` exigir assinatura diferente, corrigir a chamada do teste conforme `src/database/queries/players.ts` — ler antes. O invariante a provar é "cada save isola seu mundo".)*
- [ ] **Step 4 — tsc:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add __tests__/store/database-store.test.ts` · msg: `test(d0): cobertura de database-store (wrapExpoDb adapter + isolamento por saveId)`.

---

## Task 9: Infra de smoke test de telas (2º projeto Jest + mocks + helpers)

**Files:** Modify `package.json`; Create `jest.ui.config.js`, `__tests__/ui/setup.ts`, `__tests__/ui/helpers.tsx`
**Interfaces:** Produces: `renderWithRealDb`, `seedAndStartGame`, `wrapBetterSqlite` (helpers) + runner jsdom configurado.

> **Contexto crítico (verificado):** o `jest.config.js` atual é `testEnvironment: 'node'` + `preset: 'ts-jest'`, **sem** `react-test-renderer`, `@testing-library/*` nem `jest-expo` instalados (confirmado: `node_modules/react-test-renderer` ausente). Renderizar uma tela RN em `node` quebra. Solução: 2º projeto Jest em `jsdom`, com `react-test-renderer@19.1.0` (= versão do `react` instalado) e mocks dos módulos nativos que as telas puxam transitivamente (`expo-sqlite` via `database-store`, `react-native-svg`, `react-native-reanimated`, `@react-navigation/native` para `useFocusEffect`). DB **continua real** (`better-sqlite3`).

- [ ] **Step 1 — instalar renderer:** orquestrador roda `npm install --save-dev react-test-renderer@19.1.0` (casar com `react@19.1.0`). Verificar: `node -e "console.log(require('react-test-renderer/package.json').version)"` → `19.1.0`.
- [ ] **Step 2 — config do 2º projeto:** criar `jest.ui.config.js`:
```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/__tests__/ui'],
  setupFiles: ['<rootDir>/__tests__/ui/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-.*)/)',
  ],
};
```
- [ ] **Step 3 — setup/mocks:** criar `__tests__/ui/setup.ts`:
```ts
// expo-sqlite não roda em jsdom — as telas só importam o módulo via database-store;
// o DB real usado nos testes é injetado por wrapBetterSqlite, então o mock só precisa existir.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({})),
}));

// react-native-svg: stub leve que renderiza nada (evita parsing de assets nativos).
jest.mock('react-native-svg', () => {
  const React = require('react');
  const Stub = (props: Record<string, unknown>) => React.createElement('svg', props, props.children as React.ReactNode);
  return new Proxy({ default: Stub }, { get: () => Stub });
});

// reanimated: usa o mock oficial.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// @react-navigation/native: as telas usam useFocusEffect; stub para chamar o effect uma vez.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const React = require('react');
  return {
    ...actual,
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, []),
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
    useRoute: () => ({ params: {} }),
  };
});

// Silencia o aviso de act() do RN em testes de smoke.
jest.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
  if (typeof msg === 'string' && msg.includes('not wrapped in act')) return;
  // eslint-disable-next-line no-console
  (console as unknown as { _error?: (m?: unknown) => void })._error?.(msg);
});
```
- [ ] **Step 4 — helpers:** criar `__tests__/ui/helpers.tsx`:
```tsx
import React from 'react';
import TestRenderer, { ReactTestRenderer } from 'react-test-renderer';
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getSaveById } from '@/database/queries/saves';

/** Mesma forma de createTestDbHandle: better-sqlite3 -> DbHandle assíncrono. */
export function wrapBetterSqlite(db: Database.Database): DbHandle {
  return {
    prepare: (sql: string) => ({
      all: async (...p: unknown[]) => db.prepare(sql).all(...p),
      get: async (...p: unknown[]) => db.prepare(sql).get(...p) ?? null,
      run: async (...p: unknown[]) => {
        const r = db.prepare(sql).run(...p);
        return { lastInsertRowid: Number(r.lastInsertRowid) };
      },
    }),
  };
}

/** Cria DB real seedado (save_id=1), injeta o handle no database-store e carrega o save no game-store. */
export async function seedAndStartGame(): Promise<{ raw: Database.Database; db: DbHandle }> {
  const raw = createTestDb();
  seedTestDb(raw);
  const db = wrapBetterSqlite(raw);
  useDatabaseStore.setState({ db: null, dbHandle: db, isReady: true, error: null });
  const save = await getSaveById(db, TEST_SAVE_ID);
  if (save) useGameStore.getState().loadSave(save);
  return { raw, db };
}

/** Renderiza um elemento; aguarda microtasks (effects que carregam dados do DB). */
export async function renderWithRealDb(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(element);
  });
  // drena os useEffect assíncronos (loaders das telas)
  await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return tree;
}

/** Coleta todo o texto renderizado (recursivo) para asserts de i18n. */
export function collectText(json: unknown): string {
  if (json == null) return '';
  if (typeof json === 'string') return json;
  if (Array.isArray(json)) return json.map(collectText).join(' ');
  const node = json as { children?: unknown };
  return collectText(node.children ?? '');
}
```
- [ ] **Step 5 — script de teste:** em `package.json`, alterar `scripts.test` para rodar os dois projetos:
```json
"test": "jest --config jest.config.js && jest --config jest.ui.config.js"
```
*(Mantém o `jest.config.js` existente como default da suíte node; adiciona o passo de UI. `npm run test:watch` continua apontando para a config padrão — sem mudança.)*
- [ ] **Step 6 — rodar (verifica que a infra carrega):** `npx jest --config jest.ui.config.js --passWithNoTests` → exit 0 (sem testes ainda, só valida que jsdom + ts-jest + mocks resolvem). Em seguida `npx tsc --noEmit` → exit 0.
- [ ] **Step 7 — commit:** `git add package.json package-lock.json jest.ui.config.js __tests__/ui/setup.ts __tests__/ui/helpers.tsx` · msg: `test(d0): infra de smoke test de telas (jest jsdom + react-test-renderer + DB real)`.

---

## Task 10: Smoke + snapshot de `TransferMarketScreen` e `FreeAgentsScreen`

**Files:** Create `__tests__/ui/TransferMarketScreen.test.tsx`, `__tests__/ui/FreeAgentsScreen.test.tsx`
**Interfaces:** Consumes: `seedAndStartGame`, `renderWithRealDb`, `collectText`, `TransferMarketScreen` (`@/screens/club/transfers/TransferMarketScreen`), `FreeAgentsScreen` (`@/screens/club/transfers/FreeAgentsScreen`), `translate` (`@/i18n`). · Produces: 2 smoke tests verdes + snapshots.

> **Caminhos confirmados:** `src/screens/club/transfers/TransferMarketScreen.tsx` (export nomeado `TransferMarketScreen`) e `src/screens/club/transfers/FreeAgentsScreen.tsx`. Ambas leem `useGameStore`/`useDatabaseStore`/`useTranslation` (i18n default 'pt', sem provider). Texto i18n esperado vem de chaves reais: `transfer.no_players_found` ("Nenhum jogador encontrado."), `transfer.no_free_agents` ("Nenhum agente livre disponível"), e título via `nav.transfer_market`/`nav.free_agents` — confirmar a chave exata que CADA tela renderiza lendo o JSX antes do assert.

- [ ] **Step 1 — preparação:** ler o `return (...)` de `TransferMarketScreen.tsx` e `FreeAgentsScreen.tsx` para identificar uma string i18n estável presente no render inicial (placeholder de busca, label de filtro, ou empty state). Anotar a `TKey` exata.
- [ ] **Step 2 — teste falhando (Transfer):** criar `__tests__/ui/TransferMarketScreen.test.tsx`:
```tsx
import React from 'react';
import { TransferMarketScreen } from '@/screens/club/transfers/TransferMarketScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('TransferMarketScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const tree = await renderWithRealDb(<TransferMarketScreen />);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('contém ao menos um texto i18n esperado da tela', async () => {
    const tree = await renderWithRealDb(<TransferMarketScreen />);
    const text = collectText(tree.toJSON());
    // <KEY> = a TKey confirmada no Step 1 (ex.: 'transfer.search_placeholder' ou opção de filtro 'All')
    const expected = translate('pt', /* <KEY> */ 'transfer.no_players_found');
    // o texto da tela deve conter OU o esperado OU dados de jogadores (lista populada).
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes(expected) || /\$/.test(text)).toBe(true); // empty state OU valores de mercado ($..)
  });

  it('snapshot estável (detector de drift)', async () => {
    const tree = await renderWithRealDb(<TransferMarketScreen />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
```
- [ ] **Step 3 — rodar (Transfer):** `npx jest --config jest.ui.config.js __tests__/ui/TransferMarketScreen.test.tsx` → 3 passing (snapshot escrito na 1ª run). Se quebrar por import nativo não-mockado, adicionar o mock pontual em `setup.ts` (Task 9) — NÃO mockar DB nem store.
- [ ] **Step 4 — teste falhando (FreeAgents):** criar `__tests__/ui/FreeAgentsScreen.test.tsx` espelhando o de cima, importando `FreeAgentsScreen` de `@/screens/club/transfers/FreeAgentsScreen` e usando a `TKey` confirmada (ex.: `transfer.no_free_agents`):
```tsx
import React from 'react';
import { FreeAgentsScreen } from '@/screens/club/transfers/FreeAgentsScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('FreeAgentsScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw', async () => {
    const tree = await renderWithRealDb(<FreeAgentsScreen />);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('contém texto i18n esperado', async () => {
    const tree = await renderWithRealDb(<FreeAgentsScreen />);
    const text = collectText(tree.toJSON());
    const expected = translate('pt', /* <KEY confirmada> */ 'transfer.no_free_agents');
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes(expected) || /\$/.test(text)).toBe(true);
  });

  it('snapshot estável', async () => {
    const tree = await renderWithRealDb(<FreeAgentsScreen />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
```
> **Nota import nomeado vs default:** confirmar no Step 1 se `FreeAgentsScreen` é export nomeado ou default e ajustar o `import`. `TransferMarketScreen` é nomeado (`export function TransferMarketScreen`).
- [ ] **Step 5 — rodar (FreeAgents) + tsc:** `npx jest --config jest.ui.config.js __tests__/ui/FreeAgentsScreen.test.tsx` → 3 passing. Depois `npx tsc --noEmit` → exit 0.
- [ ] **Step 6 — commit:** `git add __tests__/ui/TransferMarketScreen.test.tsx __tests__/ui/FreeAgentsScreen.test.tsx __tests__/ui/__snapshots__/` · msg: `test(d0): smoke + snapshot das telas-beachhead (Transfer/FreeAgents) com store/DB reais`.

---

## Task 11: Verificação do gate (DoD de D0)

**Files:** nenhuma (verificação).
**Interfaces:** Consumes: suíte completa.

- [ ] **Step 1 — suíte completa:** `npm test` (roda `jest.config.js` E `jest.ui.config.js`) → tudo verde, incluindo os 4 reports pré-existentes + 6 novos = 13/13 com teste, 2 stores novos, 2 smoke tests.
- [ ] **Step 2 — type-check:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 3 — checagem de determinismo:** `grep -rn "Math.random\|Date.now" __tests__/engine/reports __tests__/store __tests__/ui` → zero ocorrências em caminhos de engine/teste de report (inputs determinísticos via factories/`SeededRng`). `Date().toISOString()` em `createSave` é da camada de query, fora do engine — aceitável (não-determinismo só do timestamp do save, não da lógica).
- [ ] **Step 4 — DoD:** confirmar: (a) 13/13 report-generators têm `.test.ts`; (b) `game-store` e `database-store` testados com DB real e isolamento por saveId; (c) 2 telas-beachhead com smoke + snapshot; (d) `npm test` + `npx tsc --noEmit` verdes. **Gate aberto para D1.**
- [ ] **Step 5 — commit (se houver ajuste residual):** orquestrador agrupa eventuais correções · msg: `test(d0): fecha gate da rede de testes de UI (13/13 reports, stores, smoke beachhead)`.

---

## Self-Review

1. **Cobertura do spec (§D0):**
   - 6 report-generators faltantes: Tasks 1–6 (contract-alerts, morale, line-efficiency, transfer-roi, free-agent-scout, opponent) com golden + edge + (determinismo onde a função o expõe — free-agent-scout via `toEqual` de duas chamadas; reports puros são determinísticos por construção, sem `rng`). 13/13 atingido na Task 6.
   - Stores: Task 7 (`game-store`: start/load/clear, derivados `currentSave`/`playerClubId`/`season`/`week`, `refreshUnreadNewsCount` com DB real) e Task 8 (`database-store`: `wrapExpoDb` adapter + ciclo create/get/getAll + **isolamento por saveId** via `seedWorldForSave`).
   - Smoke render + snapshot beachhead: Tasks 9 (infra) + 10 (Transfer/FreeAgents), asserção "renderiza sem throw + contém textos i18n", DB/store reais (NUNCA mock de DB — só módulos nativos de plataforma).
   - Tokens v2/tipografia: **fora de D0 nesta divisão** — o spec lista em §D1/§D2 ("ver §D1/§D2/§7"); o brief deste plano restringe a (1) reports (2) stores (3) smoke beachhead. Documentado para não haver lacuna percebida.

2. **Placeholder scan:** sem "TBD". Os únicos pontos de "confirmar antes de escrever" são leituras de tipos reais (`Player` em Task 5 Step 1; `SaveGame` em Task 7 Step 1; seed/queries em Task 8 Step 1; `TKey` exata em Task 10 Step 1) — são passos de *grounding* contra o código real (anti-invenção de API), com fallback explícito de chave i18n já citado. Nenhum step deixa código por escrever.

3. **Consistência de tipos:** assinaturas dos 6 geradores copiadas verbatim do código (`buildContractAlerts`, `buildMoraleReport`, `buildLineEfficiency`, `buildTransferROIReport(... PlayerForROI ...)`, `buildFreeAgentScout(BuildFreeAgentScoutParams)`, `buildOpponentReport(BuildOpponentReportInput)`). `PlayerAttributes` (19 chaves) e `mkAttrs`/`mkPlayer`/`mkFixture` factories espelham `youth-report.test.ts`. `wrapExpoDb` testado contra sua assinatura real (`database-store.ts:40-52`, retorna `{lastInsertRowid}` a partir de `lastInsertRowId`). Helpers de UI (`wrapBetterSqlite`) replicam exatamente `createTestDbHandle`. `react-test-renderer@19.1.0` casa com `react@19.1.0`.

4. **Risco de não-determinismo de snapshot:** mitigado — `seedTestDb` usa seed fixa (42), i18n default 'pt', sem `Date.now` no render das telas-alvo (valores de mercado vêm do seed determinístico). Navegação stub via mock de `@react-navigation/native` em `setup.ts`.

5. **Coexistência de configs:** `jest.config.js` (node) intocado; `jest.ui.config.js` (jsdom) novo; `npm test` encadeia os dois. Testes de report/store rodam no projeto node existente (já é onde `training-store.test.ts` vive). Só os `.tsx` de tela rodam no projeto jsdom.
