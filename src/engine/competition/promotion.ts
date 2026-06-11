import { League } from '@/types';

export interface DivisionPair {
  higherLeagueId: number;
  lowerLeagueId: number;
  relegationSpots: number;
  promotionSpots: number;
}

export interface ClubSwap {
  clubId: number;
  fromLeagueId: number;
  toLeagueId: number;
}

/**
 * Links each league to the league one division below it in the SAME country.
 * relegationSpots is taken from the higher league, promotionSpots from the lower.
 */
export function buildDivisionPairs(leagues: League[]): DivisionPair[] {
  const byKey = new Map<string, League>();
  for (const l of leagues) byKey.set(`${l.countryId}:${l.divisionLevel}`, l);

  const pairs: DivisionPair[] = [];
  for (const higher of leagues) {
    const lower = byKey.get(`${higher.countryId}:${higher.divisionLevel + 1}`);
    if (!lower) continue;
    pairs.push({
      higherLeagueId: higher.id,
      lowerLeagueId: lower.id,
      relegationSpots: higher.relegationSpots,
      promotionSpots: lower.promotionSpots,
    });
  }
  return pairs;
}

/**
 * From each pair's final standings (1st..last), swap the bottom N of the higher
 * league with the top N of the lower, where N = min(relegationSpots, promotionSpots).
 */
export function computeDivisionSwaps(
  pairs: DivisionPair[],
  standingsByLeague: Map<number, number[]>,
): ClubSwap[] {
  const swaps: ClubSwap[] = [];
  for (const pair of pairs) {
    const higher = standingsByLeague.get(pair.higherLeagueId) ?? [];
    const lower = standingsByLeague.get(pair.lowerLeagueId) ?? [];
    const n = Math.min(pair.relegationSpots, pair.promotionSpots, higher.length, lower.length);
    if (n <= 0) continue;
    const relegated = higher.slice(higher.length - n); // bottom N
    const promoted = lower.slice(0, n); // top N
    for (const clubId of relegated) {
      swaps.push({ clubId, fromLeagueId: pair.higherLeagueId, toLeagueId: pair.lowerLeagueId });
    }
    for (const clubId of promoted) {
      swaps.push({ clubId, fromLeagueId: pair.lowerLeagueId, toLeagueId: pair.higherLeagueId });
    }
  }
  return swaps;
}
