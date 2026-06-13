import { evaluatePraise, evaluateCriticism } from '@/engine/morale/interactions';

describe('evaluatePraise', () => {
  it('praising an in-form player reinforces (positive, delta > 0)', () => {
    const r = evaluatePraise({ recentAvgRating: 7.5, currentMorale: 50 });
    expect(r.reaction).toBe('positive');
    expect(r.delta).toBeGreaterThan(0);
  });

  it('praising an in-form player who is already flying rings hollow (neutral, weaker)', () => {
    const normal = evaluatePraise({ recentAvgRating: 7.5, currentMorale: 50 });
    const flying = evaluatePraise({ recentAvgRating: 7.5, currentMorale: 85 });
    expect(flying.reaction).toBe('neutral');
    expect(flying.delta).toBeLessThan(normal.delta);
  });

  it('praising an out-of-form player still gives a small lift (positive)', () => {
    const r = evaluatePraise({ recentAvgRating: 5.0, currentMorale: 50 });
    expect(r.reaction).toBe('positive');
    expect(r.delta).toBeGreaterThan(0);
  });

  it('praising an out-of-form player with high morale sounds empty (neutral, no lift)', () => {
    const r = evaluatePraise({ recentAvgRating: 5.0, currentMorale: 85 });
    expect(r.reaction).toBe('neutral');
    expect(r.delta).toBe(0);
  });
});

describe('evaluateCriticism', () => {
  it('criticizing an in-form player irritates (negative, delta < 0)', () => {
    const r = evaluateCriticism({ recentAvgRating: 7.8, currentMorale: 60 });
    expect(r.reaction).toBe('negative');
    expect(r.delta).toBeLessThan(0);
  });

  it('criticizing an out-of-form player with ok morale is a wake-up (positive, small lift)', () => {
    const r = evaluateCriticism({ recentAvgRating: 5.0, currentMorale: 55 });
    expect(r.reaction).toBe('positive');
    expect(r.delta).toBeGreaterThan(0);
  });

  it('criticizing an out-of-form player already low on morale demoralizes (negative)', () => {
    const r = evaluateCriticism({ recentAvgRating: 5.0, currentMorale: 25 });
    expect(r.reaction).toBe('negative');
    expect(r.delta).toBeLessThan(0);
  });
});
