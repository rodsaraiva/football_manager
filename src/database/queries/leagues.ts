import { Country, League, Competition, CompetitionEntry, CompetitionType, CompetitionFormat } from '@/types';
import { DbHandle } from './players';

interface CountryRow {
  id: number;
  name: string;
  code: string;
  continent: string;
}

interface LeagueRow {
  id: number;
  name: string;
  country_id: number;
  division_level: number;
  num_teams: number;
  promotion_spots: number;
  relegation_spots: number;
}

interface CompetitionRow {
  id: number;
  name: string;
  type: string;
  format: string;
  season: number;
  league_id: number | null;
}

interface CompetitionEntryRow {
  competition_id: number;
  club_id: number;
  group_name: string | null;
  seed: number;
}

function rowToCountry(row: CountryRow): Country {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    continent: row.continent,
  };
}

function rowToLeague(row: LeagueRow): League {
  return {
    id: row.id,
    name: row.name,
    countryId: row.country_id,
    divisionLevel: row.division_level,
    numTeams: row.num_teams,
    promotionSpots: row.promotion_spots,
    relegationSpots: row.relegation_spots,
  };
}

function rowToCompetition(row: CompetitionRow): Competition {
  return {
    id: row.id,
    name: row.name,
    type: row.type as CompetitionType,
    format: row.format as CompetitionFormat,
    season: row.season,
    leagueId: row.league_id,
  };
}

function rowToCompetitionEntry(row: CompetitionEntryRow): CompetitionEntry {
  return {
    competitionId: row.competition_id,
    clubId: row.club_id,
    groupName: row.group_name,
    seed: row.seed,
  };
}

export function getAllCountries(db: DbHandle): Country[] {
  const rows = db.prepare('SELECT * FROM countries').all() as CountryRow[];
  return rows.map(rowToCountry);
}

export function getAllLeagues(db: DbHandle): League[] {
  const rows = db.prepare('SELECT * FROM leagues').all() as LeagueRow[];
  return rows.map(rowToLeague);
}

export function getLeagueById(db: DbHandle, leagueId: number): League | null {
  const row = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId) as LeagueRow | undefined;
  return row ? rowToLeague(row) : null;
}

export interface CreateCompetitionInput {
  id: number;
  name: string;
  type: CompetitionType;
  format: CompetitionFormat;
  season: number;
  leagueId?: number | null;
}

export function createCompetition(db: DbHandle, input: CreateCompetitionInput): number {
  const result = db
    .prepare(
      'INSERT INTO competitions (id, name, type, format, season, league_id) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(input.id, input.name, input.type, input.format, input.season, input.leagueId ?? null) as {
    lastInsertRowid: number | bigint;
  };
  return Number(result.lastInsertRowid);
}

export function getCompetitionsBySeason(db: DbHandle, season: number): Competition[] {
  const rows = db
    .prepare('SELECT * FROM competitions WHERE season = ?')
    .all(season) as CompetitionRow[];
  return rows.map(rowToCompetition);
}

export interface AddCompetitionEntryInput {
  competitionId: number;
  clubId: number;
  groupName?: string | null;
  seed?: number;
}

export function addCompetitionEntry(db: DbHandle, input: AddCompetitionEntryInput): void {
  db.prepare(
    'INSERT INTO competition_entries (competition_id, club_id, group_name, seed) VALUES (?, ?, ?, ?)',
  ).run(input.competitionId, input.clubId, input.groupName ?? null, input.seed ?? 0);
}

export function getCompetitionEntries(db: DbHandle, competitionId: number): CompetitionEntry[] {
  const rows = db
    .prepare('SELECT * FROM competition_entries WHERE competition_id = ?')
    .all(competitionId) as CompetitionEntryRow[];
  return rows.map(rowToCompetitionEntry);
}
