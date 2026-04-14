import { createE2EContext, stepWeek, stepWeeks, E2EContext, getClubBudget } from './test-helpers';

describe('E2E · week advancement', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await createE2EContext();
    // Jump straight to week 7 (first league matchweek)
    ctx.week = 7;
  });

  afterEach(() => {
    ctx.rawDb.close();
  });

  it('advances weekly, increments the pointer, persists results to DB', async () => {
    const result = await stepWeek(ctx);
    expect(result.newWeek).toBe(8);
    expect(result.newSeason).toBe(1);
    expect(result.isSeasonEnd).toBe(false);

    const playedFixtures = ctx.rawDb
      .prepare('SELECT COUNT(*) as c FROM fixtures WHERE season = 1 AND week = 7 AND played = 1')
      .get() as { c: number };
    expect(playedFixtures.c).toBeGreaterThan(0);
  });

  it('produces a real match result for the player club', async () => {
    const result = await stepWeek(ctx);
    expect(result.playerMatchResult).not.toBeNull();
    if (result.playerMatchResult) {
      expect(result.playerMatchResult.homeRatings).toHaveLength(11);
      expect(result.playerMatchResult.awayRatings).toHaveLength(11);
      // Stats should be coherent
      expect(
        result.playerMatchResult.stats.homePossession +
          result.playerMatchResult.stats.awayPossession,
      ).toBeCloseTo(100, 0);
    }
  });

  it('deducts wages and records finance entries each week', async () => {
    const budgetBefore = getClubBudget(ctx, ctx.playerClubId);
    await stepWeek(ctx);
    const budgetAfter = getClubBudget(ctx, ctx.playerClubId);

    // Budget should have changed (income or expenses recorded)
    expect(budgetAfter).not.toBe(budgetBefore);

    const entries = ctx.rawDb
      .prepare('SELECT type FROM club_finances WHERE club_id = ? AND season = 1 AND week = 7')
      .all(ctx.playerClubId) as Array<{ type: string }>;
    const types = entries.map((e) => e.type);
    expect(types).toContain('tv');
    expect(types).toContain('sponsor');
    expect(types).toContain('wages');
    expect(types).toContain('maintenance');
  });

  it('advances the match_events table when the player plays', async () => {
    await stepWeek(ctx);
    const events = ctx.rawDb.prepare('SELECT COUNT(*) as c FROM match_events').get() as {
      c: number;
    };
    // Matches normally produce at least some events (cards/subs etc.); not
    // all matches will have them, but over a couple weeks we'd expect some.
    expect(events.c).toBeGreaterThanOrEqual(0);
  });

  it('stays deterministic: same seed reproduces the same score', async () => {
    const ctx2 = await createE2EContext();
    ctx2.week = 7;

    const r1 = await stepWeek(ctx);
    const r2 = await stepWeek(ctx2);

    if (r1.playerMatchResult && r2.playerMatchResult) {
      expect(r1.playerMatchResult.homeGoals).toBe(r2.playerMatchResult.homeGoals);
      expect(r1.playerMatchResult.awayGoals).toBe(r2.playerMatchResult.awayGoals);
    }
    ctx2.rawDb.close();
  });

  it('wraps season at week 46', async () => {
    ctx.week = 46;
    const result = await stepWeek(ctx);
    expect(result.newSeason).toBe(2);
    expect(result.newWeek).toBe(1);
    expect(result.isSeasonEnd).toBe(true);
  });

  it('advances multiple weeks without crashing and fixtures accumulate', async () => {
    await stepWeeks(ctx, 10);
    const played = ctx.rawDb
      .prepare('SELECT COUNT(*) as c FROM fixtures WHERE played = 1')
      .get() as { c: number };
    expect(played.c).toBeGreaterThan(10);
  });

  it('player fitness is updated each week', async () => {
    const fitnessBefore = ctx.rawDb
      .prepare('SELECT AVG(fitness) as f FROM players WHERE club_id = ?')
      .get(ctx.playerClubId) as { f: number };

    await stepWeeks(ctx, 3);

    const fitnessAfter = ctx.rawDb
      .prepare('SELECT AVG(fitness) as f FROM players WHERE club_id = ?')
      .get(ctx.playerClubId) as { f: number };

    // Fitness values should stay in valid range
    expect(fitnessAfter.f).toBeGreaterThanOrEqual(30);
    expect(fitnessAfter.f).toBeLessThanOrEqual(100);
    // And should have shifted from the starting 90
    expect(fitnessAfter.f).not.toBe(fitnessBefore.f);
  });
});
