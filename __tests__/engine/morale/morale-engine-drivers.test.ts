import { computeMatchMoraleDelta, computeWeeklyMoraleDrift } from '@/engine/morale/morale-engine';
import { sumDrivers } from '@/engine/morale/driver-ledger';
import {
  MORALE_WIN_BONUS, MORALE_LOSS_PENALTY, MORALE_BENCH_PENALTY,
  MORALE_BENCH_STREAK_EXTRA, MORALE_HEAVY_DEFEAT_EXTRA, MORALE_DRIFT_TARGET, MORALE_DRIFT_RATE,
} from '@/engine/balance';

const ctx = { season: 1, week: 5, archetype: 'balanced' as const };

it('win → driver matchWin somando ao bônus antigo', () => {
  const ds = computeMatchMoraleDelta({ result: 'win', played: true, minutesPlayed: 90, goalDiff: 1, benchStreakWeeks: 0 }, ctx);
  expect(ds.map((d) => d.kind)).toContain('matchWin');
  expect(sumDrivers(ds)).toBe(MORALE_WIN_BONUS);
});

it('goleada sofrida → matchLoss + heavyDefeat somando ao antigo', () => {
  const ds = computeMatchMoraleDelta({ result: 'loss', played: true, minutesPlayed: 90, goalDiff: -3, benchStreakWeeks: 0 }, ctx);
  expect(ds.map((d) => d.kind).sort()).toEqual(['heavyDefeat', 'matchLoss']);
  expect(sumDrivers(ds)).toBe(MORALE_LOSS_PENALTY + MORALE_HEAVY_DEFEAT_EXTRA);
});

it('banco com streak → benched + benchStreak', () => {
  const ds = computeMatchMoraleDelta({ result: 'win', played: false, minutesPlayed: 0, goalDiff: 1, benchStreakWeeks: 4 }, ctx);
  expect(sumDrivers(ds)).toBe(MORALE_BENCH_PENALTY + 4 * MORALE_BENCH_STREAK_EXTRA);
  expect(ds.map((d) => d.kind)).toContain('benched');
});

it('drift idle devolve driver idleDrift ou null quando já no alvo', () => {
  const d = computeWeeklyMoraleDrift(30, ctx);
  expect(d?.kind).toBe('idleDrift');
  expect(d?.delta).toBeCloseTo((MORALE_DRIFT_TARGET - 30) * MORALE_DRIFT_RATE);
  expect(computeWeeklyMoraleDrift(MORALE_DRIFT_TARGET, ctx)).toBeNull();
});
