import { Legend } from '@/types/legacy';

export interface LegendCandidate {
  playerId: number; clubId: number;
  appearances: number; goals: number; assists: number;
  trophies: number; individualAwards: number; firstSeason: number; lastSeason: number;
}

const W_APP = 1, W_GOAL = 3, W_ASSIST = 1, W_TROPHY = 25, W_AWARD = 15;

function rawScore(c: LegendCandidate): number {
  return c.appearances * W_APP + c.goals * W_GOAL + c.assists * W_ASSIST
    + c.trophies * W_TROPHY + c.individualAwards * W_AWARD;
}

export function rankLegends(candidates: readonly LegendCandidate[], limit: number): Legend[] {
  const played = candidates.filter((c) => c.appearances > 0);
  if (played.length === 0) return [];
  const maxRaw = Math.max(...played.map(rawScore));
  const safeMax = maxRaw > 0 ? maxRaw : 1;
  const legends: Legend[] = played.map((c) => ({
    playerId: c.playerId, clubId: c.clubId,
    legendScore: Math.round((rawScore(c) / safeMax) * 100),
    appearances: c.appearances, goals: c.goals,
    trophies: c.trophies, individualAwards: c.individualAwards,
    firstSeason: c.firstSeason, lastSeason: c.lastSeason,
  }));
  legends.sort((x, y) => (y.legendScore - x.legendScore) || (x.playerId - y.playerId));
  return legends.slice(0, limit);
}
