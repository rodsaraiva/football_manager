/**
 * Each save owns a disjoint ID space [saveId*STRIDE, (saveId+1)*STRIDE).
 * STRIDE is larger than the maximum number of clubs+players+fixtures+competitions
 * one save accumulates across all seasons, so raw seed/season ids never collide
 * across saves. Stays within Number.MAX_SAFE_INTEGER for thousands of saves.
 */
export const SAVE_ID_STRIDE = 100_000_000;

export function saveOffset(saveId: number): number {
  return saveId * SAVE_ID_STRIDE;
}
