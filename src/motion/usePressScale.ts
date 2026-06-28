import { useCallback } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useMotionConfig } from '@/motion/useMotionConfig';

export interface PressScale {
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function usePressScale(opts: { to?: number } = {}): PressScale {
  const to = opts.to ?? 0.96;
  const m = useMotionConfig({ speed: 'fast', curve: 'standard' });
  const scale = useSharedValue(1);
  const easing = Easing.bezier(m.easing[0], m.easing[1], m.easing[2], m.easing[3]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = useCallback(() => {
    if (!m.enabled) return; // reduce-motion → no press feedback
    scale.value = withTiming(to, { duration: m.duration, easing });
  }, [m.enabled, m.duration, to, scale, easing]);

  const onPressOut = useCallback(() => {
    if (!m.enabled) return;
    scale.value = withTiming(1, { duration: m.duration, easing });
  }, [m.enabled, m.duration, scale, easing]);

  return { animatedStyle, onPressIn, onPressOut };
}
