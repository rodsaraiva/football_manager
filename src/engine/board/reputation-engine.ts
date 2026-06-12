import {
  REPUTATION_RELEGATION_PENALTY,
  REPUTATION_PROMOTION_BONUS,
  REPUTATION_TITLE_BONUS,
  REPUTATION_CUP_BONUS,
  REPUTATION_TOP3_BONUS,
  REPUTATION_BOTTOM3_PENALTY,
  REPUTATION_BUDGET_SURPLUS_BONUS,
  REPUTATION_BUDGET_DEFICIT_PENALTY,
  REPUTATION_SQUAD_STRONG_BONUS,
  REPUTATION_SQUAD_GOOD_BONUS,
  REPUTATION_SQUAD_WEAK_PENALTY,
  REPUTATION_SQUAD_STRONG_THRESHOLD,
  REPUTATION_SQUAD_GOOD_THRESHOLD,
  REPUTATION_SQUAD_WEAK_THRESHOLD,
} from '@/engine/balance';

export interface ReputationDeltaInput {
  currentReputation: number;
  leaguePosition: number;
  totalTeams: number;
  wonLeague: boolean;
  wonCup: boolean;
  wasRelegated: boolean;
  wasPromoted: boolean;
  budgetBalance: number;
  squadAverageOverall: number;
  staffAverageAbility: number;
}

export interface ReputationBreakdown {
  performanceDelta: number;
  titlesDelta: number;
  financialDelta: number;
  squadDelta: number;
  relegationPenalty: number;
  promotionBonus: number;
}

export interface ReputationDeltaResult {
  newReputation: number;
  delta: number;
  breakdown: ReputationBreakdown;
}

/** Reputation contribution from squad strength. Pure; thresholds in balance.ts. */
export function squadStrengthDelta(squadAverageOverall: number): number {
  if (squadAverageOverall >= REPUTATION_SQUAD_STRONG_THRESHOLD) return REPUTATION_SQUAD_STRONG_BONUS;
  if (squadAverageOverall >= REPUTATION_SQUAD_GOOD_THRESHOLD) return REPUTATION_SQUAD_GOOD_BONUS;
  if (squadAverageOverall <= REPUTATION_SQUAD_WEAK_THRESHOLD) return REPUTATION_SQUAD_WEAK_PENALTY;
  return 0;
}

export function computeReputationDelta(input: ReputationDeltaInput): ReputationDeltaResult {
  const { currentReputation, leaguePosition, totalTeams, wonLeague, wonCup,
          wasRelegated, wasPromoted, budgetBalance } = input;

  const topN = Math.max(1, Math.round(totalTeams * 0.15));
  const bottomN = Math.max(1, Math.round(totalTeams * 0.15));

  const performanceDelta = leaguePosition <= topN
    ? REPUTATION_TOP3_BONUS
    : leaguePosition > totalTeams - bottomN && !wasRelegated
      ? REPUTATION_BOTTOM3_PENALTY
      : 0;

  const titlesDelta = (wonLeague ? REPUTATION_TITLE_BONUS : 0) + (wonCup ? REPUTATION_CUP_BONUS : 0);

  const financialDelta = budgetBalance > 0
    ? REPUTATION_BUDGET_SURPLUS_BONUS
    : budgetBalance < 0
      ? REPUTATION_BUDGET_DEFICIT_PENALTY
      : 0;

  const squadDelta = squadStrengthDelta(input.squadAverageOverall);

  const relegationPenalty = wasRelegated ? REPUTATION_RELEGATION_PENALTY : 0;
  const promotionBonus = wasPromoted ? REPUTATION_PROMOTION_BONUS : 0;

  const total = performanceDelta + titlesDelta + financialDelta + squadDelta + relegationPenalty + promotionBonus;

  const newReputation = Math.min(100, Math.max(1, currentReputation + total));
  const delta = newReputation - currentReputation;

  return {
    newReputation,
    delta,
    breakdown: { performanceDelta, titlesDelta, financialDelta, squadDelta, relegationPenalty, promotionBonus },
  };
}
