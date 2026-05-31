import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme';
import { getBarColor } from '@/utils/player-colors';

interface StatBarProps {
  label: string;
  value: number;
  maxValue?: number;
}

export default function StatBar({ label, value, maxValue = 99 }: StatBarProps) {
  const clampedValue = Math.max(0, Math.min(value, maxValue));
  const fillPercent = (clampedValue / maxValue) * 100;
  const barColor = getBarColor(value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.barContainer}>
        <View style={[styles.barFill, { width: `${fillPercent}%` as `${number}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.value, { color: barColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    width: 90,
  },
  barContainer: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
  },
  barFill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  value: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    width: 26,
    textAlign: 'right',
  },
});
