import { createE2EContext, E2EContext } from '../../e2e/test-helpers';
import { advanceUnemploymentSeason } from '@/engine/season/unemployment-spell';
import {
  getManagerReputation, setManagerReputation,
  getManagerSavings, setManagerSavings,
  setUnemployed, setUnemployedSince,
} from '@/database/queries/save';
import { getPendingJobOffers } from '@/database/queries/job-offers';
import { SeededRng } from '@/engine/rng';
import {
  MANAGER_REP_UNEMPLOYED_DECAY, MANAGER_UNEMPLOYED_DRAIN, MANAGER_SAVINGS_FLOOR,
} from '@/engine/balance';

describe('advanceUnemploymentSeason', () => {
  let ctx: E2EContext;
  beforeEach(async () => {
    ctx = await createE2EContext();
    await setUnemployed(ctx.db, ctx.saveId, true);
    await setUnemployedSince(ctx.db, ctx.saveId, 1);
  });
  afterEach(() => { ctx.rawDb.close(); });

  it('decai reputação, drena poupança e gera novo lote', async () => {
    await setManagerReputation(ctx.db, ctx.saveId, 60);
    await setManagerSavings(ctx.db, ctx.saveId, 5);
    const res = await advanceUnemploymentSeason(ctx.db, {
      saveId: ctx.saveId, season: 2, rng: new SeededRng(2 * 6151 + ctx.saveId),
    });
    expect(res.reputationAfter).toBe(60 + MANAGER_REP_UNEMPLOYED_DECAY);
    expect(res.savingsAfter).toBe(5 - MANAGER_UNEMPLOYED_DRAIN);
    expect(await getManagerReputation(ctx.db, ctx.saveId)).toBe(res.reputationAfter);
    expect(await getManagerSavings(ctx.db, ctx.saveId)).toBe(res.savingsAfter);
    expect(res.terminal).toBe(false);
    const pending = await getPendingJobOffers(ctx.db, ctx.saveId, 2);
    expect(pending.map((p) => p.offeringClubId).sort()).toEqual([...res.generatedOfferClubIds].sort());
  });

  it('terminal quando a poupança cruza o piso', async () => {
    await setManagerReputation(ctx.db, ctx.saveId, 60);
    await setManagerSavings(ctx.db, ctx.saveId, MANAGER_SAVINGS_FLOOR + 1); // 1 dreno cruza o piso
    const res = await advanceUnemploymentSeason(ctx.db, {
      saveId: ctx.saveId, season: 2, rng: new SeededRng(2 * 6151 + ctx.saveId),
    });
    expect(res.savingsAfter).toBeLessThanOrEqual(MANAGER_SAVINGS_FLOOR);
    expect(res.terminal).toBe(true);
  });

  it('o mesmo lote (mesma rep/seed) não duplica ofertas no mesmo (saveId, season)', async () => {
    // Reset rep/savings entre as rodadas para isolar o candidate pool — assim a 2ª
    // rodada gera o MESMO lote e o UNIQUE(save,season,club) deve impedir duplicação.
    await setManagerReputation(ctx.db, ctx.saveId, 80);
    await setManagerSavings(ctx.db, ctx.saveId, 50);
    await advanceUnemploymentSeason(ctx.db, { saveId: ctx.saveId, season: 2, rng: new SeededRng(99) });
    const firstCount = (await getPendingJobOffers(ctx.db, ctx.saveId, 2)).length;
    await setManagerReputation(ctx.db, ctx.saveId, 80);
    await setManagerSavings(ctx.db, ctx.saveId, 50);
    await advanceUnemploymentSeason(ctx.db, { saveId: ctx.saveId, season: 2, rng: new SeededRng(99) });
    const secondCount = (await getPendingJobOffers(ctx.db, ctx.saveId, 2)).length;
    expect(secondCount).toBe(firstCount); // INSERT OR IGNORE + UNIQUE(save,season,club) protege
  });
});
