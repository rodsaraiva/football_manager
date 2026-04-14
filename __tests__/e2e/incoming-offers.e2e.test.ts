import {
  createE2EContext,
  stepWeek,
  stepWeeks,
  E2EContext,
  getPlayerClub,
  getClubBudget,
  countSquad,
} from './test-helpers';
import { getOffersBySellingClub } from '@/database/queries/transfers';
import {
  acceptIncomingOffer,
  rejectIncomingOffer,
  counterIncomingOffer,
} from '@/engine/transfer/offer-processor';

describe('E2E · AI-initiated offers for the player squad', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await createE2EContext();
    // Stay in the transfer window (weeks 1-6)
    ctx.week = 2;
  });

  afterEach(() => {
    ctx.rawDb.close();
  });

  /**
   * Advance weeks until at least one incoming offer exists for the player
   * club. Returns the offers (possibly empty if unlucky over `maxWeeks`).
   */
  async function waitForIncomingOffers(maxWeeks = 6) {
    for (let i = 0; i < maxWeeks && ctx.week <= 6; i++) {
      await stepWeek(ctx, 1000 + i);
      const offers = await getOffersBySellingClub(ctx.db, ctx.playerClubId);
      if (offers.some((o) => o.status === 'pending')) return offers;
    }
    return getOffersBySellingClub(ctx.db, ctx.playerClubId);
  }

  it('AI submits offers for the player squad during the transfer window', async () => {
    const offers = await waitForIncomingOffers();
    const pending = offers.filter((o) => o.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    // Sanity: each offer has valid fee/wage and targets a player of the user's club
    for (const o of pending) {
      expect(o.sellingClubId).toBe(ctx.playerClubId);
      expect(o.feeOffered).toBeGreaterThan(0);
      expect(o.wageOffered).toBeGreaterThan(0);
    }
  });

  it('user accepts an incoming offer → player moves, money flows', async () => {
    const offers = await waitForIncomingOffers();
    const pending = offers.filter((o) => o.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);

    const target = pending[0];
    const userBudgetBefore = getClubBudget(ctx, ctx.playerClubId);
    const buyerBudgetBefore = getClubBudget(ctx, target.offeringClubId);

    const res = await acceptIncomingOffer(ctx.db, target.id, ctx.season, ctx.week);
    expect(res.success).toBe(true);

    expect(getPlayerClub(ctx, target.playerId)).toBe(target.offeringClubId);
    expect(getClubBudget(ctx, ctx.playerClubId)).toBe(userBudgetBefore + target.feeOffered);
    expect(getClubBudget(ctx, target.offeringClubId)).toBe(
      buyerBudgetBefore - target.feeOffered,
    );
  });

  it('user rejects an incoming offer → status flips to rejected; player stays', async () => {
    const offers = await waitForIncomingOffers();
    const pending = offers.filter((o) => o.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    const target = pending[0];

    const squadBefore = countSquad(ctx, ctx.playerClubId);

    await rejectIncomingOffer(ctx.db, target.id, ctx.week);

    const after = ctx.rawDb
      .prepare('SELECT status FROM transfer_offers WHERE id = ?')
      .get(target.id) as { status: string };
    expect(after.status).toBe('rejected');
    expect(getPlayerClub(ctx, target.playerId)).toBe(ctx.playerClubId);
    expect(countSquad(ctx, ctx.playerClubId)).toBe(squadBefore);
  });

  it('user counters with a reasonable price → AI matches and finalizes next week', async () => {
    const offers = await waitForIncomingOffers();
    const pending = offers.filter((o) => o.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    const target = pending[0];

    // Ask ~125% of market value (within 140% cap so AI should match)
    const player = ctx.rawDb
      .prepare('SELECT market_value FROM players WHERE id = ?')
      .get(target.playerId) as { market_value: number };
    const askFee = Math.round(player.market_value * 1.25);

    await counterIncomingOffer(ctx.db, target.id, askFee);

    await stepWeek(ctx);

    expect(getPlayerClub(ctx, target.playerId)).toBe(target.offeringClubId);
  });

  it('user counters excessively → AI walks away', async () => {
    const offers = await waitForIncomingOffers();
    const pending = offers.filter((o) => o.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    const target = pending[0];

    const player = ctx.rawDb
      .prepare('SELECT market_value FROM players WHERE id = ?')
      .get(target.playerId) as { market_value: number };
    const askFee = Math.round(player.market_value * 2); // way over 140% cap

    await counterIncomingOffer(ctx.db, target.id, askFee);

    await stepWeek(ctx);

    const after = ctx.rawDb
      .prepare('SELECT status FROM transfer_offers WHERE id = ?')
      .get(target.id) as { status: string };
    expect(after.status).toBe('rejected');
    expect(getPlayerClub(ctx, target.playerId)).toBe(ctx.playerClubId);
  });

  it('incoming offers do not appear outside the transfer window', async () => {
    // Jump past the January window (weeks 1-6 and 23-26). Week 10 is
    // between windows.
    ctx.week = 10;
    await stepWeeks(ctx, 3);

    const offers = await getOffersBySellingClub(ctx.db, ctx.playerClubId);
    // Might have old offers from seeded state (none), but the system
    // shouldn't be creating new ones outside the window.
    const created = offers.filter((o) => o.status === 'pending');
    expect(created.length).toBe(0);
  });

  it('player-initiated offers from the user are skipped by processPendingOffers for the seller', async () => {
    // Grab a rival player and have the user bid for them
    const rival = ctx.rawDb
      .prepare(
        `SELECT id, club_id, market_value, wage FROM players
         WHERE club_id != ? AND is_free_agent = 0 AND position = 'CM'
         LIMIT 1`,
      )
      .get(ctx.playerClubId) as
      | { id: number; club_id: number; market_value: number; wage: number }
      | undefined;
    if (!rival) return;

    const { createOffer } = await import('@/database/queries/transfers');
    const oid = await createOffer(ctx.db, {
      playerId: rival.id,
      offeringClubId: ctx.playerClubId,
      sellingClubId: rival.club_id,
      feeOffered: rival.market_value,
      wageOffered: rival.wage,
      createdSeason: ctx.season,
      createdWeek: ctx.week,
    });

    await stepWeek(ctx);

    // This offer's seller is NOT the user, so it should be processed.
    const { getOfferById } = await import('@/database/queries/transfers');
    const o = await getOfferById(ctx.db, oid);
    expect(['accepted', 'rejected', 'countered']).toContain(o!.status);
    expect(o!.status).not.toBe('pending');
  });
});
