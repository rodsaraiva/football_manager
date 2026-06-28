import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, spacing, fontSize, radius } from '@/theme';
import { resolveButtonStyle, ButtonVariant } from './buttonStyle';
import { useClubAccentRampOptional } from '@/theme/ClubAccentProvider';
import { usePressScale } from '@/motion/usePressScale';
import { triggerHaptic } from '@/motion/haptics';
import { useSettingsStore } from '@/store/settings-store';

interface Props {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accent?: string;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  label, variant = 'primary', loading = false, disabled = false,
  onPress, accent, testID, accessibilityLabel,
}: Props) {
  const ramp = useClubAccentRampOptional();
  // Precedência: accent explícito > accent do clube (via provider) > primário neutro.
  const resolvedAccent = accent ?? ramp?.accent ?? colors.primary;
  const state = disabled ? 'disabled' : loading ? 'loading' : 'default';
  const r = resolveButtonStyle(variant, state, resolvedAccent);
  const blocked = disabled || loading;
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const haptics = useSettingsStore((s) => s.haptics);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: blocked, busy: loading }}
        disabled={blocked}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={blocked ? undefined : () => { triggerHaptic('light', haptics); onPress(); }}
        style={({ pressed }) => [
          styles.base,
          {
            backgroundColor: r.backgroundColor,
            borderColor: r.borderColor,
            borderWidth: r.borderWidth,
            opacity: pressed && !blocked ? 0.85 : r.opacity,
          },
        ]}
      >
        {r.showSpinner
          ? <ActivityIndicator color={r.textColor} />
          : <Text style={[styles.label, { color: r.textColor }]}>{label}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm + spacing.xxs,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  label: { fontSize: fontSize.lg, fontWeight: '600' },
});
