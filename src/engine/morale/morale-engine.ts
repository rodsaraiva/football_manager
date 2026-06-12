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

export interface MatchMoraleInput {
  result: 'win' | 'draw' | 'loss';
  played: boolean;
  minutesPlayed: number;
  goalDiff: number;        // from this player's club POV (positive = won by N)
  benchStreakWeeks: number;
}

/** Pure: morale change from one matchday. */
export function computeMatchMoraleDelta(input: MatchMoraleInput): number {
  if (!input.played) {
    return MORALE_BENCH_PENALTY + input.benchStreakWeeks * MORALE_BENCH_STREAK_EXTRA;
  }
  let delta: number;
  if (input.result === 'win') delta = MORALE_WIN_BONUS;
  else if (input.result === 'loss') delta = MORALE_LOSS_PENALTY;
  else delta = MORALE_DRAW_DELTA;

  if (input.result === 'loss' && input.goalDiff <= -3) {
    delta += MORALE_HEAVY_DEFEAT_EXTRA;
  }
  return delta;
}

/** Pure: idle-week regression toward MORALE_DRIFT_TARGET. */
export function computeWeeklyMoraleDrift(currentMorale: number): number {
  return (MORALE_DRIFT_TARGET - currentMorale) * MORALE_DRIFT_RATE;
}

/** Pure: apply a delta, round to int, clamp to the schema's [1,100] CHECK. */
export function applyMoraleDelta(current: number, delta: number): number {
  return Math.max(1, Math.min(100, Math.round(current + delta)));
}
