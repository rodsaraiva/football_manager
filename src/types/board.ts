export type BoardObjectiveType =
  | 'league_position'
  | 'cup_win'
  | 'no_relegation'
  | 'top_half'
  | 'promotion'
  | 'budget_balance';

export interface BoardObjective {
  id: number;
  clubId: number;
  season: number;
  type: BoardObjectiveType;
  target: number | null;
  description: string;
}

export type TrustOutcome = 'objective_met' | 'objective_partial' | 'objective_failed';

export type TrustConsequence = 'none' | 'budget_cut' | 'budget_bonus' | 'fired';

export interface BoardTrustEntry {
  id: number;
  clubId: number;
  season: number;
  trust: number;
  outcome: TrustOutcome;
}

export interface ReputationHistoryEntry {
  id: number;
  clubId: number;
  season: number;
  reputation: number;
  delta: number;
}
