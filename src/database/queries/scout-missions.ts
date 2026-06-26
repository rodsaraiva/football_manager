import { z, ZodObject } from 'zod';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';
import type { MissionType } from '@/engine/scouting/scout-missions';

export interface ScoutMissionDto {
  id: number;
  scoutId: number;
  type: MissionType;
  targetPlayerId: number | null;
  targetClubId: number | null;
  regionCode: string | null;
  weeksElapsed: number;
  status: 'active' | 'completed' | 'expired';
}

// Campos consumidos por toDto; .passthrough() deixa save_id/created_* passarem.
const scoutMissionRowSchema = z
  .object({
    id: z.number(),
    scout_id: z.number(),
    type: z.string(),
    target_player_id: z.number().nullable(),
    target_club_id: z.number().nullable(),
    region_code: z.string().nullable(),
    weeks_elapsed: z.number(),
    status: z.string(),
  })
  .passthrough();
type ScoutMissionRow = z.infer<typeof scoutMissionRowSchema>;

// COUNT(*): projeção, não é linha de tabela — fora de __rowSchemas.
const intelCountRowSchema = z.object({ n: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'scout_missions', schema: scoutMissionRowSchema },
];

function toDto(r: ScoutMissionRow): ScoutMissionDto {
  return {
    id: r.id,
    scoutId: r.scout_id,
    type: r.type as MissionType,
    targetPlayerId: r.target_player_id,
    targetClubId: r.target_club_id,
    regionCode: r.region_code,
    weeksElapsed: r.weeks_elapsed,
    status: r.status as ScoutMissionDto['status'],
  };
}

export async function createMission(
  db: DbHandle,
  saveId: number,
  input: {
    scoutId: number;
    type: MissionType;
    targetPlayerId: number | null;
    targetClubId: number | null;
    regionCode: string | null;
    createdSeason: number;
    createdWeek: number;
  },
): Promise<number> {
  const res = (await db
    .prepare(
      `INSERT INTO scout_missions
         (save_id, scout_id, type, target_player_id, target_club_id, region_code,
          weeks_elapsed, status, created_season, created_week)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
    )
    .run(
      saveId,
      input.scoutId,
      input.type,
      input.targetPlayerId,
      input.targetClubId,
      input.regionCode,
      input.createdSeason,
      input.createdWeek,
    )) as { lastInsertRowid: number | bigint };
  return Number(res.lastInsertRowid);
}

export async function getActiveMissions(db: DbHandle, saveId: number): Promise<ScoutMissionDto[]> {
  const rows = await db
    .prepare(`SELECT * FROM scout_missions WHERE save_id = ? AND status = 'active'`)
    .all(saveId);
  return parseRows(scoutMissionRowSchema, rows, 'scout-missions.getActiveMissions').map(toDto);
}

export async function getMissionsByScout(
  db: DbHandle,
  saveId: number,
  scoutId: number,
): Promise<ScoutMissionDto[]> {
  const rows = await db
    .prepare(`SELECT * FROM scout_missions WHERE save_id = ? AND scout_id = ? AND status = 'active'`)
    .all(saveId, scoutId);
  return parseRows(scoutMissionRowSchema, rows, 'scout-missions.getMissionsByScout').map(toDto);
}

export async function setMissionWeeks(
  db: DbHandle,
  saveId: number,
  missionId: number,
  weeksElapsed: number,
): Promise<void> {
  await db
    .prepare('UPDATE scout_missions SET weeks_elapsed = ? WHERE save_id = ? AND id = ?')
    .run(weeksElapsed, saveId, missionId);
}

export async function completeMission(
  db: DbHandle,
  saveId: number,
  missionId: number,
  status: 'completed' | 'expired',
): Promise<void> {
  await db
    .prepare('UPDATE scout_missions SET status = ? WHERE save_id = ? AND id = ?')
    .run(status, saveId, missionId);
}

export async function cancelMission(db: DbHandle, saveId: number, missionId: number): Promise<void> {
  await completeMission(db, saveId, missionId, 'expired');
}

export async function getCompletedIntelForClub(
  db: DbHandle,
  saveId: number,
  clubId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM scout_missions
        WHERE save_id = ? AND type = 'opponent_intel' AND target_club_id = ? AND status = 'completed'`,
    )
    .get(saveId, clubId);
  const parsed = row ? parseRow(intelCountRowSchema, row, 'scout-missions.getCompletedIntelForClub') : null;
  return (parsed?.n ?? 0) > 0;
}
