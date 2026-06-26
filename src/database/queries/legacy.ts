import { z, ZodObject } from 'zod';
import { DbHandle } from './players';
import { Legend, ClubRecord, ClubRecordType, Rivalry, RivalryOrigin, ManagerCareerEntry, ManagerExitReason } from '@/types/legacy';
import { HeadToHead } from '@/engine/legacy/rivalry-engine';
import { parseRows, parseRow } from '../parse-rows';

// Só os campos consumidos por cada mapper; .passthrough() deixa id/save_id passarem.
// league_position é nullable no schema; exit_reason é TEXT NOT NULL (sem CHECK) → z.string().
const managerCareerRowSchema = z
  .object({
    season: z.number(),
    club_id: z.number(),
    division_level: z.number(),
    league_position: z.number().nullable(),
    total_teams: z.number(),
    trophies: z.number(),
    manager_reputation: z.number(),
    exit_reason: z.string(),
  })
  .passthrough();

// origin é TEXT NOT NULL (sem CHECK) → z.string().
const rivalryRowSchema = z
  .object({
    club_a_id: z.number(),
    club_b_id: z.number(),
    intensity: z.number(),
    origin: z.string(),
  })
  .passthrough();
type RivalryRow = z.infer<typeof rivalryRowSchema>;

const playerNameRowSchema = z.object({ id: z.number(), name: z.string() }).passthrough();
const clubNameRowSchema = z.object({ id: z.number(), name: z.string() }).passthrough();

const clubLegendRowSchema = z
  .object({
    player_id: z.number(),
    club_id: z.number(),
    legend_score: z.number(),
    appearances: z.number(),
    goals: z.number(),
    trophies: z.number(),
    individual_awards: z.number(),
    first_season: z.number(),
    last_season: z.number(),
  })
  .passthrough();

// record_type/detail são TEXT NOT NULL; holder_id/season/fixture_ref são nullable no schema.
const clubRecordRowSchema = z
  .object({
    record_type: z.string(),
    club_id: z.number(),
    value: z.number(),
    holder_id: z.number().nullable(),
    season: z.number().nullable(),
    fixture_ref: z.number().nullable(),
    detail: z.string(),
  })
  .passthrough();

// COUNT(*) AS c é projeção agregada, não linha de tabela → fora de __rowSchemas.
const countRowSchema = z.object({ c: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'manager_career', schema: managerCareerRowSchema },
  { table: 'rivalries', schema: rivalryRowSchema },
  { table: 'players', schema: playerNameRowSchema },
  { table: 'clubs', schema: clubNameRowSchema },
  { table: 'club_legends', schema: clubLegendRowSchema },
  { table: 'club_records', schema: clubRecordRowSchema },
];

