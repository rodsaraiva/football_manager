import React, { useEffect } from 'react';
import { StyleSheet, Pressable, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, alpha } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n';
import { useCelebrationStore } from '@/store/celebration-store';
import { useMotionConfig } from '@/motion/useMotionConfig';
import { useSettingsStore } from '@/store/settings-store';
import { triggerHaptic } from '@/motion/haptics';

export function CelebrationOverlay(): React.JSX.Element | null {
  const { t } = useTranslation();
  const queue = useCelebrationStore((s) => s.queue);
  const dismiss = useCelebrationStore((s) => s.dismiss);
  const haptics = useSettingsStore((s) => s.haptics);
  const m = useMotionConfig({ speed: 'base', curve: 'decelerate' });
  const current = queue[0];

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(m.enabled ? 24 : 0);

  useEffect(() => {
    if (!current) return;
    triggerHaptic('success', haptics);
    if (!m.enabled) { opacity.value = 1; translateY.value = 0; return; } // no-op de motion → mostra direto
    const easing = Easing.bezier(m.easing[0], m.easing[1], m.easing[2], m.easing[3]);
    opacity.value = withTiming(1, { duration: m.duration, easing });
    translateY.value = withTiming(0, { duration: m.duration, easing });
  }, [current?.id, m.enabled, m.duration, haptics]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!current) return null;

  return (
    <Animated.View style={[styles.wrap, style]} pointerEvents="box-none">
      <Pressable
        style={styles.card}
        onPress={() => { opacity.value = 0; translateY.value = 24; dismiss(current.id); }}
      >
        <Text style={styles.title}>{t(current.titleKey as TKey)}</Text>
        {current.detail ? <Text style={styles.detail}>{current.detail}</Text> : null}
        <Text style={styles.dismiss}>{t('celebration.dismiss')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, top: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha(colors.gold, 0.6),
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
  },
  title: { color: colors.gold, fontSize: fontSize.md, fontWeight: '700' },
  detail: { color: colors.text, fontSize: fontSize.sm, marginTop: spacing.xxs },
  dismiss: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'right', marginTop: spacing.xs },
});
