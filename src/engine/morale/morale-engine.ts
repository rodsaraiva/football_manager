import {
  MORALE_WIN_BONUS,
  MORALE_LOSS_PENALTY,
  MORALE_DRAW_DELTA,
  MORALE_BENCH_PENALTY,
  MORALE_BENCH_STREAK_EXTRA,
  MORALE_HEAVY_DEFEAT_EXTRA,
  MORALE_DRIFT_TARGET,
  MORALE_DRIFT_RATE,
} from '@/engine/balance';
import { driver, MoraleDriver, DriverCtx } from './driver-ledger';

export interface MatchMoraleInput {
  result: 'win' | 'draw' | 'loss';
  played: boolean;
  minutesPlayed: number;
  goalDiff: number; // from this player's club POV (positive = won by N)
  benchStreakWeeks: number;
}

/** Pure: morale change from one matchday, decomposed into drivers. */
export function computeMatchMoraleDelta(input: MatchMoraleInput, ctx: DriverCtx): MoraleDriver[] {
  if (!input.played) {
    const drivers: MoraleDriver[] = [driver('benched', MORALE_BENCH_PENALTY, ctx)];
    if (input.benchStreakWeeks > 0) {
      drivers.push(driver('benchStreak', input.benchStreakWeeks * MORALE_BENCH_STREAK_EXTRA, ctx));
    }
    return drivers;
  }
  const drivers: MoraleDriver[] = [];
  if (input.result === 'win') drivers.push(driver('matchWin', MORALE_WIN_BONUS, ctx));
  else if (input.result === 'loss') drivers.push(driver('matchLoss', MORALE_LOSS_PENALTY, ctx));
  else drivers.push(driver('matchDraw', MORALE_DRAW_DELTA, ctx));

  if (input.result === 'loss' && input.goalDiff <= -3) {
    drivers.push(driver('heavyDefeat', MORALE_HEAVY_DEFEAT_EXTRA, ctx));
  }
  return drivers;
}

/** Pure: idle-week regression toward MORALE_DRIFT_TARGET. null when already at target. */
export function computeWeeklyMoraleDrift(currentMorale: number, ctx: DriverCtx): MoraleDriver | null {
  const delta = (MORALE_DRIFT_TARGET - currentMorale) * MORALE_DRIFT_RATE;
  if (delta === 0) return null;
  return driver('idleDrift', delta, ctx);
}

/** Pure: apply a delta, round to int, clamp to the schema's [1,100] CHECK. INALTERADO. */
export function applyMoraleDelta(current: number, delta: number): number {
  return Math.max(1, Math.min(100, Math.round(current + delta)));
}
