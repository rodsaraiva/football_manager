import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { Club } from '@/types';
import { BoardObjective } from '@/types/board';
import { BOARD_TRUST_INITIAL } from '@/engine/balance';
import { getClubById } from '@/database/queries/clubs';
import { generateObjective } from '@/engine/board/objective-generator';
import { upsertBoardObjective, getBoardObjective } from '@/database/queries/board';
import { setJobOfferStatus, expirePendingJobOffers } from '@/database/queries/job-offers';
import {
  setJobOffersPending,
  setPreseasonPending,
  getManagerReputation,
  setUnemployedSince,
} from '@/database/queries/save';
import { setManagerExitReason } from '@/database/queries/legacy';
import { OfferBand } from '@/engine/board/job-offers-engine';
import { buildManagerContract } from '@/engine/board/manager-contract-engine';
import { upsertManagerContract } from '@/database/queries/manager-contract';

export interface AcceptJobOfferParams {
  db: DbHandle;
  saveId: number;
  offeringClubId: number;
  /** Season the offer is keyed to (the season that just finished). Used for offer status. */
  offerSeason: number;
  /** The upcoming season the manager will work — the fresh objective is keyed here. */
  newSeason: number;
  rng: SeededRng;
  /** Banda da oferta — define os termos do contrato do técnico no novo clube. */
  band: OfferBand;
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
  const { db, saveId, offeringClubId, offerSeason, newSeason } = p;

  // 1. The new club + its league shape (numTeams / divisionLevel) for the objective.
  const newClub = await getClubById(db, saveId, offeringClubId);
  if (!newClub) throw new Error(`acceptJobOffer: offering club ${offeringClubId} not found in save ${saveId}`);
  const league = (await db
    .prepare('SELECT num_teams AS numTeams, division_level AS divisionLevel FROM leagues WHERE id = ?')
    .get(newClub.leagueId)) as { numTeams: number; divisionLevel: number } | undefined;

  // 2. Close the career entry for the season that ended as a resignation (season-end-eval
  // wrote it as 'stayed'/'fired'; leaving for a rival overrides that to 'resigned').
  await setManagerExitReason(db, saveId, offerSeason, 'resigned');

  // 3. Switch club + reset board trust to the initial value (new relationship).
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
    season: newSeason,
    type: objective.type,
    target: objective.target,
    description: '',
  });

  // 4. Mark the chosen offer accepted; expire any other pending offers from that window.
  await setJobOfferStatus(db, saveId, offerSeason, offeringClubId, 'accepted');
  await expirePendingJobOffers(db, saveId, offerSeason);

  // 5/6. Clear the job-offers gate; open pre-season for the new club.
  await setJobOffersPending(db, saveId, false);
  await setPreseasonPending(db, saveId, true);

  // 7. C4 — gravar o contrato do técnico para o novo clube + sair do spell de desemprego.
  const managerRep = await getManagerReputation(db, saveId);
  const terms = buildManagerContract({
    clubReputation: newClub.reputation,
    managerReputation: managerRep,
    band: p.band,
    startSeason: newSeason,
    rng: new SeededRng(newSeason * 31337 + offeringClubId),
  });
  await upsertManagerContract(db, saveId, { clubId: offeringClubId, ...terms });
  await setUnemployedSince(db, saveId, null);

  const newObjective = await getBoardObjective(db, saveId, offeringClubId, newSeason);
  if (!newObjective) throw new Error('acceptJobOffer: failed to read back the new objective');

  return { newClub, newObjective };
}
