import { SeededRng } from '@/engine/rng';

export type YouthSpecialization =
  | 'balanced' | 'technical' | 'physical' | 'mental' | 'position';

export interface IntakeLevers {
  academyLevel: number;       // 1-5
  youthCoachBonus: number;    // 0-10
  academyReputation: number;  // 1-100
  specialization: YouthSpecialization;
}

export interface IntakePreview {
  countMin: number;
  countMax: number;
  potentialMin: number;
  potentialMax: number;
  expectedGems: number;
  reputationTier: 'elite' | 'forte' | 'mediana' | 'fraca';
}

export const GEM_THRESHOLD = 80;

const COUNT_FLOOR = 2;   // youth-academy.ts clamp [2,5]
const COUNT_CAP = 5;
const POT_FLOOR = 45;    // youth-academy.ts clamp [45,95]
const POT_CAP = 95;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function reputationTier(rep: number): IntakePreview['reputationTier'] {
  if (rep >= 80) return 'elite';
  if (rep >= 60) return 'forte';
  if (rep >= 35) return 'mediana';
  return 'fraca';
}

/**
 * Teto de potencial efetivo desta academia. Estende a fórmula original
 * (40 + level*8 + coachBonus + rng.nextInt(-5,10)) com um bônus pequeno de
 * reputação, mantendo o clamp [45,95]. O +10 é o topo da variância de rng do
 * gerador, então o ceiling reflete o melhor prospecto plausível.
 */
export function potentialCeiling(levers: IntakeLevers): number {
  const repBonus = Math.round((levers.academyReputation - 50) / 12); // ~[-4,+4]
  const raw = 40 + levers.academyLevel * 8 + levers.youthCoachBonus + repBonus + 10;
  return clamp(raw, POT_FLOOR, POT_CAP);
}

function potentialBaseline(levers: IntakeLevers): number {
  const repBonus = Math.round((levers.academyReputation - 50) / 12);
  const raw = 40 + levers.academyLevel * 8 + levers.youthCoachBonus + repBonus - 5;
  return clamp(raw, POT_FLOOR, POT_CAP);
}

/**
 * Count efetivo desta seed. Espelha youth-academy.ts
 * (academyLevel + rng.nextInt(-1,0), clamp [2,5]) e adiciona um leve viés de
 * reputação top (+1 só para academias elite, ainda clampado).
 */
export function resolveIntakeCount(levers: IntakeLevers, rng: SeededRng): number {
  const repBump = levers.academyReputation >= 80 ? 1 : 0;
  const raw = levers.academyLevel + rng.nextInt(-1, 0) + repBump;
  return clamp(raw, COUNT_FLOOR, COUNT_CAP);
}

export function previewIntake(levers: IntakeLevers): IntakePreview {
  const repBump = levers.academyReputation >= 80 ? 1 : 0;
  const countMin = clamp(levers.academyLevel - 1, COUNT_FLOOR, COUNT_CAP);
  const countMax = clamp(levers.academyLevel + repBump, COUNT_FLOOR, COUNT_CAP);
  const potentialMax = potentialCeiling(levers);
  const potentialMin = potentialBaseline(levers);
  // joias esperadas: fração do count que tende a superar GEM_THRESHOLD, função do teto.
  const headroom = Math.max(0, potentialMax - GEM_THRESHOLD); // 0..15
  const gemFraction = headroom / (POT_CAP - GEM_THRESHOLD);    // 0..1
  const expectedGems = Math.round(countMax * gemFraction * 0.6);
  return {
    countMin, countMax, potentialMin, potentialMax,
    expectedGems, reputationTier: reputationTier(levers.academyReputation),
  };
}
