import { DbHandle } from '../../database/queries/players';
import { LeagueStanding } from './types';

interface CompetitionRow {
  id: number;
  type: 'league' | 'cup' | 'continental';
  format: 'round_robin' | 'knockout' | 'group_knockout';
  league_id: number | null;
}

interface LeagueRow {
  id: number;
  relegation_spots: number;
}

interface FixtureRow {
  id: number;
  home_club_id: number;
  away_club_id: number;
  home_goals: number | null;
  away_goals: number | null;
  played: number;
  round: string | null;
}

async function getCompetitionsForSeason(db: DbHandle, season: number): Promise<CompetitionRow[]> {
  return (await db
    .prepare(
      `SELECT DISTINCT c.id, c.type, c.format, c.league_id
       FROM competitions c
       JOIN fixtures f ON f.competition_id = c.id
       WHERE f.season = ? AND f.played = 1`,
    )
    .all(season)) as CompetitionRow[];
}

async function getLeague(db: DbHandle, leagueId: number): Promise<LeagueRow | undefined> {
  return (await db
    .prepare('SELECT id, relegation_spots FROM leagues WHERE id = ?')
    .get(leagueId)) as LeagueRow | undefined;
}

async function getPlayedFixtures(
  db: DbHandle,
  competitionId: number,
  season: number,
): Promise<FixtureRow[]> {
  return (await db
    .prepare(
      `SELECT id, home_club_id, away_club_id, home_goals, away_goals, played, round
       FROM fixtures WHERE competition_id = ? AND season = ? AND played = 1`,
    )
    .all(competitionId, season)) as FixtureRow[];
}

function computeStandings(fixtures: FixtureRow[]): LeagueStanding[] {
  const table = new Map<number, LeagueStanding>();
  const touch = (clubId: number): LeagueStanding => {
    let s = table.get(clubId);
    if (!s) {
      s = { clubId, points: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0 };
      table.set(clubId, s);
    }
    return s;
  };
  for (const f of fixtures) {
    if (f.home_goals == null || f.away_goals == null) continue;
    const h = touch(f.home_club_id);
    const a = touch(f.away_club_id);
    h.goalsFor += f.home_goals; h.goalsAgainst += f.away_goals;
    a.goalsFor += f.away_goals; a.goalsAgainst += f.home_goals;
    if (f.home_goals > f.away_goals) h.points += 3;
    else if (f.home_goals < f.away_goals) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  for (const s of table.values()) s.goalDiff = s.goalsFor - s.goalsAgainst;
  return [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.clubId - b.clubId;
  });
}

interface ScorerRow { player_id: number; club_id: number; goals: number; }
interface AssisterRow { secondary_player_id: number; club_id: number; assists: number; }

async function insertAwardIgnore(
  db: DbHandle,
  season: number,
  competitionId: number,
  awardType: 'top_scorer' | 'top_assister' | 'mvp' | 'breakthrough',
  rank: number,
  playerId: number,
  clubId: number,
  value: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_awards
         (season, competition_id, award_type, rank, player_id, club_id, value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(season, competitionId, awardType, rank, playerId, clubId, value);
}

async function archiveTopScorers(db: DbHandle, competitionId: number, season: number): Promise<void> {
  const rows = (await db
    .prepare(
      `SELECT me.player_id AS player_id, p.club_id AS club_id, COUNT(*) AS goals
       FROM match_events me
       JOIN fixtures f ON f.id = me.fixture_id
       JOIN players  p ON p.id = me.player_id
       WHERE f.competition_id = ? AND f.season = ? AND me.type = 'goal'
       GROUP BY me.player_id
       ORDER BY goals DESC, me.player_id ASC
       LIMIT 5`,
    )
    .all(competitionId, season)) as ScorerRow[];
  for (let i = 0; i < rows.length; i++) {
    await insertAwardIgnore(db, season, competitionId, 'top_scorer', i + 1, rows[i].player_id, rows[i].club_id, rows[i].goals);
  }
}

async function archiveTopAssisters(db: DbHandle, competitionId: number, season: number): Promise<void> {
  const rows = (await db
    .prepare(
      `SELECT me.secondary_player_id AS secondary_player_id, p.club_id AS club_id, COUNT(*) AS assists
       FROM match_events me
       JOIN fixtures f ON f.id = me.fixture_id
       JOIN players  p ON p.id = me.secondary_player_id
       WHERE f.competition_id = ? AND f.season = ? AND me.type = 'goal' AND me.secondary_player_id IS NOT NULL
       GROUP BY me.secondary_player_id
       ORDER BY assists DESC, me.secondary_player_id ASC
       LIMIT 5`,
    )
    .all(competitionId, season)) as AssisterRow[];
  for (let i = 0; i < rows.length; i++) {
    await insertAwardIgnore(
      db, season, competitionId, 'top_assister', i + 1,
      rows[i].secondary_player_id, rows[i].club_id, rows[i].assists,
    );
  }
}

async function insertResultIgnore(
  db: DbHandle,
  season: number,
  competitionId: number,
  championClubId: number,
  runnerUpClubId: number | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_competition_results
         (season, competition_id, champion_club_id, runner_up_club_id)
       VALUES (?, ?, ?, ?)`,
    )
    .run(season, competitionId, championClubId, runnerUpClubId);
}

async function insertRelegatedIgnore(
  db: DbHandle,
  season: number,
  leagueId: number,
  clubId: number,
  finalPosition: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_relegated
         (season, league_id, club_id, final_position)
       VALUES (?, ?, ?, ?)`,
    )
    .run(season, leagueId, clubId, finalPosition);
}

