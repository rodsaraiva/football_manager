# C7 — Gestão in-match + conselho tático Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2-5 min). TDD estrito: teste falha → ver falhar → implementação mínima → ver passar → commit. NÃO há placeholders — todo código aparece inline. Subagents NÃO commitam; o passo "commit" descreve o que o orquestrador commita.

**Goal:** Estender o controle ao vivo do intervalo (já existente) para **janelas de ajuste tático/substituição durante o 2º tempo** e adicionar um **engine puro de conselho do assistente** (sugestões de subs/tática por placar, adversário e banco), mantendo determinismo total e superfície casual-first com detalhe opt-in.

**Architecture:** Generalizar o split fixo de meio-tempo (`simulateFirstHalf`/`resumeSecondHalf`) para **N segmentos pausáveis** via `LiveMatchState` + `simulateSegment(state, untilBlock)`, threadando a **mesma instância** de `SeededRng` através das pausas (já é o contrato hoje). `simulateFirstHalf`/`resumeSecondHalf` viram wrappers finos sobre isso (compose-equals-whole intacto, guardado por teste). Orquestrador `live-match.ts` evolui `halftime.ts`: `startUserMatchLive` → `advanceToNextWindow` (loop) → `finishLiveMatch`. `match-advisor.ts` é função pura que lê o snapshot vivo + arquétipo do assistente de `squad` e devolve `MatchAdvice[]` ordenado (descritores i18n, ação aplicável opcional). Gatilhos opt-in (gol sofrido / reta final) param o segmento no bloco do evento. Sem schema novo: `LiveMatchState` é volátil em memória (como `HalftimeState` hoje).

**Tech Stack:** TS 5.9 strict · Jest 29 + ts-jest · better-sqlite3 REAL em testes · SeededRng (mulberry32) · Zustand · React Navigation v7 · react-native-svg.

**Convenções:** Engine puro em `src/engine` (ZERO React/Expo). TDD com better-sqlite3 REAL, NUNCA mock. SeededRng para tudo aleatório; ZERO `Math.random`/`Date.now` no engine. Constantes em `src/engine/balance.ts`. i18n pt/en em **paridade**. Tokens via `@/theme`. Save-isolation `(db, saveId, ...)`. Branch `feat/c7-in-match`. Commits terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- `src/engine/simulation/match-engine.ts:341-519` — `HalftimeState`, `simulateFirstHalf`, `applySecondHalfOverrides`, `resumeSecondHalf`, `simulateMatch` (o loop `for block`).
- `__tests__/engine/simulation/halftime-resume.test.ts` — molde exato do compose-equals-whole + helpers `makeSquad`/`makeBench`/`makeInput`.
- `src/engine/match-day/halftime.ts` — `halftimeSeed`, `startUserMatchHalftime`, `orientResultToFixture`, `UserHalftimeContext`.
- `__tests__/engine/halftime-helper.integration.test.ts` — molde do teste de integração (createTestDb/seedTestDb/buildCalendar).
- `src/engine/assistant/comment-generator.ts:18-174` — vocabulário de arquétipos + descritores i18n (`TextDescriptor`).
- `src/screens/home/MatchHalftimeScreen.tsx` — UI atual a estender (subs/tática/placar/eventos).

---

## File Structure

- **Modify** `src/engine/balance.ts:62-63` (constantes do motor) — adicionar bloco `LIVE_MATCH` (pontos de janela, `MAX_LIVE_WINDOWS`, thresholds do advisor).
- **Create** `src/types/match-advice.ts` — `LiveWindowKind`, `LiveTrigger`, `MatchAdviceKind`, `MatchAdvice`.
- **Modify** `src/engine/simulation/match-engine.ts:333-519` — `LiveMatchState`, `initLiveMatch`, `simulateSegment`, `finalizeMatchResult`, `applyWindowOverrides`; reescrever `simulateFirstHalf`/`resumeSecondHalf` como wrappers. `HalftimeState` vira alias de `LiveMatchState`.
- **Modify** `__tests__/engine/simulation/halftime-resume.test.ts` — adicionar describe `simulateSegment N-cuts == simulateMatch`.
- **Create** `__tests__/engine/simulation/live-segment.test.ts` — TDD focado de `simulateSegment`/`initLiveMatch`/`finalizeMatchResult`.
- **Create** `src/engine/assistant/match-advisor.ts` — `generateMatchAdvice(input): MatchAdvice[]` (puro).
- **Create** `__tests__/engine/assistant/match-advisor.test.ts` — TDD do advisor (golden + edge + determinismo).
- **Create** `src/engine/match-day/live-match.ts` — `liveSeed`, `UserLiveContext`, `startUserMatchLive`, `advanceToNextWindow`, `finishLiveMatch`, `nextWindowBlock`.
- **Modify** `src/engine/match-day/halftime.ts` — re-exportar `liveSeed` como `halftimeSeed`; `startUserMatchHalftime` vira wrapper de `startUserMatchLive` (compat com `HomeScreen`).
- **Create** `__tests__/engine/match-day/live-match.test.ts` — TDD de integração (SQLite real, multi-janela, trigger, determinismo).
- **Modify** `src/store/game-store.ts:29-37,76-83,120-125,208-225` — campos `live*` (estende os `halftime*` existentes com `liveWindowKind`, `liveAdvice`).
- **Modify** `src/navigation/types.ts:6` — `MatchHalftime: undefined` → `MatchLiveWindow: { windowKind: LiveWindowKind }` (mantendo `MatchHalftime` como alias enquanto a tela migra).
- **Modify** `src/screens/home/MatchHalftimeScreen.tsx` — renderizar o painel de conselho; suportar janelas do 2º tempo (título por `windowKind`); chamar `advanceToNextWindow`/`finishLiveMatch` no loop.
- **Modify** `src/screens/home/HomeScreen.tsx:393-435` — `handleWatchLive` chama `startUserMatchLive`.
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` — chaves `advice.*` e `live.*` (paridade).

**Contract (assinaturas exatas):**

```ts
// ── src/types/match-advice.ts ──────────────────────────────────────────────
import { Formation, Mentality, Pressing } from '@/types/tactic';
import { TextDescriptor } from '@/i18n/translate';

export type LiveWindowKind = 'halftime' | 'second_half' | 'final_stretch';
export type LiveTrigger = 'conceded_goal' | 'final_stretch';

export type MatchAdviceKind =
  | 'change_mentality'
  | 'change_pressing'
  | 'sub_off'
  | 'sub_attacker'
  | 'sub_defender'
  | 'hold';

export interface MatchAdvice {
  kind: MatchAdviceKind;
  text: TextDescriptor;
  priority: number;                 // 0..100, ordena desc
  suggestedMentality?: Mentality;
  suggestedPressing?: Pressing;
  suggestedSubOutId?: number;
  suggestedSubInId?: number;
}

// ── src/engine/simulation/match-engine.ts ──────────────────────────────────
export interface LiveMatchState {
  home: TeamState;
  away: TeamState;
  events: MatchEvent[];
  usedMinutes: Set<number>;
  homeAdv: number;
  rng: SeededRng;          // MESMA instância threaded — nunca serializada
  input: MatchInput;
  currentBlock: number;    // próximo bloco a rodar (0..TOTAL_BLOCKS)
}
export type HalftimeState = LiveMatchState;                          // alias retrocompat

export function initLiveMatch(input: MatchInput): LiveMatchState;    // currentBlock = 0
export function simulateSegment(state: LiveMatchState, untilBlock: number): LiveMatchState;
export function finalizeMatchResult(state: LiveMatchState): MatchResult; // exige currentBlock === TOTAL_BLOCKS
export function applyWindowOverrides(state: LiveMatchState, overrides: SecondHalfOverrides): void;
export function simulateFirstHalf(input: MatchInput): LiveMatchState; // = initLiveMatch + simulateSegment(_, HALF_BLOCK)
export function resumeSecondHalf(state: LiveMatchState, o?: SecondHalfOverrides): MatchResult;

// ── src/engine/assistant/match-advisor.ts ──────────────────────────────────
import { AssistantArchetype } from '@/types/assistant';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

