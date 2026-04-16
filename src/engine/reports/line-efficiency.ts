/**
 * Eficiência por Linha do Próprio Time.
 *
 * Groups players into positional lines (GK / DEF / MID / ATK) and computes
 * average rating + appearances per line from the PlayerForm data already
 * computed by computeForm.
 */
import { Position } from '@/types';
import { PlayerForm, SquadPlayer } from './technical-report';

export const LINE_GROUPS: Record<'GK' | 'DEF' | 'MID' | 'ATK', Position[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATK: ['LW', 'RW', 'ST'],
};

export type LineGroup = keyof typeof LINE_GROUPS;

export interface LineEfficiency {
  group: LineGroup;
  label: string;
  avgRating: number;
  appearances: number;
  /** true if this line has the lowest avg rating among lines with data */
  isWeakest: boolean;
  /** true if this line has the highest avg rating among lines with data */
  isStrongest: boolean;
}

const GROUP_LABELS: Record<LineGroup, string> = {
  GK: 'Goleiros',
  DEF: 'Defesa',
  MID: 'Meio-campo',
  ATK: 'Ataque',
};

/**
 * Derives per-line efficiency from the PlayerForm array.
 * Requires squad to look up each player's position.
 */
export function buildLineEfficiency(
  forms: PlayerForm[],
  squad: SquadPlayer[],
): LineEfficiency[] {
  const positionById = new Map<number, Position>(squad.map((p) => [p.id, p.position]));

  // Accumulate rating sum and appearances per group
  const buckets: Record<LineGroup, { ratingSum: number; appearances: number }> = {
    GK: { ratingSum: 0, appearances: 0 },
    DEF: { ratingSum: 0, appearances: 0 },
    MID: { ratingSum: 0, appearances: 0 },
    ATK: { ratingSum: 0, appearances: 0 },
  };

  for (const form of forms) {
    if (form.appearances === 0) continue;
    const pos = positionById.get(form.playerId);
    if (!pos) continue;

    const group = (Object.keys(LINE_GROUPS) as LineGroup[]).find((g) =>
      (LINE_GROUPS[g] as Position[]).includes(pos),
    );
    if (!group) continue;

    buckets[group].ratingSum += form.avgRating * form.appearances;
    buckets[group].appearances += form.appearances;
  }

  const groups = (Object.keys(buckets) as LineGroup[]).map((group) => {
    const b = buckets[group];
    const avgRating =
      b.appearances > 0
        ? Math.round((b.ratingSum / b.appearances) * 10) / 10
        : 0;
    return { group, avgRating, appearances: b.appearances };
  });

  // Identify weakest and strongest among groups with data
  const withData = groups.filter((g) => g.appearances > 0);
  const minRating = withData.length > 0 ? Math.min(...withData.map((g) => g.avgRating)) : -1;
  const maxRating = withData.length > 0 ? Math.max(...withData.map((g) => g.avgRating)) : -1;

  return groups.map((g) => ({
    group: g.group,
    label: GROUP_LABELS[g.group],
    avgRating: g.avgRating,
    appearances: g.appearances,
    isWeakest: g.appearances > 0 && g.avgRating === minRating,
    isStrongest: g.appearances > 0 && g.avgRating === maxRating,
  }));
}
