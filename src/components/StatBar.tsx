import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '@/theme';

interface StatBarProps {
  label: string;
  value: number;
  maxValue?: number;
}

function getBarColor(value: number): string {
  if (value >= 85) return '#00e676';
  if (value >= 75) return colors.success;
  if (value >= 60) return colors.warning;
  if (value >= 40) return '#ff9800';
  return colors.danger;
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
    borderRadius: 3,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  value: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    width: 26,
    textAlign: 'right',
  },
});
