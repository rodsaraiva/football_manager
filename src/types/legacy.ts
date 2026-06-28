export interface Legend {
  playerId: number; clubId: number; legendScore: number;
  appearances: number; goals: number; trophies: number; individualAwards: number;
  firstSeason: number; lastSeason: number;
}
export type ClubRecordType =
  | 'all_time_top_scorer' | 'most_appearances' | 'biggest_win'
  | 'biggest_defeat' | 'most_trophies_in_season' | 'longest_unbeaten';
export interface ClubRecord {
  type: ClubRecordType; clubId: number; value: number;
  holderId: number | null; season: number | null; fixtureRef: number | null; detail: string;
}
export type RivalryOrigin = 'derby' | 'division' | 'regional' | 'historic';
export interface Rivalry { clubAId: number; clubBId: number; intensity: number; origin: RivalryOrigin; }
export type ManagerExitReason = 'stayed' | 'fired' | 'resigned';
export interface ManagerCareerEntry {
  season: number; clubId: number; divisionLevel: number;
  leaguePosition: number | null; totalTeams: number;
  trophies: number; managerReputation: number; exitReason: ManagerExitReason;
}
export type SeasonSagaArchetype =
  | 'historic_title' | 'title_race' | 'promotion' | 'relegation_fight'
  | 'relegated' | 'transition' | 'rebuild' | 'overachieved' | 'underachieved';
export interface SeasonSaga {
  season: number; archetype: SeasonSagaArchetype;
  titleKey: string; bodyKey: string; vars: Record<string, string | number>;
}
