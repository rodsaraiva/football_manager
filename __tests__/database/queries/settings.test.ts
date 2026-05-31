import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getSetting, setSetting } from '@/database/queries/settings';

describe('settings queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('returns null for a missing key', async () => {
    expect(await getSetting(db, 'language')).toBeNull();
  });

  it('sets and reads a value', async () => {
    await setSetting(db, 'language', 'en');
    expect(await getSetting(db, 'language')).toBe('en');
  });

  it('overwrites an existing value (INSERT OR REPLACE)', async () => {
    await setSetting(db, 'language', 'en');
    await setSetting(db, 'language', 'pt');
    expect(await getSetting(db, 'language')).toBe('pt');
  });
});
