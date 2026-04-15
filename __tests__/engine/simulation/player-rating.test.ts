import { calculatePlayerRatings, PlayerMatchInput } from '@/engine/simulation/player-rating';
import { SeededRng } from '@/engine/rng';
import { MatchEvent } from '@/types';

import { Position } from '@/types';

const makePlayerInput = (id: number, overall: number, position: Position = 'CM'): PlayerMatchInput => ({
  id,
  overall,
  position,
});

describe('calculatePlayerRatings', () => {
  it('returns a rating for every player', () => {
    const rng = new SeededRng(42);
    const players = Array.from({ length: 11 }, (_, i) => makePlayerInput(i + 1, 70));
    const ratings = calculatePlayerRatings(players, [], true, 0, rng);
    expect(ratings).toHaveLength(11);
    for (const r of ratings) {
      expect(r.rating).toBeGreaterThanOrEqual(4.0);
      expect(r.rating).toBeLessThanOrEqual(10.0);
    }
  });

  it('goal scorers get higher ratings', () => {
    const rng = new SeededRng(42);
    const players = [makePlayerInput(1, 70), makePlayerInput(2, 70)];
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 30, type: 'goal', playerId: 1, secondaryPlayerId: null },
      { fixtureId: 1, minute: 60, type: 'goal', playerId: 1, secondaryPlayerId: null },
    ];
    const ratings = calculatePlayerRatings(players, events, true, 0, rng);
    const scorer = ratings.find(r => r.playerId === 1)!;
    const nonScorer = ratings.find(r => r.playerId === 2)!;
    expect(scorer.rating).toBeGreaterThan(nonScorer.rating);
  });

  it('assist providers get a rating boost', () => {
    const rng = new SeededRng(42);
    const players = [makePlayerInput(1, 70), makePlayerInput(2, 70)];
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 30, type: 'assist', playerId: 1, secondaryPlayerId: null },
    ];
    const ratings = calculatePlayerRatings(players, events, true, 0, rng);
    const assister = ratings.find(r => r.playerId === 1)!;
    const other = ratings.find(r => r.playerId === 2)!;
    expect(assister.rating).toBeGreaterThan(other.rating);
  });

  it('red card reduces rating significantly', () => {
    const rng = new SeededRng(42);
    const players = [makePlayerInput(1, 70), makePlayerInput(2, 70)];
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 30, type: 'red', playerId: 1, secondaryPlayerId: null },
    ];
    const ratings = calculatePlayerRatings(players, events, true, 0, rng);
    const redCarded = ratings.find(r => r.playerId === 1)!;
    const clean = ratings.find(r => r.playerId === 2)!;
    expect(redCarded.rating).toBeLessThan(clean.rating);
  });

  it('higher overall leads to slightly higher base rating', () => {
    const rng1 = new SeededRng(100);
    const rng2 = new SeededRng(100);
    const weak = [makePlayerInput(1, 50)];
    const strong = [makePlayerInput(1, 90)];
    const weakRating = calculatePlayerRatings(weak, [], true, 0, rng1)[0].rating;
    const strongRating = calculatePlayerRatings(strong, [], true, 0, rng2)[0].rating;
    expect(strongRating).toBeGreaterThanOrEqual(weakRating);
  });

  it('winning team gets a small boost', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    const players = [makePlayerInput(1, 70)];
    const winRating = calculatePlayerRatings(players, [], true, 0, rng1)[0].rating;
    const loseRating = calculatePlayerRatings(players, [], false, 1, rng2)[0].rating;
    expect(winRating).toBeGreaterThanOrEqual(loseRating);
  });

  it('defenders get clean sheet bonus when team concedes 0', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    const players = [makePlayerInput(1, 70, 'CB')];
    const cleanSheet = calculatePlayerRatings(players, [], true, 0, rng1)[0].rating;
    const conceded = calculatePlayerRatings(players, [], true, 2, rng2)[0].rating;
    expect(cleanSheet).toBeGreaterThan(conceded);
  });
});
