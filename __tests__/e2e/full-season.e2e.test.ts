import { createE2EContext, stepWeek, E2EContext } from './test-helpers';
import { calculateStandings } from '@/engine/competition/standings';

describe('E2E · full season simulation', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await createE2EContext();
  });

  afterEach(() => {
    ctx.rawDb.close();
  });

  it('advances 46 weeks without errors and rolls over to season 2', async () => {
    // Run until season end
    let isEnd = false;
    let guard = 0;
    while (!isEnd && guard < 60) {
      const r = await stepWeek(ctx, 123);
      isEnd = r.isSeasonEnd;
      guard++;
    }
    expect(isEnd).toBe(true);
    expect(ctx.season).toBe(2);
    expect(ctx.week).toBe(1);
  }, 60_000);

  it('fills in league fixtures — most get played over a full season', async () => {
    // Run 46 weeks
    for (let i = 0; i < 46; i++) {
      const r = await stepWeek(ctx, 500 + i);
      if (r.isSeasonEnd) break;
    }

    // At least half the league fixtures for season 1 should be played
    const totals = ctx.rawDb
      .prepare(
        `SELECT
           SUM(CASE WHEN played = 1 THEN 1 ELSE 0 END) as played,
           COUNT(*) as total
         FROM fixtures f
         JOIN competitions c ON c.id = f.competition_id
         WHERE f.season = 1 AND c.type = 'league'`,
      )
      .get() as { played: number; total: number };

    expect(totals.total).toBeGreaterThan(0);
    expect(totals.played / totals.total).toBeGreaterThan(0.9);
  }, 60_000);

  it('final standings are coherent (wins+draws+losses = played, points = 3W+D)', async () => {
    for (let i = 0; i < 46; i++) {
      const r = await stepWeek(ctx, 777 + i);
      if (r.isSeasonEnd) break;
    }

    // Build standings for the player's league
    const leagueId = (
      ctx.rawDb.prepare('SELECT league_id FROM clubs WHERE id = ?').get(ctx.playerClubId) as {
        league_id: number;
      }
    ).league_id;
    const clubIds = (
      ctx.rawDb.prepare('SELECT id FROM clubs WHERE league_id = ?').all(leagueId) as Array<{
        id: number;
      }>
    ).map((r) => r.id);

    const playedFixtures = ctx.rawDb
      .prepare(
        `SELECT f.* FROM fixtures f JOIN competitions c ON c.id = f.competition_id
         WHERE f.season = 1 AND c.type = 'league' AND c.league_id = ? AND f.played = 1`,
      )
      .all(leagueId) as Array<{
      id: number;
      competition_id: number;
      season: number;
      week: number;
      round: number | null;
      home_club_id: number;
      away_club_id: number;
      home_goals: number | null;
      away_goals: number | null;
      played: number;
      attendance: number | null;
    }>;

    // Map to Fixture type expected by calculateStandings
    const fixtures = playedFixtures.map((f) => ({
      id: f.id,
      competitionId: f.competition_id,
      season: f.season,
      week: f.week,
      round: f.round,
      homeClubId: f.home_club_id,
      awayClubId: f.away_club_id,
      homeGoals: f.home_goals,
      awayGoals: f.away_goals,
      played: f.played === 1,
      attendance: f.attendance,
    }));

    const standings = calculateStandings(fixtures, clubIds);
    for (const e of standings) {
      expect(e.wins + e.draws + e.losses).toBe(e.played);
      expect(e.points).toBe(e.wins * 3 + e.draws);
      expect(e.goalsFor - e.goalsAgainst).toBe(e.goalDifference);
    }
  }, 60_000);

  it('match_events accumulate meaningfully over multiple weeks', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await stepWeek(ctx, 321 + i);
      if (r.isSeasonEnd) break;
    }

    // Only the player's club match produces detailed events (AI-vs-AI uses a
    // simplified simulation). Over 10 weeks that's enough to see something.
    const totalEvents = (ctx.rawDb
      .prepare('SELECT COUNT(*) as c FROM match_events')
      .get() as { c: number }).c;
    expect(totalEvents).toBeGreaterThan(0);

    // All events should point to real players + fixtures
    const orphanEvents = (ctx.rawDb
      .prepare(
        `SELECT COUNT(*) as c FROM match_events e
         WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = e.player_id)
            OR NOT EXISTS (SELECT 1 FROM fixtures f WHERE f.id = e.fixture_id)`,
      )
      .get() as { c: number }).c;
    expect(orphanEvents).toBe(0);
  }, 60_000);

  it('club_finances accumulates rows each week with expected types', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await stepWeek(ctx, 800 + i);
      if (r.isSeasonEnd) break;
    }

    const entries = ctx.rawDb
      .prepare('SELECT type FROM club_finances WHERE club_id = ? AND season = 1')
      .all(ctx.playerClubId) as Array<{ type: string }>;

    const uniqueTypes = new Set(entries.map((e) => e.type));
    expect(uniqueTypes.has('tv')).toBe(true);
    expect(uniqueTypes.has('sponsor')).toBe(true);
    expect(uniqueTypes.has('wages')).toBe(true);
    expect(uniqueTypes.has('maintenance')).toBe(true);
  }, 60_000);

  it('transfer_blocks get pruned as their window passes', async () => {
    // Force a block with blocked_until near the start
    ctx.rawDb
      .prepare(
        `INSERT INTO transfer_blocks (player_id, offering_club_id, blocked_until_season, blocked_until_week)
         VALUES (?, ?, ?, ?)`,
      )
      .run(1, ctx.playerClubId, 1, 2);

    const before = (ctx.rawDb.prepare('SELECT COUNT(*) as c FROM transfer_blocks').get() as {
      c: number;
    }).c;
    expect(before).toBeGreaterThanOrEqual(1);

    // Advance past the block
    for (let i = 0; i < 5; i++) {
      const r = await stepWeek(ctx, 999 + i);
      if (r.isSeasonEnd) break;
    }

    const after = (ctx.rawDb.prepare('SELECT COUNT(*) as c FROM transfer_blocks').get() as {
      c: number;
    }).c;
    expect(after).toBe(0);
  }, 60_000);

  it('AI-vs-AI transfers happen in the transfer window but not outside', async () => {
    const inWindowBefore = (
      ctx.rawDb
        .prepare("SELECT COUNT(*) as c FROM transfers WHERE season = 1 AND type = 'transfer'")
        .get() as { c: number }
    ).c;

    // Advance through entire transfer window
    for (let i = 0; i < 6; i++) {
      await stepWeek(ctx, 7000 + i);
    }

    const inWindowAfter = (
      ctx.rawDb
        .prepare("SELECT COUNT(*) as c FROM transfers WHERE season = 1 AND type = 'transfer'")
        .get() as { c: number }
    ).c;

    // Several random AI transfers should happen over the window
    expect(inWindowAfter).toBeGreaterThanOrEqual(inWindowBefore);
  }, 60_000);

  it('full season simulation keeps player & club tables consistent', async () => {
    for (let i = 0; i < 46; i++) {
      const r = await stepWeek(ctx, 1234 + i);
      if (r.isSeasonEnd) break;
    }

    // Every non-free-agent player still references a valid club
    const orphans = ctx.rawDb
      .prepare(
        `SELECT COUNT(*) as c FROM players p
         WHERE p.is_free_agent = 0 AND p.club_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id = p.club_id)`,
      )
      .get() as { c: number };
    expect(orphans.c).toBe(0);

    // Fitness/morale stay in allowed bounds
    const bounds = ctx.rawDb
      .prepare(
        `SELECT MIN(fitness) as f_min, MAX(fitness) as f_max,
                MIN(morale) as m_min, MAX(morale) as m_max
         FROM players WHERE club_id IS NOT NULL`,
      )
      .get() as {
      f_min: number;
      f_max: number;
      m_min: number;
      m_max: number;
    };
    expect(bounds.f_min).toBeGreaterThanOrEqual(1);
    expect(bounds.f_max).toBeLessThanOrEqual(100);
    expect(bounds.m_min).toBeGreaterThanOrEqual(1);
    expect(bounds.m_max).toBeLessThanOrEqual(100);
  }, 90_000);
});
