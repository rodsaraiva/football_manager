import { useSettingsStore } from '@/store/settings-store';
import { resolveMotion, type MotionRequest, type ResolvedMotion } from '@/motion/motion-config';

export function useMotionConfig(req: MotionRequest = {}): ResolvedMotion {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  return resolveMotion(req, reduceMotion);
}
