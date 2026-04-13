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
  entries.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  return entries;
}