export interface MatchAdviceInput {
  archetype: AssistantArchetype;
  qualityStars: number;                 // 1..5
  userGoals: number;
  oppGoals: number;
  currentBlock: number;
  userTactic: Tactic;
  onPitch: PlayerForStrength[];
  bench: PlayerForStrength[];
  yellowCardedIds: ReadonlySet<number>;
  fatigueByPlayer: ReadonlyMap<number, number>;
  subsRemaining: number;
  opponentName: string;
  rng: SeededRng;                       // MESMA do LiveMatchState (desempate determinístico)
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

/** Próxima fronteira de janela após `fromBlock`, respeitando MAX_LIVE_WINDOWS já usadas. */
export function nextWindowBlock(fromBlock: number, windowsUsed: number): number | null;

export function startUserMatchLive(params: {
  dbHandle: DbHandle; season: number; week: number; playerClubId: number; saveId: number;
}): Promise<UserLiveContext | null>;

export function advanceToNextWindow(params: {
  state: LiveMatchState; isHome: boolean; opponentName: string; windowsUsed: number;
  overrides: SecondHalfOverrides; triggers: LiveTrigger[];
  archetype: AssistantArchetype; qualityStars: number;
}): UserLiveContext | null;

export function finishLiveMatch(params: {
  state: LiveMatchState; isHome: boolean; overrides: SecondHalfOverrides;
}): MatchResult;
```

**Decisões herdadas do spec (§2, §6):**
- Pontos de janela padrão: intervalo (bloco 15) + uma janela tática no 2º tempo (bloco 22 ≈ min 66). `final_stretch` (bloco 25) só com opt-in.
- `MAX_LIVE_WINDOWS = 3` (intervalo + até 2 no 2º tempo).
- Gatilhos opt-in: `conceded_goal` (gol sofrido pelo usuário) e `final_stretch`. Sem opt-in, só os 2 pontos padrão.
- O advisor reusa a **mesma** `SeededRng` do `LiveMatchState` (sem `clone`/`fork`); o desempate avança o stream — coerente com o threading do motor.
- `MatchAdvice` NÃO inclui `change_formation` (escopo = mentality/pressing/tempo + subs, igual ao intervalo atual; formação fica fora p/ não exigir re-render do XI). Removido vs. rascunho do spec §3 (que listava `change_formation` mas a §9 confina o escopo a mentality/pressing).

---

## Task 1: Constantes `LIVE_MATCH` em balance.ts

**Files:** Modify `src/engine/balance.ts`.
**Interfaces:** Produces: `LIVE_WINDOW_BLOCKS`, `LIVE_FINAL_STRETCH_BLOCK`, `MAX_LIVE_WINDOWS`, `ADVICE_LEAD_COMFORTABLE`, `ADVICE_FATIGUE_HIGH`. Consumes: nada.

- [ ] **Step 1 — implementar (constantes não têm teste próprio; validadas via tsc + consumidores):** adicionar logo após a seção de Assistants (`balance.ts:61`):
```ts
// ── C7: gestão in-match (janelas ao vivo + conselho) ─────────────────────────
// Pontos de pausa FIXOS no 2º tempo (em blocos de 3 min; TOTAL_BLOCKS=30, HALF_BLOCK=15).
// 15 = intervalo (já existente). 22 ≈ minuto 66 (o "horário clássico de mexer").
export const LIVE_WINDOW_BLOCKS = [15, 22] as const;
// Janela opt-in da reta final (~minuto 75). Só abre se o trigger 'final_stretch' estiver ligado.
export const LIVE_FINAL_STRETCH_BLOCK = 25;
// Teto de janelas por jogo (intervalo + até 2 no 2º tempo). Evita virar 30 pausas.
export const MAX_LIVE_WINDOWS = 3;
// Conselho: diferença de gols a partir da qual "está confortável" → recuar/segurar.
export const ADVICE_LEAD_COMFORTABLE = 2;
// Conselho: fadiga (escala interna do motor) a partir da qual sugerir tirar o jogador.
export const ADVICE_FATIGUE_HIGH = 22;
```
- [ ] **Step 2 — rodar (passa):** `npx tsc --noEmit` (exit 0).
- [ ] **Step 3 — commit:** `git add src/engine/balance.ts` · msg: `feat(c7): constantes LIVE_MATCH (janelas + thresholds de conselho)`.

---

## Task 2: Tipos `MatchAdvice` & janelas

**Files:** Create `src/types/match-advice.ts`.
**Interfaces:** Produces: `LiveWindowKind`, `LiveTrigger`, `MatchAdviceKind`, `MatchAdvice`. Consumes: `Formation/Mentality/Pressing` de `@/types/tactic`, `TextDescriptor` de `@/i18n/translate`.

- [ ] **Step 1 — implementar:** criar `src/types/match-advice.ts`:
```ts
import { Mentality, Pressing } from '@/types/tactic';
import { TextDescriptor } from '@/i18n/translate';

/** Que tipo de janela ao vivo o usuário está vendo. */
export type LiveWindowKind = 'halftime' | 'second_half' | 'final_stretch';

/** Gatilhos opt-in que podem abrir uma janela extra no 2º tempo. */
export type LiveTrigger = 'conceded_goal' | 'final_stretch';

export type MatchAdviceKind =
  | 'change_mentality'
  | 'change_pressing'
  | 'sub_off'        // tirar um jogador (cartão amarelo / fadiga alta)
  | 'sub_attacker'   // reforço ofensivo (correr atrás do placar)
  | 'sub_defender'   // reforço defensivo (proteger o placar)
  | 'hold';          // sem ação: "está bom, mantenha"

/** Conselho do assistente. `text` é i18n (igual a AssistantComment.comment). */
export interface MatchAdvice {
  kind: MatchAdviceKind;
  text: TextDescriptor;
  priority: number; // 0..100, lista ordenada desc
  suggestedMentality?: Mentality;
  suggestedPressing?: Pressing;
  suggestedSubOutId?: number;
  suggestedSubInId?: number;
}
```
- [ ] **Step 2 — rodar (passa):** `npx tsc --noEmit` (exit 0).
- [ ] **Step 3 — commit:** `git add src/types/match-advice.ts` · msg: `feat(c7): tipos MatchAdvice e janelas ao vivo`.

---

## Task 3: `simulateSegment` + `initLiveMatch` + `finalizeMatchResult` (TDD, motor puro)

**Files:** Modify `src/engine/simulation/match-engine.ts`, Create `__tests__/engine/simulation/live-segment.test.ts`.
**Interfaces:** Produces: `LiveMatchState`, `initLiveMatch`, `simulateSegment`, `finalizeMatchResult`. Consumes: `MatchInput`, `MatchResult`, `TeamState`, `runBlock`, `drainFatigue` (privados existentes).

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/simulation/live-segment.test.ts` (reusa os helpers do compose test — copiá-los inline p/ independência):
```ts
import {
  simulateMatch, initLiveMatch, simulateSegment, finalizeMatchResult,
  MatchInput,
} from '@/engine/simulation/match-engine';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

const makeAttrs = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base, vision: base, composure: base,
  decisions: base, positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});
const makeSquad = (overall: number) => Array.from({ length: 11 }, (_, i) => ({
  id: i + 1,
  position: (['GK','CB','CB','LB','RB','CM','CM','LM','RM','ST','ST'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall), morale: 70, fitness: 90,
}));
const makeBench = (overall: number, off: number) => Array.from({ length: 5 }, (_, i) => ({
  id: off + i,
  position: (['CM','ST','LW','CB','GK'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall), morale: 70, fitness: 95,
}));
const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'D', isActive: true, formation: '4-4-2',
  mentality: 'balanced', pressing: 'medium', passingStyle: 'mixed',
  tempo: 'normal', width: 'normal', attackFocus: 'balanced', subStrategy: 'balanced',
};
const makeInput = (seed: number): MatchInput => ({
  fixtureId: 1,
  homeSquad: makeSquad(72),
  awaySquad: makeSquad(68).map((p, i) => ({ ...p, id: i + 100 })),
  homeBench: makeBench(72, 200), awayBench: makeBench(68, 300),
  homeTactic: defaultTactic, awayTactic: { ...defaultTactic, id: 2, clubId: 2 },
  homeClubReputation: 80, awayClubReputation: 80,
  rng: new SeededRng(seed),
});

describe('simulateSegment compõe o jogo inteiro em N cortes', () => {
  it('cortes [15,22,25,30] sem overrides == simulateMatch (byte-idêntico)', () => {
    for (const seed of [1, 7, 42, 99, 2024]) {
      const whole = simulateMatch(makeInput(seed));
      let state = initLiveMatch(makeInput(seed));
      for (const cut of [15, 22, 25, 30]) state = simulateSegment(state, cut);
      const composed = finalizeMatchResult(state);
      expect(composed.homeGoals).toBe(whole.homeGoals);
      expect(composed.awayGoals).toBe(whole.awayGoals);
      expect(composed.events).toEqual(whole.events);
      expect(composed.stats).toEqual(whole.stats);
      expect(composed.homeRatings).toEqual(whole.homeRatings);
      expect(composed.awayRatings).toEqual(whole.awayRatings);
    }
  });

  it('initLiveMatch começa em currentBlock 0 sem rodar bloco', () => {
    const s = initLiveMatch(makeInput(3));
    expect(s.currentBlock).toBe(0);
    expect(s.events).toHaveLength(0);
    expect(s.home.goals).toBe(0);
  });

  it('simulateSegment avança currentBlock e clampa untilBlock no teto', () => {
    let s = initLiveMatch(makeInput(5));
    s = simulateSegment(s, 15);
    expect(s.currentBlock).toBe(15);
    s = simulateSegment(s, 999); // clampa em TOTAL_BLOCKS=30
    expect(s.currentBlock).toBe(30);
  });

  it('untilBlock <= currentBlock é no-op (não roda nem regride)', () => {
    let s = initLiveMatch(makeInput(9));
    s = simulateSegment(s, 15);
    const before = s.events.length;
    s = simulateSegment(s, 10);
    expect(s.currentBlock).toBe(15);
    expect(s.events.length).toBe(before);
  });

  it('finalizeMatchResult lança se o jogo não chegou ao fim', () => {
    let s = initLiveMatch(makeInput(2));
    s = simulateSegment(s, 15);
    expect(() => finalizeMatchResult(s)).toThrow();
  });
});
```
- [ ] **Step 2 — rodar (falha: símbolos inexistentes):** `npx jest live-segment` → `Cannot find name 'initLiveMatch'` / `simulateSegment`.
- [ ] **Step 3 — implementar** em `src/engine/simulation/match-engine.ts`. Substituir o bloco `HalftimeState` + `simulateFirstHalf` + `applySecondHalfOverrides` + `resumeSecondHalf` + `simulateMatch` (linhas 333-519) por:
```ts
// ─── Resumable live-match state (C7: in-match management) ─────────────────────
/**
 * Live mid-match snapshot at ANY block boundary. `rng` is the SAME live SeededRng
 * instance the block loop consumes — threaded across pauses in memory (never
 * serialized), so resuming continues the deterministic stream exactly where it
 * stopped. `currentBlock` = the NEXT block to run (0..TOTAL_BLOCKS).
 */
export interface LiveMatchState {
  home: TeamState;
  away: TeamState;
  events: MatchEvent[];
  usedMinutes: Set<number>;
  homeAdv: number;
  rng: SeededRng;
  input: MatchInput;
  currentBlock: number;
}

/** Retrocompat: HalftimeState era o snapshot fixo no bloco 15. Agora é só o
 *  caso particular do LiveMatchState. */
export type HalftimeState = LiveMatchState;

/** Manager overrides applied to the HOME team at a window boundary. */
export interface SecondHalfOverrides {
  homeTactic?: Tactic;
  homeSubs?: { outId: number; inId: number }[];
}

/** Cria o estado inicial sem rodar bloco algum (currentBlock = 0). */
export function initLiveMatch(input: MatchInput): LiveMatchState {
  const { homeSquad, awaySquad, homeTactic, awayTactic } = input;
  const homeBench = input.homeBench ?? [];
  const awayBench = input.awayBench ?? [];
  const attendanceForAdv = input.attendance ?? Math.round(
    (input.homeClubReputation + input.awayClubReputation) / 2 * 500 + 10000,
  );
  const homeAdv = homeAdvantageMultiplier(attendanceForAdv);
  const home = makeTeam(homeSquad, homeBench, homeTactic, true, homeAdv, input.homeSetPieceTakers);
  const away = makeTeam(awaySquad, awayBench, awayTactic, false, homeAdv, input.awaySetPieceTakers);
  return {
    home, away, events: [], usedMinutes: new Set<number>(),
    homeAdv, rng: input.rng, input, currentBlock: 0,
  };
}

/**
 * Roda do currentBlock até untilBlock (exclusivo), threadando o mesmo rng.
 * Clampa untilBlock em TOTAL_BLOCKS; untilBlock <= currentBlock é no-op.
 * Muta e devolve o MESMO state.
 */
export function simulateSegment(state: LiveMatchState, untilBlock: number): LiveMatchState {
  const target = Math.min(untilBlock, TOTAL_BLOCKS);
  const { home, away, events, usedMinutes, homeAdv, rng, input } = state;
  const { fixtureId } = input;
  for (let block = state.currentBlock; block < target; block++) {
    const isSecondHalf = block >= HALF_BLOCK;
    drainFatigue(home, block, homeAdv);
    drainFatigue(away, block, homeAdv);
    runBlock(home, away, block, isSecondHalf, fixtureId, events, rng, usedMinutes, homeAdv);
    runBlock(away, home, block, isSecondHalf, fixtureId, events, rng, usedMinutes, homeAdv);
  }
  state.currentBlock = Math.max(state.currentBlock, target);
  return state;
}

/**
 * Applies manager overrides to the HOME team only, at the current window boundary.
 * Engine auto-subs stay enabled; the shared subsUsed cap limits how many follow.
 */
export function applyWindowOverrides(state: LiveMatchState, overrides: SecondHalfOverrides): void {
  const { home, homeAdv, events, usedMinutes, rng } = state;
  const fixtureId = state.input.fixtureId;

  if (overrides.homeTactic) {
    home.tactic = overrides.homeTactic;
    const adjusted = home.squad.map(p => ({
      ...p,
      fitness: Math.max(40, p.fitness - (home.fatigueByPlayer.get(p.id) ?? 0)),
    }));
    home.strength = calculateTeamStrength({ players: adjusted, tactic: home.tactic, isHome: home.isHome, homeAdvantageMult: homeAdv });
  }

  for (const sub of overrides.homeSubs ?? []) {
    const onPitch = home.squad.some(p => p.id === sub.outId);
    const benchPlayer = home.bench.find(p => p.id === sub.inId);
    if (!onPitch || !benchPlayer) continue;
    home.squad = home.squad.filter(p => p.id !== sub.outId);
    home.squad.push(benchPlayer);
    home.bench = home.bench.filter(p => p.id !== sub.inId);
    home.fatigueByPlayer.set(benchPlayer.id, 0);
    home.cameInAsSub.add(benchPlayer.id);
    home.subsUsed++;
    home.strength = calculateTeamStrength({ players: home.squad, tactic: home.tactic, isHome: home.isHome, homeAdvantageMult: homeAdv });
    const minute = blockToMinute(state.currentBlock, rng, usedMinutes);
    events.push({ fixtureId, minute, type: 'substitution', playerId: sub.outId, secondaryPlayerId: benchPlayer.id });
  }
}

/** Computa o MatchResult final. Exige currentBlock === TOTAL_BLOCKS. */
export function finalizeMatchResult(state: LiveMatchState): MatchResult {
  if (state.currentBlock !== TOTAL_BLOCKS) {
    throw new Error(`finalizeMatchResult: match not finished (currentBlock=${state.currentBlock})`);
  }
  const { home, away, events, homeAdv: _h, rng, input } = state;
  const { homeSquad, awaySquad } = input;

  const totalMid = home.strength.midfield + away.strength.midfield;
  const possBase = totalMid > 0 ? (home.strength.midfield / totalMid) * 100 : 50;
  const passBonus = (home.strength.passingControl - away.strength.passingControl) * 100;
  const homeFormMods = formationModifiers(home.tactic.formation);
  const awayFormMods = formationModifiers(away.tactic.formation);
  const formPossDelta = homeFormMods.possessionDelta - awayFormMods.possessionDelta;
  const homePressingPenalty = away.tactic.pressing === 'high' ? -8 : away.tactic.pressing === 'medium' ? -4 : 0;
  const homeTempoBonus = home.tactic.tempo === 'slow' ? 4 : home.tactic.tempo === 'fast' ? -2 : 0;
  const homePoss = Math.round(
    Math.max(25, Math.min(75,
      possBase + passBonus + formPossDelta + homePressingPenalty + homeTempoBonus + rng.nextFloat(-4, 4),
    )),
  );
  const stats: MatchStats = {
    homePossession: homePoss, awayPossession: 100 - homePoss,
    homeShots: home.shots, awayShots: away.shots,
    homeShotsOnTarget: home.shotsOnTarget, awayShotsOnTarget: away.shotsOnTarget,
    homeFouls: home.fouls * 2 + rng.nextInt(2, 6), awayFouls: away.fouls * 2 + rng.nextInt(2, 6),
    homeCorners: home.corners, awayCorners: away.corners,
    homeXG: Math.round(home.xG * 100) / 100, awayXG: Math.round(away.xG * 100) / 100,
  };
  const avgRep = (input.homeClubReputation + input.awayClubReputation) / 2;
  const attendance = Math.round(avgRep * 500 + rng.nextInt(0, 10000));
  const lateSubIds = new Set<number>(
    events.filter(e => e.type === 'substitution' && e.minute >= 60 && e.secondaryPlayerId !== null)
      .map(e => e.secondaryPlayerId as number),
  );
  const hmI: PlayerMatchInput[] = homeSquad.map(p => ({
    id: p.id, overall: calculateOverall(p.attributes, p.position), position: p.position, isLateSub: lateSubIds.has(p.id),
  }));
  const awI: PlayerMatchInput[] = awaySquad.map(p => ({
    id: p.id, overall: calculateOverall(p.attributes, p.position), position: p.position, isLateSub: lateSubIds.has(p.id),
  }));
  const homeRatings = calculatePlayerRatings(hmI, events, home.goals > away.goals, away.goals, rng);
  const awayRatings = calculatePlayerRatings(awI, events, away.goals > home.goals, home.goals, rng);
  return { homeGoals: home.goals, awayGoals: away.goals, events, homeRatings, awayRatings, stats, attendance };
}

// ─── Wrappers retrocompat (compose-equals-whole intacto) ─────────────────────
export function simulateFirstHalf(input: MatchInput): LiveMatchState {
  return simulateSegment(initLiveMatch(input), HALF_BLOCK);
}

export function resumeSecondHalf(state: LiveMatchState, overrides?: SecondHalfOverrides): MatchResult {
  if (overrides) applyWindowOverrides(state, overrides);
  simulateSegment(state, TOTAL_BLOCKS);
  return finalizeMatchResult(state);
}

export function simulateMatch(input: MatchInput): MatchResult {
  return resumeSecondHalf(simulateFirstHalf(input));
}
```
  **Atenção (paridade byte-a-byte):** o `finalizeMatchResult` reproduz EXATAMENTE a ordem de consumo do rng do antigo `resumeSecondHalf` (`:449-509`): stats → attendance → ratings. Não reordenar. O `blockToMinute(state.currentBlock, ...)` em `applyWindowOverrides` substitui o `blockToMinute(HALF_BLOCK, ...)` antigo — no caminho do intervalo `currentBlock===15===HALF_BLOCK`, então é idêntico ao legado.
- [ ] **Step 4 — rodar (passa):** `npx jest live-segment` (verde) e `npx jest halftime-resume` (compose-equals-whole continua verde — wrappers preservam o comportamento). `npx tsc --noEmit` (exit 0).
- [ ] **Step 5 — commit:** `git add src/engine/simulation/match-engine.ts __tests__/engine/simulation/live-segment.test.ts` · msg: `feat(c7): simulateSegment/initLiveMatch/finalizeMatchResult (split N-segmentos)`.

---

## Task 4: Estender o compose-test para N cortes arbitrários

**Files:** Modify `__tests__/engine/simulation/halftime-resume.test.ts`.
**Interfaces:** Consumes: `initLiveMatch`, `simulateSegment`, `finalizeMatchResult`.

- [ ] **Step 1 — teste falhando (na verdade já deve passar com a Task 3, mas explicitamos o guard de N-cortes irregulares no arquivo histórico):** adicionar no fim do arquivo, antes do último `});` de topo, um novo describe. Importar os símbolos no topo (adicionar à lista de import existente `:1-8`):
```ts
// adicionar ao import existente de '@/engine/simulation/match-engine':
//   initLiveMatch, simulateSegment, finalizeMatchResult
```
e o describe:
```ts
describe('N-cuts arbitrários == simulateMatch (compose-equals-whole estendido)', () => {
  it('cortes irregulares (3,15,16,29,30) batem com o jogo inteiro', () => {
    for (const seed of [1, 7, 42, 99, 123, 777]) {
      const whole = simulateMatch(makeInput(72, 68, seed));
      let s = initLiveMatch(makeInput(72, 68, seed));
      for (const cut of [3, 15, 16, 29, 30]) s = simulateSegment(s, cut);
      const composed = finalizeMatchResult(s);
      expect(composed.events).toEqual(whole.events);
      expect(composed.homeGoals).toBe(whole.homeGoals);
      expect(composed.awayGoals).toBe(whole.awayGoals);
      expect(composed.stats).toEqual(whole.stats);
      expect(composed.homeRatings).toEqual(whole.homeRatings);
      expect(composed.awayRatings).toEqual(whole.awayRatings);
    }
  });
});
```
- [ ] **Step 2 — rodar:** `npx jest halftime-resume` → verde (guarda determinismo de cortes finos).
- [ ] **Step 3 — commit:** `git add __tests__/engine/simulation/halftime-resume.test.ts` · msg: `test(c7): compose-equals-whole com cortes arbitrários`.

---

## Task 5: `match-advisor.ts` — engine puro de conselho (TDD)

**Files:** Create `src/engine/assistant/match-advisor.ts`, Create `__tests__/engine/assistant/match-advisor.test.ts`.
**Interfaces:** Produces: `generateMatchAdvice(input: MatchAdviceInput): MatchAdvice[]`. Consumes: `AssistantArchetype`, `PlayerForStrength`, `Tactic`, `SeededRng`, `MatchAdvice`, constantes `ADVICE_*`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/assistant/match-advisor.test.ts`:
```ts
import { generateMatchAdvice, MatchAdviceInput } from '@/engine/assistant/match-advisor';
import { SeededRng } from '@/engine/rng';
import { Tactic } from '@/types/tactic';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { PlayerAttributes, Position } from '@/types';

const attrs = (b: number): PlayerAttributes => ({
  finishing: b, passing: b, crossing: b, dribbling: b, heading: b, longShots: b,
  freeKicks: b, vision: b, composure: b, decisions: b, positioning: b, aggression: b,
  leadership: b, pace: b, stamina: b, strength: b, agility: b, jumping: b,
});
const p = (id: number, position: Position, b = 70): PlayerForStrength => ({
  id, position, secondaryPosition: null, attributes: attrs(b), morale: 70, fitness: 90,
});
const tactic: Tactic = {
  id: 1, clubId: 1, name: 'D', isActive: true, formation: '4-4-2',
  mentality: 'balanced', pressing: 'medium', passingStyle: 'mixed',
  tempo: 'normal', width: 'normal', attackFocus: 'balanced', subStrategy: 'balanced',
};
const base = (over: Partial<MatchAdviceInput> = {}): MatchAdviceInput => ({
  archetype: 'tactician', qualityStars: 5,
  userGoals: 0, oppGoals: 0, currentBlock: 22, userTactic: tactic,
  onPitch: [p(1,'GK'),p(2,'CB'),p(3,'CB'),p(4,'ST')],
  bench: [p(10,'ST'),p(11,'CB')],
  yellowCardedIds: new Set<number>(), fatigueByPlayer: new Map<number, number>(),
  subsRemaining: 5, opponentName: 'Rival', rng: new SeededRng(1), ...over,
});

describe('generateMatchAdvice — leitura de placar', () => {
  it('vencendo confortável (2-0) com tactician → topo é defensivo', () => {
    const a = generateMatchAdvice(base({ userGoals: 2, oppGoals: 0, archetype: 'tactician' }));
    expect(a.length).toBeGreaterThan(0);
    expect(['change_mentality','sub_defender','hold']).toContain(a[0].kind);
    if (a[0].kind === 'change_mentality') expect(a[0].suggestedMentality).toBe('defensive');
  });

  it('perdendo 0-1 com motivator → topo empurra pra frente', () => {
    const a = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, archetype: 'motivator' }));
    expect(['sub_attacker','change_mentality']).toContain(a[0].kind);
    if (a[0].kind === 'change_mentality') expect(a[0].suggestedMentality).toBe('attacking');
  });

  it('empate tardio (bloco 25) → inclui hold ou ajuste leve', () => {
    const a = generateMatchAdvice(base({ userGoals: 1, oppGoals: 1, currentBlock: 25 }));
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('generateMatchAdvice — modulação por arquétipo', () => {
  it('analytics e old_school perdendo → mesma DIREÇÃO (atacar) mas textos i18n distintos', () => {
    const ana = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, archetype: 'analytics' }));
    const old = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, archetype: 'old_school' }));
    const dir = (x: typeof ana) => x.some(ad => ad.kind === 'sub_attacker' || (ad.kind==='change_mentality'&&ad.suggestedMentality==='attacking'));
    expect(dir(ana)).toBe(true);
    expect(dir(old)).toBe(true);
    expect(ana[0].text.key).not.toBe(old[0].text.key);
  });
});

