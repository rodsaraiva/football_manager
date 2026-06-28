import { nextFalloutState, FalloutInput } from '@/engine/morale/fallout';

const base: FalloutInput = { current: 'none', morale: 30, lowStreakWeeks: 3, archetype: 'temperamental', recentCriticisms: 0 };

it('none→unsettled com streak baixo + arquétipo de risco', () => {
  expect(nextFalloutState(base)).toBe('unsettled');
});

it('arquétipo estável (professional) não escala mesmo com streak', () => {
  expect(nextFalloutState({ ...base, archetype: 'professional' })).toBe('none');
});

it('unsettled→wantsOut com criticism repetida', () => {
  expect(nextFalloutState({ ...base, current: 'unsettled', recentCriticisms: 2 })).toBe('wantsOut');
});

it('unsettled NÃO vira wantsOut sem criticism suficiente', () => {
  expect(nextFalloutState({ ...base, current: 'unsettled', recentCriticisms: 0 })).toBe('unsettled');
});

it('histerese: só regride a none com moral bem acima do alvo', () => {
  expect(nextFalloutState({ current: 'wantsOut', morale: 55, lowStreakWeeks: 0, archetype: 'temperamental', recentCriticisms: 0 })).toBe('wantsOut');
  expect(nextFalloutState({ current: 'wantsOut', morale: 80, lowStreakWeeks: 0, archetype: 'temperamental', recentCriticisms: 0 })).toBe('none');
});
