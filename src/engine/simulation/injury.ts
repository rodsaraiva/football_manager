import { SeededRng } from '@/engine/rng';
import { MatchEvent } from '@/types';

/**
 * Rolls an injury duration in whole weeks, weighted toward short layoffs.
 * Range [1, 8]; most injuries resolve in 1–3 weeks. Pure (no DB).
 */
const INJURY_DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const INJURY_WEIGHTS = [30, 24, 18, 10, 7, 5, 4, 2] as const;

export function rollInjuryDuration(rng: SeededRng): number {
  return rng.weightedPick(INJURY_DURATIONS, INJURY_WEIGHTS);
}

export interface InjuryAssignment {
  playerId: number;
  weeksLeft: number;
}

/**
 * For each 'injury' event whose player belongs to `clubPlayerIds`, roll a
 * duration. Pure: returns the assignments; the caller persists them.
 */
export function assignMatchInjuries(
  events: MatchEvent[],
  clubPlayerIds: Set<number>,
  rng: SeededRng,
): InjuryAssignment[] {
  const out: InjuryAssignment[] = [];
  for (const e of events) {
    if (e.type === 'injury' && clubPlayerIds.has(e.playerId)) {
      out.push({ playerId: e.playerId, weeksLeft: rollInjuryDuration(rng) });
    }
  }
  return out;
}
