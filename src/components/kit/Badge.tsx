import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing, radius } from '@/theme';
import { resolveBadgeStyle, BadgeTone } from './badgeStyle';

interface Props {
  value: string | number;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  accent?: string;
}

export function Badge({ value, tone = 'neutral', size = 'md', accent = colors.primary }: Props) {
  const r = resolveBadgeStyle(tone, accent);
  const sm = size === 'sm';
  return (
    <View style={[styles.badge, sm ? styles.sm : styles.md, { backgroundColor: r.backgroundColor }]}>
      <Text style={[styles.text, { color: r.textColor, fontSize: sm ? fontSize.xs : fontSize.sm }]}>
        {String(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  sm: { paddingHorizontal: spacing.xs, paddingVertical: 1, minWidth: 36 },
  md: { paddingHorizontal: spacing.sm, paddingVertical: 3, minWidth: 44 },
  text: { fontWeight: '700' },
});
