import { MatchEvent } from '@/types';
import { SeededRng } from '@/engine/rng';

export interface PlayerMatchInput {
  id: number;
  overall: number;
}

export interface PlayerRating {
  playerId: number;
  rating: number; // 4.0-10.0
}

export function calculatePlayerRatings(
  players: PlayerMatchInput[],
  events: MatchEvent[],
  teamWon: boolean,
  rng: SeededRng,
): PlayerRating[] {
  return players.map(player => {
    // Base: 6.0 + scale by overall (50→6.0, 90→7.2)
    let rating = 6.0 + (player.overall - 50) * 0.03;
    // Random variance ±0.5
    rating += rng.nextFloat(-0.5, 0.5);

    // Event bonuses for this player
    for (const e of events) {
      if (e.playerId !== player.id) continue;
      switch (e.type) {
        case 'goal': rating += 0.8; break;
        case 'assist': rating += 0.5; break;
        case 'penalty_scored': rating += 0.6; break;
        case 'penalty_missed': rating -= 0.8; break;
        case 'yellow': rating -= 0.3; break;
        case 'red': rating -= 1.5; break;
        case 'injury': rating -= 0.2; break;
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

    // Clamp [4.0, 10.0], round to 1 decimal
    rating = Math.round(Math.max(4.0, Math.min(10.0, rating)) * 10) / 10;
    return { playerId: player.id, rating };
  });
}
