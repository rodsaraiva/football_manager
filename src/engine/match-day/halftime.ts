import { DbHandle } from '@/database/queries/players';
import { getFixturesByWeek } from '@/database/queries/fixtures';
import { getClubById } from '@/database/queries/clubs';
import { loadClubMatchData } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic } from '@/types/tactic';
import { MatchStats } from '@/engine/simulation/match-engine';
import {
  simulateFirstHalf,
  HalftimeState,
  MatchInput,
  MatchResult,
} from '@/engine/simulation/match-engine';

// Isolated seed for the user's halftime preview so simulating ONLY their first
// half never touches the rng stream the weekly advance uses for AI matches.
export function halftimeSeed(season: number, week: number, fixtureId: number): number {
  return season * 100000 + week * 100 + fixtureId;
}

export interface UserHalftimeContext {
  halftime: HalftimeState;
  /** True if the user's club is the HOME side of the real fixture. */
  isHome: boolean;
  opponentName: string;
  /** The user's on-pitch XI at the start of H2 (what's currently playing). */
  homeSquad: PlayerForStrength[];
  /** The user's available bench. */
  homeBench: PlayerForStrength[];
  /** The user's current tactic (mentality/pressing/tempo etc.). */
  homeTactic: Tactic;
  fixtureId: number;
}

/**
 * Simulates ONLY the user's first half with an isolated rng so AI matches are
 * unaffected by the pause. To keep the engine override contract simple, the
 * user's club is ALWAYS oriented as "home" in the MatchInput — manager overrides
 * (which the engine applies to the home side) therefore always hit the user's
 * team regardless of the real venue. `isHome` records the real fixture venue so
 * the UI can show the score correctly and the final result can be re-oriented
 * back to the fixture's home/away frame (see orientResultToFixture).
 *
 * Returns null when the user has no fixture this week (UI falls back to instant
 * advance).
 */
export async function startUserMatchHalftime(params: {
  dbHandle: DbHandle;
  season: number;
  week: number;
  playerClubId: number;
  saveId: number;
}): Promise<UserHalftimeContext | null> {
  const { dbHandle: db, season, week, playerClubId, saveId } = params;

  const fixtures = await getFixturesByWeek(db, saveId, season, week);
  const fixture = fixtures.find(
    f => !f.played && (f.homeClubId === playerClubId || f.awayClubId === playerClubId),
  );
  if (!fixture) return null;

  const isHome = fixture.homeClubId === playerClubId;
  const opponentId = isHome ? fixture.awayClubId : fixture.homeClubId;

  const userData = await loadClubMatchData(db, saveId, playerClubId);
  const opponentData = await loadClubMatchData(db, saveId, opponentId);
  const opponentClub = await getClubById(db, saveId, opponentId);

  // User is ALWAYS the engine's "home" side (see doc comment).
  const input: MatchInput = {
    fixtureId: fixture.id,
    homeSquad: userData.squad,
    awaySquad: opponentData.squad,
    homeBench: userData.bench,
    awayBench: opponentData.bench,
    homeTactic: userData.tactic,
    awayTactic: opponentData.tactic,
    homeClubReputation: userData.reputation,
    awayClubReputation: opponentData.reputation,
    // P7: user is always the engine's "home" side, so their designated takers
    // ride on homeSetPieceTakers. Opponent (AI) stays on the auto-pick fallback.
    homeSetPieceTakers: userData.setPieceTakers,
    awaySetPieceTakers: opponentData.setPieceTakers,
    rng: new SeededRng(halftimeSeed(season, week, fixture.id)),
  };

  const halftime = simulateFirstHalf(input);

  return {
    halftime,
    isHome,
    opponentName: opponentClub?.name ?? 'Opponent',
    homeSquad: halftime.home.squad,
    homeBench: halftime.home.bench,
    homeTactic: halftime.home.tactic,
    fixtureId: fixture.id,
  };
}

/**
 * Re-orients an engine result (user-as-home) back to the real fixture frame.
 * When the user is the away side, home/away are swapped so the persisted
 * scoreline, stats and ratings match the fixture's home/away clubs.
 */
export function orientResultToFixture(result: MatchResult, userIsHome: boolean): MatchResult {
  if (userIsHome) return result;
  const s = result.stats;
  const swappedStats: MatchStats = {
    homePossession: s.awayPossession,
    awayPossession: s.homePossession,
    homeShots: s.awayShots,
    awayShots: s.homeShots,
    homeShotsOnTarget: s.awayShotsOnTarget,
    awayShotsOnTarget: s.homeShotsOnTarget,
    homeFouls: s.awayFouls,
    awayFouls: s.homeFouls,
    homeCorners: s.awayCorners,
    awayCorners: s.homeCorners,
    homeXG: s.awayXG,
    awayXG: s.homeXG,
  };
  return {
    homeGoals: result.awayGoals,
    awayGoals: result.homeGoals,
    events: result.events,
    homeRatings: result.awayRatings,
    awayRatings: result.homeRatings,
    stats: swappedStats,
    attendance: result.attendance,
  };
}
