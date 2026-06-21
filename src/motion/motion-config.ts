import { motion } from '@/theme';

export interface MotionRequest {
  speed?: 'fast' | 'base' | 'slow';
  curve?: 'standard' | 'decelerate' | 'accelerate';
}

export interface ResolvedMotion {
  enabled: boolean;
  duration: number;
  easing: readonly [number, number, number, number];
}

export function resolveMotion(req: MotionRequest, reduceMotion: boolean): ResolvedMotion {
  const speed = req.speed ?? 'base';
  const curve = req.curve ?? 'standard';
  if (reduceMotion) {
    return { enabled: false, duration: 0, easing: motion.easing.standard };
  }
  return { enabled: true, duration: motion.duration[speed], easing: motion.easing[curve] };
}
