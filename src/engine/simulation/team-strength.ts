import { calculateOverall } from '@/utils/overall';
import { PlayerAttributes, Position } from '@/types';
import { Tactic, Mentality, Pressing, PassingStyle, Tempo, Width } from '@/types/tactic';
import { PRESSING_ATTACK_GAIN } from '@/engine/balance';

export interface PlayerForStrength {
  id: number;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
  morale: number;
  fitness: number;
}

export interface TeamStrengthInput {
  players: PlayerForStrength[];
  tactic: Tactic;
  isHome: boolean;
  homeAdvantageMult?: number; // #9: scaled home advantage, defaults to HOME_ADVANTAGE
}

export interface TeamStrength {
  overall: number;
  attack: number;
  midfield: number;
  defense: number;
  pressing: number;    // 0-1 scale, affects card rates & ball recovery
  tempo: number;       // multiplier on event frequency
  width: number;       // multiplier on crossing/corner chances
  passingControl: number; // possession modifier
}

const DEFENSE_POSITIONS = new Set<Position>(['GK', 'CB', 'LB', 'RB']);
const MIDFIELD_POSITIONS = new Set<Position>(['CDM', 'CM', 'CAM', 'LM', 'RM']);
const ATTACK_POSITIONS = new Set<Position>(['ST', 'LW', 'RW']);

const HOME_ADVANTAGE = 1.07;

// ─── Tactic modifiers ────────────────────────────────────────────────────────

const MENTALITY_MOD: Record<Mentality, { attack: number; defense: number }> = {
  defensive: { attack: -0.15, defense: 0.12 },
  balanced:  { attack: 0,     defense: 0 },
  attacking: { attack: 0.18,  defense: -0.12 },
};

const PRESSING_MOD: Record<Pressing, number> = {
  low: 0.3,
  medium: 0.5,
  high: 0.8,
};

const TEMPO_MOD: Record<Tempo, number> = {
  slow: 0.85,
  normal: 1.0,
  fast: 1.15,
};

const WIDTH_MOD: Record<Width, number> = {
  narrow: 0.7,
  normal: 1.0,
  wide: 1.3,
};

const PASSING_MOD: Record<PassingStyle, number> = {
  short: 0.12,   // +12% possession
  mixed: 0,
  direct: -0.08, // -8% possession, but faster transitions
};

// ─── Core calculations ───────────────────────────────────────────────────────

function effectiveRating(player: PlayerForStrength): number {
  const base = calculateOverall(player.attributes, player.position);
  const moraleMod = 1 + (player.morale - 50) / 1000;
  const fitnessMod = 0.85 + (player.fitness / 100) * 0.15;
  return base * moraleMod * fitnessMod;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function calculateTeamStrength(input: TeamStrengthInput): TeamStrength {
  const { players, tactic, isHome, homeAdvantageMult } = input;
  const homeAdv = homeAdvantageMult ?? HOME_ADVANTAGE;

  const defenseRatings: number[] = [];
  const midfieldRatings: number[] = [];
  const attackRatings: number[] = [];

  for (const player of players) {
    const rating = effectiveRating(player);
    if (DEFENSE_POSITIONS.has(player.position)) {
      defenseRatings.push(rating);
    } else if (MIDFIELD_POSITIONS.has(player.position)) {
      midfieldRatings.push(rating);
    } else if (ATTACK_POSITIONS.has(player.position)) {
      attackRatings.push(rating);
    }
  }

  const mentalityMod = MENTALITY_MOD[tactic.mentality];
  const homeFactor = isHome ? homeAdv : 1;
  const pressFactor = PRESSING_MOD[tactic.pressing]; // 0.3 | 0.5 | 0.8, centred at 0.5
  const pressAttackMod = 1 + (pressFactor - 0.5) * PRESSING_ATTACK_GAIN;

  let defense = average(defenseRatings) * (1 + mentalityMod.defense) * homeFactor;
  let midfield = average(midfieldRatings) * homeFactor;
  let attack = average(attackRatings) * (1 + mentalityMod.attack) * homeFactor * pressAttackMod;

  const sectors = [defense, midfield, attack].filter((v) => v > 0);
  let overall = average(sectors); // already reflects homeFactor via the sectors

  // Reduce strength per missing player (red cards remove players)
  const playerPenalty = Math.max(0, 11 - players.length) * 0.08;
  overall *= (1 - playerPenalty);
  attack *= (1 - playerPenalty);
  defense *= (1 - playerPenalty * 0.5);

  return {
    overall,
    attack,
    midfield,
    defense,
    pressing: PRESSING_MOD[tactic.pressing],
    tempo: TEMPO_MOD[tactic.tempo],
    width: WIDTH_MOD[tactic.width],
    passingControl: PASSING_MOD[tactic.passingStyle],
  };
}
