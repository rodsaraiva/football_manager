import { createE2EContext, playUntilSeasonEnd, E2EContext } from '../e2e/test-helpers';
import { bootstrapRivalries, archiveLegacy } from '../../src/engine/legacy/legacy-archiver';
import { getClubLegends, getRivalries } from '../../src/database/queries/legacy';

describe('legacy wiring no game-loop (integração)', () => {
  let ctx: E2EContext;
  beforeEach(async () => { ctx = await createE2EContext(); });
  afterEach(() => ctx.rawDb.close());

  it('bootstrap gera rivalidades e fim de temporada materializa legado do clube', async () => {
    await bootstrapRivalries(ctx.db, ctx.saveId);
    const rivals = await getRivalries(ctx.db, ctx.saveId, ctx.playerClubId);
    expect(rivals.length).toBeGreaterThan(0);

    const end = await playUntilSeasonEnd(ctx, 111);
    expect(end.isSeasonEnd).toBe(true);

    const legs = await getClubLegends(ctx.db, ctx.saveId, ctx.playerClubId);
    expect(legs.length).toBeGreaterThan(0);
  });

  it('archiveLegacy direto também materializa (idempotente com o loop)', async () => {
    await playUntilSeasonEnd(ctx, 222);
    await archiveLegacy(ctx.db, ctx.saveId, 1, ctx.playerClubId);
    const legs = await getClubLegends(ctx.db, ctx.saveId, ctx.playerClubId);
    expect(legs.length).toBeGreaterThan(0);
  });
});
