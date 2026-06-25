import { createE2EContext, E2EContext } from '../../e2e/test-helpers';
import { acceptJobOffer } from '@/engine/board/accept-job-offer';
import { getActiveManagerContract } from '@/database/queries/manager-contract';
import { getUnemployedSince, setUnemployedSince } from '@/database/queries/save';
import { getAllClubs } from '@/database/queries/clubs';
import { SeededRng } from '@/engine/rng';

describe('acceptJobOffer grava contrato', () => {
  let ctx: E2EContext;
  beforeEach(async () => { ctx = await createE2EContext(); });
  afterEach(() => { ctx.rawDb.close(); });

  it('assinar gera contrato ativo e zera unemployed_since_season', async () => {
    const clubs = await getAllClubs(ctx.db, ctx.saveId);
    const target = clubs.find((c) => c.id !== ctx.playerClubId)!;
    await setUnemployedSince(ctx.db, ctx.saveId, 2); // simula spell ativo

    await acceptJobOffer({
      db: ctx.db, saveId: ctx.saveId, offeringClubId: target.id,
      offerSeason: 1, newSeason: 2, band: 'rescue', rng: new SeededRng(123),
    });

    const contract = await getActiveManagerContract(ctx.db, ctx.saveId);
    expect(contract).not.toBeNull();
    expect(contract!.clubId).toBe(target.id);
    expect(contract!.startSeason).toBe(2);
    expect(contract!.endSeason).toBeGreaterThan(2);
    expect(await getUnemployedSince(ctx.db, ctx.saveId)).toBeNull();
  });
});
