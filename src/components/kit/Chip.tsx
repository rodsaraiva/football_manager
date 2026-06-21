import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usePressScale } from '@/motion/usePressScale';
import { triggerHaptic } from '@/motion/haptics';
import { useSettingsStore } from '@/store/settings-store';

interface Props {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accent?: string;
  testID?: string;
  accessibilityLabel?: string;
}

export function Chip({ label, selected = false, onPress, accent = colors.primary, testID, accessibilityLabel }: Props) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const haptics = useSettingsStore((s) => s.haptics);
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        testID={testID}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => { triggerHaptic('light', haptics); onPress(); }}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
});
