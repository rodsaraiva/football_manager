import type { PressOutcome, PressTone } from './press-engine';

export type MediaTier = 'local' | 'national' | 'global';

export function mediaTierForReputation(reputation: number): MediaTier {
  if (reputation >= 75) return 'global';
  if (reputation >= 45) return 'national';
  return 'local';
}

// Swing base por (tone, outcome) — espelha o espírito de BASE_CONFIDENCE.
const BASE_SWING: Record<PressTone, Record<PressOutcome, number>> = {
  measured: { win: 3, draw: 1, loss: -1 },
  confident: { win: 6, draw: 0, loss: -6 },
  defiant: { win: 2, draw: -1, loss: -3 },
};

const TIER_AMP: Record<MediaTier, number> = { local: 0.6, national: 1.0, global: 1.5 };

export interface SentimentInput {
  current: number;
  outcome: PressOutcome;
  tone: PressTone;
  tier: MediaTier;
}

/** Pure: próximo sentimento de mídia, clamped a [-100, 100]. Sem RNG. */
export function nextMediaSentiment(input: SentimentInput): number {
  const swing = BASE_SWING[input.tone][input.outcome] * TIER_AMP[input.tier];
  return Math.max(-100, Math.min(100, Math.round(input.current + swing)));
}
