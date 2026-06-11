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
import { saveOffset } from '@/database/constants';
import { KNOCKOUT_START_WEEK } from '@/engine/balance';

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
        week: KNOCKOUT_START_WEEK,
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

    // Group stage fixtures: round-robin in the post-league band (no league collision).
    // 4 clubs → 6 rounds run weeks 47-52, before the CL knockout (seeded dynamically
    // by round-progression at week 53+).
    const fixtures = generateRoundRobin(groupClubs, {
      competitionId: clCompetitionId,
      season,
      startWeek: KNOCKOUT_START_WEEK,
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
  saveId: number,
  season: number,
): Promise<boolean> {
  // Heuristic: a healthy season has hundreds of fixtures (5 leagues × ~20 clubs ×
  // 38 weeks + cup + CL). If we see fewer than 100, treat it as a botched/partial
  // generation from an old buggy save and regenerate from scratch.
  const existing = await db
    .prepare('SELECT COUNT(*) AS cnt FROM fixtures WHERE save_id = ? AND season = ?')
    .get(saveId, season) as { cnt: number };
  if (existing.cnt >= 100) {
    return false;
  }

  // Wipe partial state for THIS save's season only.
  await db.prepare('DELETE FROM match_events WHERE fixture_id IN (SELECT id FROM fixtures WHERE save_id = ? AND season = ?)').run(saveId, season);
  await db.prepare('DELETE FROM fixtures WHERE save_id = ? AND season = ?').run(saveId, season);
  await db.prepare('DELETE FROM competition_entries WHERE competition_id IN (SELECT id FROM competitions WHERE save_id = ? AND season = ?)').run(saveId, season);
  await db.prepare('DELETE FROM competitions WHERE save_id = ? AND season = ?').run(saveId, season);

  const allLeagues = await getAllLeagues(db); // reference, unscoped
  const clubsByLeague: Record<number, number[]> = {};
  const championsLeagueClubs: number[] = [];

  for (const league of allLeagues) {
    const leagueClubs = await getClubsByLeague(db, saveId, league.id);
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

  // clubsByLeague already carries per-save club ids (saveOffset applied by getClubsByLeague).
  const calendar = generateSeasonCalendar({ season, leagues: allLeagues, clubsByLeague, championsLeagueClubs });

  // Per-season spacing inside the save's id space (eliminates season-1 cross-save collision).
  const off = saveOffset(saveId);
  const compIdOffset = off + (season > 1 ? season * 10000 : 0);
  const fixtureIdOffset = off + (season > 1 ? season * 100000 : 0);

  for (const comp of calendar.competitions) {
    await createCompetition(db, saveId, {
      id: comp.id + compIdOffset,
      name: comp.name,
      type: comp.type,
      format: comp.format,
      season,
      leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) {
    await addCompetitionEntry(db, saveId, {
      competitionId: entry.competitionId + compIdOffset,
      clubId: entry.clubId,
      groupName: entry.groupName,
      seed: entry.seed,
    });
  }
  // Batch-insert all (~6k) fixtures in a single statement. Per-row createFixture awaits
  // one round-trip each, which takes ~minutes on expo-sqlite web; one literal multi-VALUES
  // INSERT is a single round-trip. The season wipe above guarantees no id collisions.
  if (calendar.fixtures.length > 0) {
    const esc = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);
    const values = calendar.fixtures
      .map((f) => {
        const round = f.round !== null ? String(f.round) : null;
        return `(${f.id + fixtureIdOffset}, ${saveId}, ${f.competitionId + compIdOffset}, ${season}, ${f.week}, ${esc(round)}, ${f.homeClubId}, ${f.awayClubId}, 0)`;
      })
      .join(',');
    await db
      .prepare(
        `INSERT INTO fixtures (id, save_id, competition_id, season, week, round, home_club_id, away_club_id, played) VALUES ${values}`,
      )
      .run();
  }

  return true;
}
