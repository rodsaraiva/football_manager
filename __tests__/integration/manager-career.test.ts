import {
  createE2EContext, playUntilSeasonEnd, endSeasonHeadless, E2EContext,
} from '../e2e/test-helpers';
import { getManagerCareer } from '../../src/database/queries/legacy';
import { setManagerReputation } from '@/database/queries/save';

describe('trilha de carreira do técnico (integração)', () => {
  let ctx: E2EContext;
  beforeEach(async () => { ctx = await createE2EContext(); });
  afterEach(() => ctx.rawDb.close());

  it('fim de temporada grava stayed/fired; aceitar oferta vira resigned', async () => {
    // Temporada 1 → segue no clube (sem aceitar oferta)
    await playUntilSeasonEnd(ctx, 111);
    await endSeasonHeadless(ctx, { accept: false });
    let career = await getManagerCareer(ctx.db, ctx.saveId);
    expect(career[0].season).toBe(1);
    expect(['stayed', 'fired']).toContain(career[0].exitReason);

    // Temporada 2 → reputação alta garante ofertas; aceitar troca de clube
    await playUntilSeasonEnd(ctx, 222);
    await setManagerReputation(ctx.db, ctx.saveId, 99);
    const r = await endSeasonHeadless(ctx, { accept: true });
    expect(r.switched).toBe(true);
    career = await getManagerCareer(ctx.db, ctx.saveId);
    expect(career.find((e) => e.season === 2)?.exitReason).toBe('resigned');
  });
});
