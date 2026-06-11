import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { insertPromotedIgnore, getPromotedForClub } from '@/database/queries/season-promoted';

describe('season_promoted queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('returns null when a club was not promoted that season', async () => {
    expect(await getPromotedForClub(db, TEST_SAVE_ID, 1, 1)).toBeNull();
  });

  it('inserts and reads a promotion row', async () => {
    // club 21 belongs to a lower (Championship) league in seed data; promote into league 1.
    await insertPromotedIgnore(db, TEST_SAVE_ID, 1, 1, 21, 2);
    const row = await getPromotedForClub(db, TEST_SAVE_ID, 1, 21);
    expect(row).toEqual({ leagueId: 1, finalPosition: 2 });
  });

  it('is idempotent on (save_id, season, league_id, club_id)', async () => {
    await insertPromotedIgnore(db, TEST_SAVE_ID, 1, 1, 21, 2);
    await insertPromotedIgnore(db, TEST_SAVE_ID, 1, 1, 21, 2);
    const cnt = rawDb
      .prepare('SELECT COUNT(*) AS c FROM season_promoted WHERE save_id = ? AND season = 1 AND club_id = 21')
      .get(TEST_SAVE_ID) as { c: number };
    expect(cnt.c).toBe(1);
  });
});
