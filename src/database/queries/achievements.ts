import { DbHandle } from './players';

export interface UnlockedAchievement {
  achievementId: string;
  season: number;
  week: number;
}

interface AchievementRow {
  achievement_id: string;
  season: number;
  week: number;
}

/** All achievements unlocked for this save, ordered by when they fired. */
export async function getUnlockedAchievements(
  db: DbHandle,
  saveId: number,
): Promise<UnlockedAchievement[]> {
  const rows = (await db
    .prepare(
      'SELECT achievement_id, season, week FROM achievements WHERE save_id = ? ORDER BY season ASC, week ASC',
    )
    .all(saveId)) as AchievementRow[];
  return rows.map((r) => ({ achievementId: r.achievement_id, season: r.season, week: r.week }));
}

/**
 * Inserts the given achievement ids for the save, stamping the current season/week.
 * Already-unlocked ids are left untouched (INSERT OR IGNORE keeps the original stamp).
 * Returns only the ids that were NEWLY unlocked — the UI uses these to toast.
 */
export async function unlockAchievements(
  db: DbHandle,
  saveId: number,
  ids: string[],
  season: number,
  week: number,
): Promise<string[]> {
  if (ids.length === 0) return [];

  const existing = new Set(
    ((await db
      .prepare('SELECT achievement_id FROM achievements WHERE save_id = ?')
      .all(saveId)) as { achievement_id: string }[]).map((r) => r.achievement_id),
  );

  const newly: string[] = [];
  for (const id of ids) {
    if (existing.has(id)) continue;
    await db
      .prepare(
        'INSERT OR IGNORE INTO achievements (save_id, achievement_id, season, week) VALUES (?, ?, ?, ?)',
      )
      .run(saveId, id, season, week);
    newly.push(id);
  }
  return newly;
}
