import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';

const S = TEST_SAVE_ID;

describe('AI real simulation', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await ensureSeasonFixtures(db, S, 1);
  });
  afterEach(() => rawDb.close());

  it('persists player_stats for AI clubs (not just the human club)', async () => {
    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(7) });
    // A club that did NOT belong to the human (id 1) still has stats rows.
    const row = (await db.prepare(
      `SELECT COUNT(*) as c FROM player_stats ps
       JOIN players p ON p.id = ps.player_id
       WHERE p.club_id NOT IN (1) AND ps.season = 1`,
    ).get()) as { c: number };
    expect(row.c).toBeGreaterThan(0);
  });

  it('AI fixtures are decided by squad strength, not reputation coin-flip', async () => {
    // Boost one AI club's whole squad far above its opponents, keep rep low.
    await db.prepare('UPDATE clubs SET reputation = 40 WHERE save_id = ? AND id = 3').run(S);
    await db.prepare(
      `UPDATE player_attributes SET finishing=92, passing=92, dribbling=92, pace=92, positioning=92,
        composure=92, decisions=92, vision=92, stamina=92, strength=92, heading=92, agility=92, jumping=92,
        crossing=92, long_shots=92, free_kicks=92, aggression=92, leadership=92
       WHERE player_id IN (SELECT id FROM players WHERE save_id = ? AND club_id = 3)`,
    ).run(S);

    let wins = 0, games = 0;
    for (let wk = 7; wk <= 16; wk++) {
      await advanceGameWeek({ dbHandle: db, season: 1, week: wk, playerClubId: 1, saveId: S, rng: new SeededRng(wk * 13) });
      const fx = (await db.prepare(
        `SELECT home_club_id, away_club_id, home_goals, away_goals FROM fixtures
         WHERE season = 1 AND week = ? AND played = 1 AND (home_club_id = 3 OR away_club_id = 3)`,
      ).all(wk)) as Array<{ home_club_id: number; away_club_id: number; home_goals: number; away_goals: number }>;
      for (const f of fx) {
        games++;
        const club3Goals = f.home_club_id === 3 ? f.home_goals : f.away_goals;
        const oppGoals = f.home_club_id === 3 ? f.away_goals : f.home_goals;
        if (club3Goals > oppGoals) wins++;
      }
    }
    expect(games).toBeGreaterThan(0);
    expect(wins / games).toBeGreaterThan(0.5); // dominant squad wins despite low rep
  });
});
