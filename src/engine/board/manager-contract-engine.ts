import { SeededRng } from '@/engine/rng';
import { OfferBand } from '@/engine/board/job-offers-engine';
import { MANAGER_CONTRACT_MIN_SEASONS, MANAGER_CONTRACT_MAX_SEASONS } from '@/engine/balance';

export interface ManagerContractInput {
  clubReputation: number;
  managerReputation: number;
  band: OfferBand;
  startSeason: number;
  rng: SeededRng;
}

export interface ManagerContractTerms {
  startSeason: number;
  endSeason: number;     // startSeason + duração (MIN..MAX)
  wagePerSeason: number; // derivado da reputação do clube
  releaseClause: number; // severance pago ao técnico se demitido
  expectation: number;   // alvo macro (reputação a manter)
}

/**
 * Constrói os termos de um contrato de técnico a partir da banda da oferta + reputações.
 * Step-up dá contrato mais longo (clube acredita), rescue mais curto (prova-se primeiro).
 * Puro: toda aleatoriedade vem do rng recebido. Sem Math.random/Date.now.
 */
export function buildManagerContract(input: ManagerContractInput): ManagerContractTerms {
  const { clubReputation, band, startSeason, rng } = input;

  const span = MANAGER_CONTRACT_MAX_SEASONS - MANAGER_CONTRACT_MIN_SEASONS; // 2
  const bandBias = band === 'step_up' ? span : band === 'lateral' ? Math.round(span / 2) : 0;
  const jitter = rng.nextInt(0, span - bandBias < 0 ? 0 : span - bandBias);
  const duration = MANAGER_CONTRACT_MIN_SEASONS + Math.min(span, bandBias + jitter);
  const endSeason = startSeason + duration;

  const wagePerSeason = Math.round((1000 + clubReputation * 120) / 50) * 50;
  const releaseClause = Math.round(wagePerSeason * 0.5);
  const expectation = Math.min(100, Math.max(1, Math.round(clubReputation * 0.9)));

  return { startSeason, endSeason, wagePerSeason, releaseClause, expectation };
}

/** Contrato vence quando a temporada corrente já alcançou (ou passou) o fim do mandato. */
export function isContractExpiring(endSeason: number, currentSeason: number): boolean {
  return currentSeason >= endSeason;
}
