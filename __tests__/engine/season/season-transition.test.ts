import { createE2EContext, stepWeek } from '../../e2e/test-helpers';
import { runSeasonTransition } from '@/engine/season/season-transition';
import { SeededRng } from '@/engine/rng';

it('roda a virada: envelhece, regenera fixtures da nova temporada, abre pré-temporada', async () => {
  const ctx = await createE2EContext();
  // avançar até o fim da temporada 1
  let end = false;
  let g = 0;
  while (!end && g < 60) {
    const r = await stepWeek(ctx, 4242);
    end = r.isSeasonEnd;
    g++;
  }
  expect(end).toBe(true);
  expect(ctx.season).toBe(2);

  const ageBefore = (ctx.rawDb.prepare('SELECT age FROM players WHERE id = ?').get(1) as { age: number }).age;
  const fxBefore = (ctx.rawDb.prepare('SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = 2').get(ctx.saveId) as { n: number }).n;
  expect(fxBefore).toBe(0); // sem fixtures da temporada 2 antes da virada

  await runSeasonTransition(ctx.db, {
    saveId: ctx.saveId,
    playerClubId: ctx.playerClubId,
    endedSeason: 1,
    newSeason: 2,
    youthAcademyLevel: 3,
    rng: new SeededRng(2 * 7777),
  });

  const ageAfter = (ctx.rawDb.prepare('SELECT age FROM players WHERE id = ?').get(1) as { age: number }).age;
  const fxAfter = (ctx.rawDb.prepare('SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = 2').get(ctx.saveId) as { n: number }).n;
  const preseason = (ctx.rawDb.prepare('SELECT preseason_pending FROM save_games WHERE id = ?').get(ctx.saveId) as { preseason_pending: number }).preseason_pending;
  expect(ageAfter).toBe(ageBefore + 1);
  expect(fxAfter).toBeGreaterThan(0); // calendário da temporada 2 gerado
  expect(preseason).toBe(1);
  ctx.rawDb.close();
});
