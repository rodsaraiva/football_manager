import { mediaTierForReputation, nextMediaSentiment } from '@/engine/press/media-sentiment';

it('tier por reputação: thresholds', () => {
  expect(mediaTierForReputation(20)).toBe('local');
  expect(mediaTierForReputation(60)).toBe('national');
  expect(mediaTierForReputation(90)).toBe('global');
});

it('vitória confiante melhora sentimento; tier global amplia o swing', () => {
  const nat = nextMediaSentiment({ current: 0, outcome: 'win', tone: 'confident', tier: 'national' });
  const glob = nextMediaSentiment({ current: 0, outcome: 'win', tone: 'confident', tier: 'global' });
  expect(nat).toBeGreaterThan(0);
  expect(glob).toBeGreaterThan(nat);
});

it('derrota arrogante piora; clamp em ±100', () => {
  expect(nextMediaSentiment({ current: 0, outcome: 'loss', tone: 'confident', tier: 'national' })).toBeLessThan(0);
  expect(nextMediaSentiment({ current: 100, outcome: 'win', tone: 'confident', tier: 'global' })).toBeLessThanOrEqual(100);
  expect(nextMediaSentiment({ current: -100, outcome: 'loss', tone: 'confident', tier: 'global' })).toBeGreaterThanOrEqual(-100);
});
