import { computeFriendlyEffect } from '@/engine/preseason/preseason-effects';

it('não-participante: tudo zero', () => {
  expect(computeFriendlyEffect({ myGoals: 3, oppGoals: 0, myReputation: 50, oppReputation: 80, participated: false }))
    .toEqual({ moraleDelta: 0, sharpnessDelta: 0 });
});

it('participante ganha afiação positiva ao jogar', () => {
  const r = computeFriendlyEffect({ myGoals: 1, oppGoals: 1, myReputation: 50, oppReputation: 50, participated: true });
  expect(r.sharpnessDelta).toBeGreaterThan(0);
});

it('vencer rep maior dá mais moral que vencer rep menor', () => {
  const vsBigger = computeFriendlyEffect({ myGoals: 2, oppGoals: 0, myReputation: 50, oppReputation: 80, participated: true });
  const vsSmaller = computeFriendlyEffect({ myGoals: 2, oppGoals: 0, myReputation: 50, oppReputation: 30, participated: true });
  expect(vsBigger.moraleDelta).toBeGreaterThan(vsSmaller.moraleDelta);
});

it('derrota dá moral negativa; empate ~neutro pequeno', () => {
  expect(computeFriendlyEffect({ myGoals: 0, oppGoals: 3, myReputation: 50, oppReputation: 50, participated: true }).moraleDelta).toBeLessThan(0);
  const draw = computeFriendlyEffect({ myGoals: 1, oppGoals: 1, myReputation: 50, oppReputation: 50, participated: true });
  expect(Math.abs(draw.moraleDelta)).toBeLessThanOrEqual(1);
});

it('determinístico: sem RNG, mesma entrada → mesma saída', () => {
  const i = { myGoals: 2, oppGoals: 1, myReputation: 50, oppReputation: 60, participated: true } as const;
  expect(computeFriendlyEffect(i)).toEqual(computeFriendlyEffect(i));
});
