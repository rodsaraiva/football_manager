import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { rolloverSeason } from '@/engine/season-rollover';
import { SeededRng } from '@/engine/rng';

const S = TEST_SAVE_ID;
const AI_CLUB = 5;

describe('AI regeneration across the season rollover', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('takes a youth intake for AI clubs (not just the human club)', async () => {
    const maxBefore = (rawDb.prepare('SELECT MAX(id) as m FROM players').get() as { m: number }).m;

    await rolloverSeason({
      dbHandle: db, playerClubId: 1, saveId: S, endedSeason: 1, newSeason: 2,
      youthAcademyLevel: 3, rng: new SeededRng(123),
    });

    // New players (id > maxBefore) were inserted for the AI club.
    const newAiYouth = (rawDb
      .prepare('SELECT COUNT(*) as c FROM players WHERE club_id = ? AND id > ?')
      .get(AI_CLUB, maxBefore)) as { c: number };
    expect(newAiYouth.c).toBeGreaterThan(0);
  });

  it('re-evaluates market value of AI players (not frozen at seed)', async () => {
    const sample = (rawDb
      .prepare('SELECT id, market_value FROM players WHERE club_id = ? ORDER BY id LIMIT 5')
      .all(AI_CLUB)) as Array<{ id: number; market_value: number }>;

    await rolloverSeason({
      dbHandle: db, playerClubId: 1, saveId: S, endedSeason: 1, newSeason: 2,
      youthAcademyLevel: 3, rng: new SeededRng(321),
    });

    const after = (rawDb
      .prepare(`SELECT id, market_value FROM players WHERE id IN (${sample.map(() => '?').join(',')})`)
      .all(...sample.map(s => s.id))) as Array<{ id: number; market_value: number }>;
    const changed = after.some(a => a.market_value !== sample.find(s => s.id === a.id)!.market_value);
    expect(changed).toBe(true);
  });
});
