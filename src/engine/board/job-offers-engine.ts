import { SeededRng } from '@/engine/rng';
import { MANAGER_JOB_OFFER_STEP, MANAGER_JOB_OFFER_MAX, MANAGER_OFFER_AMBITION_WEIGHT } from '@/engine/balance';

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

export interface GenerateRescueOffersInput {
  managerReputation: number;
  currentClubId: number;
  currentClubReputation: number;
  candidates: JobOfferCandidateClub[];
}

/**
 * Rescue offers for a just-dismissed manager. Mirrors generateJobOffers but inverts the band:
 * a SMALLER club (reputation strictly below the current one) offers a fresh start, still capped
 * at managerReputation + STEP so the offers stay plausible. Excludes the current club. Returns
 * the top MANAGER_JOB_OFFER_MAX qualifying clubs by reputation desc (id asc tie-break), [] when none.
 */
export function generateRescueOffers(input: GenerateRescueOffersInput): { offeringClubId: number }[] {
  const { managerReputation, currentClubId, currentClubReputation, candidates } = input;
  const ceiling = managerReputation + MANAGER_JOB_OFFER_STEP;

  const qualifying = candidates.filter(
    (c) =>
      c.id !== currentClubId &&
      c.reputation < currentClubReputation &&
      c.reputation <= ceiling,
  );

  qualifying.sort((a, b) => (b.reputation - a.reputation) || (a.id - b.id));

  return qualifying.slice(0, MANAGER_JOB_OFFER_MAX).map((c) => ({ offeringClubId: c.id }));
}

export type OfferBand = 'step_up' | 'lateral' | 'rescue';

export interface ManagerOfferCandidate extends JobOfferCandidateClub {
  ambition: number; // 0..1 (computeClubAmbition)
}

export interface GenerateManagerOffersInput {
  managerReputation: number;
  currentClubId: number | null;  // null quando desempregado
  currentClubReputation: number; // referência; usar managerReputation quando sem clube
  candidates: ManagerOfferCandidate[];
  bands: OfferBand[];
  rng: SeededRng;
}

export interface ManagerOffer {
  offeringClubId: number;
  band: OfferBand;
}

function inBand(c: ManagerOfferCandidate, band: OfferBand, currentRep: number, currentClubId: number | null): boolean {
  if (currentClubId == null) return band === 'rescue' ? true : c.reputation >= currentRep;
  if (c.id === currentClubId) return false;
  if (band === 'step_up') return c.reputation > currentRep;
  if (band === 'rescue') return c.reputation < currentRep;
  return c.reputation === currentRep; // lateral
}

/**
 * Mercado pleno: filtra por banda + ceiling (managerReputation + STEP), pondera cada candidato
 * por (proximidade de banda × ambição) e SORTEIA até MANAGER_JOB_OFFER_MAX via rng — sem repor
 * (weighted sampling without replacement). Determinístico para o mesmo seed. [] quando ninguém
 * qualifica. Cada oferta carrega a banda para acceptJobOffer derivar o contrato.
 */
export function generateManagerOffers(input: GenerateManagerOffersInput): ManagerOffer[] {
  const { managerReputation, currentClubId, currentClubReputation, candidates, bands, rng } = input;
  const ceiling = managerReputation + MANAGER_JOB_OFFER_STEP;

  type Weighted = { offeringClubId: number; band: OfferBand; weight: number };
  const pool: Weighted[] = [];
  for (const c of candidates) {
    if (c.reputation > ceiling) continue;
    for (const band of bands) {
      if (!inBand(c, band, currentClubReputation, currentClubId)) continue;
      // proximidade: quanto mais perto do ceiling, mais "quente"; em [0,1].
      const proximity = Math.max(0, Math.min(1, c.reputation / Math.max(1, ceiling)));
      const ambition = Math.max(0, Math.min(1, c.ambition));
      const weight =
        (1 - MANAGER_OFFER_AMBITION_WEIGHT) * proximity + MANAGER_OFFER_AMBITION_WEIGHT * ambition;
      pool.push({ offeringClubId: c.id, band, weight: Math.max(0.0001, weight) });
      break; // um candidato qualifica em no máximo uma banda (bandas são mutuamente exclusivas)
    }
  }

  const result: ManagerOffer[] = [];
  const remaining = [...pool];
  while (result.length < MANAGER_JOB_OFFER_MAX && remaining.length > 0) {
    const totalWeight = remaining.reduce((s, w) => s + w.weight, 0);
    let pick = rng.next() * totalWeight;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      pick -= remaining[idx].weight;
      if (pick <= 0) break;
    }
    if (idx >= remaining.length) idx = remaining.length - 1;
    const chosen = remaining.splice(idx, 1)[0];
    result.push({ offeringClubId: chosen.offeringClubId, band: chosen.band });
  }
  return result;
}
