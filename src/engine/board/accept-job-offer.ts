import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { Club } from '@/types';
import { BoardObjective } from '@/types/board';
import { BOARD_TRUST_INITIAL } from '@/engine/balance';
import { getClubById } from '@/database/queries/clubs';
import { generateObjective } from '@/engine/board/objective-generator';
import { upsertBoardObjective, getBoardObjective } from '@/database/queries/board';
import { setJobOfferStatus, expirePendingJobOffers } from '@/database/queries/job-offers';
import { setJobOffersPending, setPreseasonPending } from '@/database/queries/save';

export interface AcceptJobOfferParams {
  db: DbHandle;
  saveId: number;
  offeringClubId: number;
  season: number;
  rng: SeededRng;
}

/**
 * Accept a rival club's job offer: switch the user's club, RESET the board relationship
 * (trust back to initial, fresh season objective for the new club), but KEEP the career-wide
 * manager reputation untouched. Marks the chosen offer accepted, expires the rest, clears the
 * job-offers gate and opens the pre-season gate so the new club plays friendlies.
 *
 * Touches the DB directly (like game-loop/halftime helpers) — the pure objective generation
 * stays in objective-generator; this orchestrates the persisted state transition.
 */
export async function acceptJobOffer(p: AcceptJobOfferParams): Promise<{ newClub: Club; newObjective: BoardObjective }> {
  const { db, saveId, offeringClubId, season } = p;

  // 1. The new club + its league shape (numTeams / divisionLevel) for the objective.
  const newClub = await getClubById(db, saveId, offeringClubId);
  if (!newClub) throw new Error(`acceptJobOffer: offering club ${offeringClubId} not found in save ${saveId}`);
  const league = (await db
    .prepare('SELECT num_teams AS numTeams, division_level AS divisionLevel FROM leagues WHERE id = ?')
    .get(newClub.leagueId)) as { numTeams: number; divisionLevel: number } | undefined;

  // 2. Switch club + reset board trust to the initial value (new relationship).
  await db
    .prepare('UPDATE save_games SET player_club_id = ?, board_trust = ? WHERE id = ?')
    .run(offeringClubId, BOARD_TRUST_INITIAL, saveId);

  // 3. Fresh board objective for the new club this season (mirror NewGameScreen).
  const objective = generateObjective({
    clubReputation: newClub.reputation,
    currentLeaguePosition: null,
    totalTeams: league?.numTeams ?? 16,
    divisionLevel: league?.divisionLevel ?? 1,
    wasRelegated: false,
    wasPromoted: false,
    rng: p.rng,
  });
  await upsertBoardObjective(db, saveId, {
    clubId: offeringClubId,
    season,
    type: objective.type,
    target: objective.target,
    description: '',
  });

  // 4. Mark the chosen offer accepted; expire any other pending offers this season.
  await setJobOfferStatus(db, saveId, season, offeringClubId, 'accepted');
  await expirePendingJobOffers(db, saveId, season);

  // 5/6. Clear the job-offers gate; open pre-season for the new club.
  await setJobOffersPending(db, saveId, false);
  await setPreseasonPending(db, saveId, true);

  const newObjective = await getBoardObjective(db, saveId, offeringClubId, season);
  if (!newObjective) throw new Error('acceptJobOffer: failed to read back the new objective');

  return { newClub, newObjective };
}
