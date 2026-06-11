import { SeededRng } from '@/engine/rng';
import { FixtureInput } from './fixture-generator';

export interface PlayedKnockoutFixture {
  homeClubId: number;
  awayClubId: number;
  homeGoals: number;
  awayGoals: number;
  round: number;
}

export interface KnockoutWinner {
  winnerClubId: number;
  loserClubId: number;
  viaShootout: boolean;
  shootoutScore: [number, number] | null; // [winner pens scored, loser pens scored]
}

/** Best-of-5 then sudden death, deterministic given the seeded rng. */
function penaltyShootout(
  homeClubId: number,
  awayClubId: number,
  rng: SeededRng,
): KnockoutWinner {
  let home = 0;
  let away = 0;
  // 5 regulation kicks each (kick converts with p≈0.75).
  for (let i = 0; i < 5; i++) {
    if (rng.next() < 0.75) home++;
    if (rng.next() < 0.75) away++;
  }
  // Sudden death, bounded so the score stays ≤ 10 (terminates deterministically).
  let extra = 0;
  while (home === away && extra < 5) {
    const h = rng.next() < 0.75 ? 1 : 0;
    const a = rng.next() < 0.75 ? 1 : 0;
    home += h; away += a;
    extra++;
  }
  // Guaranteed decider: if still level after bounded sudden death, the higher
  // single next kick decides; if both equal, lower clubId converts (deterministic).
  if (home === away) {
    if (rng.next() < 0.5) home++;
    else away++;
  }
  if (home >= away) {
    return { winnerClubId: homeClubId, loserClubId: awayClubId, viaShootout: true, shootoutScore: [home, away] };
  }
  return { winnerClubId: awayClubId, loserClubId: homeClubId, viaShootout: true, shootoutScore: [away, home] };
}

export function resolveKnockoutTie(
  fixture: PlayedKnockoutFixture,
  rng: SeededRng,
): KnockoutWinner {
  if (fixture.homeGoals > fixture.awayGoals) {
    return { winnerClubId: fixture.homeClubId, loserClubId: fixture.awayClubId, viaShootout: false, shootoutScore: null };
  }
  if (fixture.awayGoals > fixture.homeGoals) {
    return { winnerClubId: fixture.awayClubId, loserClubId: fixture.homeClubId, viaShootout: false, shootoutScore: null };
  }
  return penaltyShootout(fixture.homeClubId, fixture.awayClubId, rng);
}

export interface NextRoundInput {
  competitionId: number;
  season: number;
  completedRound: number;
  winners: number[];
  pendingByeClubIds: number[];
  week: number;
  reputationByClubId: Map<number, number>;
}

export function buildNextKnockoutRound(input: NextRoundInput): {
  fixtures: FixtureInput[];
  byeClubIds: number[];
} {
  const survivors = [...input.pendingByeClubIds, ...input.winners];
  const nextRound = input.completedRound + 1;
  const byeClubIds: number[] = [];
  const pool = [...survivors];

  if (pool.length % 2 === 1) {
    // Highest-reputation club gets the bye (mirrors real seeding).
    let byeId = pool[0];
    let bestRep = input.reputationByClubId.get(byeId) ?? 0;
    for (const id of pool) {
      const rep = input.reputationByClubId.get(id) ?? 0;
      if (rep > bestRep) { bestRep = rep; byeId = id; }
    }
    byeClubIds.push(byeId);
    pool.splice(pool.indexOf(byeId), 1);
  }

  const fixtures: FixtureInput[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    fixtures.push({
      competitionId: input.competitionId,
      season: input.season,
      week: input.week,
      round: nextRound,
      homeClubId: pool[i],
      awayClubId: pool[i + 1],
    });
  }
  return { fixtures, byeClubIds };
}

export function isKnockoutComplete(winners: number[], byeClubIds: number[]): boolean {
  return winners.length + byeClubIds.length <= 1;
}

export interface ClKnockoutSeedInput {
  competitionId: number;
  season: number;
  week: number;
  groups: Record<string, number[]>; // group name → club ids ordered 1st..last
}

/** Group winners meet the *other* groups' runners-up (single-leg). 2 groups → 2 semis. */
export function seedClChampionsKnockout(input: ClKnockoutSeedInput): FixtureInput[] {
  const names = Object.keys(input.groups).sort();
  const winners = names.map((n) => input.groups[n][0]);
  const runnersUp = names.map((n) => input.groups[n][1]);
  const fixtures: FixtureInput[] = [];
  for (let i = 0; i < winners.length; i++) {
    const opp = runnersUp[(i + 1) % runnersUp.length]; // other group's runner-up
    fixtures.push({
      competitionId: input.competitionId,
      season: input.season,
      week: input.week,
      round: 1,
      homeClubId: winners[i],
      awayClubId: opp,
    });
  }
  return fixtures;
}
