import { getBarColor } from '@/utils/player-colors';
import { mixWithWhite } from '@/theme/club-accent';

export interface StatBarResolved {
  fillPercent: number;
  colorStart: string;
  colorEnd: string;
  valueColor: string;
}

// accent (opcional) sobrescreve a cor de rating — usado por StatBar tone='accent'
// para tingir a barra pela cor do clube em vez do gradiente de overall.
export function resolveStatBar(value: number, maxValue: number, accent?: string): StatBarResolved {
  const clamped = Math.max(0, Math.min(value, maxValue));
  const fillPercent = (clamped / maxValue) * 100;
  const end = accent ?? getBarColor(value);
  return { fillPercent, colorStart: mixWithWhite(end, 0.35), colorEnd: end, valueColor: end };
}
