import { createE2EContext, stepWeek } from '../../e2e/test-helpers';
import { evaluateSeasonEndBoard } from '@/engine/season/season-end-eval';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getClubById } from '@/database/queries/clubs';
import { getManagerReputation } from '@/database/queries/save';
import { isManagerDismissed } from '@/engine/board/season-outcome';
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

it('demitido: gera ofertas-resgate de clubes de MENOR reputação', async () => {
  const ctx = await createE2EContext();
  let end = false;
  let g = 0;
  while (!end && g < 60) {
    const r = await stepWeek(ctx, 4242);
    end = r.isSeasonEnd;
    g++;
  }
  const club = (await getClubById(ctx.db, ctx.saveId, ctx.playerClubId))!;
  const comps = (await getCompetitionsBySeason(ctx.db, ctx.saveId, 1)).map((c) => ({ id: c.id, type: c.type }));

  // Force dismissal deterministically: zero board trust AND a prior-season objective the
  // top-division player club cannot meet (promotion → objective_failed → -15 trust delta),
  // so the new trust stays below the fire threshold and the board sacks the manager.
  ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId);
  ctx.rawDb
    .prepare(
      "INSERT OR REPLACE INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (?, ?, 1, 'promotion', NULL, '')",
    )
    .run(ctx.saveId, ctx.playerClubId);

  const evalRes = await evaluateSeasonEndBoard(ctx.db, {
    saveId: ctx.saveId,
    playerClubId: ctx.playerClubId,
    clubReputation: club.reputation,
    endedSeason: 1,
    newSeason: 2,
    competitions: comps,
    offerRng: new SeededRng(1 * 6151 + ctx.saveId),
  });

  expect(isManagerDismissed(evalRes.board.consequence)).toBe(true);
  expect(evalRes.generatedOfferClubIds.length).toBeGreaterThan(0);
  // Every rescue offer is from a club of strictly lower reputation than the player's club.
  for (const offeringClubId of evalRes.generatedOfferClubIds) {
    const offering = (await getClubById(ctx.db, ctx.saveId, offeringClubId))!;
    expect(offering.reputation).toBeLessThan(club.reputation);
  }
  ctx.rawDb.close();
});
