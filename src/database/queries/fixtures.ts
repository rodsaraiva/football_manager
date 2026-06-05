import { Fixture, MatchEvent, MatchEventType } from '@/types';
import { DbHandle } from './players';

interface FixtureRow {
  id: number;
  competition_id: number;
  season: number;
  week: number;
  round: number | null;
  home_club_id: number;
  away_club_id: number;
  home_goals: number | null;
  away_goals: number | null;
  played: number;
  attendance: number | null;
}

interface MatchEventRow {
  id: number;
  fixture_id: number;
  minute: number;
  type: string;
  player_id: number;
  secondary_player_id: number | null;
}

function rowToFixture(row: FixtureRow): Fixture {
  return {
    id: row.id,
    competitionId: row.competition_id,
    season: row.season,
    week: row.week,
    round: row.round,
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
    .all(saveId, season, week) as FixtureRow[];
  return rows.map(rowToFixture);
}

export async function getFixturesByClub(db: DbHandle, saveId: number, clubId: number, season: number): Promise<Fixture[]> {
  const rows = await db
    .prepare('SELECT * FROM fixtures WHERE save_id = ? AND season = ? AND (home_club_id = ? OR away_club_id = ?)')
    .all(saveId, season, clubId, clubId) as FixtureRow[];
  return rows.map(rowToFixture);
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
    .all(fixtureId) as MatchEventRow[];
  return rows.map(rowToMatchEvent);
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
    .get(saveId, season, clubId, clubId) as FixtureRow | undefined;
  return row ? rowToFixture(row) : null;
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
    .all(saveId, season, clubId, clubId, limit) as FixtureRow[];
  return rows.map(rowToFixture);
}
