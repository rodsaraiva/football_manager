import { BoardObjectiveType } from '@/types/board';
import { TextDescriptor } from './translate';

/** Deriva o descritor de texto do objetivo a partir de type+target (engine não embute string). */
export function objectiveDescriptor(type: BoardObjectiveType, target: number | null): TextDescriptor {
  switch (type) {
    case 'no_relegation':
      return { key: 'objective.no_relegation' };
    case 'top_half':
      return { key: 'objective.top_half', vars: { target: target ?? 0 } };
    case 'league_position':
      return target === 1
        ? { key: 'objective.win_league' }
        : { key: 'objective.league_position', vars: { target: target ?? 0 } };
    case 'cup_win':
      return { key: 'objective.cup_win' };
    case 'budget_balance':
      return { key: 'objective.budget_balance' };
    case 'promotion':
      return { key: 'objective.promotion' };
  }
}
