import { Competition, CompetitionEntry } from '@/types/league';
import { League } from '@/types/league';
import {
  FixtureInput,
  generateRoundRobin,
  generateKnockoutRound,
} from './fixture-generator';

export interface SeasonCalendar {
  competitions: Competition[];
  fixtures: (FixtureInput & { id: number })[];
  entries: { competitionId: number; clubId: number; groupName: string | null; seed: number }[];
}

interface GenerateSeasonCalendarOptions {
  season: number;
  leagues: League[];
  clubsByLeague: Record<number, number[]>;
  championsLeagueClubs: number[];
}

/**
 * Returns the smallest power of 2 >= n.
 */
function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function generateSeasonCalendar(options: GenerateSeasonCalendarOptions): SeasonCalendar {
  const { season, leagues, clubsByLeague, championsLeagueClubs } = options;

  const competitions: Competition[] = [];
  const allFixtureInputs: FixtureInput[] = [];
  const entries: SeasonCalendar['entries'] = [];

  let competitionIdCounter = 1;
  let fixtureIdCounter = 1;

  // ── 1. League competitions ────────────────────────────────────────────────
  for (const league of leagues) {
    const competitionId = competitionIdCounter++;
    competitions.push({
      id: competitionId,
      name: league.name,
      type: 'league',
      format: 'round_robin',
      season,
      leagueId: league.id,
    });

    const clubIds = clubsByLeague[league.id] ?? [];

    // Entries
    clubIds.forEach((clubId, index) => {
      entries.push({ competitionId, clubId, groupName: null, seed: index + 1 });
    });

    // Fixtures: double round-robin starting at week 7
    const fixtures = generateRoundRobin(clubIds, { competitionId, season, startWeek: 7 });
    allFixtureInputs.push(...fixtures);
  }

  // ── 2. Cup competitions ───────────────────────────────────────────────────
  for (const league of leagues) {
    const competitionId = competitionIdCounter++;
    competitions.push({
      id: competitionId,
      name: `${league.name} Cup`,
      type: 'cup',
      format: 'knockout',
      season,
      leagueId: league.id,
    });

    const clubIds = clubsByLeague[league.id] ?? [];
    const n = clubIds.length;
    const bracket = nextPowerOfTwo(n);
    const byeCount = bracket - n;
    // Teams with byes go straight to round 2; only remaining teams play round 1
    const firstRoundTeams = clubIds.slice(byeCount); // teams that play in round 1

    // Entries
    clubIds.forEach((clubId, index) => {
      entries.push({ competitionId, clubId, groupName: null, seed: index + 1 });
    });

    // Only generate first-round fixtures (subsequent rounds generated dynamically)
    if (firstRoundTeams.length >= 2) {
      const fixtures = generateKnockoutRound(firstRoundTeams, {
        competitionId,
        season,
        week: 10,
        round: 1,
      });
      allFixtureInputs.push(...fixtures);
    }
  }

  // ── 3. Champions League ───────────────────────────────────────────────────
  const clCompetitionId = competitionIdCounter++;
  competitions.push({
    id: clCompetitionId,
    name: 'Champions League',
    type: 'continental',
    format: 'group_knockout',
    season,
    leagueId: null,
  });

  // Split 8 clubs into 2 groups of 4
  const groupSize = 4;
  const groupNames = ['A', 'B'];
  const groups: number[][] = [
    championsLeagueClubs.slice(0, groupSize),
    championsLeagueClubs.slice(groupSize, groupSize * 2),
  ];

  groups.forEach((groupClubs, groupIndex) => {
    const groupName = groupNames[groupIndex];

    // Entries
    groupClubs.forEach((clubId, seed) => {
      entries.push({ competitionId: clCompetitionId, clubId, groupName, seed: seed + 1 });
    });

    // Group stage fixtures: round-robin starting at week 13
    const fixtures = generateRoundRobin(groupClubs, {
      competitionId: clCompetitionId,
      season,
      startWeek: 13,
    });
    allFixtureInputs.push(...fixtures);
  });

  // ── Assign unique IDs to all fixtures ─────────────────────────────────────
  const fixtures = allFixtureInputs.map(f => ({ ...f, id: fixtureIdCounter++ }));

  return { competitions, fixtures, entries };
}
