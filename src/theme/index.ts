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

  // Report category palette
  reportTechnical: '#4361ee',   // primary blue — assistant técnico
  reportAnalytics: '#7b2d8b',   // purple — data analyst
  reportYouth: '#06d6a0',       // green — youth/academy
  reportFinancial: '#ffd700',   // gold — financial
  reportScout: '#00b4d8',       // teal — scouting
  reportRadar: '#48cae4',       // cyan — radar chart
  reportOpponent: '#f77f00',    // orange — opponent scouting
  reportROI: '#c9b819',         // mustard — transfer ROI
  reportProjection: '#90e0ef',  // light blue — projection
  reportHistory: '#9e9e9e',     // grey-beige — history
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
