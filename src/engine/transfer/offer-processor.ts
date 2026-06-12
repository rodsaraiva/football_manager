import { DbHandle } from '@/database/queries/players';
import { getPendingOffers, updateOfferStatus, createTransfer } from '@/database/queries/transfers';
import { addFinanceEntry } from '@/database/queries/finances';
import { evaluateOffer } from './transfer-ai';
import { canAffordTransfer } from '@/engine/finance/affordability';
import {
  blockClubFromPlayer,
  incrementOfferRound,
  hasExceededMaxRounds,
} from './negotiation';
import { TransferType } from '@/types';

/**
 * Execute an accepted transfer: move player to buying club, transfer funds,
 * record in transfers table, and create finance entries for both clubs.
 */
export async function executeAcceptedTransfer(
  db: DbHandle,
  saveId: number,
  params: {
    offerId: number;
    playerId: number;
    fromClubId: number;
    toClubId: number;
    fee: number;
    wageOffered: number;
    season: number;
    week: number;
    offerType?: TransferType;
    loanEnd?: number | null;
  },
): Promise<void> {
  const {
    offerId,
    playerId,
    fromClubId,
    toClubId,
    fee,
    wageOffered,
    season,
    week,
    offerType = 'transfer',
    loanEnd = null,
  } = params;

  // Move player to the buying/borrowing club.
  if (offerType === 'loan') {
    // Loan: preserve the parent club's `wage`; the borrowing club pays the agreed
    // share in `loan_wage` (restored on return). Avoids the wage-bleed bug.
    await db
      .prepare('UPDATE players SET club_id = ?, loan_wage = ?, is_free_agent = 0 WHERE save_id = ? AND id = ?')
      .run(toClubId, wageOffered, saveId, playerId);
  } else {
    // Permanent: the buying club takes over the full wage.
    await db
      .prepare('UPDATE players SET club_id = ?, wage = ?, loan_wage = NULL, is_free_agent = 0 WHERE save_id = ? AND id = ?')
      .run(toClubId, wageOffered, saveId, playerId);
  }

  // Transfer funds between clubs
  if (fee > 0) {
    await db.prepare('UPDATE clubs SET budget = budget - ? WHERE save_id = ? AND id = ?').run(fee, saveId, toClubId);
    await db.prepare('UPDATE clubs SET budget = budget + ? WHERE save_id = ? AND id = ?').run(fee, saveId, fromClubId);
  }

  // Record the transfer
  await createTransfer(db, saveId, {
    playerId,
    season,
    fromClubId,
    toClubId,
    fee,
    wageOffered,
    type: offerType,
    loanEnd: offerType === 'loan' ? loanEnd : null,
  });

  // Finance entries (skip for zero-fee loans)
  if (fee > 0) {
    const label = offerType === 'loan' ? 'Loan fee' : 'Transfer fee';
    await addFinanceEntry(db, saveId, {
      clubId: toClubId,
      season,
      week,
      type: 'transfer_out',
      amount: -fee,
      description: `${label} paid for player #${playerId}`,
    });
    await addFinanceEntry(db, saveId, {
      clubId: fromClubId,
      season,
      week,
      type: 'transfer_in',
      amount: fee,
      description: `${label} received for player #${playerId}`,
    });
  }

  // Mark offer as accepted (in case it wasn't already)
  await updateOfferStatus(db, saveId, offerId, 'accepted', week);
}

/**
 * Process all pending offers: run evaluateOffer() against each and update
 * status. Accepted offers are executed immediately (player moves, money moves).
 *
 * Offers where the player's club is the seller are skipped — the human user
 * decides those via the Offers Received screen.
 *
 * Counter-offers (status 'countered') where the player is the seller flip the
 * flow: the AI buyer re-evaluates the updated fee and either matches it
 * (execute) or walks away (reject).
 */
