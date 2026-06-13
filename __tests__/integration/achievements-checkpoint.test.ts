import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { processAchievementCheckpoint } from '@/engine/achievements/achievements-checkpoint';
import { getUnlockedAchievements } from '@/database/queries/achievements';

const SAVE_ID = TEST_SAVE_ID;

describe('processAchievementCheckpoint', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('unlocks + persists the achievements whose facts are present, returning defs', async () => {
    const newly = await processAchievementCheckpoint({
      db,
      saveId: SAVE_ID,
      season: 1,
      week: 4,
      snapshot: { justWon: true, goalMargin: 4, totalWins: 1 },
    });
    const ids = newly.map((d) => d.id).sort();
    expect(ids).toEqual(['big_win', 'first_win']);
    // Returned items are full defs (icon + i18n keys) for the toast.
    expect(newly.every((d) => d.icon.length > 0 && d.titleKey.startsWith('achievements.'))).toBe(true);

    const persisted = (await getUnlockedAchievements(db, SAVE_ID)).map((r) => r.achievementId).sort();
    expect(persisted).toEqual(['big_win', 'first_win']);
  });

  it('is idempotent across calls — re-running the same checkpoint yields no new defs', async () => {
    const snapshot = { totalWins: 1 };
    const first = await processAchievementCheckpoint({ db, saveId: SAVE_ID, season: 1, week: 1, snapshot });
    expect(first.map((d) => d.id)).toEqual(['first_win']);
    const second = await processAchievementCheckpoint({ db, saveId: SAVE_ID, season: 1, week: 2, snapshot });
    expect(second).toEqual([]);
  });

  it('returns an empty array when no achievement condition is met', async () => {
    const newly = await processAchievementCheckpoint({
      db,
      saveId: SAVE_ID,
      season: 1,
      week: 1,
      snapshot: { justWon: false, goalMargin: 1, totalWins: 0 },
    });
    expect(newly).toEqual([]);
  });
});