export async function upsertManagerCareerEntry(db: DbHandle, saveId: number, e: ManagerCareerEntry): Promise<void> {
  await db.prepare(
    `INSERT OR REPLACE INTO manager_career
       (save_id, season, club_id, division_level, league_position, total_teams, trophies, manager_reputation, exit_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(saveId, e.season, e.clubId, e.divisionLevel, e.leaguePosition, e.totalTeams, e.trophies, e.managerReputation, e.exitReason);
}

export async function setManagerExitReason(db: DbHandle, saveId: number, season: number, reason: ManagerExitReason): Promise<void> {
  await db.prepare('UPDATE manager_career SET exit_reason = ? WHERE save_id = ? AND season = ?').run(reason, saveId, season);
}

export async function getManagerCareer(db: DbHandle, saveId: number): Promise<ManagerCareerEntry[]> {
  const rows = await db.prepare(
    `SELECT season, club_id, division_level, league_position, total_teams, trophies, manager_reputation, exit_reason
     FROM manager_career WHERE save_id = ? ORDER BY season ASC`,
  ).all(saveId);
  return parseRows(managerCareerRowSchema, rows, 'legacy.getManagerCareer').map((r) => ({
    season: r.season, clubId: r.club_id, divisionLevel: r.division_level,
    leaguePosition: r.league_position, totalTeams: r.total_teams, trophies: r.trophies,
    managerReputation: r.manager_reputation, exitReason: r.exit_reason as ManagerExitReason,
  }));
}

export async function upsertRivalry(db: DbHandle, saveId: number, r: Rivalry): Promise<void> {
  const a = Math.min(r.clubAId, r.clubBId), b = Math.max(r.clubAId, r.clubBId);
  await db.prepare(
    `INSERT OR REPLACE INTO rivalries (save_id, club_a_id, club_b_id, intensity, origin) VALUES (?, ?, ?, ?, ?)`,
  ).run(saveId, a, b, r.intensity, r.origin);
}

function mapRivalry(row: RivalryRow): Rivalry {
  return { clubAId: row.club_a_id, clubBId: row.club_b_id, intensity: row.intensity, origin: row.origin as RivalryOrigin };
}

export async function getRivalry(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<Rivalry | null> {
  const a = Math.min(clubAId, clubBId), b = Math.max(clubAId, clubBId);
  const row = await db.prepare(
    'SELECT club_a_id, club_b_id, intensity, origin FROM rivalries WHERE save_id = ? AND club_a_id = ? AND club_b_id = ?',
  ).get(saveId, a, b);
  const parsed = parseRow(rivalryRowSchema.nullable(), row, 'legacy.getRivalry');
  return parsed ? mapRivalry(parsed) : null;
}

export async function getRivalries(db: DbHandle, saveId: number, clubId: number): Promise<Rivalry[]> {
  const rows = await db.prepare(
    `SELECT club_a_id, club_b_id, intensity, origin FROM rivalries
     WHERE save_id = ? AND (club_a_id = ? OR club_b_id = ?) ORDER BY intensity DESC, club_a_id ASC, club_b_id ASC`,
  ).all(saveId, clubId, clubId);
  return parseRows(rivalryRowSchema, rows, 'legacy.getRivalries').map(mapRivalry);
}

export async function getHeadToHead(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<HeadToHead> {
  const a = Math.min(clubAId, clubBId), b = Math.max(clubAId, clubBId);
  const meetRow = await db.prepare(
    `SELECT COUNT(*) AS c FROM fixtures WHERE save_id = ? AND played = 1
       AND ((home_club_id = ? AND away_club_id = ?) OR (home_club_id = ? AND away_club_id = ?))`,
  ).get(saveId, a, b, b, a);
  const meet = parseRow(countRowSchema, meetRow, 'legacy.getHeadToHead.meetings');
  const decidersRow = await db.prepare(
    `SELECT COUNT(*) AS c FROM season_competition_results
     WHERE save_id = ? AND ((champion_club_id = ? AND runner_up_club_id = ?) OR (champion_club_id = ? AND runner_up_club_id = ?))`,
  ).get(saveId, a, b, b, a);
  const deciders = parseRow(countRowSchema, decidersRow, 'legacy.getHeadToHead.deciders');
  return { clubAId: a, clubBId: b, meetings: meet.c, finals: deciders.c, titleDeciders: deciders.c };
}

// Bulk name lookups for the legacy screens (avoids N+1 getPlayerById calls).
export async function getPlayerNameMap(db: DbHandle, saveId: number, ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)].filter((id) => id != null);
  if (unique.length === 0) return new Map();
  const placeholders = unique.map(() => '?').join(',');
  const rows = await db.prepare(
    `SELECT id, name FROM players WHERE save_id = ? AND id IN (${placeholders})`,
  ).all(saveId, ...unique);
  return new Map(parseRows(playerNameRowSchema, rows, 'legacy.getPlayerNameMap').map((r) => [r.id, r.name]));
}

export async function getClubNameMap(db: DbHandle, saveId: number): Promise<Map<number, string>> {
  const rows = await db.prepare(
    'SELECT id, name FROM clubs WHERE save_id = ?',
  ).all(saveId);
  return new Map(parseRows(clubNameRowSchema, rows, 'legacy.getClubNameMap').map((r) => [r.id, r.name]));
}

export async function replaceClubLegends(db: DbHandle, saveId: number, clubId: number, legends: Legend[]): Promise<void> {
  await db.prepare('DELETE FROM club_legends WHERE save_id = ? AND club_id = ?').run(saveId, clubId);
  for (const l of legends) {
    await db.prepare(
      `INSERT INTO club_legends
         (save_id, club_id, player_id, legend_score, appearances, goals, trophies, individual_awards, first_season, last_season)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(saveId, clubId, l.playerId, l.legendScore, l.appearances, l.goals, l.trophies, l.individualAwards, l.firstSeason, l.lastSeason);
  }
}

export async function getClubLegends(db: DbHandle, saveId: number, clubId: number): Promise<Legend[]> {
  const rows = await db.prepare(
    `SELECT player_id, club_id, legend_score, appearances, goals, trophies, individual_awards, first_season, last_season
     FROM club_legends WHERE save_id = ? AND club_id = ? ORDER BY legend_score DESC, player_id ASC`,
  ).all(saveId, clubId);
  return parseRows(clubLegendRowSchema, rows, 'legacy.getClubLegends').map((r) => ({
    playerId: r.player_id, clubId: r.club_id, legendScore: r.legend_score,
    appearances: r.appearances, goals: r.goals, trophies: r.trophies,
    individualAwards: r.individual_awards, firstSeason: r.first_season, lastSeason: r.last_season,
  }));
}

export async function replaceClubRecords(db: DbHandle, saveId: number, clubId: number, records: ClubRecord[]): Promise<void> {
  await db.prepare('DELETE FROM club_records WHERE save_id = ? AND club_id = ?').run(saveId, clubId);
  for (const r of records) {
    await db.prepare(
      `INSERT INTO club_records (save_id, club_id, record_type, value, holder_id, season, fixture_ref, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(saveId, clubId, r.type, r.value, r.holderId, r.season, r.fixtureRef, r.detail);
  }
}

export async function getClubRecords(db: DbHandle, saveId: number, clubId: number): Promise<ClubRecord[]> {
  const rows = await db.prepare(
    'SELECT record_type, club_id, value, holder_id, season, fixture_ref, detail FROM club_records WHERE save_id = ? AND club_id = ? ORDER BY record_type ASC',
  ).all(saveId, clubId);
  return parseRows(clubRecordRowSchema, rows, 'legacy.getClubRecords').map((r) => ({
    type: r.record_type as ClubRecordType, clubId: r.club_id, value: r.value,
    holderId: r.holder_id, season: r.season, fixtureRef: r.fixture_ref, detail: r.detail,
  }));
}