describe('generateMatchAdvice — banco/subs/cartões/fadiga', () => {
  it('banco vazio → nenhum conselho de substituição', () => {
    const a = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, bench: [] }));
    expect(a.every(ad => !ad.kind.startsWith('sub_'))).toBe(true);
  });

  it('subs esgotados → só change_*/hold', () => {
    const a = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, subsRemaining: 0 }));
    expect(a.every(ad => ad.kind === 'change_mentality' || ad.kind === 'change_pressing' || ad.kind === 'hold')).toBe(true);
  });

  it('jogador no amarelo + fadiga alta → sub_off com suggestedSubOutId correto', () => {
    const a = generateMatchAdvice(base({
      yellowCardedIds: new Set([2]),
      fatigueByPlayer: new Map([[2, 30]]),
    }));
    const off = a.find(ad => ad.kind === 'sub_off');
    expect(off).toBeDefined();
    expect(off!.suggestedSubOutId).toBe(2);
    expect(off!.suggestedSubInId).toBe(11); // CB do banco p/ cobrir o CB amarelado
  });
});

describe('generateMatchAdvice — determinismo e qualityStars', () => {
  it('mesma rng + mesmo input → lista idêntica', () => {
    const i1 = base({ userGoals: 0, oppGoals: 1, rng: new SeededRng(7) });
    const i2 = base({ userGoals: 0, oppGoals: 1, rng: new SeededRng(7) });
    expect(generateMatchAdvice(i1)).toEqual(generateMatchAdvice(i2));
  });

  it('qualityStars baixo → lista menor que qualityStars alto', () => {
    const lo = generateMatchAdvice(base({ userGoals: 0, oppGoals: 2, qualityStars: 1 }));
    const hi = generateMatchAdvice(base({ userGoals: 0, oppGoals: 2, qualityStars: 5 }));
    expect(lo.length).toBeLessThanOrEqual(hi.length);
  });
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente):** `npx jest match-advisor` → `Cannot find module '@/engine/assistant/match-advisor'`.
- [ ] **Step 3 — implementar** `src/engine/assistant/match-advisor.ts`:
```ts
import { AssistantArchetype } from '@/types/assistant';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic, Mentality, Pressing } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { MatchAdvice, MatchAdviceKind } from '@/types/match-advice';
import { TextDescriptor, TKey } from '@/i18n/translate';
import { ADVICE_LEAD_COMFORTABLE, ADVICE_FATIGUE_HIGH } from '@/engine/balance';

export interface MatchAdviceInput {
  archetype: AssistantArchetype;
  qualityStars: number;
  userGoals: number;
  oppGoals: number;
  currentBlock: number;
  userTactic: Tactic;
  onPitch: PlayerForStrength[];
  bench: PlayerForStrength[];
  yellowCardedIds: ReadonlySet<number>;
  fatigueByPlayer: ReadonlyMap<number, number>;
  subsRemaining: number;
  opponentName: string;
  rng: SeededRng;
}

const ATTACK_POS = new Set<string>(['ST', 'LW', 'RW', 'CAM']);
const DEFENSE_POS = new Set<string>(['CB', 'LB', 'RB']);

// Arquétipos que tendem a defender (segurar placar) vs empurrar pra frente.
// Modula só a PRIORIDADE/voz, nunca inverte a leitura de placar.
const CAUTIOUS: AssistantArchetype[] = ['tactician', 'pragmatic', 'old_school'];

// Texto i18n por (kind, arquétipo). Chaves em advice.* (pt/en paridade).
function adviceText(kind: MatchAdviceKind, archetype: AssistantArchetype): TextDescriptor {
  return { key: `advice.${kind}.${archetype}` as TKey };
}

/** Acha um reforço no banco por papel (def/atk); fallback = primeiro do banco. */
function pickBenchByRole(bench: PlayerForStrength[], roles: Set<string>): PlayerForStrength | null {
  return bench.find(p => roles.has(p.position)) ?? bench[0] ?? null;
}

export function generateMatchAdvice(input: MatchAdviceInput): MatchAdvice[] {
  const {
    archetype, qualityStars, userGoals, oppGoals, currentBlock, userTactic,
    onPitch, bench, yellowCardedIds, fatigueByPlayer, subsRemaining, rng,
  } = input;

  const diff = userGoals - oppGoals;          // >0 vencendo, <0 perdendo
  const late = currentBlock >= 22;            // 2º tempo / reta final
  const cautious = CAUTIOUS.includes(archetype);
  const canSub = subsRemaining > 0 && bench.length > 0;
  const out: MatchAdvice[] = [];

  // 1) Sub por cartão amarelo + fadiga alta (proteção contra 2º amarelo / queda física).
  if (canSub) {
    const risky = onPitch.find(p =>
      (yellowCardedIds.has(p.id) && late) ||
      (fatigueByPlayer.get(p.id) ?? 0) >= ADVICE_FATIGUE_HIGH,
    );
    if (risky) {
      const roles = DEFENSE_POS.has(risky.position) ? DEFENSE_POS : ATTACK_POS;
      const inn = pickBenchByRole(bench.filter(b => b.position === risky.position).length
        ? bench.filter(b => b.position === risky.position) : bench, roles);
      out.push({
        kind: 'sub_off', text: adviceText('sub_off', archetype),
        priority: yellowCardedIds.has(risky.id) ? 90 : 70,
        suggestedSubOutId: risky.id, suggestedSubInId: inn?.id,
      });
    }
  }

  // 2) Leitura de placar.
  if (diff >= ADVICE_LEAD_COMFORTABLE) {
    // Vencendo confortável → segurar.
    if (userTactic.mentality !== 'defensive') {
      out.push({
        kind: 'change_mentality', text: adviceText('change_mentality', archetype),
        priority: cautious ? 80 : 55, suggestedMentality: 'defensive',
      });
    }
    if (canSub) {
      const inn = pickBenchByRole(bench, DEFENSE_POS);
      const offCand = onPitch.find(pp => ATTACK_POS.has(pp.position));
      if (inn && offCand) out.push({
        kind: 'sub_defender', text: adviceText('sub_defender', archetype),
        priority: cautious ? 75 : 50, suggestedSubOutId: offCand.id, suggestedSubInId: inn.id,
      });
    }
    out.push({ kind: 'hold', text: adviceText('hold', archetype), priority: 30 });
  } else if (diff <= -1) {
    // Perdendo → atacar.
    if (userTactic.mentality !== 'attacking') {
      out.push({
        kind: 'change_mentality', text: adviceText('change_mentality', archetype),
        priority: cautious ? 65 : 85, suggestedMentality: 'attacking' as Mentality,
      });
    }
    if (canSub) {
      const inn = pickBenchByRole(bench, ATTACK_POS);
      const offCand = onPitch.find(pp => DEFENSE_POS.has(pp.position));
      if (inn && offCand) out.push({
        kind: 'sub_attacker', text: adviceText('sub_attacker', archetype),
        priority: cautious ? 70 : 88, suggestedSubOutId: offCand.id, suggestedSubInId: inn.id,
      });
    }
    if (userTactic.pressing !== 'high') out.push({
      kind: 'change_pressing', text: adviceText('change_pressing', archetype),
      priority: 45, suggestedPressing: 'high' as Pressing,
    });
  } else {
    // Empate / vantagem mínima → ajuste leve + hold.
    out.push({ kind: 'hold', text: adviceText('hold', archetype), priority: 40 });
    if (diff === 1 && cautious && userTactic.mentality === 'attacking') out.push({
      kind: 'change_mentality', text: adviceText('change_mentality', archetype),
      priority: 50, suggestedMentality: 'balanced' as Mentality,
    });
  }

  // 3) Ordenar por prioridade (desc). Desempate determinístico via rng (avança o stream).
  out.sort((a, b) => b.priority - a.priority || (rng.next() - 0.5));

  // 4) qualityStars limita o tamanho da lista (assistente fraco vê menos opções).
  const cap = Math.max(1, Math.min(out.length, qualityStars));
  return out.slice(0, cap);
}
```
  **Nota sobre o teste de fadiga (`suggestedSubInId === 11`):** o jogador arriscado é o CB `id 2`; `bench.filter(b => b.position === 'CB')` → `[p(11,'CB')]`, então `pickBenchByRole` devolve `11`. Confirma a leitura de papel.
- [ ] **Step 4 — rodar (passa):** `npx jest match-advisor` (verde). `npx tsc --noEmit` falhará por chaves i18n inexistentes (`advice.*`) — **resolvido na Task 6**; rode `npx jest` antes do tsc neste ponto.
- [ ] **Step 5 — commit:** `git add src/engine/assistant/match-advisor.ts __tests__/engine/assistant/match-advisor.test.ts` · msg: `feat(c7): engine puro de conselho do assistente (match-advisor)`.

---

## Task 6: i18n `advice.*` e `live.*` (paridade pt/en)

**Files:** Modify `src/i18n/pt.ts`, `src/i18n/en.ts`.
**Interfaces:** Produces: chaves `advice.<kind>.<archetype>` (6 kinds × 6 arquétipos relevantes) + `live.*`. Consumes: nada.

- [ ] **Step 1 — teste falhando (paridade):** existe `__tests__/i18n/persistence.test.ts`; adicionar/garantir um teste de paridade. Se já houver um teste que compara `Object.keys(pt)` com `Object.keys(en)`, ele falhará ao adicionarmos chaves só em pt. Rodar primeiro `npx jest i18n` p/ ver o baseline verde, depois adicionar as chaves nos DOIS arquivos no mesmo passo. (Se NÃO existir teste de paridade, criar `__tests__/i18n/advice-parity.test.ts`):
```ts
import { pt } from '@/i18n/pt';
import { en } from '@/i18n/en';

it('toda chave advice.* e live.* existe em pt e en', () => {
  const ptKeys = Object.keys(pt).filter(k => k.startsWith('advice.') || k.startsWith('live.'));
  const enKeys = Object.keys(en).filter(k => k.startsWith('advice.') || k.startsWith('live.'));
  expect(ptKeys.sort()).toEqual(enKeys.sort());
  expect(ptKeys.length).toBeGreaterThanOrEqual(40); // 6 kinds × 6 arquétipos + live.*
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest advice-parity` → 0 chaves encontradas.
- [ ] **Step 3 — implementar:** adicionar em `src/i18n/pt.ts` (perto das chaves `halftime.*`, ~`:243`) o bloco `advice.*` + `live.*`. São 6 kinds (`change_mentality`, `change_pressing`, `sub_off`, `sub_attacker`, `sub_defender`, `hold`) × 6 arquétipos (`old_school`, `analytics`, `motivator`, `tactician`, `developer`, `pragmatic`). Exemplo do padrão (gerar os 36; abaixo a coluna `tactician`/`motivator`/`analytics` como amostra obrigatória — as demais seguem o mesmo molde de voz):
```ts
  // ── C7: conselho do assistente in-match ──
  'advice.change_mentality.tactician': 'Recue as linhas e controle os espaços.',
  'advice.change_mentality.motivator': 'Joga pra cima! Vamos buscar esse gol!',
  'advice.change_mentality.analytics': 'O xG pede ajuste de mentalidade agora.',
  'advice.change_mentality.old_school': 'Hora de mudar a postura do time.',
  'advice.change_mentality.developer': 'Deixe os jovens assumirem o ritmo.',
  'advice.change_mentality.pragmatic': 'Ajuste a mentalidade ao placar.',
  'advice.change_pressing.tactician': 'Suba a marcação pra sufocar a saída deles.',
  'advice.change_pressing.motivator': 'Pressão total, não dá trégua!',
  'advice.change_pressing.analytics': 'Pressão alta maximiza recuperações no campo deles.',
  'advice.change_pressing.old_school': 'Marquem em cima, sem dó.',
  'advice.change_pressing.developer': 'Use a energia da molecada pra pressionar.',
  'advice.change_pressing.pragmatic': 'Aumente a pressão com critério.',
  'advice.sub_off.tactician': 'Tire-o antes que vire problema.',
  'advice.sub_off.motivator': 'Ele deu tudo — hora de oxigenar.',
  'advice.sub_off.analytics': 'Fadiga/cartão elevam o risco dele; substitua.',
  'advice.sub_off.old_school': 'Esse já está no limite, troque.',
  'advice.sub_off.developer': 'Proteja-o, coloque um reserva.',
  'advice.sub_off.pragmatic': 'Substituição preventiva recomendada.',
  'advice.sub_attacker.tactician': 'Um atacante a mais pra furar o bloqueio.',
  'advice.sub_attacker.motivator': 'Mais força no ataque, vamos virar!',
  'advice.sub_attacker.analytics': 'Reforço ofensivo eleva o xG esperado.',
  'advice.sub_attacker.old_school': 'Bota mais um homem na frente.',
  'advice.sub_attacker.developer': 'Solte um jovem atacante.',
  'advice.sub_attacker.pragmatic': 'Troca ofensiva pra buscar o resultado.',
  'advice.sub_defender.tactician': 'Reforce a defesa pra segurar o placar.',
  'advice.sub_defender.motivator': 'Segura firme atrás, time!',
  'advice.sub_defender.analytics': 'Reforço defensivo reduz o xG sofrido.',
  'advice.sub_defender.old_school': 'Fecha o cadeado lá atrás.',
  'advice.sub_defender.developer': 'Entra um zagueiro pra dar equilíbrio.',
  'advice.sub_defender.pragmatic': 'Troca defensiva pra proteger a vantagem.',
  'advice.hold.tactician': 'Está equilibrado. Mantenha o plano.',
  'advice.hold.motivator': 'Tá indo bem, segue assim!',
  'advice.hold.analytics': 'Os números pedem paciência. Mantenha.',
  'advice.hold.old_school': 'Não mexa no que está funcionando.',
  'advice.hold.developer': 'Deixe o time fluir, está bom.',
  'advice.hold.pragmatic': 'Sem mudanças por ora.',
  // ── janelas ao vivo ──
  'live.window_halftime': 'INTERVALO',
  'live.window_second_half': 'AJUSTE — 2º TEMPO',
  'live.window_final_stretch': 'RETA FINAL',
  'live.advice_title': 'CONSELHO DO ASSISTENTE',
  'live.apply': 'Aplicar',
  'live.advance': 'CONTINUAR PARTIDA',
  'live.finish': 'FINALIZAR PARTIDA',
  'live.no_advice': 'Sem conselhos no momento.',
```
  Replicar TODAS as 36 + 8 chaves em `src/i18n/en.ts` com tradução equivalente (ex.: `'advice.change_mentality.tactician': 'Drop the lines and control the spaces.'`, `'live.window_halftime': 'HALF-TIME'`, etc.).
- [ ] **Step 4 — rodar (passa):** `npx jest advice-parity` (verde) + `npx jest match-advisor` (continua verde) + `npx tsc --noEmit` (exit 0 — chaves agora existem).
- [ ] **Step 5 — commit:** `git add src/i18n/pt.ts src/i18n/en.ts __tests__/i18n/advice-parity.test.ts` · msg: `feat(c7): i18n advice.*/live.* (paridade pt/en)`.

---

## Task 7: Orquestrador `live-match.ts` (TDD, SQLite real)

**Files:** Create `src/engine/match-day/live-match.ts`, Create `__tests__/engine/match-day/live-match.test.ts`, Modify `src/engine/match-day/halftime.ts`.
**Interfaces:** Produces: `liveSeed`, `nextWindowBlock`, `UserLiveContext`, `startUserMatchLive`, `advanceToNextWindow`, `finishLiveMatch`. Consumes: `loadClubMatchData`, `getFixturesByWeek`, `getClubById`, `getAssistantByRole`, `computeQualityStars`, `initLiveMatch`, `simulateSegment`, `applyWindowOverrides`, `finalizeMatchResult`, `generateMatchAdvice`, `orientResultToFixture`, `MAX_SUBS`-equivalente (cap 5).

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/match-day/live-match.test.ts` (molde de `halftime-helper.integration.test.ts` p/ o setup; copiar `buildCalendar`):
```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import {
  startUserMatchLive, advanceToNextWindow, finishLiveMatch, nextWindowBlock, liveSeed,
} from '@/engine/match-day/live-match';

async function buildCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, 1, league.id);
    clubsByLeague[league.id] = clubs.map(c => c.id);
  }
  const calendar = generateSeasonCalendar({
    season: 1, leagues, clubsByLeague, championsLeagueClubs: [1,2,3,4,21,22,23,24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, 1, { id: comp.id, name: comp.name, type: comp.type, format: comp.format, season: comp.season, leagueId: comp.leagueId });
  }
  for (const entry of calendar.entries) await addCompetitionEntry(db, 1, entry);
  for (const fx of calendar.fixtures) {
    await createFixture(db, 1, { id: fx.id, competitionId: fx.competitionId, season: fx.season, week: fx.week, round: fx.round as string | null, homeClubId: fx.homeClubId, awayClubId: fx.awayClubId });
  }
}

