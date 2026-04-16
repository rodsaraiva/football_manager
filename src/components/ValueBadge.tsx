import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing } from '@/theme';

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'primary';
type Size = 'sm' | 'md';

interface ValueBadgeProps {
  value: string | number;
  tone?: Tone;
  size?: Size;
}

const TONE_COLORS: Record<Tone, string> = {
  neutral: colors.textSecondary,
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  primary: colors.primary,
};

export function ValueBadge({ value, tone = 'neutral', size = 'md' }: ValueBadgeProps) {
  const color = TONE_COLORS[tone];
  const isSmall = size === 'sm';

  return (
    <View style={[styles.badge, isSmall ? styles.badgeSm : styles.badgeMd, { borderColor: color }]}>
      <Text style={[styles.text, isSmall ? styles.textSm : styles.textMd, { color }]}>
        {String(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSm: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    minWidth: 36,
  },
  badgeMd: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    minWidth: 44,
  },
  text: {
    fontWeight: '700',
  },
  textSm: {
    fontSize: fontSize.xs,
  },
  textMd: {
    fontSize: fontSize.sm,
  },
});
