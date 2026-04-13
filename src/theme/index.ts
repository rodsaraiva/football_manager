import { StyleSheet } from 'react-native';

export const colors = {
  background: '#0f0f1a',
  surface: '#1a1a2e',
  surfaceLight: '#252540',
  primary: '#4361ee',
  primaryLight: '#6b8cff',
  accent: '#f72585',
  success: '#06d6a0',
  warning: '#ffd166',
  danger: '#ef476f',
  text: '#ffffff',
  textSecondary: '#a0a0b8',
  textMuted: '#6c6c80',
  border: '#2a2a45',
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const fontSize = { xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 28, title: 34 };

export const commonStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginHorizontal: spacing.md, marginVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: 'bold' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.md },
  label: { color: colors.textMuted, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 1 },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: spacing.lg, alignItems: 'center' },
  buttonText: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
});
