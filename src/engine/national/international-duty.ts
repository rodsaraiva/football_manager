// P9 — International duty (club-side MVP). Pure module: no React/Expo/DB imports.
//
// On FIFA international-break weeks the user's international-caliber players are
// "called up" to their national teams. The national matches themselves are
// ABSTRACTED — the only mechanical effect is TRAVEL FATIGUE: a flat fitness cost
// representing the trip. There is no national-team management mode here.

import { Position } from '@/types';
import { POSITION_GROUP } from '@/engine/simulation/squad-selection';
import { NATIONAL_SQUAD_SIZE } from '@/engine/balance';

// A handful of plausible FIFA-break weeks. SEASON_END_WEEK is 58, so these all
// fall comfortably inside the playable season and never collide with the season
// turn. Spread across the calendar to mirror the real Sep/Oct/Mar/Jun windows.
export const INTERNATIONAL_BREAK_WEEKS: number[] = [7, 15, 23, 31];

// Eligibility floor: only genuine international-caliber players get called up.
export const INTERNATIONAL_CALLUP_MIN_OVERALL = 75;

// Flat fitness cost of returning from international duty (the trip, not a match).
export const TRAVEL_FATIGUE_PENALTY = 8;

// Mirrors the schema's fitness CHECK (fitness BETWEEN 1 AND 100): travel fatigue
// can never drop a player below 1.
const FITNESS_FLOOR = 1;

export interface CallUpCandidate {
  id: number;
  nationality: string;
  overall: number;
}

export function isInternationalBreak(week: number): boolean {
  return INTERNATIONAL_BREAK_WEEKS.includes(week);
}

/**
 * Selects which squad players are called up to their national teams.
 *
 * Rules (deterministic, no RNG):
 *  - eligible = overall >= INTERNATIONAL_CALLUP_MIN_OVERALL
 *  - at most the BEST eligible player per nationality (one per country), so a
 *    squad full of same-nationality stars isn't gutted in a single break.
 *
 * Returns the called-up player ids.
 */
export function selectCallUps(squad: CallUpCandidate[]): number[] {
  const bestByNationality = new Map<string, CallUpCandidate>();
  for (const p of squad) {
    if (p.overall < INTERNATIONAL_CALLUP_MIN_OVERALL) continue;
    const current = bestByNationality.get(p.nationality);
    // Tie-break on lower id so the result is stable regardless of input order.
    if (
      !current ||
      p.overall > current.overall ||
      (p.overall === current.overall && p.id < current.id)
    ) {
      bestByNationality.set(p.nationality, p);
    }
  }
  return [...bestByNationality.values()]
    .sort((a, b) => b.overall - a.overall || a.id - b.id)
    .map((p) => p.id);
}

export function applyTravelFatigue(fitness: number): number {
  return Math.max(FITNESS_FLOOR, fitness - TRAVEL_FATIGUE_PENALTY);
}

// ─── L1-B: convocação gerida do pool da seleção ──────────────────────────────

export interface NationalSquadCandidate {
  id: number;
  position: Position;
  overall: number;
}

// Mínimos por grupo posicional para garantir que um XI válido (1 GK, linha de defesa,
// meio e ataque) sempre possa ser escalado a partir da convocação. Somam < size; as
// vagas restantes vão para os melhores overall independente de grupo.
const SQUAD_MIN_BY_GROUP: Record<string, number> = { GK: 2, DEF: 6, MID: 6, FWD: 3 };

/**
 * Convocação determinística do POOL da seleção (substitui o "melhor de um clube" para
 * o lado-seleção): seleciona NATIONAL_SQUAD_SIZE jogadores cobrindo posições. Primeiro
 * garante os mínimos por grupo (melhores por overall, desempate id), depois preenche o
 * restante pelos melhores overall. Retorna os ids ordenados por overall desc, id asc.
 * Pura, sem RNG — mesma entrada ⇒ mesma lista. Pool menor que size ⇒ retorna todos.
 */
export function selectNationalSquad(
  pool: readonly NationalSquadCandidate[],
  size: number = NATIONAL_SQUAD_SIZE,
): number[] {
  const sorted = [...pool].sort((a, b) => b.overall - a.overall || a.id - b.id);
  const picked = new Set<number>();

  for (const [group, min] of Object.entries(SQUAD_MIN_BY_GROUP)) {
    let count = 0;
    for (const p of sorted) {
      if (count >= min || picked.size >= size) break;
      if (picked.has(p.id)) continue;
      if ((POSITION_GROUP[p.position] ?? 'MID') === group) {
        picked.add(p.id);
        count++;
      }
    }
  }
  for (const p of sorted) {
    if (picked.size >= size) break;
    picked.add(p.id);
  }

  return sorted.filter((p) => picked.has(p.id)).map((p) => p.id);
}