async function archiveKnockout(
  db: DbHandle,
  competition: CompetitionRow,
  season: number,
): Promise<void> {
  const fixtures = await getPlayedFixtures(db, competition.id, season);
  if (fixtures.length === 0) return;

  // fixtures.round is TEXT in schema; parse to number for comparison.
  // Skip fixtures with null/non-numeric round (they can't be the final).
  const numericFixtures = fixtures
    .map((f) => ({ f, roundNum: f.round == null ? NaN : Number(f.round) }))
    .filter((x) => !Number.isNaN(x.roundNum));
  if (numericFixtures.length === 0) return;

  const maxRound = Math.max(...numericFixtures.map((x) => x.roundNum));
  const finals = numericFixtures.filter((x) => x.roundNum === maxRound).map((x) => x.f);
  if (finals.length === 0) return;
  // Deterministic pick if multiple finals somehow exist.
  const final = finals.sort((a, b) => b.id - a.id)[0];
  if (final.home_goals == null || final.away_goals == null) return;

  let championClubId: number;
  let runnerUpClubId: number | null;
  if (final.home_goals > final.away_goals) {
    championClubId = final.home_club_id;
    runnerUpClubId = final.away_club_id;
  } else if (final.away_goals > final.home_goals) {
    championClubId = final.away_club_id;
    runnerUpClubId = final.home_club_id;
  } else {
    // Tie with no shootout modelled — pick home deterministically.
    // TODO once penalty shootouts exist, read the actual winner from match_events.
    championClubId = final.home_club_id;
    runnerUpClubId = final.away_club_id;
  }

  await insertResultIgnore(db, season, competition.id, championClubId, runnerUpClubId);
}

async function archiveLeague(
  db: DbHandle,
  competition: CompetitionRow,
  season: number,
): Promise<void> {
  if (competition.league_id == null) return;
  const league = await getLeague(db, competition.league_id);
  if (!league) return;

  const fixtures = await getPlayedFixtures(db, competition.id, season);
  if (fixtures.length === 0) return;

  const standings = computeStandings(fixtures);
  if (standings.length === 0) return;

  const champion = standings[0].clubId;
  const runnerUp = standings.length > 1 ? standings[1].clubId : null;
  await insertResultIgnore(db, season, competition.id, champion, runnerUp);

  const relegatedCount = league.relegation_spots ?? 0;
  if (relegatedCount > 0 && standings.length >= relegatedCount) {
    const relegated = standings.slice(-relegatedCount);
    for (let i = 0; i < relegated.length; i++) {
      const finalPosition = standings.length - relegated.length + i + 1;
      await insertRelegatedIgnore(db, season, league.id, relegated[i].clubId, finalPosition);
    }
  }
}

export async function archiveSeason(db: DbHandle, season: number): Promise<void> {
  const competitions = await getCompetitionsForSeason(db, season);
  for (const competition of competitions) {
    if (competition.type === 'league') {
      await archiveLeague(db, competition, season);
    } else if (competition.type === 'cup' || competition.type === 'continental') {
      await archiveKnockout(db, competition, season);
    }
    await archiveTopScorers(db, competition.id, season);
    await archiveTopAssisters(db, competition.id, season);
  }
}
