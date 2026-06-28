export interface CongestionInput {
  gamesInWindow: number;
  baseFitnessDrop: number;
}

export interface CongestionResult {
  fitnessDrop: number;
  injuryRiskMult: number;
}

/** Jogos "de graça" antes do pile-up começar a pesar. */
const FREE_GAMES = 1;
/** Ganho de drop por jogo extra na janela (10% por jogo acima do baseline). */
const DROP_PER_EXTRA = 0.1;
/** Ganho de risco de lesão por jogo extra (15% por jogo). */
const RISK_PER_EXTRA = 0.15;

/**
 * Pure: escala o swing de fitness e o risco de lesão pelo nº de jogos recentes.
 * gamesInWindow <= 1 → sem efeito (caminho legado byte-for-byte). Sem RNG.
 */
export function computeCongestion(input: CongestionInput): CongestionResult {
  const extra = Math.max(0, input.gamesInWindow - FREE_GAMES);
  const fitnessDrop = Math.round(input.baseFitnessDrop * (1 + extra * DROP_PER_EXTRA));
  const injuryRiskMult = 1 + extra * RISK_PER_EXTRA;
  return { fitnessDrop, injuryRiskMult };
}
