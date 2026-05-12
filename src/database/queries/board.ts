import { BoardObjective, BoardObjectiveType, BoardTrustEntry, ReputationHistoryEntry, TrustOutcome } from '@/types/board';
import { DbHandle } from './players';

interface ReputationHistoryRow {
  id: number;
  club_id: number;
  season: number;
  reputation: number;
  delta: number;
}

interface BoardObjectiveRow {
  id: number;
  club_id: number;
  season: number;
  type: string;
  target: number | null;
  description: string;
}

interface BoardTrustRow {
  id: number;
  club_id: number;
  season: number;
  trust: number;
  outcome: string;
}

// ─── Reputation history ───────────────────────────────────────────────────────

export async function insertReputationHistory(
  db: DbHandle,
  entry: Omit<ReputationHistoryEntry, 'id'>,
): Promise<void> {
  await db
    .prepare('INSERT INTO club_reputation_history (club_id, season, reputation, delta) VALUES (?, ?, ?, ?)')
    .run(entry.clubId, entry.season, entry.reputation, entry.delta);
}

export async function getReputationHistory(db: DbHandle, clubId: number): Promise<ReputationHistoryEntry[]> {
  const rows = (await db
    .prepare('SELECT * FROM club_reputation_history WHERE club_id = ? ORDER BY season DESC')
    .all(clubId)) as ReputationHistoryRow[];
  return rows.map((r) => ({ id: r.id, clubId: r.club_id, season: r.season, reputation: r.reputation, delta: r.delta }));
}

// ─── Board objectives ─────────────────────────────────────────────────────────

export async function upsertBoardObjective(
  db: DbHandle,
  obj: Omit<BoardObjective, 'id'>,
): Promise<void> {
  await db
    .prepare(
      'INSERT OR REPLACE INTO board_objectives (club_id, season, type, target, description) VALUES (?, ?, ?, ?, ?)',
    )
    .run(obj.clubId, obj.season, obj.type, obj.target ?? null, obj.description);
}

export async function getBoardObjective(
  db: DbHandle,
  clubId: number,
  season: number,
): Promise<BoardObjective | null> {
  const row = (await db
    .prepare('SELECT * FROM board_objectives WHERE club_id = ? AND season = ?')
    .get(clubId, season)) as BoardObjectiveRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    clubId: row.club_id,
    season: row.season,
    type: row.type as BoardObjectiveType,
    target: row.target,
    description: row.description,
  };
}

// ─── Trust history ────────────────────────────────────────────────────────────

export async function insertTrustHistory(
  db: DbHandle,
  entry: Omit<BoardTrustEntry, 'id'>,
): Promise<void> {
  await db
    .prepare('INSERT INTO board_trust_history (club_id, season, trust, outcome) VALUES (?, ?, ?, ?)')
    .run(entry.clubId, entry.season, entry.trust, entry.outcome);
}

export async function getTrustHistory(db: DbHandle, clubId: number): Promise<BoardTrustEntry[]> {
  const rows = (await db
    .prepare('SELECT * FROM board_trust_history WHERE club_id = ? ORDER BY season DESC')
    .all(clubId)) as BoardTrustRow[];
  return rows.map((r) => ({
    id: r.id,
    clubId: r.club_id,
    season: r.season,
    trust: r.trust,
    outcome: r.outcome as TrustOutcome,
  }));
}

// ─── Save game board trust ────────────────────────────────────────────────────

export async function getSaveBoardTrust(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db
    .prepare('SELECT board_trust FROM save_games WHERE id = ?')
    .get(saveId)) as { board_trust: number } | undefined;
  return row?.board_trust ?? 50;
}

export async function updateSaveBoardTrust(db: DbHandle, saveId: number, trust: number): Promise<void> {
  await db.prepare('UPDATE save_games SET board_trust = ? WHERE id = ?').run(trust, saveId);
}
