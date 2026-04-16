/**
 * Scouting de Free Agents com Fit Tático.
 *
 * Ranks free agents by how well they cover positional gaps in the user's squad,
 * filtered by wage affordability.
 */
import { Player, PlayerAttributes, Position } from '@/types';
import { calculateOverall } from '@/utils/overall';
import { LINE_GROUPS } from './line-efficiency';

export interface FreeAgentFit {
  player: Player;
  overall: number;
  /** 0-100 score: how much this player improves the squad at their position */
  fitScore: number;
  /** The position (primary or secondary) used for the fit calculation */
  coversPosition: Position;
  /** overall - squadAvgForPosition (can be negative) */
  gapCovered: number;
}

export interface SquadGap {
  position: Position;
  group: 'GK' | 'DEF' | 'MID' | 'ATK';
  avgOverall: number;
  playerCount: number;
}

export interface FreeAgentScoutResult {
  fits: FreeAgentFit[];
  /** Positional gaps sorted worst (lowest avg) first */
  squadGaps: SquadGap[];
}

/** Map each position to its line group */
function positionGroup(pos: Position): 'GK' | 'DEF' | 'MID' | 'ATK' | null {
  for (const [group, positions] of Object.entries(LINE_GROUPS) as [keyof typeof LINE_GROUPS, Position[]][]) {
    if (positions.includes(pos)) return group;
  }
  return null;
}

/**
 * Compute average overall per position for the squad.
 * Returns a Map<Position, number> — only includes positions that have at least one player.
 */
function squadAvgByPosition(
  squadWithAttrs: { player: Player; attributes: PlayerAttributes }[],
): Map<Position, number> {
  const acc = new Map<Position, { sum: number; count: number }>();
  for (const { player, attributes } of squadWithAttrs) {
    const ovr = calculateOverall(attributes, player.position);
    const existing = acc.get(player.position);
    if (existing) {
      existing.sum += ovr;
      existing.count += 1;
    } else {
      acc.set(player.position, { sum: ovr, count: 1 });
    }
  }
  const result = new Map<Position, number>();
  for (const [pos, { sum, count }] of acc) {
    result.set(pos, sum / count);
  }
  return result;
}

export interface BuildFreeAgentScoutParams {
  freeAgentsWithAttrs: { player: Player; attributes: PlayerAttributes }[];
  squadWithAttrs: { player: Player; attributes: PlayerAttributes }[];
  wageBudgetRemaining: number;
}

export function buildFreeAgentScout({
  freeAgentsWithAttrs,
  squadWithAttrs,
  wageBudgetRemaining,
}: BuildFreeAgentScoutParams): FreeAgentScoutResult {
  // Ensure wage budget is never negative
  const budget = Math.max(0, wageBudgetRemaining);

  // Build squad average overall per position
  const avgByPos = squadAvgByPosition(squadWithAttrs);

  // Build squad gaps: one entry per position present in squad, sorted by avgOverall asc
  const squadGaps: SquadGap[] = [];
  for (const [pos, avg] of avgByPos) {
    const group = positionGroup(pos);
    if (!group) continue;
    const count = squadWithAttrs.filter((s) => s.player.position === pos).length;
    squadGaps.push({ position: pos, group, avgOverall: Math.round(avg), playerCount: count });
  }
  squadGaps.sort((a, b) => a.avgOverall - b.avgOverall);

  // Score each free agent
  const fits: FreeAgentFit[] = [];

  for (const { player, attributes } of freeAgentsWithAttrs) {
    // Wage filter: must not exceed 30% of remaining budget
    if (player.wage > budget * 0.3) continue;

    // Determine best fit position (primary first, then secondary)
    const positions: Position[] = [player.position];
    if (player.secondaryPosition && player.secondaryPosition !== player.position) {
      positions.push(player.secondaryPosition);
    }

    // Pick the position with the best fitScore
    let bestFit: FreeAgentFit | null = null;
    for (const pos of positions) {
      const agentOverall = calculateOverall(attributes, pos);
      const squadAvg = avgByPos.get(pos) ?? 50; // if no squad player at this pos, assume baseline 50
      const gap = agentOverall - squadAvg;
      const fitScore = Math.min(100, Math.max(0, (gap / 50) * 100));

      const candidate: FreeAgentFit = {
        player,
        overall: agentOverall,
        fitScore: Math.round(fitScore * 10) / 10,
        coversPosition: pos,
        gapCovered: Math.round(gap * 10) / 10,
      };

      if (!bestFit || candidate.fitScore > bestFit.fitScore) {
        bestFit = candidate;
      }
    }

    if (bestFit) {
      fits.push(bestFit);
    }
  }

  // Sort by fitScore desc
  fits.sort((a, b) => b.fitScore - a.fitScore);

  return { fits, squadGaps };
}
