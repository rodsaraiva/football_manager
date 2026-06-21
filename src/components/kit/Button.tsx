import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { resolveButtonStyle, ButtonVariant } from './buttonStyle';

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
  onPress, accent = colors.primary, testID, accessibilityLabel,
}: Props) {
  const state = disabled ? 'disabled' : loading ? 'loading' : 'default';
  const r = resolveButtonStyle(variant, state, accent);
  const blocked = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={blocked ? undefined : onPress}
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
