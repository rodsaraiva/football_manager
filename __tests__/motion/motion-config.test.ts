import { resolveMotion } from '@/motion/motion-config';
import { motion } from '@/theme';

describe('resolveMotion', () => {
  it('reduceMotion=false usa duração e curva dos tokens (default base/standard)', () => {
    const r = resolveMotion({}, false);
    expect(r.enabled).toBe(true);
    expect(r.duration).toBe(motion.duration.base);
    expect(r.easing).toEqual(motion.easing.standard);
  });

  it('respeita speed e curve explícitos', () => {
    const r = resolveMotion({ speed: 'slow', curve: 'decelerate' }, false);
    expect(r.duration).toBe(motion.duration.slow);
    expect(r.easing).toEqual(motion.easing.decelerate);
  });

  it('reduceMotion=true desliga: enabled=false e duration=0', () => {
    const r = resolveMotion({ speed: 'slow' }, true);
    expect(r.enabled).toBe(false);
    expect(r.duration).toBe(0);
    // easing ainda é uma tupla válida (fade curto pode reusar standard)
    expect(r.easing).toEqual(motion.easing.standard);
  });
});
