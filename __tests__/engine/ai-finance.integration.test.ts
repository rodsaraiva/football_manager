import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';

const S = TEST_SAVE_ID;

describe('AI finance', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await ensureSeasonFixtures(db, S, 1);
  });
  afterEach(() => rawDb.close());

  it('moves the budget of AI clubs (not just the human club) after a week', async () => {
    const before = (rawDb
      .prepare('SELECT id, budget FROM clubs WHERE id != 1')
      .all()) as Array<{ id: number; budget: number }>;
    const beforeById = new Map(before.map(c => [c.id, c.budget]));

    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(7) });

    const after = (rawDb
      .prepare('SELECT id, budget FROM clubs WHERE id != 1')
      .all()) as Array<{ id: number; budget: number }>;

    // At least one AI club's budget changed (income/expenses applied).
    const changed = after.filter(c => beforeById.get(c.id) !== c.budget);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('writes finance ledger entries for AI clubs that played', async () => {
    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(7) });
    const rows = (rawDb
      .prepare('SELECT COUNT(*) as c FROM club_finances WHERE club_id != 1 AND season = 1 AND week = 7')
      .get()) as { c: number };
    expect(rows.c).toBeGreaterThan(0);
  });
});
