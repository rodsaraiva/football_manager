/**
 * Shared helpers for end-to-end (integration) tests.
 *
 * These tests exercise the engine + queries + game-loop together against an
 * in-memory SQLite DB, simulating realistic player interactions without the
 * UI layer.
 */
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import {
  createCompetition,
  addCompetitionEntry,
  getAllLeagues,
} from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import { advanceGameWeek, AdvanceWeekResult } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';

export interface E2EContext {
  rawDb: Database.Database;
  db: DbHandle;
  playerClubId: number;
  season: number;
  week: number;
}

/**
 * Bootstraps a full end-to-end context: seeded DB, season calendar, fixtures
 * ready to play. The player controls `playerClubId` (default 1).
 */
export async function createE2EContext(
  opts: { playerClubId?: number; season?: number } = {},
): Promise<E2EContext> {
  const season = opts.season ?? 1;
  const playerClubId = opts.playerClubId ?? 1;

  const rawDb = createTestDb();
  seedTestDb(rawDb);
  const db = createTestDbHandle(rawDb);

  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, league.id);
    clubsByLeague[league.id] = clubs.map((c) => c.id);
  }
  const calendar = generateSeasonCalendar({
    season,
    leagues,
    clubsByLeague,
    championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, {
      id: comp.id,
      name: comp.name,
      type: comp.type,
      format: comp.format,
      season: comp.season,
      leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) {
    await addCompetitionEntry(db, entry);
  }
  for (const fixture of calendar.fixtures) {
    await createFixture(db, {
      id: fixture.id,
      competitionId: fixture.competitionId,
      season: fixture.season,
      week: fixture.week,
      round: fixture.round as string | null,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
    });
  }

  return { rawDb, db, playerClubId, season, week: 1 };
}

/**
 * Advances the game one week, mutating the context's week/season pointer.
 */
export async function stepWeek(ctx: E2EContext, seed = 42): Promise<AdvanceWeekResult> {
  const rng = new SeededRng(seed + ctx.season * 100 + ctx.week);
  const result = await advanceGameWeek({
    dbHandle: ctx.db,
    season: ctx.season,
    week: ctx.week,
    playerClubId: ctx.playerClubId,
    saveId: -1,
    rng,
  });
  ctx.season = result.newSeason;
  ctx.week = result.newWeek;
  return result;
}

/**
 * Advances several weeks, returning the last result.
 */
export async function stepWeeks(
  ctx: E2EContext,
  count: number,
  seed = 42,
): Promise<AdvanceWeekResult | null> {
  let last: AdvanceWeekResult | null = null;
  for (let i = 0; i < count; i++) {
    last = await stepWeek(ctx, seed + i);
    if (last.isSeasonEnd) break;
  }
  return last;
}

/**
 * Picks a player from the player's squad at the given position.
 */
export function pickPlayerFromSquad(
  ctx: E2EContext,
  position: string,
): { id: number; market_value: number; wage: number; age: number } | null {
  const row = ctx.rawDb
    .prepare(
      `SELECT id, market_value, wage, age FROM players
       WHERE club_id = ? AND position = ? AND is_free_agent = 0
       LIMIT 1`,
    )
    .get(ctx.playerClubId, position) as
    | { id: number; market_value: number; wage: number; age: number }
    | undefined;
  return row ?? null;
}

/**
 * Picks a player from a rival club at the given position.
 */
export function pickPlayerFromRival(
  ctx: E2EContext,
  position: string,
): { id: number; club_id: number; market_value: number; wage: number; age: number } | null {
  const row = ctx.rawDb
    .prepare(
      `SELECT id, club_id, market_value, wage, age FROM players
       WHERE club_id != ? AND club_id IS NOT NULL AND position = ? AND is_free_agent = 0
       ORDER BY market_value DESC
       LIMIT 1`,
    )
    .get(ctx.playerClubId, position) as
    | { id: number; club_id: number; market_value: number; wage: number; age: number }
    | undefined;
  return row ?? null;
}

/** Marks a player as free agent (for testing free-agent flows). */
export function makeFreeAgent(ctx: E2EContext, playerId: number): void {
  ctx.rawDb
    .prepare('UPDATE players SET club_id = NULL, is_free_agent = 1 WHERE id = ?')
    .run(playerId);
}

/** Reads the current club_id of a player. */
export function getPlayerClub(ctx: E2EContext, playerId: number): number | null {
  const row = ctx.rawDb
    .prepare('SELECT club_id FROM players WHERE id = ?')
    .get(playerId) as { club_id: number | null } | undefined;
  return row?.club_id ?? null;
}

/** Reads the current budget of a club. */
export function getClubBudget(ctx: E2EContext, clubId: number): number {
  const row = ctx.rawDb
    .prepare('SELECT budget FROM clubs WHERE id = ?')
    .get(clubId) as { budget: number } | undefined;
  return row?.budget ?? 0;
}

/** Counts players in a given club. */
export function countSquad(ctx: E2EContext, clubId: number): number {
  const row = ctx.rawDb
    .prepare('SELECT COUNT(*) as c FROM players WHERE club_id = ? AND is_free_agent = 0')
    .get(clubId) as { c: number };
  return row.c;
}

/** Returns the status of an offer (or null if the offer doesn't exist). */
export function getOfferStatus(ctx: E2EContext, offerId: number): string | null {
  const row = ctx.rawDb
    .prepare('SELECT status FROM transfer_offers WHERE id = ?')
    .get(offerId) as { status: string } | undefined;
  return row?.status ?? null;
}
