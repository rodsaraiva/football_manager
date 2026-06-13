import { PlayerForStrength } from './team-strength';

/**
 * Resolves which player takes a set piece.
 *
 * If `designatedId` is non-null AND that player is currently in `squad` (i.e. on
 * the pitch — not subbed off or sent off), the designated player is returned and
 * `fallback()` is NEVER called. Otherwise `fallback()` runs to pick by attribute,
 * exactly as the engine did before P7.
 *
 * Crucially, `fallback()` is only invoked in the fallback branch. When a
 * designation IS honored, any RNG the fallback would have consumed is left
 * untouched — an intentional divergence that only ever happens on the new
 * designated path, so the no-designation path stays byte-for-byte identical.
 */
export function resolveTaker(
  squad: PlayerForStrength[],
  designatedId: number | null | undefined,
  fallback: () => PlayerForStrength,
): PlayerForStrength {
  if (designatedId != null) {
    const designated = squad.find(p => p.id === designatedId);
    if (designated) return designated;
  }
  return fallback();
}
