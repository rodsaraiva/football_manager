export type InteractionReaction = 'positive' | 'neutral' | 'negative';

export interface InteractionInput {
  recentAvgRating: number; // 0 if no recent games
  currentMorale: number;   // 1..100
}

export interface InteractionResult {
  delta: number;
  reaction: InteractionReaction;
}

const GOOD_FORM = 7.0;   // appearance-weighted season rating that counts as "in form"
const HIGH_MORALE = 80;  // already flying — praise lands softer, hard to push further
const OK_MORALE = 40;    // floor above which criticism can act as a wake-up, not a blow

/**
 * Pure: a private word of praise. Context drives both the morale delta and the
 * reaction the UI surfaces.
 *
 *                 morale < 80            morale >= 80 (already flying)
 *   form >= 7.0   +3  positive           +1  neutral  (deserved but hollow)
 *   form <  7.0   +2  positive           +0  neutral  (sounds empty)
 */
export function evaluatePraise(input: InteractionInput): InteractionResult {
  const inForm = input.recentAvgRating >= GOOD_FORM;
  const flying = input.currentMorale >= HIGH_MORALE;

  if (inForm) {
    return flying ? { delta: 1, reaction: 'neutral' } : { delta: 3, reaction: 'positive' };
  }
  return flying ? { delta: 0, reaction: 'neutral' } : { delta: 2, reaction: 'positive' };
}

/**
 * Pure: a private word of criticism.
 *
 *                 morale < 40            morale >= 40
 *   form >= 7.0   -3  negative           -3  negative (resents being singled out)
 *   form <  7.0   -2  negative           +1  positive (wake-up, not a blow)
 */
export function evaluateCriticism(input: InteractionInput): InteractionResult {
  const inForm = input.recentAvgRating >= GOOD_FORM;

  if (inForm) {
    return { delta: -3, reaction: 'negative' };
  }
  if (input.currentMorale >= OK_MORALE) {
    return { delta: 1, reaction: 'positive' };
  }
  return { delta: -2, reaction: 'negative' };
}
