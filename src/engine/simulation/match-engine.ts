import { MatchEvent } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { PlayerForStrength, calculateTeamStrength } from './team-strength';
import { PlayerRating, PlayerMatchInput, calculatePlayerRatings } from './player-rating';
import { calculateOverall } from '@/utils/overall';

export interface MatchInput {
  fixtureId: number;
  homeSquad: PlayerForStrength[];  // 11 players
  awaySquad: PlayerForStrength[];  // 11 players
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

const GOAL_BASE_PROB = 0.025;
const YELLOW_PROB = 0.012;
const RED_PROB = 0.001;
const INJURY_PROB = 0.003;
const SUB_PROB = 0.15;
const SHOT_MISS_PROB = 0.08;
const ASSIST_CHANCE = 0.70;
const ATTACK_POSITIONS = new Set(['ST', 'LW', 'RW']);
const MAX_SUBS = 3;
const TOTAL_BLOCKS = 18; // 18 blocks × 5 min = 90 min

function pickScorer(squad: PlayerForStrength[], rng: SeededRng): PlayerForStrength {
  const weights = squad.map((p) => {
    const base = p.attributes.finishing + p.attributes.positioning;
    return ATTACK_POSITIONS.has(p.position) ? base * 2 : base;
  });
  return rng.weightedPick(squad, weights);
}

function pickAssist(squad: PlayerForStrength[], scorerId: number, rng: SeededRng): PlayerForStrength | null {
  const candidates = squad.filter((p) => p.id !== scorerId);
  if (candidates.length === 0) return null;
  const weights = candidates.map((p) => p.attributes.passing + p.attributes.vision);
  return rng.weightedPick(candidates, weights);
}

function blockToMinute(block: number, rng: SeededRng): number {
  // block 0 = minutes 1-5, block 1 = minutes 6-10, ..., block 17 = minutes 86-90
  const start = block * 5 + 1;
  const end = Math.min(start + 4, 90);
  return rng.nextInt(start, end);
}

export function simulateMatch(input: MatchInput): MatchResult {
  const { rng, fixtureId, homeSquad, awaySquad, homeTactic, awayTactic } = input;

  const homeStrength = calculateTeamStrength({ players: homeSquad, tactic: homeTactic, isHome: true });
  const awayStrength = calculateTeamStrength({ players: awaySquad, tactic: awayTactic, isHome: false });

  const events: MatchEvent[] = [];
  let homeGoals = 0;
  let awayGoals = 0;
  let homeShots = 0;
  let awayShots = 0;
  let homeCorners = 0;
  let awayCorners = 0;
  let homeFoulsRaw = 0;
  let awayFoulsRaw = 0;

  let homeSubsUsed = 0;
  let awaySubsUsed = 0;
  // Track the minute of the most recent injury (per team) to anchor sub minute >= injury minute
  let homeInjuryMinute: number | null = null;
  let awayInjuryMinute: number | null = null;

  for (let block = 0; block < TOTAL_BLOCKS; block++) {
    const isSecondHalf = block >= 9; // block 9 starts at minute 46

    // --- HOME TEAM events ---
    const homeGoalProb = GOAL_BASE_PROB * (homeStrength.attack / Math.max(awayStrength.defense, 1));
    if (rng.next() < homeGoalProb) {
      const minute = blockToMinute(block, rng);
      const scorer = pickScorer(homeSquad, rng);
      homeGoals++;
      homeShots++;
      events.push({ fixtureId, minute, type: 'goal', playerId: scorer.id, secondaryPlayerId: null });
      if (rng.next() < ASSIST_CHANCE) {
        const assister = pickAssist(homeSquad, scorer.id, rng);
        if (assister) {
          events.push({ fixtureId, minute, type: 'assist', playerId: assister.id, secondaryPlayerId: scorer.id });
        }
      }
    } else if (rng.next() < SHOT_MISS_PROB) {
      homeShots++;
      if (rng.next() < 0.3) homeCorners++;
    }

    // Home yellow card
    if (rng.next() < YELLOW_PROB) {
      const minute = blockToMinute(block, rng);
      const player = rng.pick(homeSquad);
      events.push({ fixtureId, minute, type: 'yellow', playerId: player.id, secondaryPlayerId: null });
      homeFoulsRaw++;
    }

    // Home red card
    if (rng.next() < RED_PROB) {
      const minute = blockToMinute(block, rng);
      const player = rng.pick(homeSquad);
      events.push({ fixtureId, minute, type: 'red', playerId: player.id, secondaryPlayerId: null });
    }

    // Home injury
    if (rng.next() < INJURY_PROB) {
      const injuryMinute = blockToMinute(block, rng);
      const player = rng.pick(homeSquad);
      events.push({ fixtureId, minute: injuryMinute, type: 'injury', playerId: player.id, secondaryPlayerId: null });
      homeInjuryMinute = injuryMinute;
    }

    // Home substitution: only in second half OR if injury occurred this block
    const homeCanSub = homeSubsUsed < MAX_SUBS && (isSecondHalf || homeInjuryMinute !== null);
    if (homeCanSub && rng.next() < SUB_PROB) {
      // If injury-triggered sub, minute must be >= injury minute
      let subMinute: number;
      if (!isSecondHalf && homeInjuryMinute !== null) {
        // Use the injury minute for the sub (immediately after injury)
        subMinute = homeInjuryMinute;
      } else {
        subMinute = blockToMinute(block, rng);
      }
      const player = rng.pick(homeSquad);
      events.push({ fixtureId, minute: subMinute, type: 'substitution', playerId: player.id, secondaryPlayerId: null });
      homeSubsUsed++;
      homeInjuryMinute = null; // reset after sub consumed
    }

    // --- AWAY TEAM events ---
    const awayGoalProb = GOAL_BASE_PROB * (awayStrength.attack / Math.max(homeStrength.defense, 1));
    if (rng.next() < awayGoalProb) {
      const minute = blockToMinute(block, rng);
      const scorer = pickScorer(awaySquad, rng);
      awayGoals++;
      awayShots++;
      events.push({ fixtureId, minute, type: 'goal', playerId: scorer.id, secondaryPlayerId: null });
      if (rng.next() < ASSIST_CHANCE) {
        const assister = pickAssist(awaySquad, scorer.id, rng);
        if (assister) {
          events.push({ fixtureId, minute, type: 'assist', playerId: assister.id, secondaryPlayerId: scorer.id });
        }
      }
    } else if (rng.next() < SHOT_MISS_PROB) {
      awayShots++;
      if (rng.next() < 0.3) awayCorners++;
    }

    // Away yellow card
    if (rng.next() < YELLOW_PROB) {
      const minute = blockToMinute(block, rng);
      const player = rng.pick(awaySquad);
      events.push({ fixtureId, minute, type: 'yellow', playerId: player.id, secondaryPlayerId: null });
      awayFoulsRaw++;
    }

    // Away red card
    if (rng.next() < RED_PROB) {
      const minute = blockToMinute(block, rng);
      const player = rng.pick(awaySquad);
      events.push({ fixtureId, minute, type: 'red', playerId: player.id, secondaryPlayerId: null });
    }

    // Away injury
    if (rng.next() < INJURY_PROB) {
      const injuryMinute = blockToMinute(block, rng);
      const player = rng.pick(awaySquad);
      events.push({ fixtureId, minute: injuryMinute, type: 'injury', playerId: player.id, secondaryPlayerId: null });
      awayInjuryMinute = injuryMinute;
    }

    // Away substitution: only in second half OR if injury occurred
    const awayCanSub = awaySubsUsed < MAX_SUBS && (isSecondHalf || awayInjuryMinute !== null);
    if (awayCanSub && rng.next() < SUB_PROB) {
      let subMinute: number;
      if (!isSecondHalf && awayInjuryMinute !== null) {
        subMinute = awayInjuryMinute;
      } else {
        subMinute = blockToMinute(block, rng);
      }
      const player = rng.pick(awaySquad);
      events.push({ fixtureId, minute: subMinute, type: 'substitution', playerId: player.id, secondaryPlayerId: null });
      awaySubsUsed++;
      awayInjuryMinute = null;
    }
  }

  // --- Stats ---
  const totalMidfield = homeStrength.midfield + awayStrength.midfield;
  const homePossessionRaw = totalMidfield > 0 ? (homeStrength.midfield / totalMidfield) * 100 : 50;
  const possessionVariance = rng.nextFloat(-5, 5);
  const homePossession = Math.round(Math.max(30, Math.min(70, homePossessionRaw + possessionVariance)));
  const awayPossession = 100 - homePossession;

  const homeFouls = homeFoulsRaw * 2 + rng.nextInt(3, 8);
  const awayFouls = awayFoulsRaw * 2 + rng.nextInt(3, 8);

  const totalAttack = homeStrength.attack + awayStrength.attack;
  homeCorners += totalAttack > 0
    ? Math.round((homeStrength.attack / totalAttack) * rng.nextInt(4, 8))
    : rng.nextInt(2, 5);
  awayCorners += totalAttack > 0
    ? Math.round((awayStrength.attack / totalAttack) * rng.nextInt(4, 8))
    : rng.nextInt(2, 5);

  const stats: MatchStats = {
    homePossession,
    awayPossession,
    homeShots,
    awayShots,
    homeFouls,
    awayFouls,
    homeCorners,
    awayCorners,
  };

  // --- Attendance ---
  const avgReputation = (input.homeClubReputation + input.awayClubReputation) / 2;
  const attendance = Math.round(avgReputation * 500 + rng.nextInt(0, 10000));

  // --- Player ratings ---
  const homeWon = homeGoals > awayGoals;
  const awayWon = awayGoals > homeGoals;

  const homeMatchInputs: PlayerMatchInput[] = homeSquad.map((p) => ({
    id: p.id,
    overall: calculateOverall(p.attributes, p.position),
  }));
  const awayMatchInputs: PlayerMatchInput[] = awaySquad.map((p) => ({
    id: p.id,
    overall: calculateOverall(p.attributes, p.position),
  }));

  const homeRatings = calculatePlayerRatings(homeMatchInputs, events, homeWon, rng);
  const awayRatings = calculatePlayerRatings(awayMatchInputs, events, awayWon, rng);

  return {
    homeGoals,
    awayGoals,
    events,
    homeRatings,
    awayRatings,
    stats,
    attendance,
  };
}
