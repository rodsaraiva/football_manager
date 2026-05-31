import { colors } from '@/theme/tokens';
import { Position } from '@/types';

// Single home for player position/rating colors (was duplicated in 4 screens,
// one with a drifted >=40 tier). Imports the RN-free tokens so it stays testable.

export function getPositionColor(position: Position | string): string {
  if (position === 'GK') return colors.positionGK;
  if (['CB', 'LB', 'RB'].includes(position)) return colors.positionDef;
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return colors.positionMid;
  return colors.positionAtk; // LW, RW, ST
}

export function getOverallColor(overall: number): string {
  if (overall >= 85) return colors.ratingElite;
  if (overall >= 75) return colors.ratingGood;
  if (overall >= 60) return colors.ratingAverage;
  if (overall >= 40) return colors.ratingPoor;
  return colors.ratingBad;
}

// Stat bars use the same ramp as overall — aliased so they can never drift apart.
export const getBarColor = getOverallColor;