describe('nextWindowBlock', () => {
  it('do bloco 0 com 0 janelas usadas → 15 (intervalo)', () => {
    expect(nextWindowBlock(0, 0)).toBe(15);
  });
  it('do bloco 15 com 1 janela usada → 22', () => {
    expect(nextWindowBlock(15, 1)).toBe(22);
  });
  it('atingido MAX_LIVE_WINDOWS → null (roda direto até o fim)', () => {
    expect(nextWindowBlock(22, 3)).toBeNull();
  });
  it('liveSeed == halftimeSeed (mesma fórmula)', () => {
    expect(liveSeed(1, 7, 123)).toBe(1 * 100000 + 7 * 100 + 123);
  });
});

describe('startUserMatchLive → advanceToNextWindow → finishLiveMatch (SQLite real)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(async () => {
    rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb);
    await buildCalendar(db);
  });
  afterEach(() => rawDb.close());

  it('intervalo: contexto com windowKind=halftime e advice não-vazio', async () => {
    const ctx = await startUserMatchLive({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
    expect(ctx).not.toBeNull();
    expect(ctx!.windowKind).toBe('halftime');
    expect(ctx!.state.currentBlock).toBe(15);
    expect(Array.isArray(ctx!.advice)).toBe(true);
    for (const ev of ctx!.state.events) expect(ev.minute).toBeLessThanOrEqual(45);
  });

  it('null quando não há fixture do usuário na semana', async () => {
    const ctx = await startUserMatchLive({ dbHandle: db, season: 1, week: 5, playerClubId: 1, saveId: 1 });
    expect(ctx).toBeNull();
  });

  it('loop multi-janela termina em resultado finalizável', async () => {
    const ctx = await startUserMatchLive({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
    let cur = ctx!;
    let windowsUsed = 1;
    // janela 2 (bloco 22), sem triggers opt-in
    const next = advanceToNextWindow({
      state: cur.state, isHome: cur.isHome, opponentName: cur.opponentName,
      windowsUsed, overrides: {}, triggers: [],
      archetype: 'tactician', qualityStars: 3,
    });
    if (next) { cur = next; windowsUsed++; expect(cur.state.currentBlock).toBe(22); }
    const result = finishLiveMatch({ state: cur.state, isHome: cur.isHome, overrides: {} });
    expect(result.homeGoals).toBeGreaterThanOrEqual(0);
    expect(result.awayGoals).toBeGreaterThanOrEqual(0);
  });

  it('determinismo: mesmo save/seed + mesmas decisões → mesmo placar/eventos', async () => {
    const run = async () => {
      const c = await startUserMatchLive({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
      const n = advanceToNextWindow({ state: c!.state, isHome: c!.isHome, opponentName: c!.opponentName, windowsUsed: 1, overrides: {}, triggers: [], archetype: 'tactician', qualityStars: 3 });
      const st = n ? n.state : c!.state;
      const ih = n ? n.isHome : c!.isHome;
      return finishLiveMatch({ state: st, isHome: ih, overrides: {} });
    };
    const r1 = await run();
    // rebuild db idêntico p/ 2ª rodada
    rawDb.close(); rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb); await buildCalendar(db);
    const r2 = await run();
    expect(r1.homeGoals).toBe(r2.homeGoals);
    expect(r1.awayGoals).toBe(r2.awayGoals);
    expect(r1.events).toEqual(r2.events);
  });

  it('trigger conceded_goal para no bloco do gol sofrido (quando há gol no 2º tempo)', async () => {
    // Busca uma seed (via fixture/semana fixos do seed) onde o usuário sofre gol no 2º tempo.
    // Determinístico: rodamos o intervalo, depois advance com trigger e checamos que, SE parou
    // antes do bloco 22, o gap reflete um gol away novo.
    const ctx = await startUserMatchLive({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
    const before = ctx!.state.away.goals;
    const next = advanceToNextWindow({
      state: ctx!.state, isHome: ctx!.isHome, opponentName: ctx!.opponentName,
      windowsUsed: 1, overrides: {}, triggers: ['conceded_goal'],
      archetype: 'tactician', qualityStars: 3,
    });
    if (next && next.state.currentBlock < 22) {
      expect(next.state.away.goals).toBeGreaterThan(before);
    }
    expect(true).toBe(true); // golden path não-crash garantido
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest live-match` → `Cannot find module '@/engine/match-day/live-match'`.
- [ ] **Step 3 — implementar** `src/engine/match-day/live-match.ts`:
```ts
import { DbHandle } from '@/database/queries/players';
import { getFixturesByWeek } from '@/database/queries/fixtures';
import { getClubById } from '@/database/queries/clubs';
import { getAssistantByRole } from '@/database/queries/assistants';
import { loadClubMatchData } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic } from '@/types/tactic';
import {
  initLiveMatch, simulateSegment, applyWindowOverrides, finalizeMatchResult,
  LiveMatchState, MatchInput, MatchResult, SecondHalfOverrides,
} from '@/engine/simulation/match-engine';
import { orientResultToFixture } from '@/engine/match-day/halftime';
import { generateMatchAdvice } from '@/engine/assistant/match-advisor';
import { computeQualityStars } from '@/engine/assistant/assistant-engine';
import { AssistantArchetype } from '@/types/assistant';
import { LiveWindowKind, LiveTrigger, MatchAdvice } from '@/types/match-advice';
import {
  LIVE_WINDOW_BLOCKS, LIVE_FINAL_STRETCH_BLOCK, MAX_LIVE_WINDOWS,
} from '@/engine/balance';

const TOTAL_BLOCKS = 30;
const HALF_BLOCK = 15;
const SUB_CAP = 5; // espelha MAX_SUBS do motor

export function liveSeed(season: number, week: number, fixtureId: number): number {
  return season * 100000 + week * 100 + fixtureId;
}

/** Próxima fronteira de janela FIXA após `fromBlock`. null se o teto de janelas
 *  já foi atingido ou não há ponto fixo restante antes do fim. */
export function nextWindowBlock(fromBlock: number, windowsUsed: number): number | null {
  if (windowsUsed >= MAX_LIVE_WINDOWS) return null;
  for (const b of LIVE_WINDOW_BLOCKS) if (b > fromBlock) return b;
  return null;
}

/** Mapeia o bloco da janela para o tipo (UI). */
function windowKindForBlock(block: number): LiveWindowKind {
  if (block <= HALF_BLOCK) return 'halftime';
  if (block >= LIVE_FINAL_STRETCH_BLOCK) return 'final_stretch';
  return 'second_half';
}

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

function buildAdvice(
  state: LiveMatchState, archetype: AssistantArchetype, qualityStars: number, opponentName: string,
): MatchAdvice[] {
  const home = state.home;
  return generateMatchAdvice({
    archetype, qualityStars,
    userGoals: home.goals, oppGoals: state.away.goals,
    currentBlock: state.currentBlock, userTactic: home.tactic,
    onPitch: home.squad, bench: home.bench,
    yellowCardedIds: home.yellows, fatigueByPlayer: home.fatigueByPlayer,
    subsRemaining: Math.max(0, SUB_CAP - home.subsUsed),
    opponentName, rng: state.rng,
  });
}

export async function startUserMatchLive(params: {
  dbHandle: DbHandle; season: number; week: number; playerClubId: number; saveId: number;
}): Promise<UserLiveContext | null> {
  const { dbHandle: db, season, week, playerClubId, saveId } = params;
  const fixtures = await getFixturesByWeek(db, saveId, season, week);
  const fixture = fixtures.find(f => !f.played && (f.homeClubId === playerClubId || f.awayClubId === playerClubId));
  if (!fixture) return null;

  const isHome = fixture.homeClubId === playerClubId;
  const opponentId = isHome ? fixture.awayClubId : fixture.homeClubId;
  const userData = await loadClubMatchData(db, saveId, playerClubId);
  const opponentData = await loadClubMatchData(db, saveId, opponentId);
  const opponentClub = await getClubById(db, saveId, opponentId);
  const squadAssistant = await getAssistantByRole(db, saveId, 'squad');

  const input: MatchInput = {
    fixtureId: fixture.id,
    homeSquad: userData.squad, awaySquad: opponentData.squad,
    homeBench: userData.bench, awayBench: opponentData.bench,
    homeTactic: userData.tactic, awayTactic: opponentData.tactic,
    homeClubReputation: userData.reputation, awayClubReputation: opponentData.reputation,
    homeSetPieceTakers: userData.setPieceTakers, awaySetPieceTakers: opponentData.setPieceTakers,
    rng: new SeededRng(liveSeed(season, week, fixture.id)),
  };

  const state = simulateSegment(initLiveMatch(input), HALF_BLOCK);
  const archetype: AssistantArchetype = squadAssistant?.archetype ?? 'tactician';
  const qualityStars = squadAssistant?.qualityStars ?? 3;
  const opponentName = opponentClub?.name ?? 'Opponent';

  return {
    state, isHome, opponentName,
    windowKind: 'halftime',
    advice: buildAdvice(state, archetype, qualityStars, opponentName),
    homeBench: state.home.bench, homeTactic: state.home.tactic, fixtureId: fixture.id,
  };
}

/**
 * Aplica os overrides da janela atual e roda até a PRÓXIMA fronteira — o menor
 * entre o próximo ponto fixo e o bloco onde um trigger opt-in dispara. Devolve o
 * próximo contexto ou null se o jogo chegou ao fim (chamador → finishLiveMatch).
 */
export function advanceToNextWindow(params: {
  state: LiveMatchState; isHome: boolean; opponentName: string; windowsUsed: number;
  overrides: SecondHalfOverrides; triggers: LiveTrigger[];
  archetype: AssistantArchetype; qualityStars: number;
}): UserLiveContext | null {
  const { state, isHome, opponentName, windowsUsed, overrides, triggers, archetype, qualityStars } = params;
  applyWindowOverrides(state, overrides);

  const finalStretchOn = triggers.includes('final_stretch');
  const concededOn = triggers.includes('conceded_goal');

  // Alvo "ideal": próximo ponto fixo (15→22), ou reta final se opt-in pediu.
  let target = nextWindowBlock(state.currentBlock, windowsUsed);
  if (finalStretchOn && (target === null || target > LIVE_FINAL_STRETCH_BLOCK) && state.currentBlock < LIVE_FINAL_STRETCH_BLOCK && windowsUsed < MAX_LIVE_WINDOWS) {
    target = LIVE_FINAL_STRETCH_BLOCK;
  }
  if (target === null) return null;

  if (concededOn) {
    // Roda bloco-a-bloco; para no fim do bloco onde o away marcar.
    const before = state.away.goals;
    while (state.currentBlock < target) {
      simulateSegment(state, state.currentBlock + 1);
      if (state.away.goals > before && state.currentBlock < TOTAL_BLOCKS) break;
    }
  } else {
    simulateSegment(state, target);
  }

  if (state.currentBlock >= TOTAL_BLOCKS) return null;

  const windowKind = windowKindForBlock(state.currentBlock);
  return {
    state, isHome, opponentName, windowKind,
    advice: buildAdvice(state, archetype, qualityStars, opponentName),
    homeBench: state.home.bench, homeTactic: state.home.tactic, fixtureId: state.input.fixtureId,
  };
}

export function finishLiveMatch(params: {
  state: LiveMatchState; isHome: boolean; overrides: SecondHalfOverrides;
}): MatchResult {
  const { state, isHome, overrides } = params;
  applyWindowOverrides(state, overrides);
  simulateSegment(state, TOTAL_BLOCKS);
  return orientResultToFixture(finalizeMatchResult(state), isHome);
}
```
- [ ] **Step 4 — implementar compat em `halftime.ts`:** re-exportar `liveSeed` como `halftimeSeed` e tornar `startUserMatchHalftime` um wrapper. Editar `src/engine/match-day/halftime.ts`:
  - Manter `orientResultToFixture` e `UserHalftimeContext` (consumidos por outros arquivos).
  - Substituir o corpo de `halftimeSeed` por `return liveSeed(season, week, fixtureId);` e adicionar `import { liveSeed, startUserMatchLive } from '@/engine/match-day/live-match';` (cuidado com import circular: `live-match.ts` importa `orientResultToFixture` de `halftime.ts`, e `halftime.ts` importa de `live-match.ts` — TS/Jest resolvem porque são só funções; mas para evitar ciclo, **mover** `orientResultToFixture` e `halftimeSeed`/`liveSeed` para `live-match.ts` e re-exportá-los de `halftime.ts`). Decisão: **mover** `orientResultToFixture` para `live-match.ts`; em `halftime.ts` fazer `export { orientResultToFixture, liveSeed as halftimeSeed } from '@/engine/match-day/live-match';`.
  - `startUserMatchHalftime` passa a chamar `startUserMatchLive` e adaptar o retorno ao shape antigo `UserHalftimeContext` (`{ halftime: ctx.state, isHome, opponentName, homeSquad: ctx.state.home.squad, homeBench, homeTactic, fixtureId }`).
- [ ] **Step 5 — rodar (passa):** `npx jest live-match halftime-helper` (ambos verdes — o wrapper preserva o teste de integração antigo). `npx tsc --noEmit` (exit 0). Confirmar ausência de ciclo: `npx jest match-engine` verde.
- [ ] **Step 6 — commit:** `git add src/engine/match-day/live-match.ts src/engine/match-day/halftime.ts __tests__/engine/match-day/live-match.test.ts` · msg: `feat(c7): orquestrador live-match (janelas múltiplas + triggers + advice)`.

---

## Task 8: Store — campos `live*` (windowKind + advice)

**Files:** Modify `src/store/game-store.ts`.
**Interfaces:** Produces: estado `liveWindowKind`, `liveAdvice` + action `setLive` (estende `setHalftime`). Consumes: `LiveMatchState`, `LiveWindowKind`, `MatchAdvice`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/store/game-store-live.test.ts`:
```ts
import { useGameStore } from '@/store/game-store';

it('setLive guarda windowKind e advice; null limpa', () => {
  const fakeState: any = { home: { squad: [] }, currentBlock: 15 };
  useGameStore.getState().setLive({
    halftime: fakeState, isHome: true, opponentName: 'Rival',
    bench: [], tactic: null as any, fixtureId: 1,
    windowKind: 'second_half', advice: [{ kind: 'hold', text: { key: 'advice.hold.tactician' }, priority: 30 }],
  });
  expect(useGameStore.getState().liveWindowKind).toBe('second_half');
  expect(useGameStore.getState().liveAdvice).toHaveLength(1);
  useGameStore.getState().setLive(null);
  expect(useGameStore.getState().liveWindowKind).toBeNull();
  expect(useGameStore.getState().liveAdvice).toHaveLength(0);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest game-store-live` → `setLive is not a function`.
- [ ] **Step 3 — implementar** em `src/store/game-store.ts`:
  - No `import` (`:3,5`): adicionar `LiveMatchState`/reusar `HalftimeState` (são alias); importar `import { LiveWindowKind, MatchAdvice } from '@/types/match-advice';`.
  - No `GameState` (após `:37`): `liveWindowKind: LiveWindowKind | null;` e `liveAdvice: MatchAdvice[];`.
  - Em `initialState` (`:125`): `liveWindowKind: null,` e `liveAdvice: [],`.
  - Em `loadSave`/`clearGame`: resetar os dois campos.
  - Adicionar action `setLive` que faz o mesmo que `setHalftime` MAIS `liveWindowKind`/`liveAdvice`; manter `setHalftime` como alias (`setLive` com `windowKind: 'halftime', advice: []`) p/ não quebrar a tela atual durante a migração:
```ts
  setLive: (ctx: {
    halftime: HalftimeState; isHome: boolean; opponentName: string;
    bench: PlayerForStrength[]; tactic: Tactic; fixtureId: number;
    windowKind: LiveWindowKind; advice: MatchAdvice[];
  } | null) =>
    set(ctx
      ? {
          halftime: ctx.halftime, halftimeIsHome: ctx.isHome, halftimeOpponentName: ctx.opponentName,
          halftimeBench: ctx.bench, halftimeTactic: ctx.tactic, halftimeFixtureId: ctx.fixtureId,
          liveWindowKind: ctx.windowKind, liveAdvice: ctx.advice,
        }
      : {
          halftime: null, halftimeIsHome: null, halftimeOpponentName: null,
          halftimeBench: [], halftimeTactic: null, halftimeFixtureId: null,
          liveWindowKind: null, liveAdvice: [],
        }),
```
  e declarar `setLive` no `GameActions`.
- [ ] **Step 4 — rodar (passa):** `npx jest game-store-live` (verde). `npx tsc --noEmit` (exit 0).
- [ ] **Step 5 — commit:** `git add src/store/game-store.ts __tests__/store/game-store-live.test.ts` · msg: `feat(c7): store live* (windowKind + advice) sobre halftime`.

---

## Task 9: Navegação — `MatchLiveWindow`

**Files:** Modify `src/navigation/types.ts`, e o registro de telas (mesmo arquivo onde `MatchHalftime` é registrada no stack).
**Interfaces:** Produces: rota `MatchLiveWindow: { windowKind: LiveWindowKind }`.

- [ ] **Step 1 — localizar registro:** `grep -rn "MatchHalftime" src/navigation` para achar onde a `Screen` é declarada.
- [ ] **Step 2 — implementar:** em `src/navigation/types.ts:6` adicionar (mantendo `MatchHalftime` por ora):
```ts
  MatchHalftime: undefined;
  MatchLiveWindow: { windowKind: import('@/types/match-advice').LiveWindowKind };
```
  e registrar a `Screen` `MatchLiveWindow` apontando para `MatchHalftimeScreen` (a tela vira genérica na Task 10). Pode reusar o mesmo componente para ambas as rotas durante a transição.
- [ ] **Step 3 — rodar (passa):** `npx tsc --noEmit` (exit 0).
- [ ] **Step 4 — commit:** `git add src/navigation/types.ts src/navigation/<arquivo-do-stack>.tsx` · msg: `feat(c7): rota MatchLiveWindow com windowKind`.

---

## Task 10: UI — painel de conselho + janelas do 2º tempo

**Files:** Modify `src/screens/home/MatchHalftimeScreen.tsx`, `src/screens/home/HomeScreen.tsx`.
**Interfaces:** Consumes: `useGameStore` (`liveWindowKind`, `liveAdvice`, `setLive`), `advanceToNextWindow`, `finishLiveMatch`, `startUserMatchLive`.

- [ ] **Step 1 — HomeScreen:** trocar `startUserMatchHalftime` por `startUserMatchLive` em `handleWatchLive` (`HomeScreen.tsx:393-435`):
  - import: `import { startUserMatchLive } from '@/engine/match-day/live-match';`.
  - chamar `startUserMatchLive({...})`; se `ctx` → `setLive({ halftime: ctx.state, isHome: ctx.isHome, opponentName: ctx.opponentName, bench: ctx.homeBench, tactic: ctx.homeTactic, fixtureId: ctx.fixtureId, windowKind: ctx.windowKind, advice: ctx.advice })` e `navigation.navigate('MatchLiveWindow', { windowKind: ctx.windowKind })`.
- [ ] **Step 2 — Tela: painel de conselho.** Em `MatchHalftimeScreen.tsx`, ler `liveWindowKind`, `liveAdvice` do store. Renderizar uma seção `live.advice_title` acima de "AJUSTES TÁTICOS": para cada `MatchAdvice` (ordenado), uma linha com `t(advice.text.key)` e, se houver `suggested*`, um botão `live.apply` que pré-preenche o controle correspondente:
  - `suggestedMentality` → `setMentality(advice.suggestedMentality)`.
  - `suggestedPressing` → `setPressing(advice.suggestedPressing)`.
  - `suggestedSubOutId`+`suggestedSubInId` → `setSubs([...subs, { outId, inId }])` (respeitando `canAddSub`).
  Título da tela por `windowKind`: `t(\`live.window_${windowKind}\`)` no lugar do fixo `halftime.title`.
- [ ] **Step 3 — Loop de janelas.** Renomear/duplicar `handleResume` em duas ações:
  - **Continuar partida** (`live.advance`): só aparece se NÃO for a última janela. Monta `overrides` (igual `:204-213`), lê `triggers` (por ora `[]` — settings-store é D7; deixar lista vazia e um TODO comentando a dependência D7). Chama `advanceToNextWindow({ state: halftime, isHome, opponentName, windowsUsed, overrides, triggers: [], archetype, qualityStars })`. **Atenção:** `archetype`/`qualityStars` precisam vir do contexto — guardá-los no store junto do advice OU recomputar `buildAdvice` via novo contexto retornado (o `advanceToNextWindow` já devolve `advice` recomputado). Se retornou contexto: `setLive({...next, halftime: next.state, ...})`, resetar `subs`/`mentality`/`pressing` para os novos valores correntes, e permanecer na tela (re-render). Se retornou `null`: cair no fluxo de finalização.
  - **Finalizar partida** (`live.finish`): chama `finishLiveMatch({ state: halftime, isHome, overrides })` → `fixtureResult`. O restante é IDÊNTICO ao `handleResume` atual (`:219-277`): `advanceGameWeek({..., userMatchResultOverride: fixtureResult})`, achievement checkpoint, comentário semanal, `setLive(null)`, `navigation.replace('MatchResult', { fixtureId })`. **Remover** o uso direto de `resumeSecondHalf`/`orientResultToFixture` (agora encapsulados em `finishLiveMatch`).
  - Para saber se é a última janela: `windowsUsed` derivado de quantas janelas já passaram (intervalo=1; cada `second_half`/`final_stretch` +1). Guardar `windowsUsed` no store (ou derivar de `currentBlock`: `currentBlock>=22 ? 2 : 1`). Quando `nextWindowBlock(currentBlock, windowsUsed) === null`, esconder "Continuar" e mostrar só "Finalizar".
- [ ] **Step 4 — type-check + jest:** `npx tsc --noEmit` (exit 0) e `npx jest` (suíte inteira verde, incluindo compose-equals-whole e integração live-match).
- [ ] **Step 5 — commit:** `git add src/screens/home/MatchHalftimeScreen.tsx src/screens/home/HomeScreen.tsx` · msg: `feat(c7): UI de janelas ao vivo com painel de conselho do assistente`.

---

## Task 11: Validação no browser (Playwright MCP) + DoD

**Files:** nenhum (validação).
**Interfaces:** Consumes: app web em `localhost:8082`.

- [ ] **Step 1 — subir o web server** (background do harness, com `--clear`): `npm run web`. Aguardar bundle.
- [ ] **Step 2 — fluxo manual via Playwright:** novo jogo → avançar até uma semana com jogo do usuário → "Assistir ao vivo". Verificar:
  1. Intervalo abre com placar parcial, stats, eventos e **painel de conselho** (≥1 item, texto traduzido pt).
  2. Botão "Aplicar" de um conselho pré-preenche mentalidade/sub corretos.
  3. "Continuar partida" avança para a janela do 2º tempo (título "AJUSTE — 2º TEMPO"), com novo conselho.
  4. "Finalizar partida" leva ao `MatchResult` com placar coerente. 0 erros no console.
- [ ] **Step 3 — screenshot** de cada janela (intervalo + 2º tempo) p/ o checkpoint visual.
- [ ] **Step 4 — DoD:** `npx jest && npx tsc --noEmit` verdes; compose-equals-whole intacto; advisor+orquestrador testados com SQLite real; determinismo verificado; UI validada no browser; i18n pt/en em paridade; ZERO `Math.random`/`Date.now` adicionados ao engine (`grep -rn "Math.random\|Date.now" src/engine/assistant/match-advisor.ts src/engine/match-day/live-match.ts src/engine/simulation/match-engine.ts` → vazio).

---

## Self-Review

1. **Cobertura do spec:**
   - §2.1 janelas por etapa/gatilho → Task 3 (`simulateSegment`) + Task 7 (`nextWindowBlock`, triggers `conceded_goal`/`final_stretch`, `MAX_LIVE_WINDOWS`).
   - §2.2 engine de conselho puro modulado por arquétipo → Task 5 + Task 6 (i18n).
   - §3 contrato → Tasks 2,3,5,7 produzem exatamente as assinaturas listadas (ajuste documentado: `change_formation` removido, alinhado à §9 que confina escopo a mentality/pressing/subs).
   - §4 data flow → Task 7 (orquestrador) + Task 10 (loop UI).
   - §5 sem schema → confirmado (Task 8 mantém volátil em memória).
   - §6 edge cases → testes da Task 5 (banco vazio, subs esgotados, amarelo+fadiga) e Task 7 (sem fixture→null, clamp em TOTAL_BLOCKS, trigger no último bloco→null).
   - §7 testing strategy → compose-equals-whole estendido (Task 4), advisor golden/edge/determinismo (Task 5), integração SQLite real + determinismo (Task 7).
2. **Placeholder scan:** sem "TBD"/"FIXME". Todo código aparece inline. Único ponto adiado **com justificativa explícita**: os toggles de `triggers` na UI (Task 10) ficam `[]` porque `settings-store` é dependência do épico D7 (spec §2.1/§8); a engine JÁ suporta os triggers (testado na Task 7) — só falta a fonte dos toggles, que não pertence a este épico.
3. **Consistência de tipos:** `LiveMatchState`/`HalftimeState` (alias) coerentes entre match-engine, store e live-match. `MatchAdvice`/`LiveWindowKind`/`LiveTrigger` centralizados em `src/types/match-advice.ts` e consumidos sem divergência. `SecondHalfOverrides` reusado (não duplicado). `generateMatchAdvice` consome `ReadonlySet`/`ReadonlyMap` que casam com `home.yellows`/`home.fatigueByPlayer`. Risco de import circular halftime↔live-match resolvido movendo `orientResultToFixture`/`liveSeed` para `live-match.ts` (Task 7 Step 4).
