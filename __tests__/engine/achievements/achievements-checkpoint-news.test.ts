import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { processAchievementCheckpoint } from '@/engine/achievements/achievements-checkpoint';
import { getAchievementDef } from '@/engine/achievements/achievements-catalog';
import { getNewsItems } from '@/database/queries/news';

const SAVE_ID = TEST_SAVE_ID;

describe('processAchievementCheckpoint — news producer', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('persists one achievement news per newly-unlocked def', async () => {
    const defs = await processAchievementCheckpoint({
      db,
      saveId: SAVE_ID,
      season: 1,
      week: 4,
      snapshot: { justWon: true, goalMargin: 4, totalWins: 1 },
    });
    expect(defs.map((d) => d.id).sort()).toEqual(['big_win', 'first_win']);

    const news = await getNewsItems(db, SAVE_ID, 1);
    expect(news.filter((n) => n.category === 'achievement')).toHaveLength(2);
  });

  it('uses the def icon + the def titleKey as the news body', async () => {
    await processAchievementCheckpoint({
      db,
      saveId: SAVE_ID,
      season: 1,
      week: 1,
      snapshot: { totalWins: 1 },
    });

    const news = (await getNewsItems(db, SAVE_ID, 1)).filter((n) => n.category === 'achievement');
    expect(news).toHaveLength(1);
    const item = news[0];
    const def = getAchievementDef('first_win')!;
    expect(item.title_key).toBe('news.persist_achievement_title');
    expect(item.body_key).toBe(def.titleKey);
    expect(item.icon).toBe(def.icon);
  });

  it('does not duplicate on re-checkpoint (idempotent unlocks)', async () => {
    const snapshot = { totalWins: 1 };
    await processAchievementCheckpoint({ db, saveId: SAVE_ID, season: 1, week: 1, snapshot });
    await processAchievementCheckpoint({ db, saveId: SAVE_ID, season: 1, week: 2, snapshot });

    const news = (await getNewsItems(db, SAVE_ID, 1)).filter((n) => n.category === 'achievement');
    expect(news).toHaveLength(1);
  });

  it('writes no news when nothing is unlocked', async () => {
    await processAchievementCheckpoint({
      db,
      saveId: SAVE_ID,
      season: 1,
      week: 1,
      snapshot: { justWon: false, goalMargin: 1, totalWins: 0 },
    });
    const news = await getNewsItems(db, SAVE_ID, 1);
    expect(news.filter((n) => n.category === 'achievement')).toHaveLength(0);
  });

  it('is save-isolated — news goes only to the checkpoint save', async () => {
    await processAchievementCheckpoint({
      db,
      saveId: SAVE_ID,
      season: 1,
      week: 1,
      snapshot: { totalWins: 1 },
    });
    expect(await getNewsItems(db, 999999, 1)).toHaveLength(0);
  });
});
