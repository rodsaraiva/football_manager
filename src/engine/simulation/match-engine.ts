import { MatchEvent, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { PlayerForStrength, TeamStrength, calculateTeamStrength } from './team-strength';
import { PlayerRating, PlayerMatchInput, calculatePlayerRatings } from './player-rating';
import { calculateOverall } from '@/utils/overall';

export interface MatchInput {
  fixtureId: number;
  homeSquad: PlayerForStrength[];
  awaySquad: PlayerForStrength[];
  homeTactic: Tactic;
  awayTactic: Tactic;
  homeClubReputation: number;
  awayClubReputation: number;
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
const SHOT_ON_TARGET_PROB = 0.04;
const SHOT_OFF_TARGET_PROB = 0.06;
const YELLOW_BASE_PROB = 0.008;
const RED_DIRECT_PROB = 0.0005;
const INJURY_PROB = 0.002;
// SUB_PROB removed — substitution rate now comes from tactic.subStrategy
// via the substitutionRate() helper.
const PENALTY_PROB = 0.003;
const CORNER_GOAL_PROB = 0.05;
const FREEKICK_GOAL_PROB = 0.03;
const ASSIST_CHANCE = 0.70;
const MAX_SUBS = 5;

// ─── Post-card follow-up probabilities ──────────────────────────────────────
const YELLOW_FREEKICK_CHANCE = 0.25;  // 25% chance of a free kick shot after yellow
const YELLOW_PENALTY_CHANCE = 0.05;   // 5% chance of penalty after yellow (foul in box)
const RED_FREEKICK_CHANCE = 0.20;     // 20% chance of a free kick shot after red
const RED_PENALTY_CHANCE = 0.30;      // 30% chance of penalty after direct red

const ATTACK_POS = new Set<string>(['ST', 'LW', 'RW']);
const HEADER_POS = new Set<string>(['CB', 'ST']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a unique minute for this block. Avoids collisions with already-used minutes. */
function blockToMinute(block: number, rng: SeededRng, usedMinutes: Set<number>): number {
  const start = block * 3 + 1;
  let minute = rng.nextInt(start, Math.min(start + 2, 90));
  // Shift forward until we find an unused minute (max 90)
  while (usedMinutes.has(minute) && minute < 90) minute++;
  if (usedMinutes.has(minute)) {
    // Shift backward from original
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

/** Returns the next available minute after `base`, capped at 90. */
function nextMinute(base: number, usedMinutes: Set<number>): number {
  let m = Math.min(base + 1, 90);
  while (usedMinutes.has(m) && m < 90) m++;
  usedMinutes.add(m);
  return m;
}

// ─── Attack focus & sub strategy modifiers ─────────────────────────────────

interface AttackFocusMods {
  openPlayGoalMult: number;   // multiplies the base goal probability
  cornerGoalMult: number;     // multiplies corner-goal probability
  shotOffTargetMult: number;  // multiplies off-target shot probability
  finishingConversion: number;// shot → goal conversion bonus (counter-attack)
}

function attackFocusModifiers(tactic: Tactic): AttackFocusMods {
  switch (tactic.attackFocus) {
    case 'through_middle':
      return { openPlayGoalMult: 1.10, cornerGoalMult: 0.85, shotOffTargetMult: 1.0, finishingConversion: 1.0 };
    case 'down_the_flanks':
      return { openPlayGoalMult: 0.95, cornerGoalMult: 1.35, shotOffTargetMult: 1.1, finishingConversion: 1.0 };
    case 'counter_attack':
      // Fewer shots overall, but better conversion on the ones that happen
      return { openPlayGoalMult: 1.0, cornerGoalMult: 0.90, shotOffTargetMult: 0.75, finishingConversion: 1.15 };
    case 'possession':
      // More shots on target, fewer wild attempts, slightly fewer goals
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
    case 'youth_chances':  return 0.16; // like heavy rotation, but we'd prefer bench randomness
    case 'chase_the_game': return 0.12; // slightly above baseline; reactive logic below
    case 'balanced':
    default:               return 0.10;
  }
}

// ─── Team state ──────────────────────────────────────────────────────────────

interface TeamState {
  squad: PlayerForStrength[];
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
}

function makeTeam(squad: PlayerForStrength[], tactic: Tactic, isHome: boolean): TeamState {
  return {
    squad: [...squad],
    tactic,
    isHome,
    strength: calculateTeamStrength({ players: squad, tactic, isHome }),
    goals: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, subsUsed: 0,
    yellows: new Set(), reds: new Set(),
  };
}

function removeAndRecalc(team: TeamState, playerId: number): void {
  team.squad = team.squad.filter(p => p.id !== playerId);
  team.strength = calculateTeamStrength({ players: team.squad, tactic: team.tactic, isHome: team.isHome });
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function simulateMatch(input: MatchInput): MatchResult {
  const { rng, fixtureId, homeSquad, awaySquad, homeTactic, awayTactic } = input;

  const home = makeTeam(homeSquad, homeTactic, true);
  const away = makeTeam(awaySquad, awayTactic, false);
  const events: MatchEvent[] = [];
  const usedMinutes = new Set<number>();

  for (let block = 0; block < TOTAL_BLOCKS; block++) {
    const isSecondHalf = block >= HALF_BLOCK;
    runBlock(home, away, block, isSecondHalf, fixtureId, events, rng, usedMinutes);
    runBlock(away, home, block, isSecondHalf, fixtureId, events, rng, usedMinutes);
  }

  // ─── Stats ─────────────────────────────────────────────────────────────
  const totalMid = home.strength.midfield + away.strength.midfield;
  const possBase = totalMid > 0 ? (home.strength.midfield / totalMid) * 100 : 50;
  const passBonus = (home.strength.passingControl - away.strength.passingControl) * 100;
  const homePoss = Math.round(Math.max(25, Math.min(75, possBase + passBonus + rng.nextFloat(-4, 4))));

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
  };

  // ─── Attendance ────────────────────────────────────────────────────────
  const avgRep = (input.homeClubReputation + input.awayClubReputation) / 2;
  const attendance = Math.round(avgRep * 500 + rng.nextInt(0, 10000));

  // ─── Player ratings ────────────────────────────────────────────────────
  const hmI: PlayerMatchInput[] = homeSquad.map(p => ({ id: p.id, overall: calculateOverall(p.attributes, p.position), position: p.position }));
  const awI: PlayerMatchInput[] = awaySquad.map(p => ({ id: p.id, overall: calculateOverall(p.attributes, p.position), position: p.position }));
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
): void {
  if (team.squad.length === 0) return;
  const tempo = team.strength.tempo;
  const minute = blockToMinute(block, rng, usedMinutes);
  const focus = attackFocusModifiers(team.tactic);

  // ── Open play goal ─────────────────────────────────────────────────────
  const goalP =
    GOAL_BASE_PROB *
    tempo *
    (team.strength.attack / Math.max(opp.strength.defense, 1)) *
    focus.openPlayGoalMult *
    focus.finishingConversion;
  if (rng.next() < goalP) {
    const scorer = pickScorer(team.squad, rng);
    team.goals++; team.shots++; team.shotsOnTarget++;
    events.push({ fixtureId, minute, type: 'goal', playerId: scorer.id, secondaryPlayerId: null });
    if (rng.next() < ASSIST_CHANCE) {
      const a = pickAssister(team.squad, scorer.id, rng);
      if (a) events.push({ fixtureId, minute, type: 'assist', playerId: a.id, secondaryPlayerId: scorer.id });
    }
  } else if (rng.next() < SHOT_ON_TARGET_PROB * tempo) {
    team.shots++; team.shotsOnTarget++;
  } else if (rng.next() < SHOT_OFF_TARGET_PROB * tempo * focus.shotOffTargetMult) {
    team.shots++;
    if (rng.next() < 0.35) team.corners++;
  }

  // ── Corner goal (heading) ──────────────────────────────────────────────
  if (team.corners > 0 && rng.next() < CORNER_GOAL_PROB * team.strength.width * focus.cornerGoalMult) {
    const scorer = pickHeaderScorer(team.squad, rng);
    team.goals++; team.shots++; team.shotsOnTarget++; team.corners--;
    events.push({ fixtureId, minute, type: 'goal', playerId: scorer.id, secondaryPlayerId: null });
    const crosser = pickAssister(team.squad, scorer.id, rng);
    if (crosser) events.push({ fixtureId, minute, type: 'assist', playerId: crosser.id, secondaryPlayerId: scorer.id });
  }

  // ── Penalty ────────────────────────────────────────────────────────────
  const penP = PENALTY_PROB * tempo * (team.strength.attack / Math.max(opp.strength.defense, 1));
  if (rng.next() < penP) {
    const taker = bestAttr(team.squad, p => p.attributes.finishing + p.attributes.composure);
    const penMin = blockToMinute(block, rng, usedMinutes);
    const chance = 0.6 + (taker.attributes.composure + taker.attributes.finishing) / 200 * 0.3;
    if (rng.next() < chance) {
      team.goals++; team.shots++; team.shotsOnTarget++;
      events.push({ fixtureId, minute: penMin, type: 'penalty_scored', playerId: taker.id, secondaryPlayerId: null });
    } else {
      team.shots++;
      events.push({ fixtureId, minute: penMin, type: 'penalty_missed', playerId: taker.id, secondaryPlayerId: null });
    }
  }

  // ── Yellow card ────────────────────────────────────────────────────────
  const yelP = YELLOW_BASE_PROB * (1 + team.strength.pressing * 0.6 + opp.strength.pressing * 0.3);
  if (rng.next() < yelP) {
    const player = rng.pick(team.squad);
    const cMin = blockToMinute(block, rng, usedMinutes);
    team.fouls++;
    events.push({ fixtureId, minute: cMin, type: 'yellow', playerId: player.id, secondaryPlayerId: null });

    if (team.yellows.has(player.id)) {
      // Second yellow = red
      events.push({ fixtureId, minute: cMin, type: 'red', playerId: player.id, secondaryPlayerId: null });
      team.reds.add(player.id);
      team.yellows.delete(player.id);
      removeAndRecalc(team, player.id);
    } else {
      team.yellows.add(player.id);
    }

    // Follow-up: free kick or penalty for opponent in the next minute
    if (opp.squad.length > 0) {
      const followUpMin = nextMinute(cMin, usedMinutes);
      const roll = rng.next();
      if (roll < YELLOW_PENALTY_CHANCE) {
        // Penalty
        const taker = bestAttr(opp.squad, p => p.attributes.finishing + p.attributes.composure);
        const chance = 0.6 + (taker.attributes.composure + taker.attributes.finishing) / 200 * 0.3;
        if (rng.next() < chance) {
          opp.goals++; opp.shots++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_scored', playerId: taker.id, secondaryPlayerId: null });
        } else {
          opp.shots++;
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_missed', playerId: taker.id, secondaryPlayerId: null });
        }
      } else if (roll < YELLOW_PENALTY_CHANCE + YELLOW_FREEKICK_CHANCE) {
        // Free kick shot
        const fk = bestAttr(opp.squad, p => p.attributes.freeKicks);
        const scoreChance = fk.attributes.freeKicks / 100 * 0.35;
        if (rng.next() < scoreChance) {
          opp.goals++; opp.shots++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'free_kick_scored', playerId: fk.id, secondaryPlayerId: null });
        } else {
          opp.shots++;
          events.push({ fixtureId, minute: followUpMin, type: 'free_kick_missed', playerId: fk.id, secondaryPlayerId: null });
        }
      }
    }
  }

  // ── Direct red card ────────────────────────────────────────────────────
  if (rng.next() < RED_DIRECT_PROB && team.squad.length > 1) {
    const player = rng.pick(team.squad);
    const rMin = blockToMinute(block, rng, usedMinutes);
    events.push({ fixtureId, minute: rMin, type: 'red', playerId: player.id, secondaryPlayerId: null });
    team.reds.add(player.id);
    removeAndRecalc(team, player.id);

    // Follow-up: penalty or free kick for opponent in the next minute
    if (opp.squad.length > 0) {
      const followUpMin = nextMinute(rMin, usedMinutes);
      const roll = rng.next();
      if (roll < RED_PENALTY_CHANCE) {
        // Penalty (higher chance after direct red)
        const taker = bestAttr(opp.squad, p => p.attributes.finishing + p.attributes.composure);
        const chance = 0.6 + (taker.attributes.composure + taker.attributes.finishing) / 200 * 0.3;
        if (rng.next() < chance) {
          opp.goals++; opp.shots++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_scored', playerId: taker.id, secondaryPlayerId: null });
        } else {
          opp.shots++;
          events.push({ fixtureId, minute: followUpMin, type: 'penalty_missed', playerId: taker.id, secondaryPlayerId: null });
        }
      } else if (roll < RED_PENALTY_CHANCE + RED_FREEKICK_CHANCE) {
        // Free kick shot
        const fk = bestAttr(opp.squad, p => p.attributes.freeKicks);
        const scoreChance = fk.attributes.freeKicks / 100 * 0.35;
        if (rng.next() < scoreChance) {
          opp.goals++; opp.shots++; opp.shotsOnTarget++;
          events.push({ fixtureId, minute: followUpMin, type: 'free_kick_scored', playerId: fk.id, secondaryPlayerId: null });
        } else {
          opp.shots++;
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

    if (team.subsUsed < MAX_SUBS) {
      const subIn = team.squad.find(p => p.id !== player.id) ?? null;
      events.push({ fixtureId, minute: iMin, type: 'substitution', playerId: player.id, secondaryPlayerId: subIn?.id ?? null });
      removeAndRecalc(team, player.id);
      team.subsUsed++;
    } else {
      // No subs left — play with fewer players
      removeAndRecalc(team, player.id);
    }
  }

  // ── Regular substitution (second half only) ────────────────────────────
  if (isSecondHalf && team.subsUsed < MAX_SUBS && team.squad.length > 1) {
    let rate = substitutionRate(team.tactic);

    // Chase-the-game: when losing badly, crank rate up; when winning comfortably, ease off
    if (team.tactic.subStrategy === 'chase_the_game') {
      const diff = team.goals - opp.goals;
      if (diff <= -2) rate *= 2.0;
      else if (diff === -1) rate *= 1.4;
      else if (diff >= 2) rate *= 0.5;
    }

    if (rng.next() < rate) {
      const sMin = blockToMinute(block, rng, usedMinutes);
      const out = rng.pick(team.squad);
      const inCandidates = team.squad.filter(p => p.id !== out.id);
      const inn = inCandidates.length > 0 ? rng.pick(inCandidates) : null;
      events.push({ fixtureId, minute: sMin, type: 'substitution', playerId: out.id, secondaryPlayerId: inn?.id ?? null });
      team.subsUsed++;
    }
  }
}
