import { calculatePlayerRatings, PlayerMatchInput } from '@/engine/simulation/player-rating';
import { SeededRng } from '@/engine/rng';

it('formModifier positivo eleva o rating; ausente = legado', () => {
  const base: PlayerMatchInput = { id: 1, overall: 70, position: 'CM' };
  const withForm: PlayerMatchInput = { id: 2, overall: 70, position: 'CM', formModifier: 1 };
  const [r0] = calculatePlayerRatings([base], [], false, 0, new SeededRng(1));
  const [r1] = calculatePlayerRatings([withForm], [], false, 0, new SeededRng(1));
  expect(r1.rating).toBeGreaterThan(r0.rating);
});

it('formModifier indefinido produz EXATAMENTE o rating legado (mesma seed)', () => {
  const p: PlayerMatchInput = { id: 1, overall: 65, position: 'ST' };
  const a = calculatePlayerRatings([p], [], true, 0, new SeededRng(4));
  const b = calculatePlayerRatings([{ ...p, formModifier: 0 }], [], true, 0, new SeededRng(4));
  expect(a[0].rating).toBe(b[0].rating);
});
