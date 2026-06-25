import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getManagerSavings, setManagerSavings,
  getUnemployedSince, setUnemployedSince,
} from '@/database/queries/save';

const SAVE = TEST_SAVE_ID;

describe('manager savings + unemployed-since', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('savings default 0, set/get round-trip', async () => {
    expect(await getManagerSavings(db, SAVE)).toBe(0);
    await setManagerSavings(db, SAVE, 1500);
    expect(await getManagerSavings(db, SAVE)).toBe(1500);
    await setManagerSavings(db, SAVE, -3);
    expect(await getManagerSavings(db, SAVE)).toBe(-3);
  });

  it('unemployedSince: default null, set número, set null', async () => {
    expect(await getUnemployedSince(db, SAVE)).toBeNull();
    await setUnemployedSince(db, SAVE, 4);
    expect(await getUnemployedSince(db, SAVE)).toBe(4);
    await setUnemployedSince(db, SAVE, null);
    expect(await getUnemployedSince(db, SAVE)).toBeNull();
  });
});
