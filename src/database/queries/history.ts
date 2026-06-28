import { z, ZodObject } from 'zod';
import { parseRows } from '../parse-rows';
import { DbHandle } from './players';

export interface SeasonAward {
  season: number;
  competitionId: number;
  competitionName?: string;
  awardType: 'top_scorer' | 'top_assister' | 'mvp' | 'breakthrough';
  rank: number;
  playerId: number;
  clubId: number;
  value: number;
}

export interface SeasonRelegated {
  clubId: number;
  finalPosition: number;
}

export interface SeasonCompetitionSummary {
  season: number;
  competitionId: number;
  competitionName: string;
  championClubId: number;
  runnerUpClubId: number | null;
  relegated: SeasonRelegated[];
  topScorers: SeasonAward[];
  topAssisters: SeasonAward[];
  mvp: SeasonAward | null;
  breakthrough: SeasonAward | null;
}

export interface CompetitionHistoryEntry {
  season: number;
  competitionId: number;
  championClubId: number;
  runnerUpClubId: number | null;
}

export interface ClubTrophySummary {
  competitionId: number;
  competitionName: string;
  titles: number;
  runnerUps: number;
  titleYears: number[];
  runnerUpYears: number[];
}

export interface PlayerTitle {
  season: number;
  competitionId: number;
  competitionName: string;
  clubId: number;
}

// Projeção: competition_name vem do JOIN com competitions — fora de __rowSchemas.
const resultRowSchema = z
  .object({
    season: z.number(),
    competition_id: z.number(),
    competition_name: z.string().nullable(),
    champion_club_id: z.number(),
    runner_up_club_id: z.number().nullable(),
  })
  .passthrough();

// Linha pura de season_relegated.
const relegatedRowSchema = z
  .object({
    season: z.number(),
    league_id: z.number(),
    club_id: z.number(),
    final_position: z.number(),
  })
  .passthrough();

// Projeção: competition_name vem do JOIN. award_type tem CHECK no SQL → z.enum fiel.
const awardRowSchema = z
  .object({
    season: z.number(),
    competition_id: z.number(),
    competition_name: z.string().nullable(),
    award_type: z.enum(['top_scorer', 'top_assister', 'mvp', 'breakthrough']),
    rank: z.number(),
    player_id: z.number(),
    club_id: z.number(),
    value: z.number(),
  })
  .passthrough();
type AwardRow = z.infer<typeof awardRowSchema>;

// Linha pura de season_competition_results (sem JOIN).
const competitionResultRowSchema = z
  .object({
    season: z.number(),
    competition_id: z.number(),
    champion_club_id: z.number(),
    runner_up_club_id: z.number().nullable(),
  })
  .passthrough();

// Projeção: competition_name vem do JOIN.
const clubTrophyRowSchema = z
  .object({
    competition_id: z.number(),
    competition_name: z.string().nullable(),
    season: z.number(),
    champion_club_id: z.number(),
    runner_up_club_id: z.number().nullable(),
  })
  .passthrough();

// Projeção: competition_name vem do JOIN.
const playerTitleRowSchema = z
  .object({
    season: z.number(),
    competition_id: z.number(),
    competition_name: z.string().nullable(),
    club_id: z.number(),
    player_id: z.number(),
  })
  .passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'season_relegated', schema: relegatedRowSchema },
  { table: 'season_competition_results', schema: competitionResultRowSchema },
];

function mapAward(row: AwardRow): SeasonAward {
  return {
    season: row.season,
    competitionId: row.competition_id,
    competitionName: row.competition_name ?? undefined,
    awardType: row.award_type,
    rank: row.rank,
    playerId: row.player_id,
    clubId: row.club_id,
    value: row.value,
  };
}

export async function getSeasonSummary(
  db: DbHandle,
  saveId: number,
  season: number,
): Promise<SeasonCompetitionSummary[]> {
  const resultsRows = await db
    .prepare(
      `SELECT r.season, r.competition_id, c.name AS competition_name,
              r.champion_club_id, r.runner_up_club_id
       FROM season_competition_results r
       LEFT JOIN competitions c ON c.id = r.competition_id
       WHERE r.save_id = ? AND r.season = ?
       ORDER BY r.competition_id ASC`,
    )
    .all(saveId, season);
  const results = parseRows(resultRowSchema, resultsRows, 'history.getSeasonSummary.results');

  const awardsRows = await db
    .prepare(
      `SELECT a.season, a.competition_id, c.name AS competition_name,
              a.award_type, a.rank, a.player_id, a.club_id, a.value
       FROM season_awards a
       LEFT JOIN competitions c ON c.id = a.competition_id
       WHERE a.save_id = ? AND a.season = ?
       ORDER BY a.competition_id ASC, a.award_type ASC, a.rank ASC`,
    )
    .all(saveId, season);
  const awards = parseRows(awardRowSchema, awardsRows, 'history.getSeasonSummary.awards');

  const relegatedRows = await db
    .prepare(
      `SELECT season, league_id, club_id, final_position
       FROM season_relegated
       WHERE save_id = ? AND season = ?
       ORDER BY final_position ASC`,
    )
    .all(saveId, season);
  const relegated = parseRows(relegatedRowSchema, relegatedRows, 'history.getSeasonSummary.relegated');

  return results.map((r) => {
    const compAwards = awards.filter((a) => a.competition_id === r.competition_id);
    const mvp = compAwards.find((a) => a.award_type === 'mvp');
    const bt = compAwards.find((a) => a.award_type === 'breakthrough');
    return {
      season: r.season,
      competitionId: r.competition_id,
      competitionName: r.competition_name ?? '',
      championClubId: r.champion_club_id,
      runnerUpClubId: r.runner_up_club_id,
      relegated: relegated
        .filter((rel) => rel.season === r.season)
        .map((rel) => ({ clubId: rel.club_id, finalPosition: rel.final_position })),
      topScorers: compAwards.filter((a) => a.award_type === 'top_scorer').map(mapAward),
      topAssisters: compAwards.filter((a) => a.award_type === 'top_assister').map(mapAward),
      mvp: mvp ? mapAward(mvp) : null,
      breakthrough: bt ? mapAward(bt) : null,
    };
  });
}

