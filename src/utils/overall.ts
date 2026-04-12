import { PlayerAttributes, Position } from '@/types';

type AttributeKey = keyof PlayerAttributes;
type WeightMap = Record<AttributeKey, number>;

/**
 * Position-specific attribute weights. Weights are relative — normalized to sum to 1.
 */
export const POSITION_WEIGHTS: Record<Position, WeightMap> = {
  GK: {
    finishing: 0, passing: 2, crossing: 0, dribbling: 1, heading: 1,
    longShots: 0, freeKicks: 0,
    vision: 2, composure: 4, decisions: 3, positioning: 5, aggression: 1, leadership: 2,
    pace: 1, stamina: 1, strength: 2, agility: 3, jumping: 3,
  },
  CB: {
    finishing: 0, passing: 2, crossing: 0, dribbling: 1, heading: 5,
    longShots: 0, freeKicks: 0,
    vision: 1, composure: 3, decisions: 3, positioning: 5, aggression: 3, leadership: 3,
    pace: 2, stamina: 2, strength: 5, agility: 1, jumping: 4,
  },
  LB: {
    finishing: 0, passing: 3, crossing: 4, dribbling: 2, heading: 1,
    longShots: 0, freeKicks: 0,
    vision: 2, composure: 2, decisions: 2, positioning: 3, aggression: 2, leadership: 1,
    pace: 5, stamina: 4, strength: 2, agility: 3, jumping: 1,
  },
  RB: {
    finishing: 0, passing: 3, crossing: 4, dribbling: 2, heading: 1,
    longShots: 0, freeKicks: 0,
    vision: 2, composure: 2, decisions: 2, positioning: 3, aggression: 2, leadership: 1,
    pace: 5, stamina: 4, strength: 2, agility: 3, jumping: 1,
  },
  CDM: {
    finishing: 1, passing: 4, crossing: 1, dribbling: 2, heading: 2,
    longShots: 1, freeKicks: 0,
    vision: 3, composure: 3, decisions: 4, positioning: 4, aggression: 3, leadership: 3,
    pace: 2, stamina: 4, strength: 4, agility: 2, jumping: 2,
  },
  CM: {
    finishing: 2, passing: 5, crossing: 2, dribbling: 3, heading: 1,
    longShots: 2, freeKicks: 1,
    vision: 5, composure: 3, decisions: 4, positioning: 3, aggression: 2, leadership: 2,
    pace: 2, stamina: 5, strength: 2, agility: 3, jumping: 1,
  },
  CAM: {
    finishing: 3, passing: 5, crossing: 2, dribbling: 4, heading: 0,
    longShots: 3, freeKicks: 2,
    vision: 5, composure: 4, decisions: 4, positioning: 2, aggression: 1, leadership: 1,
    pace: 3, stamina: 3, strength: 1, agility: 4, jumping: 0,
  },
  LM: {
    finishing: 2, passing: 4, crossing: 4, dribbling: 4, heading: 0,
    longShots: 1, freeKicks: 1,
    vision: 3, composure: 2, decisions: 2, positioning: 2, aggression: 1, leadership: 1,
    pace: 5, stamina: 4, strength: 1, agility: 4, jumping: 0,
  },
  RM: {
    finishing: 2, passing: 4, crossing: 4, dribbling: 4, heading: 0,
    longShots: 1, freeKicks: 1,
    vision: 3, composure: 2, decisions: 2, positioning: 2, aggression: 1, leadership: 1,
    pace: 5, stamina: 4, strength: 1, agility: 4, jumping: 0,
  },
  LW: {
    finishing: 4, passing: 3, crossing: 3, dribbling: 5, heading: 0,
    longShots: 2, freeKicks: 1,
    vision: 3, composure: 3, decisions: 2, positioning: 2, aggression: 1, leadership: 0,
    pace: 5, stamina: 3, strength: 1, agility: 5, jumping: 0,
  },
  RW: {
    finishing: 4, passing: 3, crossing: 3, dribbling: 5, heading: 0,
    longShots: 2, freeKicks: 1,
    vision: 3, composure: 3, decisions: 2, positioning: 2, aggression: 1, leadership: 0,
    pace: 5, stamina: 3, strength: 1, agility: 5, jumping: 0,
  },
  ST: {
    finishing: 5, passing: 2, crossing: 0, dribbling: 3, heading: 3,
    longShots: 2, freeKicks: 1,
    vision: 2, composure: 5, decisions: 2, positioning: 5, aggression: 2, leadership: 1,
    pace: 4, stamina: 2, strength: 3, agility: 3, jumping: 2,
  },
};

const ATTRIBUTE_KEYS: AttributeKey[] = [
  'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'longShots', 'freeKicks',
  'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
  'pace', 'stamina', 'strength', 'agility', 'jumping',
];

/**
 * Calculate the positional overall rating for a player.
 * Returns a number 1-99.
 */
export function calculateOverall(attributes: PlayerAttributes, position: Position): number {
  const weights = POSITION_WEIGHTS[position];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key];
    totalWeight += w;
    weightedSum += attributes[key] * w;
  }

  if (totalWeight === 0) return 1;

  const raw = weightedSum / totalWeight;
  return Math.round(Math.max(1, Math.min(99, raw)));
}
