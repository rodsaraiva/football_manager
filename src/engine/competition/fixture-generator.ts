export interface FixtureInput {
  competitionId: number;
  season: number;
  week: number;
  round: number | null;
  homeClubId: number;
  awayClubId: number;
}

interface RoundRobinOptions {
  competitionId: number;
  season: number;
  startWeek: number;
}

/**
 * Generate double round-robin schedule using the circle method.
 * Each team plays every other team twice (home and away).
 * No team plays more than once per week.
 */
export function generateRoundRobin(teamIds: number[], options: RoundRobinOptions): FixtureInput[] {
  const n = teamIds.length;
  const teams = [...teamIds];
  if (n % 2 !== 0) teams.push(-1);

  const totalTeams = teams.length;
  const roundsPerHalf = totalTeams - 1;
  const matchesPerRound = totalTeams / 2;
  const fixtures: FixtureInput[] = [];

  for (let half = 0; half < 2; half++) {
    const rotatingTeams = teams.slice(1);
    for (let round = 0; round < roundsPerHalf; round++) {
      const week = options.startWeek + half * roundsPerHalf + round;
      const roundTeams = [teams[0], ...rotatingTeams];
      for (let match = 0; match < matchesPerRound; match++) {
        const home = roundTeams[match];
        const away = roundTeams[totalTeams - 1 - match];
        if (home === -1 || away === -1) continue;
        if (half === 0) {
          fixtures.push({ competitionId: options.competitionId, season: options.season, week, round: null, homeClubId: home, awayClubId: away });
        } else {
          fixtures.push({ competitionId: options.competitionId, season: options.season, week, round: null, homeClubId: away, awayClubId: home });
        }
      }
      rotatingTeams.unshift(rotatingTeams.pop()!);
    }
  }
  return fixtures;
}

interface KnockoutOptions {
  competitionId: number;
  season: number;
  week: number;
  round: number;
}

/**
 * Generate a single knockout round. Pairs teams sequentially.
 */
export function generateKnockoutRound(teamIds: number[], options: KnockoutOptions): FixtureInput[] {
  const fixtures: FixtureInput[] = [];
  for (let i = 0; i < teamIds.length; i += 2) {
    fixtures.push({
      competitionId: options.competitionId,
      season: options.season,
      week: options.week,
      round: options.round,
      homeClubId: teamIds[i],
      awayClubId: teamIds[i + 1],
    });
  }
  return fixtures;
}
