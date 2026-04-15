import { Competition, CompetitionEntry } from '@/types/league';
import { League } from '@/types/league';
import {
  FixtureInput,
  generateRoundRobin,
  generateKnockoutRound,
} from './fixture-generator';
import { DbHandle } from '@/database/queries/players';
import { getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import {
  createCompetition,
  addCompetitionEntry,
} from '@/database/queries/leagues';
import { createFixture } from '@/database/queries/fixtures';

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

/**
 * Ensures that fixtures exist for the given season.
 * If no fixtures are found (e.g. a save created before calendar generation was
 * properly awaited), the full season calendar is generated and persisted.
 * Returns true if fixtures were generated, false if they already existed.
 */
export async function ensureSeasonFixtures(
  db: DbHandle,
  season: number,
): Promise<boolean> {
  // Heuristic: a healthy season has hundreds of fixtures (5 leagues × ~20 clubs ×
  // 38 weeks + cup + CL). If we see fewer than 100, treat it as a botched/partial
  // generation from an old buggy save and regenerate from scratch.
  const existing = await db
    .prepare('SELECT COUNT(*) AS cnt FROM fixtures WHERE season = ?')
    .get(season) as { cnt: number };
  if (existing.cnt >= 100) return false;

  // Wipe any partial state for this season before regenerating.
  await db.prepare('DELETE FROM match_events WHERE fixture_id IN (SELECT id FROM fixtures WHERE season = ?)').run(season);
  await db.prepare('DELETE FROM fixtures WHERE season = ?').run(season);
  await db.prepare('DELETE FROM competition_entries WHERE competition_id IN (SELECT id FROM competitions WHERE season = ?)').run(season);
  await db.prepare('DELETE FROM competitions WHERE season = ?').run(season);

  const allLeagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  const championsLeagueClubs: number[] = [];

  for (const league of allLeagues) {
    const leagueClubs = await getClubsByLeague(db, league.id);
    const sorted = [...leagueClubs].sort((a, b) => b.reputation - a.reputation);
    clubsByLeague[league.id] = leagueClubs.map(c => c.id);
    for (const c of sorted.slice(0, 2)) {
      if (championsLeagueClubs.length < 8) championsLeagueClubs.push(c.id);
    }
  }

  // Fill CL to 8 if needed
  if (championsLeagueClubs.length < 8) {
    const allIds = Object.values(clubsByLeague).flat();
    for (const id of allIds) {
      if (!championsLeagueClubs.includes(id) && championsLeagueClubs.length < 8) {
        championsLeagueClubs.push(id);
      }
    }
  }

  const calendar = generateSeasonCalendar({ season, leagues: allLeagues, clubsByLeague, championsLeagueClubs });

  for (const comp of calendar.competitions) {
    await createCompetition(db, {
      id: comp.id,
      name: comp.name,
      type: comp.type,
      format: comp.format,
      season,
      leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) {
    await addCompetitionEntry(db, {
      competitionId: entry.competitionId,
      clubId: entry.clubId,
      groupName: entry.groupName,
      seed: entry.seed,
    });
  }
  for (const fixture of calendar.fixtures) {
    await createFixture(db, {
      id: fixture.id,
      competitionId: fixture.competitionId,
      season,
      week: fixture.week,
      round: fixture.round !== null ? String(fixture.round) : null,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
    });
  }

  return true;
}
