import type { PersonalityArchetype } from './personality';
import {
  FALLOUT_RISK_ARCHETYPES,
  FALLOUT_STREAK_TO_UNSETTLE,
  FALLOUT_CRITICISMS_TO_WANT_OUT,
  FALLOUT_RECOVERY_MORALE,
} from '@/engine/balance';

export type FalloutState = 'none' | 'unsettled' | 'wantsOut';

export interface FalloutInput {
  current: FalloutState;
  morale: number;
  lowStreakWeeks: number;
  archetype: PersonalityArchetype;
  recentCriticisms: number;
}

/**
 * Pure: máquina de estados de conflito com histerese (escala lento, regride só com
 * moral bem acima do alvo p/ evitar flip-flop e venda forçada acidental).
 */
export function nextFalloutState(input: FalloutInput): FalloutState {
  const atRisk = FALLOUT_RISK_ARCHETYPES.includes(input.archetype);

  // Recuperação: moral alta zera o conflito a partir de qualquer estado.
  if (input.morale >= FALLOUT_RECOVERY_MORALE) return 'none';

  if (input.current === 'wantsOut') return 'wantsOut'; // pegajoso até recuperar
  if (input.current === 'unsettled') {
    return input.recentCriticisms >= FALLOUT_CRITICISMS_TO_WANT_OUT ? 'wantsOut' : 'unsettled';
  }
  // current === 'none'
  if (atRisk && input.lowStreakWeeks >= FALLOUT_STREAK_TO_UNSETTLE) return 'unsettled';
  return 'none';
}
