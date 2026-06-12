import { StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from './tokens';

// Re-export pure tokens + helpers so `@/theme` stays the single import surface.
export { colors, spacing, fontSize, radius } from './tokens';
export { alpha } from './alpha';

export const commonStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginHorizontal: spacing.md, marginVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: 'bold' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.md },
  label: { color: colors.textMuted, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 1 },
  // Rule: identity = club accent (chrome: header tint, active tab, ClubBanner);
  // action = blue (colors.primary) for predictable CTAs across clubs. See theme-consistency spec §4.
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: spacing.lg, alignItems: 'center' },
  buttonText: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
});
