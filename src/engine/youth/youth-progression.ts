import { SquadTier } from '@/types';
import { SeededRng } from '@/engine/rng';

export interface TierCandidate {
  playerId: number;
  age: number;
  currentOverall: number;
  effectivePotential: number;
  squadTier: SquadTier;
  seasonMinutesPercent: number; // 0-100
}

export interface SquadContext {
  firstTeamSize: number;
  starterAvgOverall: number; // benchmark (top-11 avg, cf. ReportsYouthScreen)
}

export interface TierTransition {
  playerId: number;
  from: SquadTier;
  to: SquadTier;
  reason: 'age' | 'overall' | 'integration' | 'manual';
}

export const PROMOTION_OVERALL_MARGIN = 2; // ReportsYouthScreen (overall >= avg - 2)
export const FIRST_TEAM_CAP = 30;

const YOUTH_GRADUATION_AGE = 18;  // após 18 deixa de ser "youth"
const RESERVE_MIN_OVERALL = 62;   // overall mínimo p/ sair de youth com mérito

/**
 * Decisão pura de promoção manual. squad_full tem precedência: nem o jogador
 * pronto entra se o elenco estourou o teto.
 */
export function evaluatePromotion(
  candidate: TierCandidate, ctx: SquadContext,
): { allowed: boolean; reason: 'ready' | 'too_raw' | 'squad_full' } {
  if (ctx.firstTeamSize >= FIRST_TEAM_CAP) return { allowed: false, reason: 'squad_full' };
  if (candidate.currentOverall >= ctx.starterAvgOverall - PROMOTION_OVERALL_MARGIN) {
    return { allowed: true, reason: 'ready' };
  }
  return { allowed: false, reason: 'too_raw' };
}

/**
 * Transições automáticas no rollover. Determinístico (rng só desempata casos de
 * fronteira). youth→reserve por idade+overall; reserve→first por integração
 * (overall perto do benchmark + minutos).
 */
export function evaluateTierTransitions(
  candidates: TierCandidate[], ctx: SquadContext, rng: SeededRng,
): TierTransition[] {
  const out: TierTransition[] = [];
  // ordem estável por playerId (sem ORDER BY RANDOM)
  const sorted = [...candidates].sort((a, b) => a.playerId - b.playerId);
  let projectedFirst = ctx.firstTeamSize;

  for (const c of sorted) {
    if (c.squadTier === 'youth') {
      const oldEnough = c.age > YOUTH_GRADUATION_AGE;
      const goodEnough = c.currentOverall >= RESERVE_MIN_OVERALL;
      // joia jovem com potencial alto pode pular cedo (desempate determinístico)
      const earlyJewel = c.effectivePotential >= 85 && c.age >= 18 && rng.nextInt(0, 1) === 1;
      if (oldEnough || goodEnough || earlyJewel) {
        out.push({ playerId: c.playerId, from: 'youth', to: 'reserve', reason: oldEnough ? 'age' : 'overall' });
      }
      continue;
    }
    if (c.squadTier === 'reserve') {
      const ready = c.currentOverall >= ctx.starterAvgOverall - PROMOTION_OVERALL_MARGIN;
      const earnedMinutes = c.seasonMinutesPercent >= 40;
      if (ready && earnedMinutes && projectedFirst < FIRST_TEAM_CAP) {
        out.push({ playerId: c.playerId, from: 'reserve', to: 'first', reason: 'integration' });
        projectedFirst++;
      }
    }
  }
  return out;
}
