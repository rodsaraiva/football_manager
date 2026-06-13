// Pure scouting fog-of-war model. No React/Expo/DB imports — fully unit-testable.
//
// Knowledge accrues 0–100 as a scout observes a player. Tier buckets drive how
// much of an attribute the manager sees; full knowledge reveals exact values.

export type ScoutingTier = 'unknown' | 'vague' | 'partial' | 'full';

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function knowledgeTier(knowledge: number): ScoutingTier {
  if (knowledge < 25) return 'unknown';
  if (knowledge < 60) return 'vague';
  if (knowledge < 100) return 'partial';
  return 'full';
}

/**
 * Weekly knowledge points a scout adds. Ability is clamped to [1,20]; a rookie
 * (1) adds 7/wk, an elite scout (20) adds 20/wk — full scouting takes ~5–14 weeks.
 */
export function weeklyKnowledgeGain(scoutAbility: number): number {
  const ability = clamp(scoutAbility, 1, 20);
  return Math.round(6 + ability * 0.7);
}

const TIER_MARGIN: Record<ScoutingTier, number> = {
  unknown: 0,
  vague: 10,
  partial: 4,
  full: 0,
};

/**
 * Masked attribute window the manager sees at a given tier. null = fully hidden
 * (unknown). 'full' collapses to the exact value. Bounds clamp to a 1–99 scale.
 */
export function maskedRange(
  value: number,
  tier: ScoutingTier,
): { lo: number; hi: number } | null {
  if (tier === 'unknown') return null;
  if (tier === 'full') return { lo: value, hi: value };
  const margin = TIER_MARGIN[tier];
  return {
    lo: clamp(value - margin, 1, 99),
    hi: clamp(value + margin, 1, 99),
  };
}

export interface ScoutingProgressRow {
  playerId: number;
  knowledge: number;
  scoutAbility: number;
}

export interface ScoutingProgressResult {
  playerId: number;
  knowledge: number;
  reachedFull: boolean;
}

export function advanceScouting(rows: ScoutingProgressRow[]): ScoutingProgressResult[] {
  return rows.map((row) => {
    const next = Math.min(100, row.knowledge + weeklyKnowledgeGain(row.scoutAbility));
    return {
      playerId: row.playerId,
      knowledge: next,
      reachedFull: next >= 100 && row.knowledge < 100,
    };
  });
}
