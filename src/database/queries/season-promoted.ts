import { z, ZodObject } from 'zod';
import { parseRow } from '../parse-rows';
import { DbHandle } from './players';

const promotedForClubRowSchema = z
  .object({
    league_id: z.number(),
    final_position: z.number(),
  })
  .passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'season_promoted', schema: promotedForClubRowSchema },
];

export async function insertPromotedIgnore(
  db: DbHandle,
  saveId: number,
  season: number,
  leagueId: number,
  clubId: number,
  finalPosition: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_promoted
         (save_id, season, league_id, club_id, final_position)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(saveId, season, leagueId, clubId, finalPosition);
}

export async function getPromotedForClub(
  db: DbHandle,
  saveId: number,
  season: number,
  clubId: number,
): Promise<{ leagueId: number; finalPosition: number } | null> {
  const raw = await db
    .prepare(
      'SELECT league_id, final_position FROM season_promoted WHERE save_id = ? AND season = ? AND club_id = ? LIMIT 1',
    )
    .get(saveId, season, clubId);
  const row = parseRow(promotedForClubRowSchema.nullable(), raw, 'season-promoted.getPromotedForClub');
  return row ? { leagueId: row.league_id, finalPosition: row.final_position } : null;
}
