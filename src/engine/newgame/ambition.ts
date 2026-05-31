export type AmbitionProfileId = 'continental' | 'nacional' | 'acesso';

export interface ClubForAmbition {
  id: number;
  reputation: number;
  divisionLevel: number;
}

export interface AmbitionProfile {
  id: AmbitionProfileId;
  matches: (club: ClubForAmbition) => boolean;
}

/** Max number of suggested clubs shown per (profile, country). */
export const MAX_SUGGESTIONS = 5;

/** Reputation floor that separates Continental elite from the rest of div 1. */
const CONTINENTAL_MIN_REP = 78;

export const AMBITION_PROFILES: AmbitionProfile[] = [
  { id: 'continental', matches: (c) => c.divisionLevel === 1 && c.reputation >= CONTINENTAL_MIN_REP },
  { id: 'nacional', matches: (c) => c.divisionLevel === 1 && c.reputation < CONTINENTAL_MIN_REP },
  { id: 'acesso', matches: (c) => c.divisionLevel >= 2 },
];

/**
 * Filters clubs of a SINGLE country by the chosen profile, sorts by reputation
 * desc and returns at most MAX_SUGGESTIONS. The original club objects are kept.
 */
export function suggestClubsForProfile<T extends ClubForAmbition>(
  profileId: AmbitionProfileId,
  clubs: T[],
): T[] {
  const profile = AMBITION_PROFILES.find((p) => p.id === profileId);
  if (!profile) return [];
  return clubs
    .filter((c) => profile.matches(c))
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, MAX_SUGGESTIONS);
}
