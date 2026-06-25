import { driver, sumDrivers, MoraleDriver } from '@/engine/morale/driver-ledger';

const ctx = { season: 2, week: 10, archetype: 'balanced' as const };

it('driver() carimba kind/delta/season/week a partir do ctx', () => {
  const d = driver('matchWin', 3, ctx);
  expect(d).toEqual({ kind: 'matchWin', delta: 3, season: 2, week: 10 });
});

it('sumDrivers soma deltas e devolve 0 para lista vazia', () => {
  const ds: MoraleDriver[] = [driver('matchWin', 3, ctx), driver('benched', -2, ctx), driver('idleDrift', 1.5, ctx)];
  expect(sumDrivers(ds)).toBeCloseTo(2.5);
  expect(sumDrivers([])).toBe(0);
});
