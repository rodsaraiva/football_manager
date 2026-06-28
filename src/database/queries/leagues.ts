import { z, ZodObject } from 'zod';
import { Country, League, Competition, CompetitionEntry, CompetitionType, CompetitionFormat } from '@/types';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';

const countryRowSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    code: z.string(),
    continent: z.string(),
  })
  .passthrough();
type CountryRow = z.infer<typeof countryRowSchema>;

const leagueRowSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    country_id: z.number(),
    division_level: z.number(),
    num_teams: z.number(),
    promotion_spots: z.number(),
    relegation_spots: z.number(),
  })
  .passthrough();
type LeagueRow = z.infer<typeof leagueRowSchema>;

const competitionRowSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    type: z.string(),
    format: z.string(),
    season: z.number(),
    league_id: z.number().nullable(),
  })
  .passthrough();
type CompetitionRow = z.infer<typeof competitionRowSchema>;

const competitionEntryRowSchema = z
  .object({
    competition_id: z.number(),
    club_id: z.number(),
    group_name: z.string().nullable(),
    seed: z.number(),
  })
  .passthrough();
type CompetitionEntryRow = z.infer<typeof competitionEntryRowSchema>;

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'countries', schema: countryRowSchema },
  { table: 'leagues', schema: leagueRowSchema },
  { table: 'competitions', schema: competitionRowSchema },
  { table: 'competition_entries', schema: competitionEntryRowSchema },
];

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

// ─── Reference tables (global — no save scope) ────────────────────────────────

export async function getAllCountries(db: DbHandle): Promise<Country[]> {
  const rows = await db.prepare('SELECT * FROM countries').all();
  return parseRows(countryRowSchema, rows, 'leagues.getAllCountries').map(rowToCountry);
}

export async function getAllLeagues(db: DbHandle): Promise<League[]> {
  const rows = await db.prepare('SELECT * FROM leagues').all();
  return parseRows(leagueRowSchema, rows, 'leagues.getAllLeagues').map(rowToLeague);
}

export async function getLeagueById(db: DbHandle, leagueId: number): Promise<League | null> {
  const row = await db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
  return row ? rowToLeague(parseRow(leagueRowSchema, row, 'leagues.getLeagueById')) : null;
}

// ─── World (save-scoped) ──────────────────────────────────────────────────────

export interface CreateCompetitionInput {
  id: number;
  name: string;
  type: CompetitionType;
  format: CompetitionFormat;
  season: number;
  leagueId?: number | null;
}

export async function createCompetition(db: DbHandle, saveId: number, input: CreateCompetitionInput): Promise<number> {
  const result = await db
    .prepare(
      'INSERT INTO competitions (save_id, id, name, type, format, season, league_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(saveId, input.id, input.name, input.type, input.format, input.season, input.leagueId ?? null) as {
    lastInsertRowid: number | bigint;
  };
  return Number(result.lastInsertRowid);
}

export async function getCompetitionsBySeason(db: DbHandle, saveId: number, season: number): Promise<Competition[]> {
  const rows = await db
    .prepare('SELECT * FROM competitions WHERE save_id = ? AND season = ?')
    .all(saveId, season);
  return parseRows(competitionRowSchema, rows, 'leagues.getCompetitionsBySeason').map(rowToCompetition);
}

export interface AddCompetitionEntryInput {
  competitionId: number;
  clubId: number;
  groupName?: string | null;
  seed?: number;
}

export async function addCompetitionEntry(db: DbHandle, saveId: number, input: AddCompetitionEntryInput): Promise<void> {
  await db.prepare(
    'INSERT INTO competition_entries (save_id, competition_id, club_id, group_name, seed) VALUES (?, ?, ?, ?, ?)',
  ).run(saveId, input.competitionId, input.clubId, input.groupName ?? null, input.seed ?? 0);
}

export async function getCompetitionEntries(db: DbHandle, saveId: number, competitionId: number): Promise<CompetitionEntry[]> {
  const rows = await db
    .prepare('SELECT * FROM competition_entries WHERE save_id = ? AND competition_id = ?')
    .all(saveId, competitionId);
  return parseRows(competitionEntryRowSchema, rows, 'leagues.getCompetitionEntries').map(rowToCompetitionEntry);
}
