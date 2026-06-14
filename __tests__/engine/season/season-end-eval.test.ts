import { createE2EContext, stepWeek } from '../../e2e/test-helpers';
import { evaluateSeasonEndBoard } from '@/engine/season/season-end-eval';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getClubById } from '@/database/queries/clubs';
import { getManagerReputation } from '@/database/queries/save';
import { SeededRng } from '@/engine/rng';

it('avalia diretoria, acumula rep do treinador e gera ofertas (se não demitido)', async () => {
  const ctx = await createE2EContext();
  let end = false;
  let g = 0;
  while (!end && g < 60) {
    const r = await stepWeek(ctx, 9001);
    end = r.isSeasonEnd;
    g++;
  }
  const club = (await getClubById(ctx.db, ctx.saveId, ctx.playerClubId))!;
  const comps = (await getCompetitionsBySeason(ctx.db, ctx.saveId, 1)).map((c) => ({ id: c.id, type: c.type }));
  const repBefore = await getManagerReputation(ctx.db, ctx.saveId);

  const evalRes = await evaluateSeasonEndBoard(ctx.db, {
    saveId: ctx.saveId,
    playerClubId: ctx.playerClubId,
    clubReputation: club.reputation,
    endedSeason: 1,
    newSeason: 2,
    competitions: comps,
    offerRng: new SeededRng(1 * 6151 + ctx.saveId),
  });
  expect(evalRes.board.newTrust).toBeGreaterThanOrEqual(0);
  expect(evalRes.managerRep.before).toBe(repBefore);
  const repAfter = await getManagerReputation(ctx.db, ctx.saveId);
  expect(repAfter).toBe(evalRes.managerRep.after); // persistido
  ctx.rawDb.close();
});
