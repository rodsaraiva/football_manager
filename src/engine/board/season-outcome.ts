import { TrustConsequence } from '@/types/board';

/** True when the season-end trust consequence ends the manager's tenure (game over). */
export function isManagerDismissed(consequence: TrustConsequence): boolean {
  return consequence === 'fired';
}
