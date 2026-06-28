import { colors } from '@/theme';
import { luminance } from '@/theme/club-accent';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'primary' | 'accent';
export interface BadgeResolved { backgroundColor: string; textColor: string; }

const TEXT_FLIP_LUM = 140;
const on = (bg: string) => (luminance(bg) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff');

export function resolveBadgeStyle(tone: BadgeTone, accent: string): BadgeResolved {
  const bg: Record<BadgeTone, string> = {
    neutral: colors.surfaceLight,
    success: colors.success,
    danger: colors.danger,
    warning: colors.warning,
    primary: colors.primary,
    accent,
  };
  return { backgroundColor: bg[tone], textColor: on(bg[tone]) };
}
