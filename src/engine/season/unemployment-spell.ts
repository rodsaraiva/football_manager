import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getAllLeagues } from '@/database/queries/leagues';
import { getAllClubs } from '@/database/queries/clubs';
import { insertJobOffer } from '@/database/queries/job-offers';
import {
  getManagerReputation, setManagerReputation,
  getManagerSavings, setManagerSavings,
  setJobOffersPending,
} from '@/database/queries/save';
import { applyUnemploymentDecay } from '@/engine/board/manager-reputation-engine';
import { generateManagerOffers, ManagerOfferCandidate } from '@/engine/board/job-offers-engine';
import { computeClubAmbition } from '@/engine/board/club-ambition';
import { MANAGER_UNEMPLOYED_DRAIN, MANAGER_SAVINGS_FLOOR, MANAGER_REP_FLOOR } from '@/engine/balance';

export interface AdvanceUnemploymentParams {
  saveId: number;
  season: number; // a temporada (nova) à qual o lote de ofertas é chaveado
  rng: SeededRng;
}

export interface AdvanceUnemploymentResult {
  reputationAfter: number;
  savingsAfter: number;
  generatedOfferClubIds: number[];
  terminal: boolean; // reputação/poupança no piso → carreira encerra
}

/**
 * Uma "rodada de mercado" do técnico desempregado: aplica decaimento de reputação e dreno
 * de poupança, gera um novo lote de ofertas-resgate (banda 'rescue', sem clube atual) e
 * decide se a carreira atingiu o piso terminal. Idempotente por (saveId, season): o
 * UNIQUE(save_id, season, offering_club_id) de job_offers impede duplicação ao reexecutar.
 * Toca o DB diretamente, como os demais orquestradores de season/*.
 */
export async function advanceUnemploymentSeason(
  db: DbHandle,
  p: AdvanceUnemploymentParams,
): Promise<AdvanceUnemploymentResult> {
  const { saveId, season, rng } = p;

  // 1. Decaimento de reputação (clampa em MANAGER_REP_FLOOR).
  const repBefore = await getManagerReputation(db, saveId);
  const { next: reputationAfter } = applyUnemploymentDecay(repBefore);
  await setManagerReputation(db, saveId, reputationAfter);

  // 2. Dreno de poupança.
  const savingsBefore = await getManagerSavings(db, saveId);
  const savingsAfter = savingsBefore - MANAGER_UNEMPLOYED_DRAIN;
  await setManagerSavings(db, saveId, savingsAfter);

  // 3. Piso terminal: poupança esgotada OU reputação no chão.
  const terminal = savingsAfter <= MANAGER_SAVINGS_FLOOR || reputationAfter <= MANAGER_REP_FLOOR;

  // 4. Novo lote de ofertas-resgate (sem clube atual; reputação decaída → bandas menores).
  const generatedOfferClubIds: number[] = [];
  if (!terminal) {
    const leagues = await getAllLeagues(db);
    const divByLeague = new Map(leagues.map((l) => [l.id, l.divisionLevel]));
    const allClubs = await getAllClubs(db, saveId);
    const candidates: ManagerOfferCandidate[] = allClubs.map((c) => {
      const divisionLevel = divByLeague.get(c.leagueId) ?? 1;
      return {
        id: c.id,
        reputation: c.reputation,
        divisionLevel,
        ambition: computeClubAmbition({ reputation: c.reputation, divisionLevel }),
      };
    });
    const offers = generateManagerOffers({
      managerReputation: reputationAfter,
      currentClubId: null,
      currentClubReputation: reputationAfter,
      candidates,
      bands: ['rescue'],
      rng,
    });
    for (const o of offers) {
      await insertJobOffer(db, saveId, season, o.offeringClubId);
      generatedOfferClubIds.push(o.offeringClubId);
    }
    if (offers.length > 0) await setJobOffersPending(db, saveId, true);
  }

  return { reputationAfter, savingsAfter, generatedOfferClubIds, terminal };
}
