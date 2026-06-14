import {
  createE2EContext,
  playUntilSeasonEnd,
  endSeasonHeadless,
  E2EContext,
} from './test-helpers';
import { getManagerReputation, setManagerReputation } from '@/database/queries/save';

function age(ctx: E2EContext, playerId: number): number {
  return (ctx.rawDb.prepare('SELECT age FROM players WHERE id = ?').get(playerId) as { age: number })
    .age;
}

function fixturesCount(ctx: E2EContext, season: number): number {
  return (
    ctx.rawDb
      .prepare('SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = ?')
      .get(ctx.saveId, season) as { n: number }
  ).n;
}

function fixturesCountForClub(ctx: E2EContext, clubId: number, season: number): number {
  return (
    ctx.rawDb
      .prepare(
        'SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = ? AND (home_club_id = ? OR away_club_id = ?)',
      )
      .get(ctx.saveId, season, clubId, clubId) as { n: number }
  ).n;
}

describe('E2E · career loop (multi-season)', () => {
  let ctx: E2EContext;
  beforeEach(async () => {
    ctx = await createE2EContext();
  });
  afterEach(() => {
    ctx.rawDb.close();
  });

  it('joga 3 temporadas, troca de clube ao aceitar oferta, mantém reputação', async () => {
    const ageStart = age(ctx, 1);

    // Temporada 1 → recusar oferta (segue no mesmo clube)
    await playUntilSeasonEnd(ctx, 111);
    expect(ctx.season).toBe(2);
    const club1 = ctx.playerClubId;
    const r1 = await endSeasonHeadless(ctx, { accept: false });
    expect(r1.switched).toBe(false);
    expect(ctx.playerClubId).toBe(club1);
    expect(fixturesCount(ctx, 2)).toBeGreaterThan(0); // calendário da temp. 2 gerado
    expect(age(ctx, 1)).toBe(ageStart + 1); // envelheceu 1 na virada

    // Temporada 2 → GARANTIR oferta (reputação alta) e aceitar (troca de clube)
    await playUntilSeasonEnd(ctx, 222);
    expect(ctx.season).toBe(3);
    await setManagerReputation(ctx.db, ctx.saveId, 99); // ceiling alto → clubes acima do atual ofertam
    const r2 = await endSeasonHeadless(ctx, { accept: true });
    expect(r2.switched).toBe(true); // a troca DEVE acontecer (sem no-op silencioso)
    expect(ctx.playerClubId).toBe(r2.newClubId);
    const pc = ctx.rawDb
      .prepare('SELECT player_club_id, board_trust FROM save_games WHERE id = ?')
      .get(ctx.saveId) as { player_club_id: number; board_trust: number };
    expect(pc.player_club_id).toBe(r2.newClubId);
    expect(pc.board_trust).toBe(50); // BOARD_TRUST_INITIAL no novo clube
    expect(fixturesCount(ctx, 3)).toBeGreaterThan(0); // calendário da temp. 3 p/ TODOS os clubes (inclui o novo)
    const repAfterS2 = await getManagerReputation(ctx.db, ctx.saveId);
    expect(repAfterS2).toBeGreaterThanOrEqual(99); // reputação não cai por troca de clube

    // Temporada 3 → joga até o fim COM O NOVO CLUBE sem crash (prova as fixtures regeneradas)
    const r3 = await playUntilSeasonEnd(ctx, 333);
    expect(r3.isSeasonEnd).toBe(true);
    expect(ctx.season).toBe(4);
  }, 120_000);

  it('demitido com ofertas-resgate: aceita → continua em clube menor com elenco rolado', async () => {
    await playUntilSeasonEnd(ctx, 555);
    ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId); // força demissão
    const ageBefore = age(ctx, 1);
    const r = await endSeasonHeadless(ctx, { accept: true });
    expect(r.fired).toBe(true);            // board_trust=0 DEVE demitir (sem no-op silencioso)
    expect(r.switched).toBe(true);         // há ofertas-resgate → troca para clube menor
    expect(ctx.playerClubId).toBe(r.newClubId);
    // o NOVO clube (resgate) tem fixtures da nova temporada — o mundo rolou para todos os clubes
    expect(fixturesCount(ctx, 2)).toBeGreaterThan(0);
    expect(fixturesCountForClub(ctx, r.newClubId!, 2)).toBeGreaterThan(0);
    expect(age(ctx, 1)).toBe(ageBefore + 1);
    // segue jogando uma temporada inteira no novo clube sem crash
    const r2 = await playUntilSeasonEnd(ctx, 556);
    expect(r2.isSeasonEnd).toBe(true);
  }, 120_000);

  it('demitido sem aceitar: carreira encerrada (markSaveEnded)', async () => {
    await playUntilSeasonEnd(ctx, 999);
    ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId);
    const r = await endSeasonHeadless(ctx, { accept: false });
    expect(r.fired).toBe(true);   // a demissão DEVE disparar (sem no-op silencioso)
    const ended = ctx.rawDb
      .prepare('SELECT ended FROM save_games WHERE id = ?')
      .get(ctx.saveId) as { ended: number };
    expect(ended.ended).toBe(1);  // recusar todas → carreira encerrada
  }, 120_000);

  it('é reprodutível: dois saves, mesmo seed, 2 temporadas → estado-chave idêntico', async () => {
    const run = async () => {
      const c = await createE2EContext();
      await playUntilSeasonEnd(c, 777);
      await endSeasonHeadless(c, { accept: true });
      await playUntilSeasonEnd(c, 777);
      const snapshot = c.rawDb
        .prepare(`SELECT id, club_id, age, market_value FROM players WHERE save_id = ? ORDER BY id`)
        .all(c.saveId);
      const budgets = c.rawDb
        .prepare(`SELECT id, budget FROM clubs WHERE save_id = ? ORDER BY id`)
        .all(c.saveId);
      const pcid = c.playerClubId;
      c.rawDb.close();
      return JSON.stringify({ snapshot, budgets, pcid });
    };
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
  }, 120_000);
});
