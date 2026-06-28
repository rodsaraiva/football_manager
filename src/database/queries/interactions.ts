import { z, ZodObject } from 'zod';
import { parseRow } from '../parse-rows';
import { DbHandle } from './players';

// Projeção com aliases (season/week vêm de last_interaction_*): não mapeia 1:1 a uma tabela.
const lastInteractionRowSchema = z
  .object({
    season: z.number().nullable(),
    week: z.number().nullable(),
  })
  .passthrough()
  .nullable();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [];

export interface InteractionStamp {
  season: number;
  week: number;
}

/**
 * Last individual interaction (praise/criticize) recorded for a player, or null if none.
 * Player ids are globally unique (offset per save) but we keep save_id in the WHERE for
 * the save-isolation convention.
 */
export async function getLastInteraction(
  db: DbHandle,
  saveId: number,
  playerId: number,
): Promise<InteractionStamp | null> {
  const raw = await db
    .prepare(
      'SELECT last_interaction_season AS season, last_interaction_week AS week FROM players WHERE save_id = ? AND id = ?',
    )
    .get(saveId, playerId);
  const row = parseRow(lastInteractionRowSchema, raw, 'interactions.getLastInteraction');
  if (!row || row.season == null || row.week == null) return null;
  return { season: row.season, week: row.week };
}

/** True if the player already received an individual interaction this exact season+week. */
export async function hasInteractedThisWeek(
  db: DbHandle,
  saveId: number,
  playerId: number,
  season: number,
  week: number,
): Promise<boolean> {
  const last = await getLastInteraction(db, saveId, playerId);
  return last != null && last.season === season && last.week === week;
}

/** Stamps the player's last interaction at the given season+week (anti-spam cooldown). */
export async function recordInteraction(
  db: DbHandle,
  saveId: number,
  playerId: number,
  season: number,
  week: number,
): Promise<void> {
  await db
    .prepare('UPDATE players SET last_interaction_season = ?, last_interaction_week = ? WHERE save_id = ? AND id = ?')
    .run(season, week, saveId, playerId);
}
