import type { MoraleDriverKind } from './driver-ledger';
import {
  PERSONALITY_BENCH_DAMPEN_LEADER,
  PERSONALITY_WAGE_AMPLIFY_MERCENARY,
  PERSONALITY_CRITICISM_AMPLIFY_TEMPER,
  PERSONALITY_NEGATIVE_AMPLIFY_PROBLEM,
  PERSONALITY_MODIFIER_MAX_MAGNITUDE,
} from '@/engine/balance';

export type PersonalityArchetype =
  | 'leader' | 'professional' | 'mercenary' | 'temperamental' | 'dressingRoomProblem' | 'balanced';

export interface PersonalityInput {
  leadership: number;
  composure: number;
  aggression: number;
  decisions: number;
}

/**
 * Mapeia atributos na escala de jogo (1-99) para a escala FM (1-20) que os limiares
 * de derivePersonality esperam. Necessário porque players/youth são gerados em 1-99 —
 * sem normalizar, leadership/composure sempre cruzam os limiares e todo mundo vira 'leader'.
 */
export function toPersonalityScale(input: PersonalityInput): PersonalityInput {
  const conv = (v: number): number => Math.max(1, Math.min(20, Math.round((v / 99) * 20)));
  return {
    leadership: conv(input.leadership),
    composure: conv(input.composure),
    aggression: conv(input.aggression),
    decisions: conv(input.decisions),
  };
}

/**
 * Pure & deterministic: mapeia atributos mentais + um componente da seed do save
 * para um arquétipo estável. O seedComponent (0..N) só desempata na faixa "balanced",
 * garantindo variedade sem quebrar determinismo (mesma seed → mesmo arquétipo).
 * Espera atributos na escala FM (1-20); use toPersonalityScale para converter de 1-99.
 */
export function derivePersonality(input: PersonalityInput, seedComponent: number): PersonalityArchetype {
  const { leadership, composure, aggression, decisions } = input;
  if (leadership >= 15 && composure >= 13) return 'leader';
  if (aggression >= 15 && composure <= 7) return 'temperamental';
  if (composure >= 13 && decisions >= 13) return 'professional';
  if (aggression >= 13 && leadership <= 8 && composure <= 9) return 'dressingRoomProblem';
  if (decisions <= 8 && composure <= 9) return 'mercenary';
  // faixa intermediária: o seed escolhe entre balanced/professional/mercenary de forma estável
  const bucket = ((seedComponent % 3) + 3) % 3;
  return bucket === 0 ? 'professional' : bucket === 1 ? 'mercenary' : 'balanced';
}

/** Pure: modula um delta de driver conforme o arquétipo, clampando a magnitude. */
export function personalityMoraleModifier(
  archetype: PersonalityArchetype,
  kind: MoraleDriverKind,
  baseDelta: number,
): number {
  let factor = 1;
  if (archetype === 'leader' && (kind === 'benched' || kind === 'benchStreak')) {
    factor = PERSONALITY_BENCH_DAMPEN_LEADER;
  } else if (archetype === 'mercenary' && kind === 'wage') {
    factor = PERSONALITY_WAGE_AMPLIFY_MERCENARY;
  } else if (archetype === 'temperamental' && kind === 'criticism') {
    factor = PERSONALITY_CRITICISM_AMPLIFY_TEMPER;
  } else if (archetype === 'dressingRoomProblem' && baseDelta < 0) {
    factor = PERSONALITY_NEGATIVE_AMPLIFY_PROBLEM;
  }
  const modulated = baseDelta * factor;
  const cap = PERSONALITY_MODIFIER_MAX_MAGNITUDE;
  return Math.max(-cap, Math.min(cap, modulated));
}
