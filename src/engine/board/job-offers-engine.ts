import { SeededRng } from '@/engine/rng';
import { MANAGER_JOB_OFFER_STEP, MANAGER_JOB_OFFER_MAX } from '@/engine/balance';

export interface JobOfferCandidateClub {
  id: number;
  reputation: number;
  divisionLevel: number;
}

export interface GenerateJobOffersInput {
  managerReputation: number;
  currentClubId: number;
  currentClubReputation: number;
  candidates: JobOfferCandidateClub[];
  rng: SeededRng;
}

/**
 * Season-end job-offer generation. Pure; thresholds in balance.ts. A rival club offers
 * the job only when it's a GENUINE step up (reputation strictly above the current club)
 * AND plausibly interested (won't poach a manager far below its level: reputation must be
 * within managerReputation + STEP). Higher manager reputation → more/bigger clubs qualify.
 * Returns the top MANAGER_JOB_OFFER_MAX qualifying clubs by reputation desc, [] when none.
 */
export function generateJobOffers(input: GenerateJobOffersInput): { offeringClubId: number }[] {
  const { managerReputation, currentClubId, currentClubReputation, candidates } = input;
  const ceiling = managerReputation + MANAGER_JOB_OFFER_STEP;

  const qualifying = candidates.filter(
    (c) =>
      c.id !== currentClubId &&
      c.reputation > currentClubReputation &&
      c.reputation <= ceiling,
  );

  // Sort by reputation desc; id asc as a stable, deterministic tie-break.
  qualifying.sort((a, b) => (b.reputation - a.reputation) || (a.id - b.id));

  return qualifying.slice(0, MANAGER_JOB_OFFER_MAX).map((c) => ({ offeringClubId: c.id }));
}
