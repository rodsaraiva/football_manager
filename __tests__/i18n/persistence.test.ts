import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { setSetting } from '@/database/queries/settings';
import { useI18nStore } from '@/store/i18n-store';
import { loadPersistedLanguage, changeLanguage } from '@/i18n/persistence';

describe('i18n persistence', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    rawDb.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    db = createTestDbHandle(rawDb);
    useI18nStore.setState({ language: 'pt' });
  });
  afterEach(() => rawDb.close());

  it('setLanguage changes only the store state', () => {
    useI18nStore.getState().setLanguage('en');
    expect(useI18nStore.getState().language).toBe('en');
  });

  it('changeLanguage persists and updates the store', async () => {
    await changeLanguage(db, 'en');
    expect(useI18nStore.getState().language).toBe('en');
    expect(await import('@/database/queries/settings').then(m => m.getSetting(db, 'language'))).toBe('en');
  });

  it('loadPersistedLanguage applies a saved value', async () => {
    await setSetting(db, 'language', 'en');
    await loadPersistedLanguage(db);
    expect(useI18nStore.getState().language).toBe('en');
  });

  it('loadPersistedLanguage keeps default pt when nothing saved', async () => {
    await loadPersistedLanguage(db);
    expect(useI18nStore.getState().language).toBe('pt');
  });
});
