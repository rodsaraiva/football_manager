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

export type InjurySeverity = 'knock' | 'moderate' | 'serious';

/** Tier by layoff length: <=2 knock, 3–5 moderate, >=6 serious. Pure. */
export function classifyInjury(weeksLeft: number): InjurySeverity {
  if (weeksLeft <= 2) return 'knock';
  if (weeksLeft <= 5) return 'moderate';
  return 'serious';
}

const RETURN_FITNESS: Record<InjurySeverity, number> = { knock: 90, moderate: 75, serious: 60 };

/** Max fitness on return; worse injuries return less sharp. Pure. */
export function returnFitnessForSeverity(severity: InjurySeverity): number {
  return RETURN_FITNESS[severity];
}

/** Quanto o physio (0..20) acelera além do decremento base de 1/semana. */
const PHYSIO_MAX_BONUS = 1; // physio 20 → recupera ~2 semanas/semana

/** One week of recovery; physio (0..20) can shave an extra week. Never negative. Pure. */
export function injuryRecoveryStep(weeksLeft: number, physioAbility: number): number {
  if (weeksLeft <= 0) return 0;
  const bonus = Math.round((Math.max(0, Math.min(20, physioAbility)) / 20) * PHYSIO_MAX_BONUS);
  return Math.max(0, weeksLeft - 1 - bonus);
}

export interface InjuryAssignment {
  playerId: number;
  weeksLeft: number;
  severity: InjurySeverity;
  returnFitnessCap: number;
}

/**
 * For each 'injury' event whose player belongs to `clubPlayerIds`, roll a
 * duration and classify it. `injuryRiskMult` (>=1) never removes injuries; when
 * >1 it may escalate severity via one extra fixed roll (preserves RNG position
 * relative to legado: mult=1 consumes only the duration roll). Pure.
 */
export function assignMatchInjuries(
  events: MatchEvent[],
  clubPlayerIds: Set<number>,
  rng: SeededRng,
  injuryRiskMult: number = 1,
): InjuryAssignment[] {
  const out: InjuryAssignment[] = [];
  for (const e of events) {
    if (e.type === 'injury' && clubPlayerIds.has(e.playerId)) {
      const weeksLeft = rollInjuryDuration(rng);
      const escalate = injuryRiskMult > 1 && rng.next() < (injuryRiskMult - 1) * 0.2;
      const finalWeeks = escalate ? weeksLeft + 2 : weeksLeft;
      const severity = classifyInjury(finalWeeks);
      out.push({
        playerId: e.playerId,
        weeksLeft: finalWeeks,
        severity,
        returnFitnessCap: returnFitnessForSeverity(severity),
      });
    }
  }
  return out;
}
