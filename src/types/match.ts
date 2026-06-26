export type MatchEventType = 'goal' | 'assist' | 'yellow' | 'red' | 'substitution' | 'injury' | 'penalty_scored' | 'penalty_missed' | 'free_kick_scored' | 'free_kick_missed' | 'shot_on_target' | 'shot_off_target' | 'save' | 'penalty_shootout';

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
  // L2 Fase 1: qualidade da chance (expected goals) do chute que gerou o evento.
  // Presente só nos eventos de chute em jogo aberto (gol/chute/defesa); ausente em
  // eventos sem chute (cartões, subs) e em gols de bola parada. Opcional ⇒ eventos
  // legados/AI seguem válidos.
  xg?: number;
}

/**
 * A pre-season friendly. Modeled in its own table (not `fixtures`) so it never
 * counts toward standings, history or promotion — only the official engines that
 * read `fixtures` exist, and they never see this row.
 */
export interface Friendly {
  id: number;
  season: number;
  homeClubId: number;
  awayClubId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
  attendance: number | null;
}
