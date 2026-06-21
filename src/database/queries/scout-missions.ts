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

interface ScoutMissionRow {
  id: number;
  scout_id: number;
  type: MissionType;
  target_player_id: number | null;
  target_club_id: number | null;
  region_code: string | null;
  weeks_elapsed: number;
  status: 'active' | 'completed' | 'expired';
}

function toDto(r: ScoutMissionRow): ScoutMissionDto {
  return {
    id: r.id,
    scoutId: r.scout_id,
    type: r.type,
    targetPlayerId: r.target_player_id,
    targetClubId: r.target_club_id,
    regionCode: r.region_code,
    weeksElapsed: r.weeks_elapsed,
    status: r.status,
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
  const rows = (await db
    .prepare(`SELECT * FROM scout_missions WHERE save_id = ? AND status = 'active'`)
    .all(saveId)) as ScoutMissionRow[];
  return rows.map(toDto);
}

export async function getMissionsByScout(
  db: DbHandle,
  saveId: number,
  scoutId: number,
): Promise<ScoutMissionDto[]> {
  const rows = (await db
    .prepare(`SELECT * FROM scout_missions WHERE save_id = ? AND scout_id = ? AND status = 'active'`)
    .all(saveId, scoutId)) as ScoutMissionRow[];
  return rows.map(toDto);
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
  const row = (await db
    .prepare(
      `SELECT 1 AS one FROM scout_missions
        WHERE save_id = ? AND type = 'opponent_intel' AND target_club_id = ? AND status = 'completed'
        LIMIT 1`,
    )
    .get(saveId, clubId)) as { one: number } | undefined;
  return row !== undefined;
}
