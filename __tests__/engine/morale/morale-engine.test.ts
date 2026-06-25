import {
  computeMatchMoraleDelta,
  computeWeeklyMoraleDrift,
  applyMoraleDelta,
  MatchMoraleInput,
} from '@/engine/morale/morale-engine';
import { sumDrivers } from '@/engine/morale/driver-ledger';
import { MORALE_DRIFT_TARGET } from '@/engine/balance';

const ctx = { season: 1, week: 1, archetype: 'balanced' as const };
const base: MatchMoraleInput = {
  result: 'win', played: true, minutesPlayed: 90, goalDiff: 1, benchStreakWeeks: 0,
};
const matchDelta = (i: Partial<MatchMoraleInput>) => sumDrivers(computeMatchMoraleDelta({ ...base, ...i }, ctx));
const driftDelta = (m: number) => computeWeeklyMoraleDrift(m, ctx)?.delta ?? 0;

describe('computeMatchMoraleDelta', () => {
  it('a win while playing is positive', () => {
    expect(matchDelta({ result: 'win' })).toBeGreaterThan(0);
  });

  it('a loss while playing is negative', () => {
    expect(matchDelta({ result: 'loss', goalDiff: -1 })).toBeLessThan(0);
  });

  it('a heavy defeat hurts more than a narrow one', () => {
    const narrow = matchDelta({ result: 'loss', goalDiff: -1 });
    const heavy = matchDelta({ result: 'loss', goalDiff: -4 });
    expect(heavy).toBeLessThan(narrow);
  });

  it('a prolonged bench streak is negative even on a team win', () => {
    const benched = matchDelta({ result: 'win', played: false, minutesPlayed: 0, goalDiff: 2, benchStreakWeeks: 4 });
    expect(benched).toBeLessThan(0);
  });

  it('a draw is near-neutral', () => {
    const d = matchDelta({ result: 'draw', goalDiff: 0 });
    expect(Math.abs(d)).toBeLessThanOrEqual(1);
  });
});

describe('computeWeeklyMoraleDrift', () => {
  it('pulls a low morale upward toward the target', () => {
    const drift = driftDelta(30);
    expect(drift).toBeGreaterThan(0);
    expect(30 + drift).toBeLessThanOrEqual(MORALE_DRIFT_TARGET);
  });

  it('pulls a high morale downward toward the target', () => {
    const drift = driftDelta(80);
    expect(drift).toBeLessThan(0);
    expect(80 + drift).toBeGreaterThanOrEqual(MORALE_DRIFT_TARGET);
  });

  it('is null at the target', () => {
    expect(computeWeeklyMoraleDrift(MORALE_DRIFT_TARGET, ctx)).toBeNull();
  });
});

describe('applyMoraleDelta', () => {
  it('clamps to [1,100]', () => {
    expect(applyMoraleDelta(99, +10)).toBe(100);
    expect(applyMoraleDelta(3, -10)).toBe(1);
  });
  it('rounds to an integer (morale column is INTEGER)', () => {
    expect(Number.isInteger(applyMoraleDelta(50, 2.6))).toBe(true);
  });
});
