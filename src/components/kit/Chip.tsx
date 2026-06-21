import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';

interface Props {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accent?: string;
  testID?: string;
  accessibilityLabel?: string;
}

export function Chip({ label, selected = false, onPress, accent = colors.primary, testID, accessibilityLabel }: Props) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? accent : 'transparent', borderColor: selected ? accent : colors.border },
      ]}
    >
      <Text style={[styles.label, { color: selected ? colors.text : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
});
