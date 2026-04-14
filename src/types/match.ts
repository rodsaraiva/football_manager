export type MatchEventType = 'goal' | 'assist' | 'yellow' | 'red' | 'substitution' | 'injury' | 'penalty_scored' | 'penalty_missed' | 'free_kick_scored' | 'free_kick_missed' | 'shot_on_target' | 'shot_off_target' | 'save';

export interface Fixture {
  id: number;
  competitionId: number;
  season: number;
  week: number;
  round: number | null;
  homeClubId: number;
  awayClubId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
  attendance: number | null;
}

export interface MatchEvent {
  fixtureId: number;
  minute: number;
  type: MatchEventType;
  playerId: number;
  secondaryPlayerId: number | null;
}
