import {
  BOARD_TRUST_FIRE_THRESHOLD,
  BOARD_TRUST_CUT_THRESHOLD,
  BOARD_TRUST_BONUS_THRESHOLD,
} from '@/engine/balance';
import { BoardObjectiveType, TrustConsequence, TrustOutcome } from '@/types/board';

export interface TrustDeltaInput {
  currentTrust: number;
  objectiveType: BoardObjectiveType;
  objectiveTarget: number | null;
  leaguePosition: number | null;
  totalTeams: number;
  wonCup: boolean;
  wasRelegated: boolean;
  wasPromoted: boolean;
  reputationDelta: number;
  budgetBalance?: number;
}

export interface TrustDeltaResult {
  newTrust: number;
  delta: number;
  outcome: TrustOutcome;
  consequence: TrustConsequence;
}

function evaluateOutcome(input: TrustDeltaInput): TrustOutcome {
  const { objectiveType, objectiveTarget, leaguePosition, wonCup, wasRelegated, wasPromoted, totalTeams } = input;

  switch (objectiveType) {
    case 'no_relegation':
      return wasRelegated ? 'objective_failed' : 'objective_met';

    case 'promotion':
      return wasPromoted ? 'objective_met' : 'objective_failed';

    case 'cup_win':
      return wonCup ? 'objective_met' : 'objective_failed';

    case 'budget_balance':
      return (input.budgetBalance ?? 0) >= 0 ? 'objective_met' : 'objective_failed';

    case 'top_half': {
      const threshold = objectiveTarget ?? Math.ceil(totalTeams / 2);
      if (leaguePosition == null) return 'objective_partial';
      if (leaguePosition <= threshold) return 'objective_met';
      if (leaguePosition <= threshold + 2) return 'objective_partial';
      return 'objective_failed';
    }

    case 'league_position': {
      if (objectiveTarget == null || leaguePosition == null) return 'objective_partial';
      if (leaguePosition <= objectiveTarget) return 'objective_met';
      if (leaguePosition <= objectiveTarget + 2) return 'objective_partial';
      return 'objective_failed';
    }

    default:
      return 'objective_partial';
  }
}

function outcomeToTrustDelta(outcome: TrustOutcome): number {
  switch (outcome) {
    case 'objective_met':     return 15;
    case 'objective_partial': return 0;
    case 'objective_failed':  return -15;
  }
}

export function computeTrustDelta(input: TrustDeltaInput): TrustDeltaResult {
  const outcome = evaluateOutcome(input);
  const objectiveDelta = outcomeToTrustDelta(outcome);
  const repContribution = Math.round(input.reputationDelta * 0.5);

  const total = objectiveDelta + repContribution;
  const newTrust = Math.min(100, Math.max(0, input.currentTrust + total));
  const delta = newTrust - input.currentTrust;

  const consequence: TrustConsequence =
    newTrust < BOARD_TRUST_FIRE_THRESHOLD   ? 'fired' :
    newTrust < BOARD_TRUST_CUT_THRESHOLD    ? 'budget_cut' :
    newTrust > BOARD_TRUST_BONUS_THRESHOLD  ? 'budget_bonus' :
    'none';

  return { newTrust, delta, outcome, consequence };
}
