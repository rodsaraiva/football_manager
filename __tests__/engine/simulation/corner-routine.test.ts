import { cornerRoutineMultiplier } from '@/engine/simulation/match-engine';

it('auto/undefined === 1.0 exato (byte-for-byte)', () => {
  expect(cornerRoutineMultiplier(undefined)).toBe(1.0);
  expect(cornerRoutineMultiplier('auto')).toBe(1.0);
});

it('far_post favorece cabeçada mais que short', () => {
  expect(cornerRoutineMultiplier('far_post')).toBeGreaterThan(cornerRoutineMultiplier('short'));
});

it('near_post entre short e far_post', () => {
  const near = cornerRoutineMultiplier('near_post');
  expect(near).toBeGreaterThanOrEqual(cornerRoutineMultiplier('short'));
  expect(near).toBeLessThanOrEqual(cornerRoutineMultiplier('far_post'));
});
