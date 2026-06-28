export interface FriendlyEffectInput {
  myGoals: number;
  oppGoals: number;
  myReputation: number;
  oppReputation: number;
  participated: boolean;
}

export interface FriendlyEffect {
  moraleDelta: number;
  sharpnessDelta: number;
}

/** Pontos de afiação por amistoso disputado (independe do placar). */
const SHARPNESS_GAIN = 8;
/** Moral base por resultado, antes do ajuste por força do adversário. */
const MORALE_WIN = 3;
const MORALE_DRAW = 0;
const MORALE_LOSS = -2;
/** Quão forte a diferença de reputação modula a moral (pontos por 30 de gap). */
const REP_SCALE = 30;

/**
 * Pure: dado o resultado de um amistoso e a força relativa, devolve deltas de
 * moral e afiação para um participante. Não-participantes não mudam (espelha
 * applyFriendlyFitnessGain). Sem RNG — determinístico pela entrada.
 */
export function computeFriendlyEffect(input: FriendlyEffectInput): FriendlyEffect {
  if (!input.participated) return { moraleDelta: 0, sharpnessDelta: 0 };

  const diff = input.myGoals - input.oppGoals;
  let morale = diff > 0 ? MORALE_WIN : diff < 0 ? MORALE_LOSS : MORALE_DRAW;

  // Bater rep maior vale mais; perder p/ rep menor dói mais.
  const repGap = input.oppReputation - input.myReputation; // >0 = adversário mais forte
  if (diff > 0) morale += Math.round(Math.max(0, repGap) / REP_SCALE);
  else if (diff < 0) morale -= Math.round(Math.max(0, -repGap) / REP_SCALE);

  return { moraleDelta: morale, sharpnessDelta: SHARPNESS_GAIN };
}
