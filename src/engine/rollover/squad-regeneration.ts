import { SeededRng } from '@/engine/rng';
import { recalculatePotential } from '@/engine/training/potential';
import { calculateMarketValue } from '@/engine/transfer/market-value';

export interface AiPlayerProgressInput {
  playerId: number;
  age: number;                 // idade ANTES da virada
  currentOverall: number;      // média real dos atributos
  basePotential: number;
  effectivePotential: number;
  contractYearsLeft: number;
  seasonAvgRating: number | null;
  minutesPercent: number;      // 0-100
}

export interface AiPlayerProgressDelta {
  playerId: number;
  newEffectivePotential: number;
  newMarketValue: number;
}

/**
 * Per-player season regeneration for AI squads: recomputes effective potential
 * from the REAL season rating (or freezes when minutes were insufficient) and
 * re-prices market value from the real overall + advanced age. Keeps AI league
 * quality from collapsing. Pure.
 */
export function regenerateAiSquadSeason(args: {
  players: AiPlayerProgressInput[];
  rng: SeededRng;
}): AiPlayerProgressDelta[] {
  const { players } = args;
  void args.rng; // reservado para variância futura; consumo estável evita regressões
  return players.map((p) => {
    const seasonRatings =
      p.seasonAvgRating == null
        ? []
        : [{ avgRating: p.seasonAvgRating, minutesPercent: p.minutesPercent }];

    const { newEffectivePotential } = recalculatePotential({
      basePotential: p.basePotential,
      effectivePotential: p.effectivePotential,
      currentOverall: p.currentOverall,
      seasonRatings,
    });

    const newMarketValue = calculateMarketValue({
      overall: p.currentOverall,
      effectivePotential: newEffectivePotential,
      age: p.age + 1, // virada avança a idade
      contractYearsLeft: p.contractYearsLeft,
    });

    return { playerId: p.playerId, newEffectivePotential, newMarketValue };
  });
}
