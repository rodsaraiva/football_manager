import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius, alpha } from '@/theme';

export type ToastTone = 'info' | 'success' | 'danger' | 'gold';

interface Props {
  title: string;
  message?: string;
  tone?: ToastTone;
  onDismiss: () => void;
  testID?: string;
}

const TONE_COLOR: Record<ToastTone, string> = {
  info: colors.primary,
  success: colors.success,
  danger: colors.danger,
  gold: colors.gold,
};

export function Toast({ title, message, tone = 'info', onDismiss, testID }: Props) {
  const accent = TONE_COLOR[tone];
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.toast, { borderColor: alpha(accent, 0.6), borderLeftColor: accent }]}
      activeOpacity={0.9}
      onPress={onDismiss}
      accessibilityRole="button"
    >
      <Text style={[styles.title, { color: accent }]}>{title}</Text>
      {message != null && <Text style={styles.message}>{message}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderLeftWidth: 4,
  },
  title: { fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 0.5 },
  message: { color: colors.text, fontSize: fontSize.md, marginTop: spacing.xxs },
});
