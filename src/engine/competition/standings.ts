import { Fixture } from '@/types';

export interface StandingsEntry {
  clubId: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export function calculateStandings(fixtures: Fixture[], clubIds: number[]): StandingsEntry[] {
  const map = new Map<number, StandingsEntry>();
  for (const id of clubIds) {
    map.set(id, { clubId: id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 });
  }

  for (const f of fixtures) {
    if (!f.played || f.homeGoals === null || f.awayGoals === null) continue;
    const home = map.get(f.homeClubId);
    const away = map.get(f.awayClubId);
    if (!home || !away) continue;

    home.played++; away.played++;
    home.goalsFor += f.homeGoals; home.goalsAgainst += f.awayGoals;
    away.goalsFor += f.awayGoals; away.goalsAgainst += f.homeGoals;

    if (f.homeGoals > f.awayGoals) { home.wins++; home.points += 3; away.losses++; }
    else if (f.homeGoals < f.awayGoals) { away.wins++; away.points += 3; home.losses++; }
    else { home.draws++; away.draws++; home.points += 1; away.points += 1; }
  }

  const entries = Array.from(map.values());
  for (const e of entries) e.goalDifference = e.goalsFor - e.goalsAgainst;
  entries.sort((a, b) => compareStandings(a, b, fixtures));
  return entries;
}

/**
 * Comparator: points → GD → GF → head-to-head (points then GD among the tied set)
 * → clubId (deterministic final fallback). `fixtures` is the full set of played
 * fixtures, used only to resolve the H2H sub-table.
 */
export function compareStandings(
  a: StandingsEntry,
  b: StandingsEntry,
  fixtures: Fixture[],
): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

  // Head-to-head between exactly a and b.
  let aPts = 0, bPts = 0, aGd = 0, bGd = 0;
  for (const f of fixtures) {
    if (!f.played || f.homeGoals === null || f.awayGoals === null) continue;
    const isAB = f.homeClubId === a.clubId && f.awayClubId === b.clubId;
    const isBA = f.homeClubId === b.clubId && f.awayClubId === a.clubId;
    if (!isAB && !isBA) continue;
    const aGoals = isAB ? f.homeGoals : f.awayGoals;
    const bGoals = isAB ? f.awayGoals : f.homeGoals;
    aGd += aGoals - bGoals; bGd += bGoals - aGoals;
    if (aGoals > bGoals) aPts += 3;
    else if (bGoals > aGoals) bPts += 3;
    else { aPts += 1; bPts += 1; }
  }
  if (bPts !== aPts) return bPts - aPts;
  if (bGd !== aGd) return bGd - aGd;

  return a.clubId - b.clubId;
}
