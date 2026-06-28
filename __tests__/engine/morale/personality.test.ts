import { derivePersonality, personalityMoraleModifier } from '@/engine/morale/personality';

it('derivePersonality é determinística e mapeia perfis-chave', () => {
  const leaderIn = { leadership: 18, composure: 16, aggression: 8, decisions: 14 };
  expect(derivePersonality(leaderIn, 7)).toBe('leader');
  expect(derivePersonality(leaderIn, 7)).toBe(derivePersonality(leaderIn, 7)); // estável

  const tempIn = { leadership: 9, composure: 4, aggression: 18, decisions: 8 };
  expect(derivePersonality(tempIn, 3)).toBe('temperamental');

  const proIn = { leadership: 11, composure: 15, aggression: 7, decisions: 15 };
  expect(derivePersonality(proIn, 1)).toBe('professional');
});

it('personalityMoraleModifier: líder amortece benched, mercenário amplifica wage, temperamental amplifica criticism', () => {
  // benched é negativo: líder sofre MENOS (delta menos negativo)
  expect(personalityMoraleModifier('leader', 'benched', -4)).toBeGreaterThan(-4);
  // wage negativo: mercenário sofre MAIS (mais negativo)
  expect(personalityMoraleModifier('mercenary', 'wage', -3)).toBeLessThan(-3);
  // criticism negativo: temperamental sofre MAIS
  expect(personalityMoraleModifier('temperamental', 'criticism', -3)).toBeLessThan(-3);
  // professional ~neutro (igual ao base)
  expect(personalityMoraleModifier('professional', 'criticism', -3)).toBe(-3);
  // balanced sempre neutro
  expect(personalityMoraleModifier('balanced', 'matchWin', 3)).toBe(3);
});
