import { MatchEvent, MatchEventType, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { PlayerForStrength, TeamStrength, calculateTeamStrength } from './team-strength';
import { PlayerRating, PlayerMatchInput, calculatePlayerRatings } from './player-rating';
import { calculateOverall } from '@/utils/overall';
import { formationModifiers } from '../formations';
import { resolveTaker } from './set-piece-takers';

// P7: manager-designated set-piece takers. Each id nullable/undefined → engine
// auto-picks by attribute (legacy behavior). Threaded as an optional MatchInput
// field so the no-designation path is byte-for-byte identical to before.
export type CornerRoutine = 'auto' | 'near_post' | 'far_post' | 'short';

export interface SetPieceTakers {
  penaltyTakerId?: number | null;
  freeKickTakerId?: number | null;
  cornerTakerId?: number | null;
  cornerRoutine?: CornerRoutine; // C8-f: undefined/'auto' = legado
}

const CORNER_ROUTINE_MULT: Record<CornerRoutine, number> = {
  auto: 1.0,
  short: 0.85,      // troca curta: menos cabeçada, mais posse
  near_post: 1.10,  // primeiro pau: desvio rápido
  far_post: 1.20,   // segundo pau: cruzamento p/ cabeceador alto
};

/** Multiplicador da prob. de gol de escanteio pela rotina. undefined/'auto' = 1.0. Puro. */
export function cornerRoutineMultiplier(routine: CornerRoutine | undefined): number {
  return routine ? CORNER_ROUTINE_MULT[routine] : 1.0;
}

export interface MatchInput {
  fixtureId: number;
  homeSquad: PlayerForStrength[];
  awaySquad: PlayerForStrength[];
  homeBench?: PlayerForStrength[];
  awayBench?: PlayerForStrength[];
  homeTactic: Tactic;
  awayTactic: Tactic;
  homeClubReputation: number;
  awayClubReputation: number;
  attendance?: number; // #9: for home advantage scaling
  homeSetPieceTakers?: SetPieceTakers; // P7
  awaySetPieceTakers?: SetPieceTakers; // P7
  // C1: derby atmosphere. Absent/neutral (atmosphereMult === 1) ⇒ byte-for-byte
  // identical to the legacy path, so non-derby fixtures are unaffected.
  derbyBonus?: { atmosphereMult: number; homeMoraleBonus: number; awayMoraleBonus: number };
  // C8-e: recent-form modifier por jogador (id → -1..+1). Ausente ⇒ legado.
  homeFormModifiers?: Map<number, number>;
  awayFormModifiers?: Map<number, number>;
  // L2 Fase 6: emite eventos de fase granulares (tackle/key_pass/recovery/
  // possession_change). Ausente/false ⇒ legado byte-a-byte: nenhum evento de fase,
  // zero consumo extra do rng principal. Quando true, usa uma stream SEPARADA
  // (phaseRng) que NÃO toca o rng do placar/cartões.
  emitPhaseEvents?: boolean;
  rng: SeededRng;
}

export interface MatchStats {
  homePossession: number;
  awayPossession: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homeFouls: number;
  awayFouls: number;
  homeCorners: number;
  awayCorners: number;
  homeXG: number; // #2
  awayXG: number; // #2
  // L2 Fase 6: agregados de fase, presentes SÓ quando emitPhaseEvents está ON
  // (ausentes ⇒ legado byte-a-byte). Derivados dos eventos de fase.
  homeTackles?: number;
  awayTackles?: number;
  homeKeyPasses?: number;
  awayKeyPasses?: number;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  homeRatings: PlayerRating[];
  awayRatings: PlayerRating[];
  stats: MatchStats;
  attendance: number;
}

// ─── Constants (tuned for 30 blocks × 3 min, ~2.5 goals/match; recalibrated 2026-06-11) ──

const TOTAL_BLOCKS = 30;
const HALF_BLOCK = 15;

const GOAL_BASE_PROB = 0.013;      // was 0.016 — recalibrated to ~2.5 goals/match
const SHOT_BASE_PROB = 0.10;       // #2: probability of generating any shot attempt
const YELLOW_BASE_PROB = 0.008;
const RED_DIRECT_PROB = 0.0005;
const INJURY_PROB = 0.002;
const PENALTY_PROB = 0.0025;       // was 0.003
const CORNER_GOAL_PROB = 0.04;     // was 0.05
const FREEKICK_GOAL_PROB = 0.03;
const ASSIST_CHANCE = 0.70;
const MAX_SUBS = 5;

// ─── Post-card follow-up probabilities ──────────────────────────────────────
const YELLOW_FREEKICK_CHANCE = 0.25;
const YELLOW_PENALTY_CHANCE = 0.05;
const RED_FREEKICK_CHANCE = 0.20;
const RED_PENALTY_CHANCE = 0.30;

// ─── #5: Momentum constants ──────────────────────────────────────────────────
const MOMENTUM_BLOCKS_AFTER_GOAL = 3;
const MOMENTUM_BOOST_LOSING = 0.12;
const MOMENTUM_BOOST_DRAWING = 0.06;
const MOMENTUM_SCORER_PENALTY = 0.05;

// ─── #9: Home advantage ─────────────────────────────────────────────────────
const HOME_ADVANTAGE_BASE = 1.04;
const HOME_ADVANTAGE_MAX = 1.12;
const STADIUM_CAPACITY = 60000;

// ─── L2 Fase 6: phaseRng namespaced ──────────────────────────────────────────
// Offset primo grande p/ separar a stream de eventos de fase do rng principal.
// O seed combina fixtureId/block/lado de forma determinística (o `| 0` interno do
// SeededRng trunca para 32 bits — determinismo preservado).
const PHASE_RNG_OFFSET = 1_000_000_007;
function phaseRngSeed(fixtureId: number, block: number, side: number): number {
  return PHASE_RNG_OFFSET + fixtureId * 7919 + block * 31 + side;
}

const ATTACK_POS = new Set<string>(['ST', 'LW', 'RW']);
const HEADER_POS = new Set<string>(['CB', 'ST']);
const DEFENSE_POS = new Set<string>(['CB', 'LB', 'RB']);
const GK_POS = 'GK';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function blockToMinute(block: number, rng: SeededRng, usedMinutes: Set<number>): number {
  const start = block * 3 + 1;
  let minute = rng.nextInt(start, Math.min(start + 2, 90));
  while (usedMinutes.has(minute) && minute < 90) minute++;
  if (usedMinutes.has(minute)) {
    minute = rng.nextInt(start, Math.min(start + 2, 90));
    while (usedMinutes.has(minute) && minute > 1) minute--;
  }
  usedMinutes.add(minute);
  return minute;
}

function pickScorer(squad: PlayerForStrength[], rng: SeededRng): PlayerForStrength {
  const w = squad.map(p => {
    const base = p.attributes.finishing + p.attributes.positioning;
    return ATTACK_POS.has(p.position) ? base * 2 : base;
  });
  return rng.weightedPick(squad, w);
}

function pickHeaderScorer(squad: PlayerForStrength[], rng: SeededRng): PlayerForStrength {
  const w = squad.map(p => {
    const base = p.attributes.heading + p.attributes.jumping;
    return HEADER_POS.has(p.position) ? base * 2 : base;
  });
  return rng.weightedPick(squad, w);
}

function pickAssister(squad: PlayerForStrength[], excludeId: number, rng: SeededRng): PlayerForStrength | null {
  const c = squad.filter(p => p.id !== excludeId);
  if (c.length === 0) return null;
  return rng.weightedPick(c, c.map(p => p.attributes.passing + p.attributes.vision + p.attributes.crossing));
}

function bestAttr(squad: PlayerForStrength[], attr: (p: PlayerForStrength) => number): PlayerForStrength {
  let best = squad[0];
  for (const p of squad) if (attr(p) > attr(best)) best = p;
  return best;
}

function nextMinute(base: number, usedMinutes: Set<number>): number {
  let m = Math.min(base + 1, 90);
  while (usedMinutes.has(m) && m < 90) m++;
  usedMinutes.add(m);
  return m;
}

// #2: Find the active goalkeeper
function findGoalkeeper(squad: PlayerForStrength[]): PlayerForStrength | null {
  return squad.find(p => p.position === GK_POS) ?? null;
}

// #7: Average overall of top defenders
function defenderAvgOverall(squad: PlayerForStrength[]): number {
  const defenders = squad
    .filter(p => DEFENSE_POS.has(p.position))
    .map(p => calculateOverall(p.attributes, p.position))
    .sort((a, b) => b - a)
    .slice(0, 4);
  if (defenders.length === 0) return 60;
  return defenders.reduce((s, v) => s + v, 0) / defenders.length;
}

// ─── Attack focus & sub strategy modifiers ─────────────────────────────────

interface AttackFocusMods {
  openPlayGoalMult: number;
  cornerGoalMult: number;
  shotOffTargetMult: number;
  finishingConversion: number;
}

function attackFocusModifiers(tactic: Tactic): AttackFocusMods {
  switch (tactic.attackFocus) {
    case 'through_middle':
      return { openPlayGoalMult: 1.10, cornerGoalMult: 0.85, shotOffTargetMult: 1.0, finishingConversion: 1.0 };
    case 'down_the_flanks':
      return { openPlayGoalMult: 0.95, cornerGoalMult: 1.35, shotOffTargetMult: 1.1, finishingConversion: 1.0 };
    case 'counter_attack':
      return { openPlayGoalMult: 1.0, cornerGoalMult: 0.90, shotOffTargetMult: 0.75, finishingConversion: 1.15 };
    case 'possession':
      return { openPlayGoalMult: 0.95, cornerGoalMult: 1.0, shotOffTargetMult: 0.65, finishingConversion: 1.0 };
    case 'balanced':
    default:
      return { openPlayGoalMult: 1.0, cornerGoalMult: 1.0, shotOffTargetMult: 1.0, finishingConversion: 1.0 };
  }
}

function substitutionRate(tactic: Tactic): number {
  switch (tactic.subStrategy) {
    case 'minimal':        return 0.03;
    case 'heavy_rotation': return 0.20;
    case 'youth_chances':  return 0.16;
    case 'chase_the_game': return 0.12;
    case 'balanced':
    default:               return 0.10;
  }
}

// ─── #9: Scaled home advantage ───────────────────────────────────────────────

function homeAdvantageMultiplier(attendance: number): number {
  const ratio = Math.min(1, attendance / STADIUM_CAPACITY);
  return Math.min(HOME_ADVANTAGE_MAX, HOME_ADVANTAGE_BASE + ratio * 0.06);
}

// ─── Team state ──────────────────────────────────────────────────────────────

export interface TeamState {
  squad: PlayerForStrength[];
  bench: PlayerForStrength[]; // #4
  tactic: Tactic;
  takers?: SetPieceTakers; // P7: manager-designated set-piece takers (undefined = auto-pick)
  isHome: boolean;
  strength: TeamStrength;
  goals: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  subsUsed: number;
  yellows: Set<number>;
  reds: Set<number>;
  xG: number; // #2
  fatigueByPlayer: Map<number, number>; // #3
  momentumBlocksLeft: number;           // #5
  momentumType: 'chase' | 'scorer' | 'none'; // #5
  cameInAsSub: Set<number>;
  tackles: number;   // L2 Fase 6 (só incrementado com emitPhaseEvents ON)
  keyPasses: number; // L2 Fase 6
}

function makeTeam(
  squad: PlayerForStrength[],
  bench: PlayerForStrength[],
  tactic: Tactic,
  isHome: boolean,
  homeAdvantageMult: number,
  takers?: SetPieceTakers,
): TeamState {
  return {
    squad: [...squad],
    bench: [...bench],
    tactic,
    takers,
    isHome,
    strength: calculateTeamStrength({ players: squad, tactic, isHome, homeAdvantageMult }),
    goals: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, subsUsed: 0,
    yellows: new Set(), reds: new Set(),
    xG: 0,
    fatigueByPlayer: new Map(squad.map(p => [p.id, 0])),
    momentumBlocksLeft: 0,
    momentumType: 'none',
    cameInAsSub: new Set(),
    tackles: 0,
    keyPasses: 0,
  };
}

function removeAndRecalc(team: TeamState, playerId: number, homeAdvantageMult: number): void {
  team.squad = team.squad.filter(p => p.id !== playerId);
  team.strength = calculateTeamStrength({ players: team.squad, tactic: team.tactic, isHome: team.isHome, homeAdvantageMult });
}

// #3: Drain fatigue each block and optionally recalculate strength every 5 blocks
function drainFatigue(team: TeamState, block: number, homeAdvantageMult: number): void {
  const timeFactor = block / TOTAL_BLOCKS;
  const pressingFactor = team.tactic.pressing === 'high' ? 1 : team.tactic.pressing === 'medium' ? 0.5 : 0;
  const drain = 0.8 + timeFactor * 0.4 + pressingFactor * 0.5;

  for (const p of team.squad) {
    const cur = team.fatigueByPlayer.get(p.id) ?? 0;
    team.fatigueByPlayer.set(p.id, cur + drain);
  }

  // Recalculate every 5 blocks using fitness-adjusted players
  if (block % 5 === 4) {
    const adjusted = team.squad.map(p => ({
      ...p,
      fitness: Math.max(40, p.fitness - (team.fatigueByPlayer.get(p.id) ?? 0)),
    }));
    team.strength = calculateTeamStrength({ players: adjusted, tactic: team.tactic, isHome: team.isHome, homeAdvantageMult });
  }
}

// ─── #4: Smart substitution ──────────────────────────────────────────────────

function pickPlayerOut(team: TeamState, rng: SeededRng): PlayerForStrength | null {
  // Cannot sub out a player who came in as a substitute
  const eligible = team.squad.filter(p => !team.cameInAsSub.has(p.id));
  if (eligible.length === 0) return null;
  const weights = eligible.map(p => {
    let w = team.fatigueByPlayer.get(p.id) ?? 0;
    if (team.yellows.has(p.id)) w += 40;
    if (team.tactic.subStrategy === 'chase_the_game' && DEFENSE_POS.has(p.position)) w += 30;
    return Math.max(1, w);
  });
  return rng.weightedPick(eligible, weights);
}

function pickPlayerIn(
  bench: PlayerForStrength[],
  outPosition: Position,
  tactic: Tactic,
  oppGoalDiff: number, // positive = team is winning
  rng: SeededRng,
): PlayerForStrength | null {
  if (bench.length === 0) return null;

  // Filter by position match (primary or secondary)
  let candidates = bench.filter(p =>
    p.position === outPosition || p.secondaryPosition === outPosition,
  );

  // chase_the_game losing: prefer attackers/CAM
  if (tactic.subStrategy === 'chase_the_game' && oppGoalDiff < 0) {
    const attackers = bench.filter(p => ATTACK_POS.has(p.position) || p.position === 'CAM');
    if (attackers.length > 0) candidates = attackers;
  }

  // youth_chances: prefer age ≤ 21 — we don't have age on PlayerForStrength but
  // can proxy via lower overall (youth tend to lower overall)
  if (tactic.subStrategy === 'youth_chances') {
    // No age on the struct; just pick from remaining bench (randomness simulates youth priority)
    // This is a best-effort implementation.
  }

  if (candidates.length === 0) {
    // No positional match; pick highest overall
    candidates = [...bench].sort(
      (a, b) => calculateOverall(b.attributes, b.position) - calculateOverall(a.attributes, a.position),
    );
  }

  return candidates[0];
}

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

// ─── Main ────────────────────────────────────────────────────────────────────

/** Cria o estado inicial sem rodar bloco algum (currentBlock = 0). */
export function initLiveMatch(input: MatchInput): LiveMatchState {
  const { homeSquad, awaySquad, homeTactic, awayTactic } = input;
  const homeBench = input.homeBench ?? [];
  const awayBench = input.awayBench ?? [];

  // #9: Scaled home advantage
  const attendanceForAdv = input.attendance ?? Math.round(
    (input.homeClubReputation + input.awayClubReputation) / 2 * 500 + 10000,
  );
  const baseHomeAdv = homeAdvantageMultiplier(attendanceForAdv);
  // C1: derby atmosphere amplifies home advantage. Neutral (mult 1) ⇒ unchanged.
  const homeAdv = baseHomeAdv * (input.derbyBonus?.atmosphereMult ?? 1);

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
  const emitPhase = input.emitPhaseEvents === true;
  for (let block = state.currentBlock; block < target; block++) {
    const isSecondHalf = block >= HALF_BLOCK;
    // #3: Drain fatigue at the start of each block
    drainFatigue(home, block, homeAdv);
    drainFatigue(away, block, homeAdv);

    // L2 Fase 6: stream de fase SEPARADA por (fixture, block, lado). null ⇒ legado.
    const homePhaseRng = emitPhase ? new SeededRng(phaseRngSeed(fixtureId, block, 0)) : null;
    const awayPhaseRng = emitPhase ? new SeededRng(phaseRngSeed(fixtureId, block, 1)) : null;
    runBlock(home, away, block, isSecondHalf, fixtureId, events, rng, usedMinutes, homeAdv, homePhaseRng);
    runBlock(away, home, block, isSecondHalf, fixtureId, events, rng, usedMinutes, homeAdv, awayPhaseRng);
  }
  state.currentBlock = Math.max(state.currentBlock, target);
  return state;
}

/**
 * Applies manager overrides to the HOME team only, at the current window boundary.
 * The engine's existing auto-subs stay enabled — manual subs are additive and the
 * shared `subsUsed` cap naturally limits how many auto-subs can follow.
 */
export function applyWindowOverrides(state: LiveMatchState, overrides: SecondHalfOverrides): void {
  const { home, homeAdv, events, usedMinutes, rng } = state;
  const fixtureId = state.input.fixtureId;

  if (overrides.homeTactic) {
    home.tactic = overrides.homeTactic;
    // Recompute strength from the new tactic so the change takes effect,
    // using the same fitness-adjusted players the loop's periodic recalc uses.
    const adjusted = home.squad.map(p => ({
      ...p,
      fitness: Math.max(40, p.fitness - (home.fatigueByPlayer.get(p.id) ?? 0)),
    }));
    home.strength = calculateTeamStrength({ players: adjusted, tactic: home.tactic, isHome: home.isHome, homeAdvantageMult: homeAdv });
  }

  for (const sub of overrides.homeSubs ?? []) {
    const onPitch = home.squad.some(p => p.id === sub.outId);
    const benchPlayer = home.bench.find(p => p.id === sub.inId);
    // Skip invalid ids defensively (out not on pitch, in not on bench).
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
  const { home, away, events, rng, input } = state;
  const { homeSquad, awaySquad } = input;

  // ─── Stats ─────────────────────────────────────────────────────────────
  const totalMid = home.strength.midfield + away.strength.midfield;
  const possBase = totalMid > 0 ? (home.strength.midfield / totalMid) * 100 : 50;
  const passBonus = (home.strength.passingControl - away.strength.passingControl) * 100;
  const homeFormMods = formationModifiers(home.tactic.formation);
  const awayFormMods = formationModifiers(away.tactic.formation);
  const formPossDelta = homeFormMods.possessionDelta - awayFormMods.possessionDelta;

  // #10: Pressing and tempo adjustments on possession
  const homePressingPenalty = away.tactic.pressing === 'high' ? -8 : away.tactic.pressing === 'medium' ? -4 : 0;
  const homeTempoBonus = home.tactic.tempo === 'slow' ? 4 : home.tactic.tempo === 'fast' ? -2 : 0;

  const homePoss = Math.round(
    Math.max(25, Math.min(75,
      possBase + passBonus + formPossDelta + homePressingPenalty + homeTempoBonus + rng.nextFloat(-4, 4),
    )),
  );

  const stats: MatchStats = {
    homePossession: homePoss,
    awayPossession: 100 - homePoss,
    homeShots: home.shots,
    awayShots: away.shots,
    homeShotsOnTarget: home.shotsOnTarget,
    awayShotsOnTarget: away.shotsOnTarget,
    homeFouls: home.fouls * 2 + rng.nextInt(2, 6),
    awayFouls: away.fouls * 2 + rng.nextInt(2, 6),
    homeCorners: home.corners,
    awayCorners: away.corners,
    homeXG: Math.round(home.xG * 100) / 100,
    awayXG: Math.round(away.xG * 100) / 100,
  };

  // L2 Fase 6: agregados de fase só quando ON (ausentes ⇒ legado byte-a-byte).
  if (input.emitPhaseEvents) {
    stats.homeTackles = home.tackles;
    stats.awayTackles = away.tackles;
    stats.homeKeyPasses = home.keyPasses;
    stats.awayKeyPasses = away.keyPasses;
  }

  // ─── Attendance ────────────────────────────────────────────────────────
  const avgRep = (input.homeClubReputation + input.awayClubReputation) / 2;
  const attendance = Math.round(avgRep * 500 + rng.nextInt(0, 10000));

  // ─── Player ratings ────────────────────────────────────────────────────
  // #8: Detect substitutes (came on in last 30min = after minute 60)
  const lateSubIds = new Set<number>(
    events
      .filter(e => e.type === 'substitution' && e.minute >= 60 && e.secondaryPlayerId !== null)
      .map(e => e.secondaryPlayerId as number),
  );

  const hmI: PlayerMatchInput[] = homeSquad.map(p => ({
    id: p.id,
    overall: calculateOverall(p.attributes, p.position),
    position: p.position,
    isLateSub: lateSubIds.has(p.id),
    formModifier: input.homeFormModifiers?.get(p.id),
  }));
  const awI: PlayerMatchInput[] = awaySquad.map(p => ({
    id: p.id,
    overall: calculateOverall(p.attributes, p.position),
    position: p.position,
    isLateSub: lateSubIds.has(p.id),
    formModifier: input.awayFormModifiers?.get(p.id),
  }));
  const homeRatings = calculatePlayerRatings(hmI, events, home.goals > away.goals, away.goals, rng);
  const awayRatings = calculatePlayerRatings(awI, events, away.goals > home.goals, home.goals, rng);

  return { homeGoals: home.goals, awayGoals: away.goals, events, homeRatings, awayRatings, stats, attendance };
}

// ─── Wrappers retrocompat (compose-equals-whole intacto) ─────────────────────

/**
 * Runs the first half (blocks 0..HALF_BLOCK-1) and returns the live snapshot,
 * including the mid-stream rng instance. Pairs with `resumeSecondHalf`.
 */
export function simulateFirstHalf(input: MatchInput): LiveMatchState {
  return simulateSegment(initLiveMatch(input), HALF_BLOCK);
}

/**
 * Resumes from a live snapshot: applies manager overrides to the HOME team,
 * runs to the end (threading the same rng), then computes the full MatchResult.
 */
export function resumeSecondHalf(state: LiveMatchState, overrides?: SecondHalfOverrides): MatchResult {
  if (overrides) applyWindowOverrides(state, overrides);
  simulateSegment(state, TOTAL_BLOCKS);
  return finalizeMatchResult(state);
}

/**
 * Simulates a full match. ONE code path: first half then second half, threading
 * the same live rng instance so determinism is identical to the old monolithic
 * loop (the compose-equals-whole test guards this).
 */
export function simulateMatch(input: MatchInput): MatchResult {
  return resumeSecondHalf(simulateFirstHalf(input));
}

// ─── Block simulation for one team ───────────────────────────────────────────

/**
 * Orquestrador de UM time atacando num bloco. Encadeia os sub-resolvedores na
 * ordem fixa de consumo do rng — esta ordem é a invariante de determinismo
 * byte-a-byte e NÃO pode mudar.
 */
function runBlock(
  team: TeamState, opp: TeamState,
  block: number, isSecondHalf: boolean,
  fixtureId: number, events: MatchEvent[], rng: SeededRng,
  usedMinutes: Set<number>,
  homeAdvantageMult: number,
  phaseRng: SeededRng | null,
): void {
  if (team.squad.length === 0) return;
  const tempo = team.strength.tempo;
  const minute = blockToMinute(block, rng, usedMinutes);
  const focus = attackFocusModifiers(team.tactic);
  const form = formationModifiers(team.tactic.formation);
  const oppForm = formationModifiers(opp.tactic.formation);

  resolveOpenPlay(team, opp, fixtureId, events, rng, minute, tempo, focus, form, oppForm, phaseRng);
  resolveCorner(team, opp, fixtureId, events, rng, minute, focus, form, phaseRng);
  resolvePenalty(team, opp, block, fixtureId, events, rng, usedMinutes, tempo, minute, phaseRng);
  resolveCards(team, opp, block, fixtureId, events, rng, usedMinutes, homeAdvantageMult, minute, phaseRng);
  resolveInjury(team, opp, block, fixtureId, events, rng, usedMinutes, homeAdvantageMult, minute, phaseRng);
  resolveSubstitution(team, opp, block, isSecondHalf, fixtureId, events, rng, usedMinutes, homeAdvantageMult);
}

// ─── L2 Fase 6: emissão de eventos de fase (stream phaseRng, nunca o rng principal) ──

/** Empurra um evento de fase descritivo. Só chamado com phaseRng não-nulo. */
function pushPhaseEvent(
  events: MatchEvent[], fixtureId: number, minute: number,
  type: MatchEventType, playerId: number, secondaryPlayerId: number | null, phase: string,
): void {
  events.push({ fixtureId, minute, type, playerId, secondaryPlayerId, phase });
}

function pickPhaseTeammate(squad: PlayerForStrength[], excludeId: number, rng: SeededRng): PlayerForStrength | null {
  const c = squad.filter(p => p.id !== excludeId);
  if (c.length === 0) return null;
  return rng.pick(c);
}

/**
 * #2/#5: momentum + ataque em jogo aberto (xG, conversão, defesa do GK, escanteio
 * gerado por chute pra fora). Consome o rng vivo na ordem original.
 */
function resolveOpenPlay(
  team: TeamState, opp: TeamState,
  fixtureId: number, events: MatchEvent[], rng: SeededRng,
  minute: number, tempo: number,
  focus: ReturnType<typeof attackFocusModifiers>,
  form: ReturnType<typeof formationModifiers>,
  oppForm: ReturnType<typeof formationModifiers>,
  phaseRng: SeededRng | null,
): void {
  // ── #5: Momentum modifier ─────────────────────────────────────────────
  let momentumAttackMult = 1.0;
  if (team.momentumBlocksLeft > 0) {
    if (team.momentumType === 'chase') {
      momentumAttackMult = team.goals < opp.goals
        ? 1 + MOMENTUM_BOOST_LOSING
        : 1 + MOMENTUM_BOOST_DRAWING;
    } else if (team.momentumType === 'scorer') {
      momentumAttackMult = 1 - MOMENTUM_SCORER_PENALTY;
    }
    team.momentumBlocksLeft--;
  }

  // ── #2: xG-based shot resolution ──────────────────────────────────────
  // Base attack probability (replaces old GOAL_BASE_PROB direct goal path)
  const pressingChanceMod = 1 + (team.strength.pressing - 0.5) * 0.10;
  const attackP =
    GOAL_BASE_PROB * 6 *          // scaled up: was goalP, now shot prob
    tempo *
    (team.strength.attack / Math.max(opp.strength.defense, 1)) *
    focus.openPlayGoalMult *
    form.attackMult *
    momentumAttackMult *
    pressingChanceMod /
    Math.max(0.5, oppForm.defenseMult);

  if (rng.next() < attackP) {
    const scorer = pickScorer(team.squad, rng);
    const gk = findGoalkeeper(opp.squad);

    // xG: chance quality (0..1) blended from scorer finishing and attack/defense ratio
    const attackDefRatio = Math.min(2, team.strength.attack / Math.max(opp.strength.defense, 1));
    const xgChance = Math.min(0.9, (scorer.attributes.finishing / 100) * 0.5 + attackDefRatio * 0.2 + rng.nextFloat(0, 0.15));
    team.xG += xgChance;

    // Conversion = xgChance × finishingConversion focus × individual attacker/defender
    const attackerOverall = calculateOverall(scorer.attributes, scorer.position);
    const defAvg = defenderAvgOverall(opp.squad); // #7
    const defenderMod = Math.min(1.4, Math.max(0.7, 1 + (attackerOverall - defAvg) / 200));
    const conversionRoll = xgChance * focus.finishingConversion * defenderMod;

    if (rng.next() < conversionRoll) {
      // Shot is on target — now GK save check
      team.shots++; team.shotsOnTarget++;

      let gkSaveChance = 0;
      if (gk) {
        gkSaveChance = ((gk.attributes.positioning + gk.attributes.agility + gk.attributes.jumping + gk.attributes.decisions) / 4) / 100 * 0.55;
        // Fatigue reduces GK effectiveness slightly
        const gkFatigue = opp.fatigueByPlayer.get(gk.id) ?? 0;
        gkSaveChance *= Math.max(0.85, 1 - gkFatigue / 200);
      }

      if (gk && rng.next() < gkSaveChance) {
        // Saved!
        events.push({ fixtureId, minute, type: 'save', playerId: gk.id, secondaryPlayerId: scorer.id });
        events.push({ fixtureId, minute, type: 'shot_on_target', playerId: scorer.id, secondaryPlayerId: null, xg: xgChance });
      } else {
        // Goal
        team.goals++;
        events.push({ fixtureId, minute, type: 'goal', playerId: scorer.id, secondaryPlayerId: null, xg: xgChance });
        if (rng.next() < ASSIST_CHANCE) {
          const a = pickAssister(team.squad, scorer.id, rng);
          if (a) events.push({ fixtureId, minute, type: 'assist', playerId: a.id, secondaryPlayerId: scorer.id });
        }
        // #5: Set momentum for both teams after goal
        const goalDiff = team.goals - opp.goals; // from opp's perspective: negative = opp trailing
        opp.momentumBlocksLeft = MOMENTUM_BLOCKS_AFTER_GOAL;
        opp.momentumType = 'chase';
        team.momentumBlocksLeft = MOMENTUM_BLOCKS_AFTER_GOAL;
        team.momentumType = 'scorer';
      }
    } else {
      // Shot off target or wide
      team.shots++;
      events.push({ fixtureId, minute, type: 'shot_off_target', playerId: scorer.id, secondaryPlayerId: null, xg: xgChance });
      if (rng.next() < 0.35) team.corners++;
    }
  } else if (rng.next() < 0.04 * tempo * form.attackMult) {
    // Non-counted SOT (no scorer event — keep stats tracking but no persisted event)
    team.shots++; team.shotsOnTarget++;
  } else if (rng.next() < 0.06 * tempo * focus.shotOffTargetMult * form.attackMult) {
    team.shots++;
    if (rng.next() < 0.35) team.corners++;
  }

  // ── L2 Fase 6: build-up descritivo (phaseRng — não toca o rng acima) ──────
  if (phaseRng) {
    if (phaseRng.next() < 0.5) {
      const passer = phaseRng.weightedPick(team.squad, team.squad.map(p => p.attributes.passing + p.attributes.vision));
      const receiver = pickPhaseTeammate(team.squad, passer.id, phaseRng);
      pushPhaseEvent(events, fixtureId, minute, 'key_pass', passer.id, receiver?.id ?? null, 'open_play');
      team.keyPasses++;
    }
    if (opp.squad.length > 0 && phaseRng.next() < 0.45) {
      const tackler = phaseRng.weightedPick(opp.squad, opp.squad.map(p => p.attributes.aggression + p.attributes.strength));
      pushPhaseEvent(events, fixtureId, minute, 'tackle', tackler.id, null, 'open_play');
      opp.tackles++;
    }
    if (phaseRng.next() < 0.4) {
      const recoverer = phaseRng.pick(team.squad);
      pushPhaseEvent(events, fixtureId, minute, 'recovery', recoverer.id, null, 'open_play');
    }
    if (phaseRng.next() < 0.4) {
      const carrier = phaseRng.pick(team.squad);
      pushPhaseEvent(events, fixtureId, minute, 'possession_change', carrier.id, null, 'open_play');
    }
  }
}

/** Gol de escanteio (cabeçada) com defesa do GK e assistência do cobrador (P7). */
function resolveCorner(
  team: TeamState, opp: TeamState,
  fixtureId: number, events: MatchEvent[], rng: SeededRng,
  minute: number,
  focus: ReturnType<typeof attackFocusModifiers>,
  form: ReturnType<typeof formationModifiers>,
  phaseRng: SeededRng | null,
): void {
  // ── Corner goal (heading) ──────────────────────────────────────────────
  if (team.corners > 0 && rng.next() < CORNER_GOAL_PROB * team.strength.width * focus.cornerGoalMult * form.wingPlayMult * cornerRoutineMultiplier(team.takers?.cornerRoutine)) {
    const scorer = pickHeaderScorer(team.squad, rng);
    const gk = findGoalkeeper(opp.squad);
    team.shots++; team.shotsOnTarget++; team.corners--;

    let gkSaveChance = 0;
    if (gk) {
      gkSaveChance = ((gk.attributes.positioning + gk.attributes.agility + gk.attributes.jumping + gk.attributes.decisions) / 4) / 100 * 0.35; // corners harder to save
    }

    if (gk && rng.next() < gkSaveChance) {
      events.push({ fixtureId, minute, type: 'save', playerId: gk.id, secondaryPlayerId: scorer.id });
      events.push({ fixtureId, minute, type: 'shot_on_target', playerId: scorer.id, secondaryPlayerId: null });
    } else {
      team.goals++;
      events.push({ fixtureId, minute, type: 'goal', playerId: scorer.id, secondaryPlayerId: null });
      // P7: the corner TAKER is the crosser (credited with the assist). A designated
      // corner taker is used only if on-pitch AND not the scorer (pickAssister
      // excludes the scorer); otherwise fall back to the RNG-weighted assister pick.
      const designatedCorner = team.takers?.cornerTakerId;
      const crosser =
        designatedCorner != null && designatedCorner !== scorer.id
          ? resolveTaker(team.squad, designatedCorner, () => pickAssister(team.squad, scorer.id, rng) as PlayerForStrength)
          : pickAssister(team.squad, scorer.id, rng);
      if (crosser) events.push({ fixtureId, minute, type: 'assist', playerId: crosser.id, secondaryPlayerId: scorer.id });
      // #5: momentum
      opp.momentumBlocksLeft = MOMENTUM_BLOCKS_AFTER_GOAL;
      opp.momentumType = 'chase';
      team.momentumBlocksLeft = MOMENTUM_BLOCKS_AFTER_GOAL;
      team.momentumType = 'scorer';
    }
  }

  // ── L2 Fase 6: cruzamento + segunda bola (phaseRng) ──────────────────────
  if (phaseRng && team.squad.length > 0) {
    if (phaseRng.next() < 0.5) {
      const crosser = phaseRng.weightedPick(team.squad, team.squad.map(p => p.attributes.crossing + p.attributes.passing));
      const target = pickPhaseTeammate(team.squad, crosser.id, phaseRng);
      pushPhaseEvent(events, fixtureId, minute, 'key_pass', crosser.id, target?.id ?? null, 'corner');
      team.keyPasses++;
    }
    if (opp.squad.length > 0 && phaseRng.next() < 0.4) {
      const clearer = phaseRng.pick(opp.squad);
      pushPhaseEvent(events, fixtureId, minute, 'recovery', clearer.id, null, 'corner');
    }
  }
}

/** Pênalti em jogo aberto: cobrança designada (P7) ou melhor finalizador. */
function resolvePenalty(
  team: TeamState, opp: TeamState,
  block: number, fixtureId: number, events: MatchEvent[], rng: SeededRng,
  usedMinutes: Set<number>, tempo: number,
  minute: number, phaseRng: SeededRng | null,
): void {
  // ── L2 Fase 6: falta dentro da área (desarme do adversário) ──────────────
  if (phaseRng && opp.squad.length > 0 && phaseRng.next() < 0.3) {
    const tackler = phaseRng.weightedPick(opp.squad, opp.squad.map(p => p.attributes.aggression + p.attributes.strength));
    pushPhaseEvent(events, fixtureId, minute, 'tackle', tackler.id, null, 'penalty_box');
    opp.tackles++;
  }

  // ── Penalty ────────────────────────────────────────────────────────────
  const penP = PENALTY_PROB * tempo * (team.strength.attack / Math.max(opp.strength.defense, 1));
  if (rng.next() < penP) {
    const taker = resolveTaker(
      team.squad,
      team.takers?.penaltyTakerId,
      () => bestAttr(team.squad, p => p.attributes.finishing + p.attributes.composure),
    );
    const penMin = blockToMinute(block, rng, usedMinutes);
    const chance = 0.6 + (taker.attributes.composure + taker.attributes.finishing) / 200 * 0.3;
    team.shots++;
    if (rng.next() < chance) {
      team.goals++; team.shotsOnTarget++;
      events.push({ fixtureId, minute: penMin, type: 'penalty_scored', playerId: taker.id, secondaryPlayerId: null });
      opp.momentumBlocksLeft = MOMENTUM_BLOCKS_AFTER_GOAL;
      opp.momentumType = 'chase';
      team.momentumBlocksLeft = MOMENTUM_BLOCKS_AFTER_GOAL;
      team.momentumType = 'scorer';
    } else {
      events.push({ fixtureId, minute: penMin, type: 'penalty_missed', playerId: taker.id, secondaryPlayerId: null });
    }
  }

}

/**
 * Cartões: amarelo (com 2º amarelo→vermelho) e vermelho direto, cada um com
 * follow-up de pênalti/falta sofridos pelo adversário.
 */
function resolveCards(
  team: TeamState, opp: TeamState,
  block: number, fixtureId: number, events: MatchEvent[], rng: SeededRng,
  usedMinutes: Set<number>, homeAdvantageMult: number,
  minute: number, phaseRng: SeededRng | null,
): void {
  // ── L2 Fase 6: o desarme/falta que origina o lance disciplinar ───────────
  if (phaseRng && team.squad.length > 0 && phaseRng.next() < 0.3) {
    const fouler = phaseRng.weightedPick(team.squad, team.squad.map(p => p.attributes.aggression + 20));
    pushPhaseEvent(events, fixtureId, minute, 'tackle', fouler.id, null, 'foul');
    team.tackles++;
  }

  // ── Yellow card ────────────────────────────────────────────────────────
  const yelP = YELLOW_BASE_PROB * (1 + team.strength.pressing * 0.6 + opp.strength.pressing * 0.3);
  if (rng.next() < yelP) {
    // #6: weighted by aggression
    const player = rng.weightedPick(team.squad, team.squad.map(p => p.attributes.aggression + 20));
    const cMin = blockToMinute(block, rng, usedMinutes);
    team.fouls++;
    events.push({ fixtureId, minute: cMin, type: 'yellow', playerId: player.id, secondaryPlayerId: null });

    if (team.yellows.has(player.id)) {
      events.push({ fixtureId, minute: cMin, type: 'red', playerId: player.id, secondaryPlayerId: null });
      team.reds.add(player.id);
      team.yellows.delete(player.id);
      removeAndRecalc(team, player.id, homeAdvantageMult);
    } else {
      team.yellows.add(player.id);
    }

    if (opp.squad.length > 0) {
      const followUpMin = nextMinute(cMin, usedMinutes);
      const roll = rng.next();
      if (roll < YELLOW_PENALTY_CHANCE) {
        const taker = resolveTaker(
          opp.squad,
          opp.takers?.penaltyTakerId,
          () => bestAttr(opp.squad, p => p.attributes.finishing + p.attributes.composure),
        );
        const chance = 0.6 + (taker.attributes.composure + taker.attributes.finishing) / 200 * 0.3;
        opp.shots++;
        if (rng.next() < chance) {
          opp.goals++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_scored', playerId: taker.id, secondaryPlayerId: null });
        } else {
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_missed', playerId: taker.id, secondaryPlayerId: null });
        }
      } else if (roll < YELLOW_PENALTY_CHANCE + YELLOW_FREEKICK_CHANCE) {
        const fk = resolveTaker(
          opp.squad,
          opp.takers?.freeKickTakerId,
          () => bestAttr(opp.squad, p => p.attributes.freeKicks),
        );
        const scoreChance = fk.attributes.freeKicks / 100 * 0.35;
        opp.shots++;
        if (rng.next() < scoreChance) {
          opp.goals++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'free_kick_scored', playerId: fk.id, secondaryPlayerId: null });
        } else {
          events.push({ fixtureId, minute: followUpMin, type: 'free_kick_missed', playerId: fk.id, secondaryPlayerId: null });
        }
      }
    }
  }

  // ── Direct red card ────────────────────────────────────────────────────
  if (rng.next() < RED_DIRECT_PROB && team.squad.length > 1) {
    const player = rng.weightedPick(team.squad, team.squad.map(p => p.attributes.aggression + 20));
    const rMin = blockToMinute(block, rng, usedMinutes);
    events.push({ fixtureId, minute: rMin, type: 'red', playerId: player.id, secondaryPlayerId: null });
    team.reds.add(player.id);
    removeAndRecalc(team, player.id, homeAdvantageMult);

    if (opp.squad.length > 0) {
      const followUpMin = nextMinute(rMin, usedMinutes);
      const roll = rng.next();
      if (roll < RED_PENALTY_CHANCE) {
        const taker = resolveTaker(
          opp.squad,
          opp.takers?.penaltyTakerId,
          () => bestAttr(opp.squad, p => p.attributes.finishing + p.attributes.composure),
        );
        const chance = 0.6 + (taker.attributes.composure + taker.attributes.finishing) / 200 * 0.3;
        opp.shots++;
        if (rng.next() < chance) {
          opp.goals++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_scored', playerId: taker.id, secondaryPlayerId: null });
        } else {
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_missed', playerId: taker.id, secondaryPlayerId: null });
        }
      } else if (roll < RED_PENALTY_CHANCE + RED_FREEKICK_CHANCE) {
        const fk = resolveTaker(
          opp.squad,
          opp.takers?.freeKickTakerId,
          () => bestAttr(opp.squad, p => p.attributes.freeKicks),
        );
        const scoreChance = fk.attributes.freeKicks / 100 * 0.35;
        opp.shots++;
        if (rng.next() < scoreChance) {
          opp.goals++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'free_kick_scored', playerId: fk.id, secondaryPlayerId: null });
        } else {
          events.push({ fixtureId, minute: followUpMin, type: 'free_kick_missed', playerId: fk.id, secondaryPlayerId: null });
        }
      }
    }
  }

}

