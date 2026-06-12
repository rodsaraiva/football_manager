import { DbHandle, getPlayerById } from '@/database/queries/players';
import { getPlayerStatsByCompetition } from '@/database/queries/player-stats';

export interface TopScorerRow {
  playerId: number;
  name: string;
  goals: number;
  assists: number;
}

/** Real top scorers for a competition+season, goals desc, zero-goal players excluded. */
export async function buildTopScorers(
  db: DbHandle,
  saveId: number,
  season: number,
  competitionId: number,
): Promise<TopScorerRow[]> {
  const stats = await getPlayerStatsByCompetition(db, saveId, season, competitionId);
  const scored = stats.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals);
  const rows: TopScorerRow[] = [];
  for (const s of scored) {
    const player = await getPlayerById(db, saveId, s.playerId);
    rows.push({
      playerId: s.playerId,
      name: player?.name ?? `#${s.playerId}`,
      goals: s.goals,
      assists: s.assists,
    });
  }
  return rows;
}
