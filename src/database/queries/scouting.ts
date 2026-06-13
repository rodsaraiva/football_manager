import { DbHandle } from './players';

interface ScoutingRow {
  player_id: number;
  knowledge: number;
  scout_id: number | null;
}

export interface ScoutingRowDto {
  playerId: number;
  knowledge: number;
  scoutId: number | null;
}

/** Knowledge 0–100 the user's club has of a player, or 0 if never scouted. */
export async function getPlayerKnowledge(
  db: DbHandle,
  saveId: number,
  playerId: number,
): Promise<number> {
  const row = (await db
    .prepare('SELECT knowledge FROM scouting WHERE save_id = ? AND player_id = ?')
    .get(saveId, playerId)) as { knowledge: number } | undefined;
  return row?.knowledge ?? 0;
}

export async function getScoutingRows(db: DbHandle, saveId: number): Promise<ScoutingRowDto[]> {
  const rows = (await db
    .prepare('SELECT player_id, knowledge, scout_id FROM scouting WHERE save_id = ?')
    .all(saveId)) as ScoutingRow[];
  return rows.map((r) => ({ playerId: r.player_id, knowledge: r.knowledge, scoutId: r.scout_id }));
}

/**
 * Assigns a scout to a target. Upserts the target row (knowledge 0 if new) and
 * sets scout_id. A scout watches one player at a time, so any other row that
 * still holds this scout is freed first.
 */
export async function assignScout(
  db: DbHandle,
  saveId: number,
  playerId: number,
  scoutId: number,
): Promise<void> {
  await db
    .prepare('UPDATE scouting SET scout_id = NULL WHERE save_id = ? AND scout_id = ? AND player_id != ?')
    .run(saveId, scoutId, playerId);
  await db
    .prepare(
      `INSERT INTO scouting (save_id, player_id, knowledge, scout_id)
         VALUES (?, ?, 0, ?)
       ON CONFLICT(save_id, player_id) DO UPDATE SET scout_id = excluded.scout_id`,
    )
    .run(saveId, playerId, scoutId);
}

export async function unassignScout(db: DbHandle, saveId: number, playerId: number): Promise<void> {
  await db
    .prepare('UPDATE scouting SET scout_id = NULL WHERE save_id = ? AND player_id = ?')
    .run(saveId, playerId);
}

/**
 * Upserts knowledge for a player. Reaching 100 frees the scout (the report is
 * complete, so the scout returns to the idle pool).
 */
export async function setKnowledge(
  db: DbHandle,
  saveId: number,
  playerId: number,
  knowledge: number,
): Promise<void> {
  const scoutId = knowledge >= 100 ? null : undefined;
  await db
    .prepare(
      `INSERT INTO scouting (save_id, player_id, knowledge, scout_id)
         VALUES (?, ?, ?, NULL)
       ON CONFLICT(save_id, player_id) DO UPDATE SET
         knowledge = excluded.knowledge${scoutId === null ? ', scout_id = NULL' : ''}`,
    )
    .run(saveId, playerId, knowledge);
}

/** Targets with a scout actively assigned and not yet fully known. */
export async function getActiveAssignments(
  db: DbHandle,
  saveId: number,
): Promise<{ playerId: number; scoutId: number }[]> {
  const rows = (await db
    .prepare(
      'SELECT player_id, scout_id FROM scouting WHERE save_id = ? AND scout_id IS NOT NULL AND knowledge < 100',
    )
    .all(saveId)) as { player_id: number; scout_id: number }[];
  return rows.map((r) => ({ playerId: r.player_id, scoutId: r.scout_id }));
}
