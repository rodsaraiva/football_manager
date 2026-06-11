import { League } from '@/types';
import {
  buildDivisionPairs,
  computeDivisionSwaps,
  DivisionPair,
} from '@/engine/competition/promotion';

const lg = (id: number, countryId: number, level: number, promo: number, releg: number): League => ({
  id, name: `L${id}`, countryId, divisionLevel: level, numTeams: 20, promotionSpots: promo, relegationSpots: releg,
});

describe('buildDivisionPairs', () => {
  it('links division N to N+1 within the same country, using the lower league promotion spots', () => {
    const leagues = [
      lg(1, 1, 1, 0, 3), // top
      lg(2, 1, 2, 3, 4), // second
      lg(99, 2, 1, 0, 3), // other country, no lower → no pair
    ];
    const pairs = buildDivisionPairs(leagues);
    expect(pairs).toEqual([
      { higherLeagueId: 1, lowerLeagueId: 2, relegationSpots: 3, promotionSpots: 3 },
    ]);
  });
});

describe('computeDivisionSwaps', () => {
  const pairs: DivisionPair[] = [
    { higherLeagueId: 1, lowerLeagueId: 2, relegationSpots: 3, promotionSpots: 3 },
  ];

  it('swaps bottom-3 of higher with top-3 of lower', () => {
    const standings = new Map<number, number[]>([
      [1, [101, 102, 103, 104, 105]], // 105,104,103 are bottom 3
      [2, [201, 202, 203, 204, 205]], // 201,202,203 are top 3
    ]);
    const swaps = computeDivisionSwaps(pairs, standings);
    const down = swaps.filter((s) => s.fromLeagueId === 1).map((s) => s.clubId).sort();
    const up = swaps.filter((s) => s.fromLeagueId === 2).map((s) => s.clubId).sort();
    expect(down).toEqual([103, 104, 105]);
    expect(up).toEqual([201, 202, 203]);
    expect(swaps.filter((s) => s.fromLeagueId === 1).every((s) => s.toLeagueId === 2)).toBe(true);
    expect(swaps.filter((s) => s.fromLeagueId === 2).every((s) => s.toLeagueId === 1)).toBe(true);
  });

  it('reconciles to min(relegationSpots, promotionSpots) so sizes stay constant', () => {
    const mismatched: DivisionPair[] = [
      { higherLeagueId: 1, lowerLeagueId: 2, relegationSpots: 4, promotionSpots: 2 },
    ];
    const standings = new Map<number, number[]>([
      [1, [101, 102, 103, 104, 105]],
      [2, [201, 202, 203, 204, 205]],
    ]);
    const swaps = computeDivisionSwaps(mismatched, standings);
    expect(swaps.filter((s) => s.fromLeagueId === 1)).toHaveLength(2);
    expect(swaps.filter((s) => s.fromLeagueId === 2)).toHaveLength(2);
  });

  it('a top league (promotionSpots 0 on its lower link reconciled) never sends clubs up beyond the min', () => {
    const noPromo: DivisionPair[] = [
      { higherLeagueId: 1, lowerLeagueId: 2, relegationSpots: 3, promotionSpots: 0 },
    ];
    const standings = new Map<number, number[]>([
      [1, [101, 102, 103]],
      [2, [201, 202, 203]],
    ]);
    expect(computeDivisionSwaps(noPromo, standings)).toEqual([]);
  });
});