/** Lesão que força substituição (ou expulsa em campo se sem reservas). */
function resolveInjury(
  team: TeamState, opp: TeamState,
  block: number, fixtureId: number, events: MatchEvent[], rng: SeededRng,
  usedMinutes: Set<number>, homeAdvantageMult: number,
  minute: number, phaseRng: SeededRng | null,
): void {
  // ── L2 Fase 6: disputa física que pode gerar a lesão ─────────────────────
  if (phaseRng && opp.squad.length > 0 && phaseRng.next() < 0.25) {
    const tackler = phaseRng.weightedPick(opp.squad, opp.squad.map(p => p.attributes.aggression + p.attributes.strength));
    pushPhaseEvent(events, fixtureId, minute, 'tackle', tackler.id, null, 'duel');
    opp.tackles++;
  }

  // ── Injury (forces substitution) ───────────────────────────────────────
  if (rng.next() < INJURY_PROB && team.squad.length > 1) {
    const player = rng.pick(team.squad);
    const iMin = blockToMinute(block, rng, usedMinutes);
    events.push({ fixtureId, minute: iMin, type: 'injury', playerId: player.id, secondaryPlayerId: null });

    if (team.subsUsed < MAX_SUBS && team.bench.length > 0) {
      const subIn = pickPlayerIn(team.bench, player.position, team.tactic, team.goals - opp.goals, rng);
      events.push({ fixtureId, minute: iMin, type: 'substitution', playerId: player.id, secondaryPlayerId: subIn?.id ?? null });
      removeAndRecalc(team, player.id, homeAdvantageMult);
      if (subIn) {
        team.squad.push(subIn);
        team.bench = team.bench.filter(p => p.id !== subIn.id);
        team.fatigueByPlayer.set(subIn.id, 0);
        team.cameInAsSub.add(subIn.id);
      }
      team.subsUsed++;
    } else {
      removeAndRecalc(team, player.id, homeAdvantageMult);
    }
  }

}

