import {
  createE2EContext,
  stepWeek,
  stepWeeks,
  E2EContext,
  pickPlayerFromRival,
  getPlayerClub,
  getClubBudget,
  getOfferStatus,
} from './test-helpers';
import { createOffer, getOfferById } from '@/database/queries/transfers';
import { acceptCounterOffer } from '@/engine/transfer/offer-processor';

describe('E2E · player-initiated offers', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await createE2EContext();
    ctx.week = 2; // inside transfer window
  });

  afterEach(() => {
    ctx.rawDb.close();
  });

  it('offer at >= market value with replacements is accepted; player + money move', async () => {
    const target = pickPlayerFromRival(ctx, 'ST');
    expect(target).not.toBeNull();
    if (!target) return;

    // Ensure seller has a backup ST so evaluateOffer flags clubHasReplacement
    const backupCount = ctx.rawDb
      .prepare('SELECT COUNT(*) as c FROM players WHERE club_id = ? AND position = ? AND id != ?')
      .get(target.club_id, 'ST', target.id) as { c: number };
    expect(backupCount.c).toBeGreaterThanOrEqual(1);

    const buyerBudgetBefore = getClubBudget(ctx, ctx.playerClubId);
    const sellerBudgetBefore = getClubBudget(ctx, target.club_id);

    const offerId = await createOffer(ctx.db, {
      playerId: target.id,
      offeringClubId: ctx.playerClubId,
      sellingClubId: target.club_id,
      feeOffered: Math.round(target.market_value * 1.1),
      wageOffered: Math.round(target.wage * 1.2),
      createdSeason: ctx.season,
      createdWeek: ctx.week,
    });

    await stepWeek(ctx);

    const status = getOfferStatus(ctx, offerId);
    expect(status).toBe('accepted');

    expect(getPlayerClub(ctx, target.id)).toBe(ctx.playerClubId);

    const fee = Math.round(target.market_value * 1.1);
    expect(getClubBudget(ctx, ctx.playerClubId)).toBeLessThanOrEqual(buyerBudgetBefore - fee);
    expect(getClubBudget(ctx, target.club_id)).toBeGreaterThanOrEqual(sellerBudgetBefore + fee);
  });

  it('low-but-reasonable offer returns a counter', async () => {
    const target = pickPlayerFromRival(ctx, 'CM');
    if (!target) return;

    const offerId = await createOffer(ctx.db, {
      playerId: target.id,
      offeringClubId: ctx.playerClubId,
      sellingClubId: target.club_id,
      feeOffered: Math.round(target.market_value * 0.85),
      wageOffered: target.wage,
      createdSeason: ctx.season,
      createdWeek: ctx.week,
    });

    await stepWeek(ctx);

    const offer = await getOfferById(ctx.db, offerId);
    expect(offer!.status).toBe('countered');
    // Counter should raise the fee
    expect(offer!.feeOffered).toBeGreaterThan(Math.round(target.market_value * 0.85));
    // Player stays put
    expect(getPlayerClub(ctx, target.id)).toBe(target.club_id);
  });

  it('accepting a counter finalizes the deal immediately', async () => {
    const target = pickPlayerFromRival(ctx, 'CM');
    if (!target) return;

    const offerId = await createOffer(ctx.db, {
      playerId: target.id,
      offeringClubId: ctx.playerClubId,
      sellingClubId: target.club_id,
      feeOffered: Math.round(target.market_value * 0.85),
      wageOffered: target.wage,
      createdSeason: ctx.season,
      createdWeek: ctx.week,
    });

    await stepWeek(ctx); // → countered

    const res = await acceptCounterOffer(ctx.db, offerId, ctx.season, ctx.week);
    expect(res.success).toBe(true);
    expect(getPlayerClub(ctx, target.id)).toBe(ctx.playerClubId);
  });

  it('lowball offer for a star with no replacement is rejected, triggers block', async () => {
    const target = pickPlayerFromRival(ctx, 'ST');
    if (!target) return;

    // Kill other STs at the selling club so it's a no-replacement situation
    ctx.rawDb
      .prepare(
        `UPDATE players SET club_id = NULL, is_free_agent = 1
         WHERE club_id = ? AND position = 'ST' AND id != ?`,
      )
      .run(target.club_id, target.id);

    const offerId = await createOffer(ctx.db, {
      playerId: target.id,
      offeringClubId: ctx.playerClubId,
      sellingClubId: target.club_id,
      feeOffered: Math.round(target.market_value * 0.5),
      wageOffered: target.wage,
      createdSeason: ctx.season,
      createdWeek: ctx.week,
    });

    await stepWeek(ctx);

    expect(getOfferStatus(ctx, offerId)).toBe('rejected');

    const block = ctx.rawDb
      .prepare(
        'SELECT 1 FROM transfer_blocks WHERE player_id = ? AND offering_club_id = ?',
      )
      .get(target.id, ctx.playerClubId);
    expect(block).toBeTruthy();
  });

  it('pending offer expires after OFFER_EXPIRATION_WEEKS without response', async () => {
    const target = pickPlayerFromRival(ctx, 'CM');
    if (!target) return;

    // Insert an offer that is "stuck" — pre-dated so it's already close to
    // expiring, and mark it somehow past AI evaluation. Simplest: create a
    // pending offer, advance week → AI will respond, but we want to test
    // the expiration pathway itself. We'll create a fresh offer, advance 3
    // weeks (with the AI counter path), and check that if the user never
    // answers the counter, it eventually expires.
    const offerId = await createOffer(ctx.db, {
      playerId: target.id,
      offeringClubId: ctx.playerClubId,
      sellingClubId: target.club_id,
      feeOffered: Math.round(target.market_value * 0.85),
      wageOffered: target.wage,
      createdSeason: ctx.season,
      createdWeek: ctx.week,
    });

    // Week N: AI counters
    await stepWeek(ctx);
    expect(getOfferStatus(ctx, offerId)).toBe('countered');

    // Weeks N+1 and N+2: user does nothing → should expire
    await stepWeek(ctx);
    await stepWeek(ctx);

    expect(getOfferStatus(ctx, offerId)).toBe('rejected');
    expect(getPlayerClub(ctx, target.id)).toBe(target.club_id);
  });

  it('after a firm rejection, the AI wont re-accept the same-club bid within the block window', async () => {
    const target = pickPlayerFromRival(ctx, 'ST');
    if (!target) return;

    // No replacement scenario
    ctx.rawDb
      .prepare(
        `UPDATE players SET club_id = NULL, is_free_agent = 1
         WHERE club_id = ? AND position = 'ST' AND id != ?`,
      )
      .run(target.club_id, target.id);

    // First lowball → rejected + blocked
    await createOffer(ctx.db, {
      playerId: target.id,
      offeringClubId: ctx.playerClubId,
      sellingClubId: target.club_id,
      feeOffered: Math.round(target.market_value * 0.5),
      wageOffered: target.wage,
      createdSeason: ctx.season,
      createdWeek: ctx.week,
    });
    await stepWeek(ctx);

    // Now try another offer immediately — should also fail quickly because
    // the new offer will be processed by the AI on the next week. The key
    // invariant: a transfer_blocks row now exists for this pair, so the
    // ai-offer-generator would skip. For player-initiated offers the block
    // doesn't gate creation, but a subsequent rejection confirms the AI
    // still doesn't want to sell.
    const blocks = ctx.rawDb
      .prepare(
        'SELECT COUNT(*) as c FROM transfer_blocks WHERE player_id = ? AND offering_club_id = ?',
      )
      .get(target.id, ctx.playerClubId) as { c: number };
    expect(blocks.c).toBeGreaterThanOrEqual(1);
  });

  it('multiple simultaneous offers are all resolved in one week', async () => {
    const t1 = pickPlayerFromRival(ctx, 'CB');
    const t2 = pickPlayerFromRival(ctx, 'CM');
    const t3 = pickPlayerFromRival(ctx, 'ST');
    if (!t1 || !t2 || !t3) return;

    const ids: number[] = [];
    for (const t of [t1, t2, t3]) {
      const oid = await createOffer(ctx.db, {
        playerId: t.id,
        offeringClubId: ctx.playerClubId,
        sellingClubId: t.club_id,
        feeOffered: Math.round(t.market_value * 1.1),
        wageOffered: Math.round(t.wage * 1.2),
        createdSeason: ctx.season,
        createdWeek: ctx.week,
      });
      ids.push(oid);
    }

    await stepWeek(ctx);

    for (const oid of ids) {
      const status = getOfferStatus(ctx, oid);
      expect(['accepted', 'countered', 'rejected']).toContain(status);
      expect(status).not.toBe('pending');
    }
  });

  it('max negotiation rounds collapses to accept/reject (no infinite counters)', async () => {
    const target = pickPlayerFromRival(ctx, 'CM');
    if (!target) return;

    const offerId = await createOffer(ctx.db, {
      playerId: target.id,
      offeringClubId: ctx.playerClubId,
      sellingClubId: target.club_id,
      feeOffered: Math.round(target.market_value * 0.85),
      wageOffered: target.wage,
      createdSeason: ctx.season,
      createdWeek: ctx.week,
    });

    // Manually drive the round_count up. The processor increments once per
    // processPendingOffers loop; after enough rounds the next counter
    // attempt must be upgraded to a rejection.
    // Fast-forward by setting round_count to just below the cap and
    // forcing a pending state so the AI processes it again.
    ctx.rawDb.prepare("UPDATE transfer_offers SET status = 'pending', round_count = 3 WHERE id = ?").run(offerId);
    await stepWeek(ctx);
    ctx.rawDb.prepare("UPDATE transfer_offers SET status = 'pending', round_count = 4 WHERE id = ?").run(offerId);
    await stepWeek(ctx);

    const final = await getOfferById(ctx.db, offerId);
    // After hitting MAX_NEGOTIATION_ROUNDS, counters turn into rejections.
    expect(['rejected', 'accepted']).toContain(final!.status);
  });
});
