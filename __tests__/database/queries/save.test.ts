import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { markSaveEnded, isSaveEnded } from '@/database/queries/save';

describe('save ended queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const SAVE_ID = TEST_SAVE_ID; // seedTestDb already creates save id=1

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('defaults to not ended', async () => {
    expect(await isSaveEnded(db, SAVE_ID)).toBe(false);
  });

  it('marks a save ended and reads it back', async () => {
    await markSaveEnded(db, SAVE_ID);
    expect(await isSaveEnded(db, SAVE_ID)).toBe(true);
  });

  it('returns false for an unknown save', async () => {
    expect(await isSaveEnded(db, 999)).toBe(false);
  });
});