/** Substituição inteligente (só 2º tempo), com taxa ajustada por subStrategy. */
function resolveSubstitution(
  team: TeamState, opp: TeamState,
  block: number, isSecondHalf: boolean,
  fixtureId: number, events: MatchEvent[], rng: SeededRng,
  usedMinutes: Set<number>, homeAdvantageMult: number,
): void {
  // ── Regular substitution (second half only) ────────────────────────────
  if (isSecondHalf && team.subsUsed < MAX_SUBS && team.squad.length > 1 && team.bench.length > 0) {
    let rate = substitutionRate(team.tactic);

    if (team.tactic.subStrategy === 'chase_the_game') {
      const diff = team.goals - opp.goals;
      if (diff <= -2) rate *= 2.0;
      else if (diff === -1) rate *= 1.4;
      else if (diff >= 2) rate *= 0.5;
    }

    if (rng.next() < rate) {
      const sMin = blockToMinute(block, rng, usedMinutes);
      const out = pickPlayerOut(team, rng);
      if (out) {
        const inn = pickPlayerIn(team.bench, out.position, team.tactic, team.goals - opp.goals, rng);
        events.push({ fixtureId, minute: sMin, type: 'substitution', playerId: out.id, secondaryPlayerId: inn?.id ?? null });
        removeAndRecalc(team, out.id, homeAdvantageMult);
        if (inn) {
          team.squad.push(inn);
          team.bench = team.bench.filter(p => p.id !== inn.id);
          team.fatigueByPlayer.set(inn.id, 0);
          team.cameInAsSub.add(inn.id);
        }
        team.subsUsed++;
      }
    }
  }
}
