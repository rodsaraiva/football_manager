import { getBarColor } from '@/utils/player-colors';
import { mixWithWhite } from '@/theme/club-accent';

export interface StatBarResolved {
  fillPercent: number;
  colorStart: string;
  colorEnd: string;
  valueColor: string;
}

export function resolveStatBar(value: number, maxValue: number): StatBarResolved {
  const clamped = Math.max(0, Math.min(value, maxValue));
  const fillPercent = (clamped / maxValue) * 100;
  const end = getBarColor(value);
  return { fillPercent, colorStart: mixWithWhite(end, 0.35), colorEnd: end, valueColor: end };
}
