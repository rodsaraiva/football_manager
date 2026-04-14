import { MatchEvent, Position } from '@/types';
import { SeededRng } from '@/engine/rng';

export interface PlayerMatchInput {
  id: number;
  overall: number;
  position: Position;
  isLateSub?: boolean; // #8: came on in last 30min
}

export interface PlayerRating {
  playerId: number;
  rating: number; // 4.0-10.0
}

const DEFENSE_POSITIONS = new Set<string>(['GK', 'CB', 'LB', 'RB']);

export function calculatePlayerRatings(
  players: PlayerMatchInput[],
  events: MatchEvent[],
  teamWon: boolean,
  teamConceded: number,
  rng: SeededRng,
): PlayerRating[] {
  return players.map(player => {
    // #8: Late subs don't have enough time to show much — fixed 6.0 base
    let rating = player.isLateSub
      ? 6.0
      : 6.0 + (player.overall - 50) * 0.03;
    // Random variance ±0.4
    rating += rng.nextFloat(-0.4, 0.4);

    // Event bonuses for this player
    for (const e of events) {
      if (e.playerId !== player.id) continue;
      switch (e.type) {
        case 'goal': rating += 0.8; break;
        case 'assist': rating += 0.5; break;
        case 'penalty_scored': rating += 0.6; break;
        case 'penalty_missed': rating -= 0.8; break;
        case 'free_kick_scored': rating += 0.7; break;
        case 'free_kick_missed': rating -= 0.2; break;
        case 'yellow': rating -= 0.3; break;
        case 'red': rating -= 1.5; break;
        case 'injury': rating -= 0.2; break;
        case 'shot_on_target': rating += 0.05; break;
        case 'save': rating += 0.1; break;
        case 'shot_off_target': break;
      }
    }

    // Check secondary (assists via secondaryPlayerId on goals)
    for (const e of events) {
      if (e.secondaryPlayerId === player.id && e.type === 'goal') {
        rating += 0.5;
      }
    }

    // Win bonus
    if (teamWon) rating += 0.3;

    // Clean sheet bonus for defenders/GK
    if (teamConceded === 0 && DEFENSE_POSITIONS.has(player.position)) {
      rating += 0.5;
    }

    // Clamp [4.0, 10.0], round to 1 decimal
    rating = Math.round(Math.max(4.0, Math.min(10.0, rating)) * 10) / 10;
    return { playerId: player.id, rating };
  });
}
