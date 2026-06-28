import { ClubRecord } from '@/types/legacy';

export interface RecordInputs {
  clubId: number;
  scorers: ReadonlyArray<{ playerId: number; goals: number }>;
  appearances: ReadonlyArray<{ playerId: number; games: number }>;
  results: ReadonlyArray<{ fixtureId: number; season: number; gf: number; ga: number; opponentId: number }>;
  trophiesBySeason: ReadonlyMap<number, number>;
}

export function computeClubRecords(inputs: RecordInputs): ClubRecord[] {
  const { clubId } = inputs;
  const out: ClubRecord[] = [];

  const topScorer = [...inputs.scorers].sort((a, b) => (b.goals - a.goals) || (a.playerId - b.playerId))[0];
  if (topScorer && topScorer.goals > 0) {
    out.push({ type: 'all_time_top_scorer', clubId, value: topScorer.goals,
      holderId: topScorer.playerId, season: null, fixtureRef: null, detail: '' });
  }

  const mostApps = [...inputs.appearances].sort((a, b) => (b.games - a.games) || (a.playerId - b.playerId))[0];
  if (mostApps && mostApps.games > 0) {
    out.push({ type: 'most_appearances', clubId, value: mostApps.games,
      holderId: mostApps.playerId, season: null, fixtureRef: null, detail: '' });
  }

  const wins = inputs.results.filter((r) => r.gf - r.ga > 0)
    .sort((a, b) => ((b.gf - b.ga) - (a.gf - a.ga)) || (a.fixtureId - b.fixtureId));
  if (wins[0]) {
    const w = wins[0];
    out.push({ type: 'biggest_win', clubId, value: w.gf - w.ga, holderId: null,
      season: w.season, fixtureRef: w.fixtureId, detail: `${w.gf}-${w.ga} vs Club ${w.opponentId}` });
  }

  const defeats = inputs.results.filter((r) => r.ga - r.gf > 0)
    .sort((a, b) => ((b.ga - b.gf) - (a.ga - a.gf)) || (a.fixtureId - b.fixtureId));
  if (defeats[0]) {
    const d = defeats[0];
    out.push({ type: 'biggest_defeat', clubId, value: d.ga - d.gf, holderId: null,
      season: d.season, fixtureRef: d.fixtureId, detail: `${d.gf}-${d.ga} vs Club ${d.opponentId}` });
  }

  let bestSeason: number | null = null, bestTrophies = 0;
  for (const [season, n] of inputs.trophiesBySeason) {
    if (n > bestTrophies || (n === bestTrophies && bestSeason != null && season < bestSeason)) {
      bestTrophies = n; bestSeason = season;
    }
  }
  if (bestSeason != null && bestTrophies > 0) {
    out.push({ type: 'most_trophies_in_season', clubId, value: bestTrophies,
      holderId: null, season: bestSeason, fixtureRef: null, detail: '' });
  }

  const ordered = [...inputs.results].sort((a, b) => (a.season - b.season) || (a.fixtureId - b.fixtureId));
  let run = 0, longest = 0;
  for (const r of ordered) {
    if (r.gf >= r.ga) { run += 1; if (run > longest) longest = run; }
    else run = 0;
  }
  if (longest > 0) {
    out.push({ type: 'longest_unbeaten', clubId, value: longest,
      holderId: null, season: null, fixtureRef: null, detail: '' });
  }

  return out;
}
