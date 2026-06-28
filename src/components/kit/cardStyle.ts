import { colors, spacing, radius, elevation } from '@/theme';

export type CardVariant = 'hero' | 'summary' | 'detail';

export interface CardResolved {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  padding: number;
  elevation: {
    shadowColor: string; shadowOpacity: number; shadowRadius: number;
    shadowOffset: { width: number; height: number }; elevation: number;
  };
}

export function resolveCardStyle(variant: CardVariant, accent: string): CardResolved {
  switch (variant) {
    case 'hero':
      return { backgroundColor: colors.surfaceLight, borderColor: accent, borderWidth: 1, radius: radius.lg, padding: spacing.lg, elevation: elevation.e3 };
    case 'summary':
      return { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, radius: radius.lg, padding: spacing.md, elevation: elevation.e2 };
    case 'detail':
    default:
      return { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, radius: radius.md, padding: spacing.md, elevation: elevation.e1 };
  }
}
