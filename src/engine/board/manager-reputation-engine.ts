import {
  MANAGER_REP_LEAGUE_TITLE_BONUS,
  MANAGER_REP_CUP_BONUS,
  MANAGER_REP_PROMOTION_BONUS,
  MANAGER_REP_TOP_THIRD_BONUS,
  MANAGER_REP_RELEGATION_PENALTY,
  MANAGER_REP_OBJECTIVE_FAILED_PENALTY,
  MANAGER_REP_UNEMPLOYED_DECAY,
  MANAGER_REP_FLOOR,
  MANAGER_REP_NATIONAL_WIN,
  MANAGER_REP_NATIONAL_LOSS,
  MANAGER_REP_NATIONAL_TITLE_BONUS,
} from '@/engine/balance';

export interface ManagerRepInput {
  current: number;
  leaguePosition: number | null;
  totalTeams: number;
  wonLeague: boolean;
  wonCup: boolean;
  wasPromoted: boolean;
  wasRelegated: boolean;
  objectiveMet: boolean;
}

/**
 * Career-wide MANAGER reputation accrual at season-end. Pure; deltas live in balance.ts.
 * Mirrors the magnitude discipline of computeReputationDelta (modest contributions).
 * Distinct from a club's reputation: this value follows the manager across club switches.
 */
export function computeManagerReputationDelta(input: ManagerRepInput): { next: number; delta: number } {
  const { current, leaguePosition, totalTeams, wonLeague, wonCup, wasPromoted, wasRelegated, objectiveMet } = input;

  const titleBonus = wonLeague ? MANAGER_REP_LEAGUE_TITLE_BONUS : 0;
  const cupBonus = wonCup ? MANAGER_REP_CUP_BONUS : 0;
  const promotionBonus = wasPromoted ? MANAGER_REP_PROMOTION_BONUS : 0;

  // Top-third league finish (only when not already counted via title, to keep it modest).
  const topThird = Math.max(1, Math.round(totalTeams / 3));
  const topThirdBonus =
    leaguePosition != null && !wonLeague && leaguePosition <= topThird ? MANAGER_REP_TOP_THIRD_BONUS : 0;

  const relegationPenalty = wasRelegated ? MANAGER_REP_RELEGATION_PENALTY : 0;
  const objectivePenalty = objectiveMet ? 0 : MANAGER_REP_OBJECTIVE_FAILED_PENALTY;

  const total = titleBonus + cupBonus + promotionBonus + topThirdBonus + relegationPenalty + objectivePenalty;

  const next = Math.min(100, Math.max(1, current + total));
  return { next, delta: next - current };
}

export interface NationalRepInput {
  current: number;
  /** Resultado de UMA partida internacional da seleção dirigida (omitir = sem jogo). */
  outcome?: 'win' | 'draw' | 'loss' | null;
  /** Conquista do torneio internacional pela seleção do usuário. */
  wonTitle?: boolean;
}

/**
 * L1-D: prestígio do técnico por resultado internacional da seleção DIRIGIDA. Análogo a
 * computeManagerReputationDelta, mesma disciplina de magnitude e mesmo clamp [1,100]. Puro,
 * sem RNG — só a seleção do usuário chega aqui (rivais não movem a reputação). Aplicado por
 * jogo (outcome) e uma vez por título (wonTitle).
 */
export function computeNationalReputationDelta(input: NationalRepInput): { next: number; delta: number } {
  const matchDelta =
    input.outcome === 'win'
      ? MANAGER_REP_NATIONAL_WIN
      : input.outcome === 'loss'
        ? MANAGER_REP_NATIONAL_LOSS
        : 0;
  const titleBonus = input.wonTitle ? MANAGER_REP_NATIONAL_TITLE_BONUS : 0;
  const next = Math.min(100, Math.max(1, input.current + matchDelta + titleBonus));
  return { next, delta: next - input.current };
}

/**
 * Decaimento de reputação por temporada de desemprego (técnico esquecido pelo mercado).
 * Clampa no piso MANAGER_REP_FLOOR. Puro.
 */
export function applyUnemploymentDecay(current: number): { next: number; delta: number } {
  const next = Math.max(MANAGER_REP_FLOOR, current + MANAGER_REP_UNEMPLOYED_DECAY);
  return { next, delta: next - current };
}
