import { DbHandle } from '@/database/queries/players';
import { getPendingOffers, updateOfferStatus, createTransfer } from '@/database/queries/transfers';
import { addFinanceEntry } from '@/database/queries/finances';
import { evaluateOffer } from './transfer-ai';

/**
 * Execute an accepted transfer: move player to buying club, transfer funds,
 * record in transfers table, and create finance entries for both clubs.
 */
export async function executeAcceptedTransfer(
  db: DbHandle,
  params: {
    offerId: number;
    playerId: number;
    fromClubId: number;
    toClubId: number;
    fee: number;
    wageOffered: number;
    season: number;
    week: number;
  },
): Promise<void> {
  const { offerId, playerId, fromClubId, toClubId, fee, wageOffered, season, week } = params;

  // Move player to the buying club, update wage, reset free-agent flag
  await db
    .prepare('UPDATE players SET club_id = ?, wage = ?, is_free_agent = 0 WHERE id = ?')
    .run(toClubId, wageOffered, playerId);

  // Transfer funds between clubs
  await db.prepare('UPDATE clubs SET budget = budget - ? WHERE id = ?').run(fee, toClubId);
  await db.prepare('UPDATE clubs SET budget = budget + ? WHERE id = ?').run(fee, fromClubId);

  // Record the transfer
  await createTransfer(db, {
    playerId,
    season,
    fromClubId,
    toClubId,
    fee,
    wageOffered,
    type: 'transfer',
  });

  // Finance entries
  await addFinanceEntry(db, {
    clubId: toClubId,
    season,
    week,
    type: 'transfer_out',
    amount: -fee,
    description: `Transfer fee paid for player #${playerId}`,
  });
  await addFinanceEntry(db, {
    clubId: fromClubId,
    season,
    week,
    type: 'transfer_in',
    amount: fee,
    description: `Transfer fee received for player #${playerId}`,
  });

  // Mark offer as accepted (in case it wasn't already)
  await updateOfferStatus(db, offerId, 'accepted', week);
}

/**
 * Process all pending offers: run evaluateOffer() against each and update
 * status. Accepted offers are executed immediately (player moves, money moves).
 *
 * Pending offers are processed regardless of whether it's a transfer window;
 * once a player has submitted an offer the selling club responds.
 */
export async function processPendingOffers(
  db: DbHandle,
  season: number,
  week: number,
): Promise<void> {
  const pending = await getPendingOffers(db);
  if (pending.length === 0) return;

  for (const offer of pending) {
    // Load player + club details
    const player = await db
      .prepare(
        'SELECT id, club_id, market_value, age, wage, contract_end, is_free_agent FROM players WHERE id = ?',
      )
      .get(offer.playerId) as
      | {
          id: number;
          club_id: number | null;
          market_value: number;
          age: number;
          wage: number;
          contract_end: number;
          is_free_agent: number;
        }
      | undefined;

    if (!player) {
      await updateOfferStatus(db, offer.id, 'rejected', week);
      continue;
    }

    // If player is a free agent, this path shouldn't be used — free agents
    // are signed directly (handled elsewhere). Reject to avoid weirdness.
    if (player.is_free_agent === 1 || player.club_id === null) {
      await updateOfferStatus(db, offer.id, 'rejected', week);
      continue;
    }

    // If player has already moved to offering club for any reason, reject
    if (player.club_id === offer.offeringClubId) {
      await updateOfferStatus(db, offer.id, 'rejected', week);
      continue;
    }

    // Count teammates at player's position to derive starter/replacement signals
    const [{ same_pos_count }] = (await db
      .prepare(
        `SELECT COUNT(*) as same_pos_count FROM players
         WHERE club_id = ? AND id != ?
           AND position = (SELECT position FROM players WHERE id = ?)`,
      )
      .all(player.club_id, player.id, player.id)) as Array<{ same_pos_count: number }>;

    // Without a starting-lineup signal in the schema, assume the player is a
    // starter (the AI will favour keeping him) and say a replacement exists if
    // at least one other teammate shares his primary position.
    const playerIsStarter = true;
    const clubHasReplacement = same_pos_count >= 1;
    const contractYearsLeft = Math.max(0, player.contract_end - season);

    const result = evaluateOffer({
      playerMarketValue: player.market_value,
      feeOffered: offer.feeOffered,
      playerIsStarter,
      clubHasReplacement,
      playerAge: player.age,
      contractYearsLeft,
    });

    if (result.decision === 'accept') {
      // Execute immediately
      await executeAcceptedTransfer(db, {
        offerId: offer.id,
        playerId: offer.playerId,
        fromClubId: player.club_id,
        toClubId: offer.offeringClubId,
        fee: offer.feeOffered,
        wageOffered: offer.wageOffered,
        season,
        week,
      });
    } else if (result.decision === 'reject') {
      await updateOfferStatus(db, offer.id, 'rejected', week);
    } else {
      // counter
      await db
        .prepare(
          "UPDATE transfer_offers SET status = 'countered', response_week = ?, fee_offered = ? WHERE id = ?",
        )
        .run(week, result.counterFee ?? offer.feeOffered, offer.id);
    }
  }
}

/**
 * Executes a counter-offer acceptance initiated by the player.
 * The offer is already at status `countered` with the counterFee stored in
 * fee_offered. Calling this finalizes the deal immediately.
 */
export async function acceptCounterOffer(
  db: DbHandle,
  offerId: number,
  season: number,
  week: number,
): Promise<{ success: boolean; reason?: string }> {
  const row = await db
    .prepare('SELECT * FROM transfer_offers WHERE id = ?')
    .get(offerId) as
    | {
        id: number;
        player_id: number;
        offering_club_id: number;
        selling_club_id: number;
        fee_offered: number;
        wage_offered: number;
        status: string;
      }
    | undefined;

  if (!row) return { success: false, reason: 'Offer not found' };
  if (row.status !== 'countered') return { success: false, reason: 'Offer is not in countered state' };

  // Check buyer still has budget
  const buyer = await db
    .prepare('SELECT budget FROM clubs WHERE id = ?')
    .get(row.offering_club_id) as { budget: number } | undefined;

  if (!buyer) return { success: false, reason: 'Buying club not found' };
  if (buyer.budget < row.fee_offered) {
    return { success: false, reason: 'Insufficient budget to meet counter-offer' };
  }

  await executeAcceptedTransfer(db, {
    offerId: row.id,
    playerId: row.player_id,
    fromClubId: row.selling_club_id,
    toClubId: row.offering_club_id,
    fee: row.fee_offered,
    wageOffered: row.wage_offered,
    season,
    week,
  });

  return { success: true };
}
