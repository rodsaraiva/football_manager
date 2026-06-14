import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  insertNewsItem,
  getNewsItems,
  markNewsRead,
  countUnread,
  toNewsItem,
} from '@/database/queries/news';
import type { TKey } from '@/i18n/translate';

const k = (s: string) => s as TKey;

describe('news queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('insere e recupera por temporada, ordenado por priority desc', async () => {
    await insertNewsItem(db, TEST_SAVE_ID, {
      season: 1, week: 5, category: 'transfer', icon: '💰',
      titleKey: k('news.persist_transfer_in_title'), titleVars: { player: 'Silva' },
      bodyKey: k('news.persist_transfer_in_body'), bodyVars: { fee: '$5.0M', from: 'ABC' }, priority: 70,
    });
    await insertNewsItem(db, TEST_SAVE_ID, {
      season: 1, week: 6, category: 'board', icon: '🏛️',
      titleKey: k('news.persist_board_met_title'), bodyKey: k('news.persist_board_met_body'), priority: 95,
    });
    const rows = await getNewsItems(db, TEST_SAVE_ID, 1);
    expect(rows).toHaveLength(2);
    expect(rows[0].priority).toBe(95);

    const item = toNewsItem(rows[0]);
    expect(item.title.key).toBe('news.persist_board_met_title');
    expect(item.category).toBe('board');
  });

  it('countUnread conta só não-lidas; markNewsRead zera', async () => {
    await insertNewsItem(db, TEST_SAVE_ID, { season: 1, week: 1, category: 'info', icon: 'ℹ️', titleKey: k('news.persist_press_neutral_title'), bodyKey: k('news.persist_press_neutral_body'), priority: 10 });
    await insertNewsItem(db, TEST_SAVE_ID, { season: 1, week: 2, category: 'info', icon: 'ℹ️', titleKey: k('news.persist_press_neutral_title'), bodyKey: k('news.persist_press_neutral_body'), priority: 10 });
    expect(await countUnread(db, TEST_SAVE_ID)).toBe(2);
    await markNewsRead(db, TEST_SAVE_ID);
    expect(await countUnread(db, TEST_SAVE_ID)).toBe(0);
  });

  it('é save-isolado', async () => {
    await insertNewsItem(db, TEST_SAVE_ID, { season: 1, week: 1, category: 'info', icon: 'ℹ️', titleKey: k('news.persist_press_neutral_title'), bodyKey: k('news.persist_press_neutral_body'), priority: 10 });
    expect(await countUnread(db, 999999)).toBe(0);
    expect(await getNewsItems(db, 999999, 1)).toHaveLength(0);
  });

  it('title_vars/body_vars persistem como JSON e voltam parseados', async () => {
    await insertNewsItem(db, TEST_SAVE_ID, {
      season: 2, week: 3, category: 'callup', icon: '🌍',
      titleKey: k('news.persist_press_positive_title'), titleVars: { count: 3 },
      bodyKey: k('news.persist_press_positive_body'), priority: 60,
    });
    const item = toNewsItem((await getNewsItems(db, TEST_SAVE_ID, 2))[0]);
    expect(item.title.vars).toEqual({ count: 3 });
    expect(item.body.vars).toBeUndefined();
    expect(item.id).toBe('persist-1');
  });
});
