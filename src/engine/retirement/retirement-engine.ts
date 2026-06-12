import { Player } from '@/types';
import { SeededRng } from '@/engine/rng';
import {
  RETIREMENT_MIN_AGE,
  RETIREMENT_MAX_AGE,
  RETIREMENT_MORALE_THRESHOLD,
  MAX_PLAYER_AGE,
  RETIREMENT_LOW_MORALE_STREAK_THRESHOLD,
  RETIREMENT_ANNOUNCE_WINDOW_OPEN_OFFSET,
  RETIREMENT_ANNOUNCE_WINDOW_CLOSE_OFFSET,
  SEASON_END_WEEK,
  ORDINARY_RETIREMENT_BASE_PROB,
  ORDINARY_RETIREMENT_AGE_SLOPE,
} from '@/engine/balance';

export interface RetirementDecision {
  playerId: number;
  playerName: string;
  age: number;
  reason: 'low_morale' | 'max_age';
}

type CompulsoryInput = Pick<Player, 'id' | 'name' | 'age' | 'isFreeAgent'>;

/** Aposentadoria compulsória por idade ≥ MAX_PLAYER_AGE. Aplicada em todos os clubes (inclui IA). */
export function detectCompulsoryRetirements(players: CompulsoryInput[]): RetirementDecision[] {
  const out: RetirementDecision[] = [];
  for (const p of players) {
    if (p.isFreeAgent) continue;
    if (p.age >= MAX_PLAYER_AGE) {
      out.push({ playerId: p.id, playerName: p.name, age: p.age, reason: 'max_age' });
    }
  }
  return out;
}

export function isInAnnounceWindow(currentWeek: number): boolean {
  const start = SEASON_END_WEEK - RETIREMENT_ANNOUNCE_WINDOW_OPEN_OFFSET;
  const end = SEASON_END_WEEK - RETIREMENT_ANNOUNCE_WINDOW_CLOSE_OFFSET;
  return currentWeek >= start && currentWeek <= end;
}

export interface AnnounceInput {
  age: number;
  streak: number;
  currentWeek: number;
  alreadyAnnounced: boolean;
}

export function shouldAnnounceRetirement(input: AnnounceInput): boolean {
  if (input.alreadyAnnounced) return false;
  if (input.age < RETIREMENT_MIN_AGE || input.age > RETIREMENT_MAX_AGE) return false;
  if (input.streak < RETIREMENT_LOW_MORALE_STREAK_THRESHOLD) return false;
  if (!isInAnnounceWindow(input.currentWeek)) return false;
  return true;
}

/** Avança o streak de moral-baixa pra uma semana. `morale < threshold` incrementa; caso contrário zera. */
export function nextMoraleStreak(currentStreak: number, morale: number): number {
  return morale < RETIREMENT_MORALE_THRESHOLD ? currentStreak + 1 : 0;
}

export interface OrdinaryInput {
  id: number;
  name: string;
  age: number;
  isFreeAgent: boolean;
  willRetireAtSeasonEnd: boolean;
}

/**
 * Aposentadoria ordinária por idade na faixa [RETIREMENT_MIN_AGE, MAX_PLAYER_AGE).
 * Probabilidade cresce com a idade; independe de moral. Determinística via rng.
 * Não pega quem já foi anunciado (moral) nem free agents; ≥ MAX_PLAYER_AGE é da compulsória.
 */
export function detectOrdinaryRetirements(
  players: OrdinaryInput[],
  rng: SeededRng,
): RetirementDecision[] {
  const out: RetirementDecision[] = [];
  for (const p of players) {
    if (p.isFreeAgent || p.willRetireAtSeasonEnd) continue;
    if (p.age < RETIREMENT_MIN_AGE || p.age >= MAX_PLAYER_AGE) continue;
    const prob =
      ORDINARY_RETIREMENT_BASE_PROB +
      (p.age - RETIREMENT_MIN_AGE) * ORDINARY_RETIREMENT_AGE_SLOPE;
    if (rng.next() < prob) {
      out.push({ playerId: p.id, playerName: p.name, age: p.age, reason: 'max_age' });
    }
  }
  return out;
}
