import { computeFormModifier } from '@/engine/simulation/form';

it('vazio → 0 (rating = overall puro, legado)', () => {
  expect(computeFormModifier([])).toBe(0);
});

it('sequência alta → modificador positivo; baixa → negativo', () => {
  expect(computeFormModifier([8, 8.5, 9, 8, 8.2])).toBeGreaterThan(0);
  expect(computeFormModifier([4.5, 5, 4, 5.2, 4.8])).toBeLessThan(0);
});

it('clamp em [-1, 1]', () => {
  expect(computeFormModifier([10, 10, 10, 10, 10])).toBeLessThanOrEqual(1);
  expect(computeFormModifier([4, 4, 4, 4, 4])).toBeGreaterThanOrEqual(-1);
});

it('usa só os jogos que houver (menos de N)', () => {
  expect(computeFormModifier([8])).toBeGreaterThan(0);
});
