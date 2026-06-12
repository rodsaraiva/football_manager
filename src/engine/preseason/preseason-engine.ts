import { SeededRng } from '@/engine/rng';

/** Max friendlies the user may play in the pre-season window. */
export const PRESEASON_MAX_FRIENDLIES = 3;

/** Reputation half-width considered a "close" opponent band. */
export const FRIENDLY_REPUTATION_BAND = 12;

/** Friendly fitness reward bounds (participants only), capped at 100. */
export const FRIENDLY_FITNESS_MIN_GAIN = 5;
export const FRIENDLY_FITNESS_MAX_GAIN = 8;

export interface FriendlyOpponentCandidate {
  id: number;
  name: string;
  reputation: number;
}

export interface SuggestFriendlyOpponentsInput {
  playerClubId: number;
  playerReputation: number;
  candidates: FriendlyOpponentCandidate[];
  rng: SeededRng;
}

/**
 * Picks up to PRESEASON_MAX_FRIENDLIES opponents whose reputation sits close to
 * the player's club. Clubs inside the band are shuffled (deterministic per seed)
 * and taken first; if fewer than the cap qualify, the remaining slots are filled
 * by the nearest-by-reputation clubs outside the band. The player's own club is
 * never suggested.
 */
export function suggestFriendlyOpponents(
  input: SuggestFriendlyOpponentsInput,
): FriendlyOpponentCandidate[] {
  const pool = input.candidates.filter((c) => c.id !== input.playerClubId);

  const inBand = pool.filter(
    (c) => Math.abs(c.reputation - input.playerReputation) <= FRIENDLY_REPUTATION_BAND,
  );
  const outOfBand = pool
    .filter((c) => Math.abs(c.reputation - input.playerReputation) > FRIENDLY_REPUTATION_BAND)
    .sort(
      (a, b) =>
        Math.abs(a.reputation - input.playerReputation) -
        Math.abs(b.reputation - input.playerReputation),
    );

  const shuffledInBand = input.rng.shuffle([...inBand]);
  const ordered = [...shuffledInBand, ...outOfBand];
  return ordered.slice(0, PRESEASON_MAX_FRIENDLIES);
}

/**
 * Small fitness boost for a player who took part in a friendly. Non-participants
 * are unchanged. Result is clamped to 100.
 */
export function applyFriendlyFitnessGain(
  currentFitness: number,
  participated: boolean,
  rng: SeededRng,
): number {
  if (!participated) return currentFitness;
  const gain = rng.nextInt(FRIENDLY_FITNESS_MIN_GAIN, FRIENDLY_FITNESS_MAX_GAIN);
  return Math.min(100, currentFitness + gain);
}
