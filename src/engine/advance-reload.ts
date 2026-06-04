export interface ResolveAdvanceReloadParams {
  result: { isSeasonEnd: boolean; newSeason: number };
  season: number; // store's season BEFORE advanceGameWeek bumped it
}

export interface AdvanceReloadDecision {
  fetchSeasonForRecents: number;
  shouldStartNewSeason: boolean;
}

/**
 * Decides, after advanceGameWeek, which season's fixtures to reload for the
 * "recent results" list and whether to flip the new-season flag. Pure mirror of
 * HomeScreen.handleAdvanceWeek's inline logic (HomeScreen.tsx:239,244): on a
 * season end the recents belong to the season that just finished (`season`),
 * because `result.newSeason` already points at the upcoming year.
 */
export function resolveAdvanceReload(p: ResolveAdvanceReloadParams): AdvanceReloadDecision {
  return {
    fetchSeasonForRecents: p.result.isSeasonEnd ? p.season : p.result.newSeason,
    shouldStartNewSeason: p.result.isSeasonEnd,
  };
}
