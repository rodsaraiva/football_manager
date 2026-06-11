import { DbHandle } from './players';

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
  const row = (await db
    .prepare(
      'SELECT league_id, final_position FROM season_promoted WHERE save_id = ? AND season = ? AND club_id = ? LIMIT 1',
    )
    .get(saveId, season, clubId)) as { league_id: number; final_position: number } | undefined;
  return row ? { leagueId: row.league_id, finalPosition: row.final_position } : null;
}
