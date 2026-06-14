import { createE2EContext } from '../../e2e/test-helpers';
import { generateAiOffersForSquad, generateAiToAiOffers } from '@/engine/transfer/ai-offer-generator';
import { getOffersBySellingClub } from '@/database/queries/transfers';
import { SeededRng } from '@/engine/rng';

/**
 * Regression guard: AI offer generation must be reproducible for a given seed.
 * Previously the suitor pool was selected with SQLite `ORDER BY RANDOM()`, an
 * unseeded PRNG, so the set of bidding clubs (and thus the resulting offers)
 * varied run-to-run regardless of the engine's SeededRng. That made
 * `incoming-offers.e2e` flaky (~1/6) and broke save reproducibility.
 */
describe('AI offer generation determinism', () => {
  const SEED = 777;

  it('generateAiOffersForSquad produces identical offers for a given seed', async () => {
    const run = async () => {
      const ctx = await createE2EContext();
      // List the whole squad so offers reliably appear (listing boost).
      ctx.rawDb.prepare('UPDATE players SET is_transfer_listed = 1 WHERE club_id = ?').run(ctx.playerClubId);
      const rng = new SeededRng(SEED);
      for (const week of [2, 3, 4]) {
        await generateAiOffersForSquad(ctx.db, ctx.saveId, ctx.playerClubId, rng, 1, week);
      }
      const offers = await getOffersBySellingClub(ctx.db, ctx.saveId, ctx.playerClubId);
      ctx.rawDb.close();
      return offers
        .map((o) => `${o.playerId}:${o.offeringClubId}:${o.feeOffered}:${o.wageOffered}`)
        .sort();
    };

    const a = await run();
    const b = await run();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('generateAiToAiOffers produces identical offers for a given seed', async () => {
    const run = async () => {
      const ctx = await createE2EContext();
      ctx.rawDb.prepare('UPDATE players SET is_transfer_listed = 1').run();
      const rng = new SeededRng(SEED);
      await generateAiToAiOffers(ctx.db, ctx.saveId, rng, 1, 2, ctx.playerClubId);
      // Collect every offer in the save (AI→AI offers target many selling clubs).
      const rows = ctx.rawDb
        .prepare('SELECT player_id, offering_club_id, fee_offered FROM transfer_offers ORDER BY player_id, offering_club_id')
        .all() as Array<{ player_id: number; offering_club_id: number; fee_offered: number }>;
      ctx.rawDb.close();
      return rows.map((r) => `${r.player_id}:${r.offering_club_id}:${r.fee_offered}`);
    };

    const a = await run();
    const b = await run();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});
