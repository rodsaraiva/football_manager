export interface Country {
  id: number;
  name: string;
  code: string;
  continent: string;
}

export interface League {
  id: number;
  name: string;
  countryId: number;
  divisionLevel: number;
  numTeams: number;
  promotionSpots: number;
  relegationSpots: number;
}

export type CompetitionType = 'league' | 'cup' | 'continental' | 'national';
export type CompetitionFormat = 'round_robin' | 'knockout' | 'group_knockout';

export interface Competition {
  id: number;
  name: string;
  type: CompetitionType;
  format: CompetitionFormat;
  season: number;
  leagueId: number | null;
}

export interface CompetitionEntry {
  competitionId: number;
  clubId: number;
  groupName: string | null;
  seed: number;
}
