import { DbHandle } from '@/database/queries/players';
import { evaluateAchievements, AchievementSnapshot } from './achievements-engine';
import { AchievementDef, getAchievementDef } from './achievements-catalog';
import { unlockAchievements } from '@/database/queries/achievements';
import { insertNewsItem } from '@/database/queries/news';

export interface AchievementCheckpointParams {
  db: DbHandle;
  saveId: number;
  season: number;
  week: number;
  /** The facts known at this checkpoint (post-match / season-end / club-change). */
  snapshot: AchievementSnapshot;
}

/**
 * Orchestrates one achievement checkpoint: evaluate the snapshot against the catalog,
 * persist the unlocks (idempotent), and return the NEWLY-unlocked defs so the UI can toast.
 *
 * Touches the DB directly (like accept-job-offer / halftime helpers); the pure decision
 * lives in evaluateAchievements, this just wires evaluate → persist → resolve defs.
 */
export async function processAchievementCheckpoint(
  p: AchievementCheckpointParams,
): Promise<AchievementDef[]> {
  const candidateIds = evaluateAchievements(p.snapshot);
  if (candidateIds.length === 0) return [];

  const newlyIds = await unlockAchievements(p.db, p.saveId, candidateIds, p.season, p.week);
  const defs = newlyIds
    .map((id) => getAchievementDef(id))
    .filter((d): d is AchievementDef => d != null);

  // News producer: one persisted headline per newly-unlocked achievement.
  // unlockAchievements only returns the NEW ids, so re-checkpoints don't duplicate.
  for (const def of defs) {
    await insertNewsItem(p.db, p.saveId, {
      season: p.season,
      week: p.week,
      category: 'achievement',
      icon: def.icon,
      priority: 96,
      titleKey: 'news.persist_achievement_title',
      bodyKey: def.titleKey,
    });
  }

  return defs;
}
