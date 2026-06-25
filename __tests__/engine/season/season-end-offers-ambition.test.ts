import { createE2EContext, playUntilSeasonEnd, E2EContext } from '../../e2e/test-helpers';
import { evaluateSeasonEndBoard } from '@/engine/season/season-end-eval';
import { setManagerReputation } from '@/database/queries/save';
import { getPendingJobOffers } from '@/database/queries/job-offers';
import { getClubById } from '@/database/queries/clubs';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { SeededRng } from '@/engine/rng';

describe('season-end ofertas com ambição (retido)', () => {
  let ctx: E2EContext;
  beforeEach(async () => { ctx = await createE2EContext(); });
  afterEach(() => { ctx.rawDb.close(); });

  it('gera ofertas up-band quando retido com reputação alta (lote determinístico)', async () => {
    await playUntilSeasonEnd(ctx, 4242);
    await setManagerReputation(ctx.db, ctx.saveId, 99);
    const endedSeason = ctx.season - 1;
    const club = (await getClubById(ctx.db, ctx.saveId, ctx.playerClubId))!;
    const comps = (await getCompetitionsBySeason(ctx.db, ctx.saveId, endedSeason)).map((c) => ({ id: c.id, type: c.type }));
    const res = await evaluateSeasonEndBoard(ctx.db, {
      saveId: ctx.saveId, playerClubId: ctx.playerClubId, clubReputation: club.reputation,
      endedSeason, newSeason: ctx.season, competitions: comps,
      offerRng: new SeededRng(ctx.season * 6151 + ctx.saveId),
    });
    const pending = await getPendingJobOffers(ctx.db, ctx.saveId, endedSeason);
    expect(pending.map((p) => p.offeringClubId).sort()).toEqual([...res.generatedOfferClubIds].sort());
  }, 120_000);
});
