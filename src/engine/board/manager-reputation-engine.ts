import {
  MANAGER_REP_LEAGUE_TITLE_BONUS,
  MANAGER_REP_CUP_BONUS,
  MANAGER_REP_PROMOTION_BONUS,
  MANAGER_REP_TOP_THIRD_BONUS,
  MANAGER_REP_RELEGATION_PENALTY,
  MANAGER_REP_OBJECTIVE_FAILED_PENALTY,
} from '@/engine/balance';

export interface ManagerRepInput {
  current: number;
  leaguePosition: number | null;
  totalTeams: number;
  wonLeague: boolean;
  wonCup: boolean;
  wasPromoted: boolean;
  wasRelegated: boolean;
  objectiveMet: boolean;
}

/**
 * Career-wide MANAGER reputation accrual at season-end. Pure; deltas live in balance.ts.
 * Mirrors the magnitude discipline of computeReputationDelta (modest contributions).
 * Distinct from a club's reputation: this value follows the manager across club switches.
 */
export function computeManagerReputationDelta(input: ManagerRepInput): { next: number; delta: number } {
  const { current, leaguePosition, totalTeams, wonLeague, wonCup, wasPromoted, wasRelegated, objectiveMet } = input;

  const titleBonus = wonLeague ? MANAGER_REP_LEAGUE_TITLE_BONUS : 0;
  const cupBonus = wonCup ? MANAGER_REP_CUP_BONUS : 0;
  const promotionBonus = wasPromoted ? MANAGER_REP_PROMOTION_BONUS : 0;

  // Top-third league finish (only when not already counted via title, to keep it modest).
  const topThird = Math.max(1, Math.round(totalTeams / 3));
  const topThirdBonus =
    leaguePosition != null && !wonLeague && leaguePosition <= topThird ? MANAGER_REP_TOP_THIRD_BONUS : 0;

  const relegationPenalty = wasRelegated ? MANAGER_REP_RELEGATION_PENALTY : 0;
  const objectivePenalty = objectiveMet ? 0 : MANAGER_REP_OBJECTIVE_FAILED_PENALTY;

  const total = titleBonus + cupBonus + promotionBonus + topThirdBonus + relegationPenalty + objectivePenalty;

  const next = Math.min(100, Math.max(1, current + total));
  return { next, delta: next - current };
}
