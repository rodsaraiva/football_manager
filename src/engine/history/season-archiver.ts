import { DbHandle } from '../../database/queries/players';
import { LeagueStanding } from './types';
import { buildDivisionPairs } from '../competition/promotion';
import { getAllLeagues } from '../../database/queries/leagues';
import { insertPromotedIgnore } from '../../database/queries/season-promoted';

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

async function getCompetitionsForSeason(db: DbHandle, saveId: number, season: number): Promise<CompetitionRow[]> {
  return (await db
    .prepare(
      `SELECT DISTINCT c.id, c.type, c.format, c.league_id
       FROM competitions c
       JOIN fixtures f ON f.competition_id = c.id AND f.save_id = c.save_id
       WHERE c.save_id = ? AND f.season = ? AND f.played = 1`,
    )
    .all(saveId, season)) as CompetitionRow[];
}

async function getLeague(db: DbHandle, leagueId: number): Promise<LeagueRow | undefined> {
  return (await db
    .prepare('SELECT id, relegation_spots FROM leagues WHERE id = ?')
    .get(leagueId)) as LeagueRow | undefined;
}

async function getPlayedFixtures(
  db: DbHandle,
  saveId: number,
  competitionId: number,
  season: number,
): Promise<FixtureRow[]> {
  return (await db
    .prepare(
      `SELECT id, home_club_id, away_club_id, home_goals, away_goals, played, round
       FROM fixtures WHERE save_id = ? AND competition_id = ? AND season = ? AND played = 1`,
    )
    .all(saveId, competitionId, season)) as FixtureRow[];
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
  return [...table.values()].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
    if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
    // Head-to-head between x and y (points then GD among just the two).
    let xPts = 0, yPts = 0, xGd = 0, yGd = 0;
    for (const f of fixtures) {
      if (f.home_goals == null || f.away_goals == null) continue;
      const xy = f.home_club_id === x.clubId && f.away_club_id === y.clubId;
      const yx = f.home_club_id === y.clubId && f.away_club_id === x.clubId;
      if (!xy && !yx) continue;
      const xg = xy ? f.home_goals : f.away_goals;
      const yg = xy ? f.away_goals : f.home_goals;
      xGd += xg - yg; yGd += yg - xg;
      if (xg > yg) xPts += 3; else if (yg > xg) yPts += 3; else { xPts++; yPts++; }
    }
    if (yPts !== xPts) return yPts - xPts;
    if (yGd !== xGd) return yGd - xGd;
    return x.clubId - y.clubId;
  });
}

interface ScorerRow { player_id: number; club_id: number; goals: number; }
interface AssisterRow { secondary_player_id: number; club_id: number; assists: number; }

interface MvpCandidateRow {
  player_id: number;
  club_id: number;
  avg_rating: number;
  appearances: number;
  age: number;
}

async function getLeagueClubCount(db: DbHandle, saveId: number, leagueId: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM clubs WHERE save_id = ? AND league_id = ?')
    .get(saveId, leagueId) as { c: number };
  return row.c;
}