export async function getCompetitionHistory(
  db: DbHandle,
  saveId: number,
  competitionId: number,
): Promise<CompetitionHistoryEntry[]> {
  const rawRows = await db
    .prepare(
      `SELECT season, competition_id, champion_club_id, runner_up_club_id
       FROM season_competition_results
       WHERE save_id = ? AND competition_id = ?
       ORDER BY season ASC`,
    )
    .all(saveId, competitionId);
  const rows = parseRows(competitionResultRowSchema, rawRows, 'history.getCompetitionHistory');
  return rows.map((r) => ({
    season: r.season,
    competitionId: r.competition_id,
    championClubId: r.champion_club_id,
    runnerUpClubId: r.runner_up_club_id,
  }));
}

export async function getClubTrophies(
  db: DbHandle,
  saveId: number,
  clubId: number,
): Promise<ClubTrophySummary[]> {
  const rawRows = await db
    .prepare(
      `SELECT r.competition_id, c.name AS competition_name, r.season,
              r.champion_club_id, r.runner_up_club_id
       FROM season_competition_results r
       LEFT JOIN competitions c ON c.id = r.competition_id
       WHERE r.save_id = ? AND (r.champion_club_id = ? OR r.runner_up_club_id = ?)
       ORDER BY r.competition_id ASC, r.season ASC`,
    )
    .all(saveId, clubId, clubId);
  const rows = parseRows(clubTrophyRowSchema, rawRows, 'history.getClubTrophies');

  const byComp = new Map<number, ClubTrophySummary>();
  for (const r of rows) {
    let entry = byComp.get(r.competition_id);
    if (!entry) {
      entry = {
        competitionId: r.competition_id,
        competitionName: r.competition_name ?? '',
        titles: 0,
        runnerUps: 0,
        titleYears: [],
        runnerUpYears: [],
      };
      byComp.set(r.competition_id, entry);
    }
    if (r.champion_club_id === clubId) {
      entry.titles += 1;
      entry.titleYears.push(r.season);
    }
    if (r.runner_up_club_id === clubId) {
      entry.runnerUps += 1;
      entry.runnerUpYears.push(r.season);
    }
  }
  return [...byComp.values()];
}

export async function getPlayerAwards(
  db: DbHandle,
  saveId: number,
  playerId: number,
): Promise<SeasonAward[]> {
  const rawRows = await db
    .prepare(
      `SELECT a.season, a.competition_id, c.name AS competition_name,
              a.award_type, a.rank, a.player_id, a.club_id, a.value
       FROM season_awards a
       LEFT JOIN competitions c ON c.id = a.competition_id
       WHERE a.save_id = ? AND a.player_id = ?
       ORDER BY a.season ASC, a.competition_id ASC, a.award_type ASC, a.rank ASC`,
    )
    .all(saveId, playerId);
  const rows = parseRows(awardRowSchema, rawRows, 'history.getPlayerAwards');
  return rows.map(mapAward);
}

export async function getPlayerTitles(
  db: DbHandle,
  saveId: number,
  playerId: number,
): Promise<PlayerTitle[]> {
  const rawRows = await db
    .prepare(
      `SELECT t.season, t.competition_id, c.name AS competition_name, t.club_id, t.player_id
       FROM season_player_titles t
       LEFT JOIN competitions c ON c.id = t.competition_id
       WHERE t.save_id = ? AND t.player_id = ?
       ORDER BY t.season ASC, t.competition_id ASC`,
    )
    .all(saveId, playerId);
  const rows = parseRows(playerTitleRowSchema, rawRows, 'history.getPlayerTitles');
  return rows.map((r) => ({
    season: r.season,
    competitionId: r.competition_id,
    competitionName: r.competition_name ?? '',
    clubId: r.club_id,
  }));
}
