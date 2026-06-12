/**
 * Projeção de Classificação Final.
 *
 * Uses a deterministic expected-value approach:
 *   P(win for A) = overallA / (overallA + overallB)
 *   P(draw)      = fixed 0.20 (subtracted proportionally from win/loss)
 *   P(win for B) = 1 - P(draw) - P(win for A)
 *
 * For each remaining fixture, we add expected points to both clubs.
 * This produces a fully deterministic (no randomness) projection.
 */
import { Fixture } from '@/types';
import { StandingsEntry } from '@/engine/competition/standings';

export interface ProjectedStanding extends StandingsEntry {
  projectedPoints: number;
  projectedPosition: number;
  remainingFixtures: number;
  status: 'title' | 'promotion' | 'continental' | 'safe' | 'relegation';
}

const DRAW_PROB = 0.20;

/**
 * Computes expected points for a single fixture for side A.
 */
function expectedPoints(overallA: number, overallB: number): { expA: number; expB: number } {
  const total = overallA + overallB;
  if (total === 0) {
    return { expA: 1, expB: 1 }; // draw if both unknown
  }
  const rawWinA = overallA / total;
  // Apply draw probability proportionally
  const winA = rawWinA * (1 - DRAW_PROB);
  const winB = (1 - rawWinA) * (1 - DRAW_PROB);
  // draw = DRAW_PROB

  // Expected points: 3 * win + 1 * draw
  const expA = 3 * winA + DRAW_PROB;
  const expB = 3 * winB + DRAW_PROB;
  return { expA, expB };
}

export function projectClassification(options: {
  currentStandings: StandingsEntry[];
  remainingFixtures: Fixture[];
  overallByClub: Map<number, number>;
  leagueSize: number;
  divisionLevel?: number;
}): ProjectedStanding[] {
  const { currentStandings, remainingFixtures, overallByClub, leagueSize, divisionLevel = 1 } = options;

  // Copy current points into a mutable map
  const projectedPoints = new Map<number, number>();
  const remainingCount = new Map<number, number>();

  for (const s of currentStandings) {
    projectedPoints.set(s.clubId, s.points);
    remainingCount.set(s.clubId, 0);
  }

  // Add expected points from remaining fixtures
  for (const f of remainingFixtures) {
    if (f.played) continue;
    const ovHome = overallByClub.get(f.homeClubId) ?? 60;
    const ovAway = overallByClub.get(f.awayClubId) ?? 60;
    const { expA, expB } = expectedPoints(ovHome, ovAway);

    // Only add for clubs that have standings entries (i.e., they're in the league)
    if (projectedPoints.has(f.homeClubId)) {
      projectedPoints.set(f.homeClubId, (projectedPoints.get(f.homeClubId) ?? 0) + expA);
      remainingCount.set(f.homeClubId, (remainingCount.get(f.homeClubId) ?? 0) + 1);
    }
    if (projectedPoints.has(f.awayClubId)) {
      projectedPoints.set(f.awayClubId, (projectedPoints.get(f.awayClubId) ?? 0) + expB);
      remainingCount.set(f.awayClubId, (remainingCount.get(f.awayClubId) ?? 0) + 1);
    }
  }

  // Merge into projected standings array, sorted by projectedPoints
  const projected: Omit<ProjectedStanding, 'projectedPosition' | 'status'>[] = currentStandings.map((s) => ({
    ...s,
    projectedPoints: Math.round((projectedPoints.get(s.clubId) ?? s.points) * 10) / 10,
    remainingFixtures: remainingCount.get(s.clubId) ?? 0,
  }));

  projected.sort((a, b) => {
    const ptsDiff = b.projectedPoints - a.projectedPoints;
    if (Math.abs(ptsDiff) > 0.01) return ptsDiff;
    return b.goalDifference - a.goalDifference;
  });

  // Assign positions and status zones
  const n = projected.length || leagueSize;
  const relegationZone = Math.max(1, Math.floor(n * 0.2)); // bottom 20% ≈ 3-4 clubs

  return projected.map((p, i) => {
    const pos = i + 1;
    let status: ProjectedStanding['status'];
    if (pos === 1) status = 'title';
    else if (pos <= Math.ceil(n * 0.25)) status = divisionLevel > 1 ? 'promotion' : 'continental';
    else if (pos > n - relegationZone) status = 'relegation';
    else status = 'safe';

    return { ...p, projectedPosition: pos, status };
  });
}