export async function processPendingOffers(
  db: DbHandle,
  saveId: number,
  season: number,
  week: number,
  playerClubId: number | null = null,
): Promise<void> {
  // AI-buyer re-evaluation of offers the user countered
  if (playerClubId !== null) {
    const userCounters = (await db
      .prepare(
        "SELECT * FROM transfer_offers WHERE save_id = ? AND status = 'countered' AND selling_club_id = ?",
      )
      .all(saveId, playerClubId)) as Array<{
      id: number;
      player_id: number;
      offering_club_id: number;
      selling_club_id: number;
      fee_offered: number;
      wage_offered: number;
      offer_type: string | null;
      loan_end: number | null;
    }>;

    for (const counter of userCounters) {
      // Load original player market value to judge how aggressive the ask is
      const player = (await db
        .prepare('SELECT market_value FROM players WHERE save_id = ? AND id = ?')
        .get(saveId, counter.player_id)) as { market_value: number } | undefined;
      if (!player) {
        await updateOfferStatus(db, saveId, counter.id, 'rejected', week);
        continue;
      }
      const buyer = (await db
        .prepare('SELECT budget FROM clubs WHERE save_id = ? AND id = ?')
        .get(saveId, counter.offering_club_id)) as { budget: number } | undefined;
      if (!buyer) {
        await updateOfferStatus(db, saveId, counter.id, 'rejected', week);
        continue;
      }

      const ratio = counter.fee_offered / Math.max(1, player.market_value);
      const canAfford = buyer.budget >= counter.fee_offered;
      // Buyer walks away if the demand is excessive (>140% of market) or unaffordable
      if (!canAfford || ratio > 1.4) {
        await updateOfferStatus(db, saveId, counter.id, 'rejected', week);
        // Block this (buyer, player) pairing temporarily to avoid instant re-bidding
        await blockClubFromPlayer(db, saveId, counter.player_id, counter.offering_club_id, season, week);
        continue;
      }

      // Otherwise, match the counter and close the deal
      await executeAcceptedTransfer(db, saveId, {
        offerId: counter.id,
        playerId: counter.player_id,
        fromClubId: counter.selling_club_id,
        toClubId: counter.offering_club_id,
        fee: counter.fee_offered,
        wageOffered: counter.wage_offered,
        season,
        week,
        offerType: (counter.offer_type as TransferType | null) ?? 'transfer',
        loanEnd: counter.loan_end,
      });
    }
  }

  const pending = await getPendingOffers(db, saveId);
  if (pending.length === 0) return;

  for (const offer of pending) {
    // Skip offers where the user is the seller — the user decides those
    if (playerClubId !== null && offer.sellingClubId === playerClubId) {
      continue;
    }
    // Load player + club details
    const player = await db
      .prepare(
        'SELECT id, club_id, market_value, age, wage, contract_end, is_free_agent FROM players WHERE save_id = ? AND id = ?',
      )
      .get(saveId, offer.playerId) as
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
      await updateOfferStatus(db, saveId, offer.id, 'rejected', week);
      continue;
    }

    // If player is a free agent, this path shouldn't be used — free agents
    // are signed directly (handled elsewhere). Reject to avoid weirdness.
    if (player.is_free_agent === 1 || player.club_id === null) {
      await updateOfferStatus(db, saveId, offer.id, 'rejected', week);
      continue;
    }

    // If player has already moved to offering club for any reason, reject
    if (player.club_id === offer.offeringClubId) {
      await updateOfferStatus(db, saveId, offer.id, 'rejected', week);
      continue;
    }

    // Count teammates at player's position to derive starter/replacement signals
    const [{ same_pos_count }] = (await db
      .prepare(
        `SELECT COUNT(*) as same_pos_count FROM players
         WHERE save_id = ? AND club_id = ? AND id != ?
           AND position = (SELECT position FROM players WHERE save_id = ? AND id = ?)`,
      )
      .all(saveId, player.club_id, player.id, saveId, player.id)) as Array<{ same_pos_count: number }>;

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

    // Track round: if we've hit the cap, collapse to accept/reject (no more counters)
    await incrementOfferRound(db, saveId, offer.id);
    const maxedOut = await hasExceededMaxRounds(db, saveId, offer.id);

    if (result.decision === 'accept') {
      // Gate: the offering club must actually be able to pay the fee. Without
      // this, AI sellers happily accept bids the buyer cannot fund and the
      // buyer budget goes arbitrarily negative.
      const buyer = (await db
        .prepare('SELECT budget FROM clubs WHERE save_id = ? AND id = ?')
        .get(saveId, offer.offeringClubId)) as { budget: number } | undefined;
      if (!buyer || !canAffordTransfer(buyer.budget, offer.feeOffered)) {
        await updateOfferStatus(db, saveId, offer.id, 'rejected', week);
        await blockClubFromPlayer(db, saveId, offer.playerId, offer.offeringClubId, season, week);
        continue;
      }
      // Execute immediately
      await executeAcceptedTransfer(db, saveId, {
        offerId: offer.id,
        playerId: offer.playerId,
        fromClubId: player.club_id,
        toClubId: offer.offeringClubId,
        fee: offer.feeOffered,
        wageOffered: offer.wageOffered,
        season,
        week,
        offerType: offer.offerType,
        loanEnd: offer.loanEnd,
      });
    } else if (result.decision === 'reject' || (maxedOut && result.decision === 'counter')) {
      // Firm rejection: block this club from bidding on this player for a while
      await updateOfferStatus(db, saveId, offer.id, 'rejected', week);
      await blockClubFromPlayer(db, saveId, offer.playerId, offer.offeringClubId, season, week);
    } else {
      // counter — still in negotiation window
      await db
        .prepare(
          "UPDATE transfer_offers SET status = 'countered', response_week = ?, fee_offered = ? WHERE save_id = ? AND id = ?",
        )
        .run(week, result.counterFee ?? offer.feeOffered, saveId, offer.id);
    }
  }
}

