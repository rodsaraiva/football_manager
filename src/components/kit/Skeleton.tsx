import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { colors, radius } from '@/theme';
import { useMotionConfig } from '@/motion/useMotionConfig';

interface Props { width?: number | string; height?: number; radius?: number; style?: object; }

export function Skeleton({ width = '100%', height = 12, radius: r = radius.sm, style }: Props) {
  const m = useMotionConfig({ speed: 'slow' });
  const opacity = useSharedValue(m.enabled ? 0.4 : 0.6);

  useEffect(() => {
    if (!m.enabled) { opacity.value = 0.6; return; } // reduce-motion → estático
    opacity.value = withRepeat(
      withTiming(0.8, { duration: m.duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [m.enabled, m.duration, opacity]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.base, { width: width as any, height, borderRadius: r }, shimmerStyle, style]}
    />
  );
}

const styles = StyleSheet.create({ base: { backgroundColor: colors.surfaceLight } });
