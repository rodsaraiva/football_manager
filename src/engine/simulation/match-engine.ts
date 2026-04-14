import { MatchEvent, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { PlayerForStrength, TeamStrength, calculateTeamStrength } from './team-strength';
import { PlayerRating, PlayerMatchInput, calculatePlayerRatings } from './player-rating';
import { calculateOverall } from '@/utils/overall';
import { formationModifiers } from '../formations';

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

// ─── Constants (tuned for 30 blocks × 3 min, ~2.5 goals/match) ──────────────

const TOTAL_BLOCKS = 30;
const HALF_BLOCK = 15;

const GOAL_BASE_PROB = 0.016;
const SHOT_BASE_PROB = 0.10;       // #2: probability of generating any shot attempt
const YELLOW_BASE_PROB = 0.008;
const RED_DIRECT_PROB = 0.0005;
const INJURY_PROB = 0.002;
const PENALTY_PROB = 0.003;
const CORNER_GOAL_PROB = 0.05;
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

interface TeamState {
  squad: PlayerForStrength[];
  bench: PlayerForStrength[]; // #4
  tactic: Tactic;
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
}

function makeTeam(
  squad: PlayerForStrength[],
  bench: PlayerForStrength[],
  tactic: Tactic,
  isHome: boolean,
  homeAdvantageMult: number,
): TeamState {
  return {
    squad: [...squad],
    bench: [...bench],
    tactic,
    isHome,
    strength: calculateTeamStrength({ players: squad, tactic, isHome, homeAdvantageMult }),
    goals: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, subsUsed: 0,
    yellows: new Set(), reds: new Set(),
    xG: 0,
    fatigueByPlayer: new Map(squad.map(p => [p.id, 0])),
    momentumBlocksLeft: 0,
    momentumType: 'none',
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

function pickPlayerOut(team: TeamState, rng: SeededRng): PlayerForStrength {
  // #6: yellow card holders are higher risk; fatigue also factors in
  const weights = team.squad.map(p => {
    let w = team.fatigueByPlayer.get(p.id) ?? 0;
    if (team.yellows.has(p.id)) w += 40; // risk of 2nd yellow
    if (team.tactic.subStrategy === 'chase_the_game' && DEFENSE_POS.has(p.position)) w += 30;
    return Math.max(1, w);
  });
  return rng.weightedPick(team.squad, weights);
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

// ─── Main ────────────────────────────────────────────────────────────────────

export function simulateMatch(input: MatchInput): MatchResult {
  const { rng, fixtureId, homeSquad, awaySquad, homeTactic, awayTactic } = input;
  const homeBench = input.homeBench ?? [];
  const awayBench = input.awayBench ?? [];

  // #9: Scaled home advantage
  const attendanceForAdv = input.attendance ?? Math.round(
    (input.homeClubReputation + input.awayClubReputation) / 2 * 500 + 10000,
  );
  const homeAdv = homeAdvantageMultiplier(attendanceForAdv);

  const home = makeTeam(homeSquad, homeBench, homeTactic, true, homeAdv);
  const away = makeTeam(awaySquad, awayBench, awayTactic, false, homeAdv);
  const events: MatchEvent[] = [];
  const usedMinutes = new Set<number>();

  for (let block = 0; block < TOTAL_BLOCKS; block++) {
    const isSecondHalf = block >= HALF_BLOCK;
    // #3: Drain fatigue at the start of each block
    drainFatigue(home, block, homeAdv);
    drainFatigue(away, block, homeAdv);

    runBlock(home, away, block, isSecondHalf, fixtureId, events, rng, usedMinutes, homeAdv);
    runBlock(away, home, block, isSecondHalf, fixtureId, events, rng, usedMinutes, homeAdv);
  }

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
  }));
  const awI: PlayerMatchInput[] = awaySquad.map(p => ({
    id: p.id,
    overall: calculateOverall(p.attributes, p.position),
    position: p.position,
    isLateSub: lateSubIds.has(p.id),
  }));
  const homeRatings = calculatePlayerRatings(hmI, events, home.goals > away.goals, away.goals, rng);
  const awayRatings = calculatePlayerRatings(awI, events, away.goals > home.goals, home.goals, rng);

  return { homeGoals: home.goals, awayGoals: away.goals, events, homeRatings, awayRatings, stats, attendance };
}

// ─── Block simulation for one team ───────────────────────────────────────────

function runBlock(
  team: TeamState, opp: TeamState,
  block: number, isSecondHalf: boolean,
  fixtureId: number, events: MatchEvent[], rng: SeededRng,
  usedMinutes: Set<number>,
  homeAdvantageMult: number,
): void {
  if (team.squad.length === 0) return;
  const tempo = team.strength.tempo;
  const minute = blockToMinute(block, rng, usedMinutes);
  const focus = attackFocusModifiers(team.tactic);
  const form = formationModifiers(team.tactic.formation);
  const oppForm = formationModifiers(opp.tactic.formation);

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
  const attackP =
    GOAL_BASE_PROB * 6 *          // scaled up: was goalP, now shot prob
    tempo *
    (team.strength.attack / Math.max(opp.strength.defense, 1)) *
    focus.openPlayGoalMult *
    form.attackMult *
    momentumAttackMult /
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
        events.push({ fixtureId, minute, type: 'shot_on_target', playerId: scorer.id, secondaryPlayerId: null });
      } else {
        // Goal
        team.goals++;
        events.push({ fixtureId, minute, type: 'goal', playerId: scorer.id, secondaryPlayerId: null });
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
      events.push({ fixtureId, minute, type: 'shot_off_target', playerId: scorer.id, secondaryPlayerId: null });
      if (rng.next() < 0.35) team.corners++;
    }
  } else if (rng.next() < 0.04 * tempo * form.attackMult) {
    // Non-counted SOT (no scorer event — keep stats tracking but no persisted event)
    team.shots++; team.shotsOnTarget++;
  } else if (rng.next() < 0.06 * tempo * focus.shotOffTargetMult * form.attackMult) {
    team.shots++;
    if (rng.next() < 0.35) team.corners++;
  }

  // ── Corner goal (heading) ──────────────────────────────────────────────
  if (team.corners > 0 && rng.next() < CORNER_GOAL_PROB * team.strength.width * focus.cornerGoalMult * form.wingPlayMult) {
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
      const crosser = pickAssister(team.squad, scorer.id, rng);
      if (crosser) events.push({ fixtureId, minute, type: 'assist', playerId: crosser.id, secondaryPlayerId: scorer.id });
      // #5: momentum
      opp.momentumBlocksLeft = MOMENTUM_BLOCKS_AFTER_GOAL;
      opp.momentumType = 'chase';
      team.momentumBlocksLeft = MOMENTUM_BLOCKS_AFTER_GOAL;
      team.momentumType = 'scorer';
    }
  }

  // ── Penalty ────────────────────────────────────────────────────────────
  const penP = PENALTY_PROB * tempo * (team.strength.attack / Math.max(opp.strength.defense, 1));
  if (rng.next() < penP) {
    const taker = bestAttr(team.squad, p => p.attributes.finishing + p.attributes.composure);
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
        const taker = bestAttr(opp.squad, p => p.attributes.finishing + p.attributes.composure);
        const chance = 0.6 + (taker.attributes.composure + taker.attributes.finishing) / 200 * 0.3;
        opp.shots++;
        if (rng.next() < chance) {
          opp.goals++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_scored', playerId: taker.id, secondaryPlayerId: null });
        } else {
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_missed', playerId: taker.id, secondaryPlayerId: null });
        }
      } else if (roll < YELLOW_PENALTY_CHANCE + YELLOW_FREEKICK_CHANCE) {
        const fk = bestAttr(opp.squad, p => p.attributes.freeKicks);
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
        const taker = bestAttr(opp.squad, p => p.attributes.finishing + p.attributes.composure);
        const chance = 0.6 + (taker.attributes.composure + taker.attributes.finishing) / 200 * 0.3;
        opp.shots++;
        if (rng.next() < chance) {
          opp.goals++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_scored', playerId: taker.id, secondaryPlayerId: null });
        } else {
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_missed', playerId: taker.id, secondaryPlayerId: null });
        }
      } else if (roll < RED_PENALTY_CHANCE + RED_FREEKICK_CHANCE) {
        const fk = bestAttr(opp.squad, p => p.attributes.freeKicks);
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
        team.fatigueByPlayer.set(subIn.id, 0); // #3: fresh legs
      }
      team.subsUsed++;
    } else if (team.subsUsed < MAX_SUBS) {
      const subIn = team.squad.find(p => p.id !== player.id) ?? null;
      events.push({ fixtureId, minute: iMin, type: 'substitution', playerId: player.id, secondaryPlayerId: subIn?.id ?? null });
      removeAndRecalc(team, player.id, homeAdvantageMult);
      team.subsUsed++;
    } else {
      removeAndRecalc(team, player.id, homeAdvantageMult);
    }
  }

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
      const out = pickPlayerOut(team, rng); // #4+#6: smart pick
      const inn = pickPlayerIn(team.bench, out.position, team.tactic, team.goals - opp.goals, rng);
      events.push({ fixtureId, minute: sMin, type: 'substitution', playerId: out.id, secondaryPlayerId: inn?.id ?? null });
      removeAndRecalc(team, out.id, homeAdvantageMult);
      if (inn) {
        team.squad.push(inn);
        team.bench = team.bench.filter(p => p.id !== inn.id);
        team.fatigueByPlayer.set(inn.id, 0); // #3: fresh
      }
      team.subsUsed++;
    }
  }
}
