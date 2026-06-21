// Pure scout-archetype model. No React/Expo/DB. Determinístico (sem rng).
import type { Position } from '@/types';

export type ScoutArchetype = 'generalist' | 'youth' | 'defenders' | 'regional';

export const SCOUT_ARCHETYPES: readonly ScoutArchetype[] = [
  'generalist',
  'youth',
  'defenders',
  'regional',
] as const;

export interface ArchetypeTarget {
  age: number;
  position: Position;
  regionCode: string;
}

export interface ArchetypeContext {
  scoutRegionCode: string;
}

const DEFENSIVE_POSITIONS: ReadonlySet<Position> = new Set(['GK', 'CB', 'LB', 'RB', 'CDM']);
const ATTACKING_POSITIONS: ReadonlySet<Position> = new Set(['LW', 'RW', 'ST', 'CAM']);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Multiplicador 0.7–1.6 sobre o ganho semanal base. 1.0 = neutro. */
export function archetypeMultiplier(
  archetype: ScoutArchetype,
  target: ArchetypeTarget,
  ctx: ArchetypeContext,
): number {
  let m = 1.0;
  switch (archetype) {
    case 'generalist':
      m = 1.0;
      break;
    case 'youth':
      if (target.age <= 19) m = 1.4;
      else if (target.age >= 30) m = 0.8;
      else m = 1.0;
      break;
    case 'defenders':
      if (DEFENSIVE_POSITIONS.has(target.position)) m = 1.4;
      else if (ATTACKING_POSITIONS.has(target.position)) m = 0.8;
      else m = 1.0;
      break;
    case 'regional':
      m = target.regionCode !== '' && target.regionCode === ctx.scoutRegionCode ? 1.4 : 1.0;
      break;
  }
  return clamp(m, 0.7, 1.6);
}

/** Bônus 0–0.15 somado a scoutAccuracy quando o alvo casa com a especialidade. */
export function archetypeAccuracyBonus(
  archetype: ScoutArchetype,
  target: ArchetypeTarget,
  ctx: ArchetypeContext,
): number {
  switch (archetype) {
    case 'youth':
      return target.age <= 19 ? 0.15 : 0;
    case 'defenders':
      return DEFENSIVE_POSITIONS.has(target.position) ? 0.15 : 0;
    case 'regional':
      return target.regionCode !== '' && target.regionCode === ctx.scoutRegionCode ? 0.15 : 0;
    case 'generalist':
    default:
      return 0;
  }
}
