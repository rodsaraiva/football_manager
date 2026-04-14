import { DbHandle } from '@/database/queries/players';

/**
 * Returns loaned players to their parent club when the loan has reached its
 * end season. Called at end-of-season.
 *
 * A loan is tracked by:
 *   - transfers table: type='loan', loan_end = season, from_club_id = parent
 *   - players.club_id = current (loan) club
 *
 * When loan_end <= season being finalized, the player is moved back to the
 * parent club and the loan record is effectively closed.
 *
 * Returns the number of players returned.
 */
export async function returnExpiredLoans(
  db: DbHandle,
  season: number,
): Promise<number> {
  // Find loans whose loan_end has been reached and the player hasn't been
  // sold off to yet another club (we trust player.club_id = to_club_id still).
  const loans = (await db
    .prepare(
      `SELECT t.id, t.player_id, t.from_club_id, t.to_club_id, t.loan_end, t.wage_offered
       FROM transfers t
       WHERE t.type = 'loan'
         AND t.loan_end IS NOT NULL
         AND t.loan_end <= ?`,
    )
    .all(season)) as Array<{
    id: number;
    player_id: number;
    from_club_id: number | null;
    to_club_id: number | null;
    loan_end: number;
    wage_offered: number;
  }>;

  let returned = 0;
  for (const loan of loans) {
    if (loan.from_club_id === null || loan.to_club_id === null) continue;

    // Only return if the player is still at the borrowing club
    const player = (await db
      .prepare('SELECT club_id FROM players WHERE id = ?')
      .get(loan.player_id)) as { club_id: number | null } | undefined;
    if (!player || player.club_id !== loan.to_club_id) continue;

    // Move back to parent club. We don't touch wage here (parent decides).
    await db
      .prepare('UPDATE players SET club_id = ? WHERE id = ?')
      .run(loan.from_club_id, loan.player_id);

    // Neutralize the loan record so it isn't returned again
    await db
      .prepare('UPDATE transfers SET loan_end = NULL WHERE id = ?')
      .run(loan.id);

    returned++;
  }

  return returned;
}
