import { DbHandle } from './players';
import { Legend, ClubRecord, ClubRecordType, Rivalry, RivalryOrigin, ManagerCareerEntry, ManagerExitReason } from '@/types/legacy';
import { HeadToHead } from '@/engine/legacy/rivalry-engine';

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
  const rows = (await db.prepare(
    `SELECT season, club_id, division_level, league_position, total_teams, trophies, manager_reputation, exit_reason
     FROM manager_career WHERE save_id = ? ORDER BY season ASC`,
  ).all(saveId)) as Array<{
    season: number; club_id: number; division_level: number; league_position: number | null;
    total_teams: number; trophies: number; manager_reputation: number; exit_reason: ManagerExitReason;
  }>;
  return rows.map((r) => ({
    season: r.season, clubId: r.club_id, divisionLevel: r.division_level,
    leaguePosition: r.league_position, totalTeams: r.total_teams, trophies: r.trophies,
    managerReputation: r.manager_reputation, exitReason: r.exit_reason,
  }));
}

export async function upsertRivalry(db: DbHandle, saveId: number, r: Rivalry): Promise<void> {
  const a = Math.min(r.clubAId, r.clubBId), b = Math.max(r.clubAId, r.clubBId);
  await db.prepare(
    `INSERT OR REPLACE INTO rivalries (save_id, club_a_id, club_b_id, intensity, origin) VALUES (?, ?, ?, ?, ?)`,
  ).run(saveId, a, b, r.intensity, r.origin);
}

function mapRivalry(row: { club_a_id: number; club_b_id: number; intensity: number; origin: RivalryOrigin }): Rivalry {
  return { clubAId: row.club_a_id, clubBId: row.club_b_id, intensity: row.intensity, origin: row.origin };
}

export async function getRivalry(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<Rivalry | null> {
  const a = Math.min(clubAId, clubBId), b = Math.max(clubAId, clubBId);
  const row = (await db.prepare(
    'SELECT club_a_id, club_b_id, intensity, origin FROM rivalries WHERE save_id = ? AND club_a_id = ? AND club_b_id = ?',
  ).get(saveId, a, b)) as { club_a_id: number; club_b_id: number; intensity: number; origin: RivalryOrigin } | undefined;
  return row ? mapRivalry(row) : null;
}

export async function getRivalries(db: DbHandle, saveId: number, clubId: number): Promise<Rivalry[]> {
  const rows = (await db.prepare(
    `SELECT club_a_id, club_b_id, intensity, origin FROM rivalries
     WHERE save_id = ? AND (club_a_id = ? OR club_b_id = ?) ORDER BY intensity DESC, club_a_id ASC, club_b_id ASC`,
  ).all(saveId, clubId, clubId)) as Array<{ club_a_id: number; club_b_id: number; intensity: number; origin: RivalryOrigin }>;
  return rows.map(mapRivalry);
}

export async function getHeadToHead(db: DbHandle, saveId: number, clubAId: number, clubBId: number): Promise<HeadToHead> {
  const a = Math.min(clubAId, clubBId), b = Math.max(clubAId, clubBId);
  const meet = (await db.prepare(
    `SELECT COUNT(*) AS c FROM fixtures WHERE save_id = ? AND played = 1
       AND ((home_club_id = ? AND away_club_id = ?) OR (home_club_id = ? AND away_club_id = ?))`,
  ).get(saveId, a, b, b, a)) as { c: number };
  const deciders = (await db.prepare(
    `SELECT COUNT(*) AS c FROM season_competition_results
     WHERE save_id = ? AND ((champion_club_id = ? AND runner_up_club_id = ?) OR (champion_club_id = ? AND runner_up_club_id = ?))`,
  ).get(saveId, a, b, b, a)) as { c: number };
  return { clubAId: a, clubBId: b, meetings: meet.c, finals: deciders.c, titleDeciders: deciders.c };
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
  const rows = (await db.prepare(
    `SELECT player_id, club_id, legend_score, appearances, goals, trophies, individual_awards, first_season, last_season
     FROM club_legends WHERE save_id = ? AND club_id = ? ORDER BY legend_score DESC, player_id ASC`,
  ).all(saveId, clubId)) as Array<{
    player_id: number; club_id: number; legend_score: number; appearances: number; goals: number;
    trophies: number; individual_awards: number; first_season: number; last_season: number;
  }>;
  return rows.map((r) => ({
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
  const rows = (await db.prepare(
    'SELECT record_type, club_id, value, holder_id, season, fixture_ref, detail FROM club_records WHERE save_id = ? AND club_id = ? ORDER BY record_type ASC',
  ).all(saveId, clubId)) as Array<{
    record_type: ClubRecordType; club_id: number; value: number;
    holder_id: number | null; season: number | null; fixture_ref: number | null; detail: string;
  }>;
  return rows.map((r) => ({
    type: r.record_type, clubId: r.club_id, value: r.value,
    holderId: r.holder_id, season: r.season, fixtureRef: r.fixture_ref, detail: r.detail,
  }));
}
