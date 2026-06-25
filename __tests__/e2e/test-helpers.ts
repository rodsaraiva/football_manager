/**
 * Shared helpers for end-to-end (integration) tests.
 *
 * These tests exercise the engine + queries + game-loop together against an
 * in-memory SQLite DB, simulating realistic player interactions without the
 * UI layer.
 */
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../database/test-helpers';
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
import { evaluateSeasonEndBoard } from '@/engine/season/season-end-eval';
import { runSeasonTransition } from '@/engine/season/season-transition';
import { acceptJobOffer } from '@/engine/board/accept-job-offer';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getClubById } from '@/database/queries/clubs';
import { setJobOffersPending, setUnemployed, markSaveEnded } from '@/database/queries/save';
import { getPendingJobOffers } from '@/database/queries/job-offers';
import { isManagerDismissed } from '@/engine/board/season-outcome';

export interface E2EContext {
  rawDb: Database.Database;
  db: DbHandle;
  saveId: number;
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
    const clubs = await getClubsByLeague(db, TEST_SAVE_ID, league.id);
    clubsByLeague[league.id] = clubs.map((c) => c.id);
  }
  const calendar = generateSeasonCalendar({
    season,
    leagues,
    clubsByLeague,
    championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, TEST_SAVE_ID, {
      id: comp.id,
      name: comp.name,
      type: comp.type,
      format: comp.format,
      season: comp.season,
      leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) {
    await addCompetitionEntry(db, TEST_SAVE_ID, entry);
  }
  for (const fixture of calendar.fixtures) {
    await createFixture(db, TEST_SAVE_ID, {
      id: fixture.id,
      competitionId: fixture.competitionId,
      season: fixture.season,
      week: fixture.week,
      round: fixture.round as string | null,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
    });
  }

  return { rawDb, db, saveId: TEST_SAVE_ID, playerClubId, season, week: 1 };
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
    saveId: ctx.saveId,
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

/** Advance week-by-week until the season ends; returns the season-end AdvanceWeekResult. */
export async function playUntilSeasonEnd(ctx: E2EContext, seed = 42): Promise<AdvanceWeekResult> {
  let r: AdvanceWeekResult | null = null;
  let guard = 0;
  do {
    r = await stepWeek(ctx, seed);
    guard++;
  } while (!r.isSeasonEnd && guard < 70);
  if (!r || !r.isSeasonEnd) throw new Error('season did not end within 70 weeks');
  return r;
}

/**
 * Responds to the job-offers gate: accepts the given club's offer (club switch) or,
 * if null, declines all pending offers. Mirrors EndOfSeasonScreen's offer gate.
 */
export async function respondToJobOfferGate(
  ctx: E2EContext,
  endedSeason: number,
  offeringClubIdOrNull: number | null,
): Promise<boolean> {
  if (offeringClubIdOrNull == null) {
    await setJobOffersPending(ctx.db, ctx.saveId, false);
    return false;
  }
  await acceptJobOffer({
    db: ctx.db,
    saveId: ctx.saveId,
    offeringClubId: offeringClubIdOrNull,
    offerSeason: endedSeason,
    newSeason: ctx.season,
    band: 'step_up',
    rng: new SeededRng(ctx.saveId * 13 + endedSeason),
  });
  ctx.playerClubId = offeringClubIdOrNull;
  return true;
}

export interface EndSeasonHeadlessResult {
  /** True when the board evaluation dismissed the manager (W2 rescue branch taken). */
  fired: boolean;
  /** True when the player ended up at a different club (offer accepted). */
  switched: boolean;
  newClubId: number | null;
}

/**
 * Full headless season-end ceremony, mirroring EndOfSeasonScreen:
 * evaluate board → (if fired: rescue branch | else: transition + offer gate).
 * Call right after playUntilSeasonEnd returns isSeasonEnd. When `accept` is true, picks the
 * first pending offer (the offer-gate switch). The transition runs with the ORIGINAL club —
 * exactly like the UI, where rolloverSeason happens before the offer gate.
 *
 * W2 dismissed branch (board.consequence === 'fired'), mirroring EndOfSeasonScreen.handleContinue:
 *   - accept + rescue offers exist → runSeasonTransition (original club, the world rolls) +
 *     acceptJobOffer (first rescue offer) + setUnemployed(false); { fired, switched:true, newClubId }.
 *   - else → markSaveEnded (career over); { fired:true, switched:false }.
 */
export async function endSeasonHeadless(
  ctx: E2EContext,
  opts: { accept: boolean } = { accept: false },
): Promise<EndSeasonHeadlessResult> {
  const endedSeason = ctx.season - 1; // advanceGameWeek already bumped the pointer
  const club = (await getClubById(ctx.db, ctx.saveId, ctx.playerClubId))!;
  const comps = (await getCompetitionsBySeason(ctx.db, ctx.saveId, endedSeason)).map((c) => ({
    id: c.id,
    type: c.type,
  }));

  const evalRes = await evaluateSeasonEndBoard(ctx.db, {
    saveId: ctx.saveId,
    playerClubId: ctx.playerClubId,
    clubReputation: club.reputation,
    endedSeason,
    newSeason: ctx.season,
    competitions: comps,
    offerRng: new SeededRng(ctx.season * 6151 + ctx.saveId), // espelha o seed da UI (nova temporada)
  });

  // ── W2: dismissed → rescue offers (down-band) instead of an immediate game over ──
  if (isManagerDismissed(evalRes.board.consequence)) {
    const pending = await getPendingJobOffers(ctx.db, ctx.saveId, endedSeason);
    if (opts.accept && pending.length > 0) {
      // The world rolls with the ORIGINAL club (rescue club rolled along), then we switch.
      await runSeasonTransition(ctx.db, {
        saveId: ctx.saveId,
        playerClubId: ctx.playerClubId,
        endedSeason,
        newSeason: ctx.season,
        youthAcademyLevel: club.youthAcademy,
        rng: new SeededRng(ctx.season * 7777),
      });
      const newClubId = pending[0].offeringClubId;
      await acceptJobOffer({
        db: ctx.db,
        saveId: ctx.saveId,
        offeringClubId: newClubId,
        offerSeason: endedSeason,
        newSeason: ctx.season,
        band: 'rescue',
        rng: new SeededRng(ctx.saveId * 13 + endedSeason),
      });
      await setUnemployed(ctx.db, ctx.saveId, false);
      ctx.playerClubId = newClubId;
      return { fired: true, switched: true, newClubId };
    }
    // No rescue accepted → career over.
    await markSaveEnded(ctx.db, ctx.saveId);
    return { fired: true, switched: false, newClubId: null };
  }

  // ── Retained: transition runs with the ORIGINAL club (rollover before the offer gate) ──
  await runSeasonTransition(ctx.db, {
    saveId: ctx.saveId,
    playerClubId: ctx.playerClubId,
    endedSeason,
    newSeason: ctx.season,
    youthAcademyLevel: club.youthAcademy,
    rng: new SeededRng(ctx.season * 7777),
  });

  // Respond to the offer gate — accept the FIRST pending offer if requested (robust:
  // does not depend on generatedOfferClubIds; accepts any persisted/pending offer).
  let newClubId: number | null = null;
  if (opts.accept) {
    const pending = await getPendingJobOffers(ctx.db, ctx.saveId, endedSeason);
    newClubId = pending[0]?.offeringClubId ?? null;
  }
  const switched = await respondToJobOfferGate(ctx, endedSeason, newClubId);
  return { fired: false, switched, newClubId: switched ? newClubId : null };
}
