import { DbHandle } from '@/database/queries/players';

// ─── Constants ──────────────────────────────────────────────────────────────

/** How many weeks a player has to respond to a counter-offer before the
 *  other party walks away. */
export const OFFER_EXPIRATION_WEEKS = 2;

/** After a firm rejection, how many weeks before the same club can bid for
 *  the same player again. */
export const BLOCK_DURATION_WEEKS = 4;

/** Maximum rounds of back-and-forth. After this, counters flip to firm
 *  accept/reject. */
export const MAX_NEGOTIATION_ROUNDS = 4;

// ─── Helpers ────────────────────────────────────────────────────────────────

function weekDiff(
  fromSeason: number,
  fromWeek: number,
  toSeason: number,
  toWeek: number,
  weeksPerSeason = 46,
): number {
  return (toSeason - fromSeason) * weeksPerSeason + (toWeek - fromWeek);
}

// ─── Block system ──────────────────────────────────────────────────────────

/**
 * After a firm rejection, add a temporary block so the same club doesn't
 * immediately re-bid for the same player.
 */
export async function blockClubFromPlayer(
  db: DbHandle,
  playerId: number,
  offeringClubId: number,
  currentSeason: number,
  currentWeek: number,
): Promise<void> {
  const untilWeek = currentWeek + BLOCK_DURATION_WEEKS;
  const untilSeason = currentSeason + Math.floor(untilWeek / 46);
  const wrappedWeek = untilWeek % 46 || 46;
  await db
    .prepare(
      `INSERT INTO transfer_blocks (player_id, offering_club_id, blocked_until_season, blocked_until_week)
       VALUES (?, ?, ?, ?)`,
    )
    .run(playerId, offeringClubId, untilSeason, wrappedWeek);
}

/** Returns true if this club is currently blocked from bidding on this player. */
export async function isClubBlocked(
  db: DbHandle,
  playerId: number,
  offeringClubId: number,
  currentSeason: number,
  currentWeek: number,
): Promise<boolean> {
  const rows = (await db
    .prepare(
      `SELECT blocked_until_season, blocked_until_week FROM transfer_blocks
       WHERE player_id = ? AND offering_club_id = ?`,
    )
    .all(playerId, offeringClubId)) as Array<{
    blocked_until_season: number;
    blocked_until_week: number;
  }>;

  for (const r of rows) {
    const diff = weekDiff(currentSeason, currentWeek, r.blocked_until_season, r.blocked_until_week);
    if (diff > 0) return true;
  }
  return false;
}

/**
 * Purge blocks whose expiry has passed. Called periodically from the game
 * loop to keep the table lean.
 */
export async function prunExpiredBlocks(
  db: DbHandle,
  currentSeason: number,
  currentWeek: number,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM transfer_blocks
       WHERE (blocked_until_season < ?)
          OR (blocked_until_season = ? AND blocked_until_week <= ?)`,
    )
    .run(currentSeason, currentSeason, currentWeek);
}

// ─── Offer expiration ──────────────────────────────────────────────────────

/**
 * Expires offers (status pending or countered) whose created_week is older
 * than OFFER_EXPIRATION_WEEKS. The other party has walked away.
 */
export async function expireStaleOffers(
  db: DbHandle,
  currentSeason: number,
  currentWeek: number,
): Promise<number> {
  const stale = (await db
    .prepare(
      `SELECT id, created_season, created_week, response_week FROM transfer_offers
       WHERE status IN ('pending', 'countered')
         AND created_season IS NOT NULL AND created_week IS NOT NULL`,
    )
    .all()) as Array<{
    id: number;
    created_season: number;
    created_week: number;
    response_week: number | null;
  }>;

  let expired = 0;
  for (const row of stale) {
    // The "clock" starts from whenever the offer last saw activity.
    // If response_week is set (AI responded), that's the reference;
    // otherwise use created_week. Both are advanced in the same "year" unit.
    const refWeek = row.response_week ?? row.created_week;
    const refSeason = row.response_week !== null ? currentSeason : row.created_season;
    const age = weekDiff(refSeason, refWeek, currentSeason, currentWeek);
    if (age >= OFFER_EXPIRATION_WEEKS) {
      await db
        .prepare("UPDATE transfer_offers SET status = 'rejected', response_week = ? WHERE id = ?")
        .run(currentWeek, row.id);
      expired++;
    }
  }
  return expired;
}

// ─── Round counting ────────────────────────────────────────────────────────

/** Increments the round counter for a given offer. */
export async function incrementOfferRound(db: DbHandle, offerId: number): Promise<number> {
  await db
    .prepare('UPDATE transfer_offers SET round_count = round_count + 1 WHERE id = ?')
    .run(offerId);
  const row = (await db
    .prepare('SELECT round_count FROM transfer_offers WHERE id = ?')
    .get(offerId)) as { round_count: number };
  return row.round_count;
}

/** Has this offer exceeded the maximum negotiation rounds? */
export async function hasExceededMaxRounds(db: DbHandle, offerId: number): Promise<boolean> {
  const row = (await db
    .prepare('SELECT round_count FROM transfer_offers WHERE id = ?')
    .get(offerId)) as { round_count: number } | undefined;
  return !!row && row.round_count >= MAX_NEGOTIATION_ROUNDS;
}
