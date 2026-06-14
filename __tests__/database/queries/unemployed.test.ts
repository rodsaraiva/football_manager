import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { setUnemployed, isUnemployed } from '@/database/queries/save';

describe('unemployed gate queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const SAVE_ID = TEST_SAVE_ID;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('defaults to not unemployed', async () => {
    expect(await isUnemployed(db, SAVE_ID)).toBe(false);
  });

  it('sets the gate and reads it back', async () => {
    await setUnemployed(db, SAVE_ID, true);
    expect(await isUnemployed(db, SAVE_ID)).toBe(true);
  });

  it('clears the gate', async () => {
    await setUnemployed(db, SAVE_ID, true);
    await setUnemployed(db, SAVE_ID, false);
    expect(await isUnemployed(db, SAVE_ID)).toBe(false);
  });

  it('returns false for an unknown save', async () => {
    expect(await isUnemployed(db, 999)).toBe(false);
  });
});
