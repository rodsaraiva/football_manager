import { z, ZodObject } from 'zod';
import { Fixture, MatchEvent, MatchEventType } from '@/types';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';

// Campos consumidos por rowToFixture; .passthrough() deixa save_id passar.
const fixtureRowSchema = z
  .object({
    id: z.number(),
    competition_id: z.number(),
    season: z.number(),
    week: z.number(),
    // round é coluna TEXT (numérico-string ou null); rowToFixture mantém o passthrough
    // tipado como number|null e os consumidores coagem via Number(). Ver cup-bracket.ts.
    round: z.string().nullable(),
    home_club_id: z.number(),
    away_club_id: z.number(),
    home_goals: z.number().nullable(),
    away_goals: z.number().nullable(),
    played: z.number(),
    attendance: z.number().nullable(),
  })
  .passthrough();
type FixtureRow = z.infer<typeof fixtureRowSchema>;

const matchEventRowSchema = z
  .object({
    fixture_id: z.number(),
    minute: z.number(),
    type: z.string(),
    player_id: z.number(),
    secondary_player_id: z.number().nullable(),
  })
  .passthrough();
type MatchEventRow = z.infer<typeof matchEventRowSchema>;

// Projeção COUNT(*): não é linha de tabela, fica fora de __rowSchemas.
const countWinsRowSchema = z.object({ wins: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'fixtures', schema: fixtureRowSchema },
  { table: 'match_events', schema: matchEventRowSchema },
];

function rowToFixture(row: FixtureRow): Fixture {
  return {
    id: row.id,
    competitionId: row.competition_id,
    season: row.season,
    week: row.week,
    round: row.round as unknown as number | null,
    homeClubId: row.home_club_id,
    awayClubId: row.away_club_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    played: row.played === 1,
    attendance: row.attendance,
  };
}

function rowToMatchEvent(row: MatchEventRow): MatchEvent {
  return {
    fixtureId: row.fixture_id,
    minute: row.minute,
    type: row.type as MatchEventType,
    playerId: row.player_id,
    secondaryPlayerId: row.secondary_player_id,
  };
}

export interface CreateFixtureInput {
  id: number;
  competitionId: number;
  season: number;
  week: number;
  round?: string | null;
  homeClubId: number;
  awayClubId: number;
}

export async function createFixture(db: DbHandle, saveId: number, input: CreateFixtureInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO fixtures (id, save_id, competition_id, season, week, round, home_club_id, away_club_id, played)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(
      input.id,
      saveId,
      input.competitionId,
      input.season,
      input.week,
      input.round ?? null,
      input.homeClubId,
      input.awayClubId,
    ) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function getFixturesByWeek(db: DbHandle, saveId: number, season: number, week: number): Promise<Fixture[]> {
  const rows = await db
    .prepare('SELECT * FROM fixtures WHERE save_id = ? AND season = ? AND week = ?')
    .all(saveId, season, week);
  return parseRows(fixtureRowSchema, rows, 'fixtures.getFixturesByWeek').map(rowToFixture);
}

export async function getFixturesByClub(db: DbHandle, saveId: number, clubId: number, season: number): Promise<Fixture[]> {
  const rows = await db
    .prepare('SELECT * FROM fixtures WHERE save_id = ? AND season = ? AND (home_club_id = ? OR away_club_id = ?)')
    .all(saveId, season, clubId, clubId);
  return parseRows(fixtureRowSchema, rows, 'fixtures.getFixturesByClub').map(rowToFixture);
}

export async function updateFixtureResult(
  db: DbHandle,
  saveId: number,
  fixtureId: number,
  homeGoals: number,
  awayGoals: number,
  attendance?: number,
): Promise<void> {
  await db.prepare(
    'UPDATE fixtures SET home_goals = ?, away_goals = ?, played = 1, attendance = ? WHERE save_id = ? AND id = ?',
  ).run(homeGoals, awayGoals, attendance ?? null, saveId, fixtureId);
}

export interface AddMatchEventInput {
  fixtureId: number;
  minute: number;
  type: MatchEventType;
  playerId: number;
  secondaryPlayerId?: number | null;
}

export async function addMatchEvent(db: DbHandle, input: AddMatchEventInput): Promise<void> {
  await db.prepare(
    'INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id) VALUES (?, ?, ?, ?, ?)',
  ).run(input.fixtureId, input.minute, input.type, input.playerId, input.secondaryPlayerId ?? null);
}

export async function getMatchEvents(db: DbHandle, fixtureId: number): Promise<MatchEvent[]> {
  const rows = await db
    .prepare('SELECT * FROM match_events WHERE fixture_id = ? ORDER BY minute ASC')
    .all(fixtureId);
  return parseRows(matchEventRowSchema, rows, 'fixtures.getMatchEvents').map(rowToMatchEvent);
}

/**
 * Returns the next unplayed fixture for a club in a given season,
 * ordered by week ascending (first upcoming match).
 */
export async function getNextFixtureForClub(
  db: DbHandle,
  saveId: number,
  clubId: number,
  season: number,
): Promise<Fixture | null> {
  const row = await db
    .prepare(
      `SELECT * FROM fixtures
       WHERE save_id = ? AND played = 0 AND season = ? AND (home_club_id = ? OR away_club_id = ?)
       ORDER BY week ASC
       LIMIT 1`,
    )
    .get(saveId, season, clubId, clubId);
  const parsed = parseRow(fixtureRowSchema, row, 'fixtures.getNextFixtureForClub');
  return parsed ? rowToFixture(parsed) : null;
}

/**
 * Counts the user's club's WON fixtures across the whole save (all seasons/competitions),
 * including friendlies-free official matches only (the friendlies table is separate, so it
 * is naturally excluded). Used by the post-match achievement checkpoint (totalWins).
 */
export async function countClubWins(db: DbHandle, saveId: number, clubId: number): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS wins FROM fixtures
       WHERE save_id = ? AND played = 1
         AND ((home_club_id = ? AND home_goals > away_goals)
           OR (away_club_id = ? AND away_goals > home_goals))`,
    )
    .get(saveId, clubId, clubId);
  return parseRow(countWinsRowSchema, row, 'fixtures.countClubWins')?.wins ?? 0;
}

/**
 * Returns recent played fixtures for a club in a season, most recent first.
 */
export async function getRecentFixturesForClub(
  db: DbHandle,
  saveId: number,
  clubId: number,
  season: number,
  limit: number = 5,
): Promise<Fixture[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM fixtures
       WHERE save_id = ? AND played = 1 AND season = ? AND (home_club_id = ? OR away_club_id = ?)
       ORDER BY week DESC
       LIMIT ?`,
    )
    .all(saveId, season, clubId, clubId, limit);
  return parseRows(fixtureRowSchema, rows, 'fixtures.getRecentFixturesForClub').map(rowToFixture);
}
