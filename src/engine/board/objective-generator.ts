import { SeededRng } from '@/engine/rng';
import { BoardObjectiveType } from '@/types/board';

export interface ObjectiveGeneratorInput {
  clubReputation: number;
  currentLeaguePosition: number | null;
  totalTeams: number;
  divisionLevel: number;
  wasRelegated: boolean;
  wasPromoted: boolean;
  rng: SeededRng;
}

export interface GeneratedObjective {
  type: BoardObjectiveType;
  target: number | null;
  description: string;
}

type Template = { type: BoardObjectiveType; target: number | null; description: string };

function pick<T>(rng: SeededRng, arr: T[]): T {
  return arr[rng.nextInt(0, arr.length - 1)];
}

export function generateObjective(input: ObjectiveGeneratorInput): GeneratedObjective {
  const { clubReputation, totalTeams, rng } = input;
  const topHalf = Math.ceil(totalTeams / 2);

  const templates = (() => {
    if (clubReputation <= 30) {
      return [
        { type: 'no_relegation' as BoardObjectiveType, target: null, description: 'Avoid relegation this season' },
        { type: 'top_half' as BoardObjectiveType, target: topHalf, description: `Finish in the top half (top ${topHalf})` },
      ] satisfies Template[];
    }
    if (clubReputation <= 55) {
      return [
        { type: 'top_half' as BoardObjectiveType, target: topHalf, description: `Finish in the top half (top ${topHalf})` },
        { type: 'league_position' as BoardObjectiveType, target: Math.max(1, topHalf - 2), description: `Finish in the top ${Math.max(1, topHalf - 2)}` },
        { type: 'cup_win' as BoardObjectiveType, target: null, description: 'Win a cup competition this season' },
        { type: 'budget_balance' as BoardObjectiveType, target: null, description: 'Keep the club finances in the black' },
      ] satisfies Template[];
    }
    if (clubReputation <= 70) {
      return [
        { type: 'league_position' as BoardObjectiveType, target: Math.max(1, Math.round(totalTeams * 0.3)), description: `Finish in the top ${Math.round(totalTeams * 0.3)}` },
        { type: 'cup_win' as BoardObjectiveType, target: null, description: 'Win a cup competition this season' },
        { type: 'league_position' as BoardObjectiveType, target: 3, description: 'Finish in the top 3' },
      ] satisfies Template[];
    }
    if (clubReputation <= 85) {
      return [
        { type: 'league_position' as BoardObjectiveType, target: 3, description: 'Finish in the top 3' },
        { type: 'league_position' as BoardObjectiveType, target: 1, description: 'Win the league championship' },
        { type: 'cup_win' as BoardObjectiveType, target: null, description: 'Win a cup competition this season' },
      ] satisfies Template[];
    }
    // 86-100 elite
    return [
      { type: 'league_position' as BoardObjectiveType, target: 1, description: 'Win the league championship' },
      { type: 'cup_win' as BoardObjectiveType, target: null, description: 'Win a major cup competition' },
    ] satisfies Template[];
  })();

  return pick(rng, templates);
}
