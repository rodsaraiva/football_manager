import { SeededRng } from '@/engine/rng';
import { Tactic } from '@/types/tactic';
import { PlayerForStrength } from './team-strength';
import { simulateMatch, MatchResult, SetPieceTakers } from './match-engine';
import { DerbyBonus } from '@/engine/legacy/derby-bonus';

export interface ClubMatchData {
  clubId: number;
  reputation: number;
  squad: PlayerForStrength[]; // XI elegível
  bench: PlayerForStrength[];
  tactic: Tactic;
  setPieceTakers?: SetPieceTakers; // P7: undefined = auto-pick (AI clubs)
  formModifiers?: Map<number, number>; // C8-e: só p/ o clube do usuário (AI = undefined)
}

export interface FixtureSimInput {
  fixtureId: number;
  homeClubId: number;
  awayClubId: number;
  derbyBonus?: DerbyBonus; // C1: absent ⇒ neutral, no behavior change
}

export interface SimulatedFixture {
  fixtureId: number;
  result: MatchResult;
}

function emptyResult(): MatchResult {
  return {
    homeGoals: 0, awayGoals: 0, events: [],
    homeRatings: [], awayRatings: [],
    stats: {
      homePossession: 50, awayPossession: 50, homeShots: 0, awayShots: 0,
      homeShotsOnTarget: 0, awayShotsOnTarget: 0, homeFouls: 0, awayFouls: 0,
      homeCorners: 0, awayCorners: 0, homeXG: 0, awayXG: 0,
    },
    attendance: 0,
  };
}

/**
 * Runs the real match engine for every fixture of the week (human included —
 * same engine). Fixtures sorted by id for deterministic RNG consumption.
 * A fixture where both sides are missing/empty records a 0-0 walkover.
 */
export function simulateWeekFixtures(args: {
  fixtures: FixtureSimInput[];
  clubData: Map<number, ClubMatchData>;
  rng: SeededRng;
}): SimulatedFixture[] {
  const { clubData, rng } = args;
  const fixtures = [...args.fixtures].sort((a, b) => a.fixtureId - b.fixtureId);
  const out: SimulatedFixture[] = [];

  for (const fx of fixtures) {
    const home = clubData.get(fx.homeClubId);
    const away = clubData.get(fx.awayClubId);

    // Both empty (or missing) → walkover 0-0, no RNG consumed, no throw.
    if ((!home || home.squad.length === 0) && (!away || away.squad.length === 0)) {
      out.push({ fixtureId: fx.fixtureId, result: emptyResult() });
      continue;
    }

    const result = simulateMatch({
      fixtureId: fx.fixtureId,
      homeSquad: home?.squad ?? [],
      awaySquad: away?.squad ?? [],
      homeBench: home?.bench ?? [],
      awayBench: away?.bench ?? [],
      homeTactic: home?.tactic ?? away!.tactic,
      awayTactic: away?.tactic ?? home!.tactic,
      homeClubReputation: home?.reputation ?? 50,
      awayClubReputation: away?.reputation ?? 50,
      homeSetPieceTakers: home?.setPieceTakers,
      awaySetPieceTakers: away?.setPieceTakers,
      homeFormModifiers: home?.formModifiers,
      awayFormModifiers: away?.formModifiers,
      derbyBonus: fx.derbyBonus,
      rng,
    });
    out.push({ fixtureId: fx.fixtureId, result });
  }
  return out;
}
