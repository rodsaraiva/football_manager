import { calculateOverall } from '@/utils/overall';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';

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
}

export interface TeamStrength {
  overall: number;
  attack: number;
  midfield: number;
  defense: number;
}

const DEFENSE_POSITIONS = new Set<Position>(['GK', 'CB', 'LB', 'RB']);
const MIDFIELD_POSITIONS = new Set<Position>(['CDM', 'CM', 'CAM', 'LM', 'RM']);
const ATTACK_POSITIONS = new Set<Position>(['ST', 'LW', 'RW']);

const HOME_ADVANTAGE = 1.07;

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
  const { players, isHome } = input;

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

  const defense = average(defenseRatings);
  const midfield = average(midfieldRatings);
  const attack = average(attackRatings);

  const sectors = [defense, midfield, attack].filter((v) => v > 0);
  let overall = average(sectors);

  if (isHome) {
    overall *= HOME_ADVANTAGE;
  }

  return { overall, attack, midfield, defense };
}
