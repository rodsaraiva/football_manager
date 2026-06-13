import { DbHandle } from '@/database/queries/players';
import { evaluateAchievements, AchievementSnapshot } from './achievements-engine';
import { AchievementDef, getAchievementDef } from './achievements-catalog';
import { unlockAchievements } from '@/database/queries/achievements';

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
  return newlyIds
    .map((id) => getAchievementDef(id))
    .filter((d): d is AchievementDef => d != null);
}
