import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getUnlockedAchievements,
  unlockAchievements,
} from '@/database/queries/achievements';
import { isOnboardingSeen, setOnboardingSeen } from '@/database/queries/save';

const SAVE_ID = TEST_SAVE_ID;

describe('achievements queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('starts with no unlocked achievements', async () => {
    expect(await getUnlockedAchievements(db, SAVE_ID)).toEqual([]);
  });

  it('unlockAchievements inserts ids and returns the newly-unlocked ones', async () => {
    const newly = await unlockAchievements(db, SAVE_ID, ['first_win', 'big_win'], 1, 5);
    expect(newly.sort()).toEqual(['big_win', 'first_win']);

    const rows = await getUnlockedAchievements(db, SAVE_ID);
    expect(rows.map((r) => r.achievementId).sort()).toEqual(['big_win', 'first_win']);
    const firstWin = rows.find((r) => r.achievementId === 'first_win')!;
    expect(firstWin.season).toBe(1);
    expect(firstWin.week).toBe(5);
  });

  it('unlocking is idempotent and returns only the NEW ids', async () => {
    await unlockAchievements(db, SAVE_ID, ['first_win'], 1, 3);
    // Re-pass first_win plus a new one: only the new one comes back.
    const newly = await unlockAchievements(db, SAVE_ID, ['first_win', 'wins_10'], 2, 1);
    expect(newly).toEqual(['wins_10']);

    const rows = await getUnlockedAchievements(db, SAVE_ID);
    expect(rows).toHaveLength(2);
    // The original first_win keeps its ORIGINAL season/week (INSERT OR IGNORE, not replace).
    const firstWin = rows.find((r) => r.achievementId === 'first_win')!;
    expect(firstWin.season).toBe(1);
    expect(firstWin.week).toBe(3);
  });

  it('passing an empty id list unlocks nothing', async () => {
    expect(await unlockAchievements(db, SAVE_ID, [], 1, 1)).toEqual([]);
    expect(await getUnlockedAchievements(db, SAVE_ID)).toEqual([]);
  });

  it('achievements are isolated per save', async () => {
    // A second save with its own row.
    rawDb.prepare(
      "INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, created_at, updated_at) VALUES (2, 'S2', 1, 1, 1, 'normal', '', '')",
    ).run();
    await unlockAchievements(db, SAVE_ID, ['first_win'], 1, 1);
    await unlockAchievements(db, 2, ['league_title'], 1, 1);

    expect((await getUnlockedAchievements(db, SAVE_ID)).map((r) => r.achievementId)).toEqual(['first_win']);
    expect((await getUnlockedAchievements(db, 2)).map((r) => r.achievementId)).toEqual(['league_title']);
  });

  it('onboarding gate defaults to not-seen and round-trips', async () => {
    expect(await isOnboardingSeen(db, SAVE_ID)).toBe(false);
    await setOnboardingSeen(db, SAVE_ID, true);
    expect(await isOnboardingSeen(db, SAVE_ID)).toBe(true);
    await setOnboardingSeen(db, SAVE_ID, false);
    expect(await isOnboardingSeen(db, SAVE_ID)).toBe(false);
  });
});
