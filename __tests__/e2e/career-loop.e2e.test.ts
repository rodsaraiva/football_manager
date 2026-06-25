import {
  createE2EContext,
  playUntilSeasonEnd,
  endSeasonHeadless,
  advanceUnemploymentHeadless,
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
    await playUntilSeasonEnd(ctx, 4040);
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
    const r2 = await playUntilSeasonEnd(ctx, 4041);
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

  it('demitido → spell de 2+ temporadas → aceita resgate de banda menor → continua', async () => {
    await playUntilSeasonEnd(ctx, 4321);
    ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId); // força demissão
    const repAtDismissal = await getManagerReputation(ctx.db, ctx.saveId);

    // demitido sem aceitar imediatamente → entra no spell (unemployed=1, since=season)
    const fired = await endSeasonHeadless(ctx, { accept: false, enterSpell: true });
    expect(fired.fired).toBe(true);
    const unemp = ctx.rawDb
      .prepare('SELECT unemployed, unemployed_since_season FROM save_games WHERE id = ?')
      .get(ctx.saveId) as { unemployed: number; unemployed_since_season: number | null };
    expect(unemp.unemployed).toBe(1);
    expect(unemp.unemployed_since_season).not.toBeNull();

    // avança 2 rodadas de mercado: primeira sem aceitar (decaimento + dreno), depois aceita
    await advanceUnemploymentHeadless(ctx, { accept: false });
    const r2 = await advanceUnemploymentHeadless(ctx, { accept: true });
    expect(r2.accepted).toBe(true);

    const repAfter = await getManagerReputation(ctx.db, ctx.saveId);
    expect(repAfter).toBeLessThan(repAtDismissal); // decaimento durante o spell
    // segue jogando uma temporada inteira no novo clube sem crash
    const next = await playUntilSeasonEnd(ctx, 4322);
    expect(next.isSeasonEnd).toBe(true);
  }, 180_000);

  it('spell até o piso terminal encerra a carreira', async () => {
    await playUntilSeasonEnd(ctx, 8000);
    ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId);
    await endSeasonHeadless(ctx, { accept: false, enterSpell: true });
    // poupança no chão força terminal já na próxima rodada
    ctx.rawDb.prepare('UPDATE save_games SET manager_savings = ? WHERE id = ?').run(-2, ctx.saveId);
    const r = await advanceUnemploymentHeadless(ctx, { accept: false });
    expect(r.terminal).toBe(true);
    const ended = ctx.rawDb.prepare('SELECT ended FROM save_games WHERE id = ?').get(ctx.saveId) as { ended: number };
    expect(ended.ended).toBe(1);
  }, 180_000);

  it('spell é reprodutível: dois saves, mesmo seed → estado-chave idêntico', async () => {
    const run = async () => {
      const c = await createE2EContext();
      await playUntilSeasonEnd(c, 9001);
      c.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(c.saveId);
      await endSeasonHeadless(c, { accept: false, enterSpell: true });
      await advanceUnemploymentHeadless(c, { accept: false });
      const snap = c.rawDb
        .prepare('SELECT manager_reputation, manager_savings, unemployed_since_season FROM save_games WHERE id = ?')
        .get(c.saveId);
      const offers = c.rawDb
        .prepare('SELECT offering_club_id FROM job_offers WHERE save_id = ? ORDER BY offering_club_id')
        .all(c.saveId);
      c.rawDb.close();
      return JSON.stringify({ snap, offers });
    };
    expect(await run()).toEqual(await run());
  }, 180_000);
});
