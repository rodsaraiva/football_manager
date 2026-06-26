// L1 — Pure nationality model for the national-team subsystem. No React/Expo/DB.
//
// players.nationality is a DEMONYM ('English'), while countries.name is the place
// ('England'). There is no join column, so the mapping lives here as a constant and
// every consumer (seeding, pool derivation) goes through it.

import { SeededRng } from '@/engine/rng';
import { INTERNATIONAL_CALLUP_MIN_OVERALL } from './international-duty';

export const DEMONYM_TO_COUNTRY: Record<string, string> = {
  English: 'England',
  Spanish: 'Spain',
  Italian: 'Italy',
  German: 'Germany',
  French: 'France',
};

// Reverse view: which country names are reachable from a demonym. Used to decide
// which countries get a national team seeded (data-driven by the demonym table).
export const PLAYABLE_NATIONAL_COUNTRIES: ReadonlySet<string> = new Set(
  Object.values(DEMONYM_TO_COUNTRY),
);

export function countryNameForDemonym(demonym: string): string | undefined {
  return DEMONYM_TO_COUNTRY[demonym];
}

export interface CountryRow {
  id: number;
  name: string;
  continent: string;
}

/** Finds the country row a demonym maps to, or undefined when unmapped/absent. */
export function findCountryByDemonym(
  countries: readonly CountryRow[],
  demonym: string,
): CountryRow | undefined {
  const name = DEMONYM_TO_COUNTRY[demonym];
  if (name === undefined) return undefined;
  return countries.find((c) => c.name === name);
}

export interface PoolCandidate {
  id: number;
  nationality: string; // demonym
  overall: number;
}

/**
 * Eligible pool for a country: players whose demonym maps to `countryName` and whose
 * overall clears the international floor, sorted by overall desc (id asc tiebreak),
 * capped at topN. Pure and deterministic — no RNG, stable regardless of input order.
 */
export function deriveNationalPool(
  players: readonly PoolCandidate[],
  countryName: string,
  topN: number,
): PoolCandidate[] {
  return players
    .filter(
      (p) =>
        DEMONYM_TO_COUNTRY[p.nationality] === countryName &&
        p.overall >= INTERNATIONAL_CALLUP_MIN_OVERALL,
    )
    .sort((a, b) => b.overall - a.overall || a.id - b.id)
    .slice(0, topN);
}

/**
 * Aggregate strength of a national team from its pool: the rounded mean overall of
 * the (already top-N) pool. Empty pool → 0 (a nation with no eligible players is a
 * minnow). Deterministic.
 */
export function computeNationalStrength(pool: readonly PoolCandidate[]): number {
  if (pool.length === 0) return 0;
  const sum = pool.reduce((acc, p) => acc + p.overall, 0);
  return Math.round(sum / pool.length);
}

/**
 * Abstract (resultado-only) national match. No lineups: goals are sampled from a
 * Poisson whose mean is driven by the two aggregate strengths. The caller owns the
 * rng (one per FIFA window, namespaced on save/season/week) and iterates fixtures in
 * a stable order, so the whole window is reproducible.
 */
export function simulateAbstractMatch(
  rng: SeededRng,
  homeStrength: number,
  awayStrength: number,
): { homeGoals: number; awayGoals: number } {
  return {
    homeGoals: samplePoisson(rng, expectedGoals(homeStrength, awayStrength)),
    awayGoals: samplePoisson(rng, expectedGoals(awayStrength, homeStrength)),
  };
}

// Mean goals for `attack` against `defence`: a base rate tilted by the strength gap,
// clamped to a sane football range.
function expectedGoals(attack: number, defence: number): number {
  const base = 1.35;
  const lambda = base + (attack - defence) / 20;
  return Math.max(0.2, Math.min(4.5, lambda));
}

// Knuth's Poisson sampler. Consumes a variable but deterministic number of rng draws.
function samplePoisson(rng: SeededRng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}
