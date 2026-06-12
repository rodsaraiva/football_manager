import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';

const S = TEST_SAVE_ID;

describe('debt_weeks tracking', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    clubId = (rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number }).id;
  });
  afterEach(() => rawDb.close());

  it('increments debt_weeks when the budget stays negative after a week', async () => {
    // Force a deeply negative budget so weekly income cannot lift it positive.
    rawDb.prepare('UPDATE clubs SET budget = -500000000 WHERE id = ?').run(clubId);
    await advanceGameWeek({ dbHandle: db, saveId: S, playerClubId: clubId, season: 2025, week: 3, rng: new SeededRng(1) });
    const c1 = rawDb.prepare('SELECT debt_weeks, budget FROM clubs WHERE id = ?').get(clubId) as { debt_weeks: number; budget: number };
    expect(c1.budget).toBeLessThan(0);
    expect(c1.debt_weeks).toBe(1);

    await advanceGameWeek({ dbHandle: db, saveId: S, playerClubId: clubId, season: 2025, week: 4, rng: new SeededRng(1) });
    const c2 = rawDb.prepare('SELECT debt_weeks FROM clubs WHERE id = ?').get(clubId) as { debt_weeks: number };
    expect(c2.debt_weeks).toBe(2);
  });

  it('resets debt_weeks to 0 once the budget is non-negative', async () => {
    // Large positive budget so it stays non-negative after a week's net.
    rawDb.prepare('UPDATE clubs SET budget = 1000000000, debt_weeks = 5 WHERE id = ?').run(clubId);
    await advanceGameWeek({ dbHandle: db, saveId: S, playerClubId: clubId, season: 2025, week: 3, rng: new SeededRng(1) });
    const c = rawDb.prepare('SELECT debt_weeks, budget FROM clubs WHERE id = ?').get(clubId) as { debt_weeks: number; budget: number };
    expect(c.budget).toBeGreaterThanOrEqual(0);
    expect(c.debt_weeks).toBe(0);
  });
});