async function getClubFixturesPlayed(
  db: DbHandle,
  saveId: number,
  competitionId: number,
  season: number,
  clubId: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM fixtures
       WHERE save_id = ? AND competition_id = ? AND season = ? AND played = 1
         AND (home_club_id = ? OR away_club_id = ?)`,
    )
    .get(saveId, competitionId, season, clubId, clubId) as { c: number };
  return row.c;
}

async function getCandidates(
  db: DbHandle,
  saveId: number,
  competitionId: number,
  season: number,
): Promise<MvpCandidateRow[]> {
  return (await db
    .prepare(
      `SELECT ps.player_id AS player_id, p.club_id AS club_id,
              ps.avg_rating AS avg_rating, ps.appearances AS appearances, p.age AS age
       FROM player_stats ps
       JOIN players p ON p.id = ps.player_id AND p.save_id = ps.save_id
       WHERE ps.save_id = ? AND ps.competition_id = ? AND ps.season = ?
       ORDER BY ps.avg_rating DESC, ps.player_id ASC`,
    )
    .all(saveId, competitionId, season)) as MvpCandidateRow[];
}

async function minGamesForCompetition(
  db: DbHandle,
  saveId: number,
  competition: CompetitionRow,
  season: number,
  clubId: number,
): Promise<number> {
  if (competition.type === 'league' && competition.league_id != null) {
    const n = await getLeagueClubCount(db, saveId, competition.league_id);
    if (n < 2) return 0;
    return Math.ceil(((n - 1) * 2) / 2);
  }
  const clubGames = await getClubFixturesPlayed(db, saveId, competition.id, season, clubId);
  return Math.ceil(clubGames / 2);
}

async function archiveMvpAndBreakthrough(
  db: DbHandle,
  saveId: number,
  competition: CompetitionRow,
  season: number,
): Promise<void> {
  const candidates = await getCandidates(db, saveId, competition.id, season);
  if (candidates.length === 0) return;

  let mvp: MvpCandidateRow | null = null;
  let breakthrough: MvpCandidateRow | null = null;

  for (const c of candidates) {
    const minGames = await minGamesForCompetition(db, saveId, competition, season, c.club_id);
    if (c.appearances < minGames) continue;
    if (!mvp) mvp = c;
    if (!breakthrough && c.age <= 21) breakthrough = c;
    if (mvp && breakthrough) break;
  }

  if (mvp) {
    await insertAwardIgnore(db, saveId, season, competition.id, 'mvp', 1, mvp.player_id, mvp.club_id, mvp.avg_rating);
  }
  if (breakthrough) {
    await insertAwardIgnore(db, saveId, season, competition.id, 'breakthrough', 1, breakthrough.player_id, breakthrough.club_id, breakthrough.avg_rating);
  }
}

async function insertAwardIgnore(
  db: DbHandle,
  saveId: number,
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
         (save_id, season, competition_id, award_type, rank, player_id, club_id, value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(saveId, season, competitionId, awardType, rank, playerId, clubId, value);
}

async function archiveTopScorers(db: DbHandle, saveId: number, competitionId: number, season: number): Promise<void> {
  const rows = (await db
    .prepare(
      `SELECT me.player_id AS player_id, p.club_id AS club_id, COUNT(*) AS goals
       FROM match_events me
       JOIN fixtures f ON f.id = me.fixture_id AND f.save_id = ?
       JOIN players  p ON p.id = me.player_id AND p.save_id = f.save_id
       WHERE f.competition_id = ? AND f.season = ? AND me.type = 'goal'
       GROUP BY me.player_id
       ORDER BY goals DESC, me.player_id ASC
       LIMIT 5`,
    )
    .all(saveId, competitionId, season)) as ScorerRow[];
  for (let i = 0; i < rows.length; i++) {
    await insertAwardIgnore(db, saveId, season, competitionId, 'top_scorer', i + 1, rows[i].player_id, rows[i].club_id, rows[i].goals);
  }
}

async function archiveTopAssisters(db: DbHandle, saveId: number, competitionId: number, season: number): Promise<void> {
  const rows = (await db
    .prepare(
      `SELECT me.secondary_player_id AS secondary_player_id, p.club_id AS club_id, COUNT(*) AS assists
       FROM match_events me
       JOIN fixtures f ON f.id = me.fixture_id AND f.save_id = ?
       JOIN players  p ON p.id = me.secondary_player_id AND p.save_id = f.save_id
       WHERE f.competition_id = ? AND f.season = ? AND me.type = 'goal' AND me.secondary_player_id IS NOT NULL
       GROUP BY me.secondary_player_id
       ORDER BY assists DESC, me.secondary_player_id ASC
       LIMIT 5`,
    )
    .all(saveId, competitionId, season)) as AssisterRow[];
  for (let i = 0; i < rows.length; i++) {
    await insertAwardIgnore(
      db, saveId, season, competitionId, 'top_assister', i + 1,
      rows[i].secondary_player_id, rows[i].club_id, rows[i].assists,
    );
  }
}

async function insertResultIgnore(
  db: DbHandle,
  saveId: number,
  season: number,
  competitionId: number,
  championClubId: number,
  runnerUpClubId: number | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_competition_results
         (save_id, season, competition_id, champion_club_id, runner_up_club_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(saveId, season, competitionId, championClubId, runnerUpClubId);
}

async function insertRelegatedIgnore(
  db: DbHandle,
  saveId: number,
  season: number,
  leagueId: number,
  clubId: number,
  finalPosition: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_relegated
         (save_id, season, league_id, club_id, final_position)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(saveId, season, leagueId, clubId, finalPosition);
}

async function snapshotChampionSquad(
  db: DbHandle,
  saveId: number,
  season: number,
  competitionId: number,
  championClubId: number,
): Promise<void> {
  const players = (await db
    .prepare('SELECT id FROM players WHERE save_id = ? AND club_id = ?')
    .all(saveId, championClubId)) as Array<{ id: number }>;
  for (const p of players) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO season_player_titles
           (save_id, season, competition_id, club_id, player_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(saveId, season, competitionId, championClubId, p.id);
  }
}

async function getShootoutWinner(
  db: DbHandle,
  fixtureId: number,
): Promise<{ winnerClubId: number; loserClubId: number } | null> {
  const row = (await db
    .prepare(
      "SELECT player_id, secondary_player_id FROM match_events WHERE fixture_id = ? AND type = 'penalty_shootout' LIMIT 1",
    )
    .get(fixtureId)) as { player_id: number; secondary_player_id: number | null } | undefined;
  if (!row || row.secondary_player_id == null) return null;
  return { winnerClubId: row.player_id, loserClubId: row.secondary_player_id };
}

async function archiveKnockout(
  db: DbHandle,
  saveId: number,
  competition: CompetitionRow,
  season: number,
): Promise<void> {
  const fixtures = await getPlayedFixtures(db, saveId, competition.id, season);
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
    // Drawn final: read the persisted penalty_shootout winner. Guarded legacy
    // fallback (no event) keeps old saves deterministic on the home club.
    const shootout = await getShootoutWinner(db, final.id);
    if (shootout) {
      championClubId = shootout.winnerClubId;
      runnerUpClubId = shootout.loserClubId;
    } else {
      championClubId = final.home_club_id;
      runnerUpClubId = final.away_club_id;
    }
  }

  await insertResultIgnore(db, saveId, season, competition.id, championClubId, runnerUpClubId);
  await snapshotChampionSquad(db, saveId, season, competition.id, championClubId);
}

async function archiveLeague(
  db: DbHandle,
  saveId: number,
  competition: CompetitionRow,
  season: number,
): Promise<{ leagueId: number; orderedClubIds: number[] } | null> {
  if (competition.league_id == null) return null;
  const league = await getLeague(db, competition.league_id);
  if (!league) return null;

  const fixtures = await getPlayedFixtures(db, saveId, competition.id, season);
  if (fixtures.length === 0) return null;

  const standings = computeStandings(fixtures);
  if (standings.length === 0) return null;

  const champion = standings[0].clubId;
  const runnerUp = standings.length > 1 ? standings[1].clubId : null;
  await insertResultIgnore(db, saveId, season, competition.id, champion, runnerUp);
  await snapshotChampionSquad(db, saveId, season, competition.id, champion);

  const relegatedCount = league.relegation_spots ?? 0;
  if (relegatedCount > 0 && standings.length >= relegatedCount) {
    const relegated = standings.slice(-relegatedCount);
    for (let i = 0; i < relegated.length; i++) {
      const finalPosition = standings.length - relegated.length + i + 1;
      await insertRelegatedIgnore(db, saveId, season, league.id, relegated[i].clubId, finalPosition);
    }
  }
  return { leagueId: league.id, orderedClubIds: standings.map((s) => s.clubId) };
}

export async function archiveSeason(db: DbHandle, saveId: number, season: number): Promise<void> {
  const competitions = await getCompetitionsForSeason(db, saveId, season);
  const standingsByLeague = new Map<number, number[]>();

  for (const competition of competitions) {
    if (competition.type === 'league') {
      const res = await archiveLeague(db, saveId, competition, season);
      if (res) standingsByLeague.set(res.leagueId, res.orderedClubIds);
    } else if (competition.type === 'cup' || competition.type === 'continental') {
      await archiveKnockout(db, saveId, competition, season);
    }
    await archiveTopScorers(db, saveId, competition.id, season);
    await archiveTopAssisters(db, saveId, competition.id, season);
    await archiveMvpAndBreakthrough(db, saveId, competition, season);
  }

  // Record promotions: top-N of each lower league move up into its linked higher league.
  const leagues = await getAllLeagues(db);
  const pairs = buildDivisionPairs(leagues);
  for (const pair of pairs) {
    const lowerOrder = standingsByLeague.get(pair.lowerLeagueId);
    if (!lowerOrder) continue;
    const n = Math.min(pair.relegationSpots, pair.promotionSpots, lowerOrder.length);
    for (let i = 0; i < n; i++) {
      await insertPromotedIgnore(db, saveId, season, pair.higherLeagueId, lowerOrder[i], i + 1);
    }
  }
}