/**
 * Player-side: accept an incoming offer (selling one of your players to
 * another club). Executes the transfer immediately.
 */
export async function acceptIncomingOffer(
  db: DbHandle,
  saveId: number,
  offerId: number,
  season: number,
  week: number,
): Promise<{ success: boolean; reason?: string }> {
  const row = await db
    .prepare('SELECT * FROM transfer_offers WHERE save_id = ? AND id = ?')
    .get(saveId, offerId) as
    | {
        id: number;
        player_id: number;
        offering_club_id: number;
        selling_club_id: number;
        fee_offered: number;
        wage_offered: number;
        status: string;
        offer_type: string | null;
        loan_end: number | null;
      }
    | undefined;

  if (!row) return { success: false, reason: 'Offer not found' };
  if (row.status !== 'pending') return { success: false, reason: 'Offer is not pending' };

  await executeAcceptedTransfer(db, saveId, {
    offerId: row.id,
    playerId: row.player_id,
    fromClubId: row.selling_club_id,
    toClubId: row.offering_club_id,
    fee: row.fee_offered,
    wageOffered: row.wage_offered,
    season,
    week,
    offerType: (row.offer_type as TransferType | null) ?? 'transfer',
    loanEnd: row.loan_end,
  });

  return { success: true };
}

/**
 * Player-side: reject an incoming offer.
 */
export async function rejectIncomingOffer(
  db: DbHandle,
  saveId: number,
  offerId: number,
  week: number,
): Promise<void> {
  await updateOfferStatus(db, saveId, offerId, 'rejected', week);
}

/**
 * Player-side: counter an incoming offer with a higher fee. The offer stays
 * pending from the buyer's perspective but with an updated fee (the buyer will
 * re-evaluate it next week via processPendingOffers, now with the player's
 * asking price).
 */
export async function counterIncomingOffer(
  db: DbHandle,
  saveId: number,
  offerId: number,
  newFee: number,
): Promise<void> {
  // Mark status 'countered' and update fee — the AI buyer will see this next
  // week and decide whether to match.
  await db
    .prepare("UPDATE transfer_offers SET status = 'countered', fee_offered = ? WHERE save_id = ? AND id = ?")
    .run(newFee, saveId, offerId);
}

/**
 * Executes a counter-offer acceptance initiated by the player.
 * The offer is already at status `countered` with the counterFee stored in
 * fee_offered. Calling this finalizes the deal immediately.
 */
export async function acceptCounterOffer(
  db: DbHandle,
  saveId: number,
  offerId: number,
  season: number,
  week: number,
): Promise<{ success: boolean; reason?: string }> {
  const row = await db
    .prepare('SELECT * FROM transfer_offers WHERE save_id = ? AND id = ?')
    .get(saveId, offerId) as
    | {
        id: number;
        player_id: number;
        offering_club_id: number;
        selling_club_id: number;
        fee_offered: number;
        wage_offered: number;
        status: string;
        offer_type: string | null;
        loan_end: number | null;
      }
    | undefined;

  if (!row) return { success: false, reason: 'Offer not found' };
  if (row.status !== 'countered') return { success: false, reason: 'Offer is not in countered state' };

  // Check buyer still has budget
  const buyer = await db
    .prepare('SELECT budget FROM clubs WHERE save_id = ? AND id = ?')
    .get(saveId, row.offering_club_id) as { budget: number } | undefined;

  if (!buyer) return { success: false, reason: 'Buying club not found' };
  if (buyer.budget < row.fee_offered) {
    return { success: false, reason: 'Insufficient budget to meet counter-offer' };
  }

  await executeAcceptedTransfer(db, saveId, {
    offerId: row.id,
    playerId: row.player_id,
    fromClubId: row.selling_club_id,
    toClubId: row.offering_club_id,
    fee: row.fee_offered,
    wageOffered: row.wage_offered,
    season,
    week,
    offerType: (row.offer_type as TransferType | null) ?? 'transfer',
    loanEnd: row.loan_end,
  });

  return { success: true };
}
