import { z, ZodObject } from 'zod';
import { parseRow } from '../parse-rows';
import { DbHandle } from './players';
import { SetPieceTakers, CornerRoutine } from '@/engine/simulation/match-engine';

// Só os campos consumidos por getSetPieceTakers; .passthrough() deixa save_id/club_id passarem.
// Ids são INTEGER sem NOT NULL (.nullable()); corner_routine é TEXT NOT NULL DEFAULT 'auto'.
const setPieceTakerRowSchema = z
  .object({
    penalty_taker_id: z.number().nullable(),
    free_kick_taker_id: z.number().nullable(),
    corner_taker_id: z.number().nullable(),
    corner_routine: z.string(),
  })
  .passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'set_piece_takers', schema: setPieceTakerRowSchema },
];

/**
 * Reads a club's designated set-piece takers. Returns null when no row exists
 * (the engine then auto-picks by attribute for every set piece). Save-isolated:
 * save_id is the leading WHERE term.
 */
export async function getSetPieceTakers(
  db: DbHandle,
  saveId: number,
  clubId: number,
): Promise<SetPieceTakers | null> {
  const rawRow = await db
    .prepare(
      'SELECT penalty_taker_id, free_kick_taker_id, corner_taker_id, corner_routine FROM set_piece_takers WHERE save_id = ? AND club_id = ?',
    )
    .get(saveId, clubId);
  if (!rawRow) return null;
  const row = parseRow(setPieceTakerRowSchema, rawRow, 'set-piece-takers.getSetPieceTakers');
  return {
    penaltyTakerId: row.penalty_taker_id,
    freeKickTakerId: row.free_kick_taker_id,
    cornerTakerId: row.corner_taker_id,
    cornerRoutine: (row.corner_routine as CornerRoutine | null) ?? 'auto',
  };
}

/**
 * Upserts a club's set-piece takers. A null id clears that taker (auto-pick).
 * INSERT OR REPLACE keeps a single row per (save_id, club_id).
 */
export async function setSetPieceTakers(
  db: DbHandle,
  saveId: number,
  clubId: number,
  takers: SetPieceTakers,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO set_piece_takers
         (save_id, club_id, penalty_taker_id, free_kick_taker_id, corner_taker_id, corner_routine)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      saveId,
      clubId,
      takers.penaltyTakerId ?? null,
      takers.freeKickTakerId ?? null,
      takers.cornerTakerId ?? null,
      takers.cornerRoutine ?? 'auto',
    );
}
