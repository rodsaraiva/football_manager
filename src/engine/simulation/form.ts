/** Rating "neutro": acima disso embala, abaixo entra em seca. */
const NEUTRAL_RATING = 6.5;
/** Quanto cada ponto de rating acima/abaixo do neutro move o modificador. */
const SENSITIVITY = 0.5;
const MIN_MOD = -1;
const MAX_MOD = 1;

/**
 * Pure: converte ratings recentes (não-ponderados) num modificador de rating
 * efetivo em [-1, 1]. Array vazio → 0 (sem efeito, legado). Sem RNG.
 */
export function computeFormModifier(recentRatings: number[]): number {
  if (recentRatings.length === 0) return 0;
  const avg = recentRatings.reduce((s, r) => s + r, 0) / recentRatings.length;
  const mod = (avg - NEUTRAL_RATING) * SENSITIVITY;
  return Math.max(MIN_MOD, Math.min(MAX_MOD, mod));
}
