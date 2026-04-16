import { colors } from '@/theme';
import { Position } from '@/types';

export function getPositionColor(position: Position | string): string {
  if (position === 'GK') return '#f4a261';
  if (['CB', 'LB', 'RB'].includes(position)) return colors.primary;
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return colors.success;
  return colors.accent;
}

export function getOverallColor(overall: number): string {
  if (overall >= 85) return '#00e676';
  if (overall >= 75) return colors.success;
  if (overall >= 60) return colors.warning;
  if (overall >= 40) return '#ff9800';
  return colors.danger;
}
