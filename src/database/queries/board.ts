import { z, ZodObject } from 'zod';
import { BoardObjective, BoardObjectiveType, BoardTrustEntry, ReputationHistoryEntry, TrustOutcome } from '@/types/board';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';

// Só os campos consumidos no mapeamento; .passthrough() deixa save_id passar.
const reputationHistoryRowSchema = z
  .object({
    id: z.number(),
    club_id: z.number(),
    season: z.number(),
    reputation: z.number(),
    delta: z.number(),
  })
  .passthrough();
type ReputationHistoryRow = z.infer<typeof reputationHistoryRowSchema>;

const boardObjectiveRowSchema = z
  .object({
    id: z.number(),
    club_id: z.number(),
    season: z.number(),
    type: z.string(),
    target: z.number().nullable(),
    description: z.string(),
  })
  .passthrough();
type BoardObjectiveRow = z.infer<typeof boardObjectiveRowSchema>;

const boardTrustRowSchema = z
  .object({
    id: z.number(),
    club_id: z.number(),
    season: z.number(),
    trust: z.number(),
    outcome: z.string(),
  })
  .passthrough();
type BoardTrustRow = z.infer<typeof boardTrustRowSchema>;

// Projeção de coluna única de save_games: fica fora de __rowSchemas.
const saveBoardTrustRowSchema = z.object({ board_trust: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'club_reputation_history', schema: reputationHistoryRowSchema },
  { table: 'board_objectives', schema: boardObjectiveRowSchema },
  { table: 'board_trust_history', schema: boardTrustRowSchema },
];

// ─── Reputation history ───────────────────────────────────────────────────────

export async function insertReputationHistory(
  db: DbHandle,
  saveId: number,
  entry: Omit<ReputationHistoryEntry, 'id'>,
): Promise<void> {
  await db
    .prepare('INSERT INTO club_reputation_history (save_id, club_id, season, reputation, delta) VALUES (?, ?, ?, ?, ?)')
    .run(saveId, entry.clubId, entry.season, entry.reputation, entry.delta);
}

export async function getReputationHistory(db: DbHandle, saveId: number, clubId: number): Promise<ReputationHistoryEntry[]> {
  const rows = await db
    .prepare('SELECT * FROM club_reputation_history WHERE save_id = ? AND club_id = ? ORDER BY season DESC')
    .all(saveId, clubId);
  return parseRows(reputationHistoryRowSchema, rows, 'board.getReputationHistory').map((r) => ({
    id: r.id,
    clubId: r.club_id,
    season: r.season,
    reputation: r.reputation,
    delta: r.delta,
  }));
}

// ─── Board objectives ─────────────────────────────────────────────────────────

export async function upsertBoardObjective(
  db: DbHandle,
  saveId: number,
  obj: Omit<BoardObjective, 'id'>,
): Promise<void> {
  await db
    .prepare(
      'INSERT OR REPLACE INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(saveId, obj.clubId, obj.season, obj.type, obj.target ?? null, obj.description);
}

export async function getBoardObjective(
  db: DbHandle,
  saveId: number,
  clubId: number,
  season: number,
): Promise<BoardObjective | null> {
  const row = await db
    .prepare('SELECT * FROM board_objectives WHERE save_id = ? AND club_id = ? AND season = ?')
    .get(saveId, clubId, season);
  const parsed = parseRow(boardObjectiveRowSchema.nullable(), row, 'board.getBoardObjective');
  if (!parsed) return null;
  return {
    id: parsed.id,
    clubId: parsed.club_id,
    season: parsed.season,
    type: parsed.type as BoardObjectiveType,
    target: parsed.target,
    description: parsed.description,
  };
}

// ─── Trust history ────────────────────────────────────────────────────────────

export async function insertTrustHistory(
  db: DbHandle,
  saveId: number,
  entry: Omit<BoardTrustEntry, 'id'>,
): Promise<void> {
  await db
    .prepare('INSERT INTO board_trust_history (save_id, club_id, season, trust, outcome) VALUES (?, ?, ?, ?, ?)')
    .run(saveId, entry.clubId, entry.season, entry.trust, entry.outcome);
}

export async function getTrustHistory(db: DbHandle, saveId: number, clubId: number): Promise<BoardTrustEntry[]> {
  const rows = await db
    .prepare('SELECT * FROM board_trust_history WHERE save_id = ? AND club_id = ? ORDER BY season DESC')
    .all(saveId, clubId);
  return parseRows(boardTrustRowSchema, rows, 'board.getTrustHistory').map((r) => ({
    id: r.id,
    clubId: r.club_id,
    season: r.season,
    trust: r.trust,
    outcome: r.outcome as TrustOutcome,
  }));
}

// ─── Save game board trust ────────────────────────────────────────────────────

export async function getSaveBoardTrust(db: DbHandle, saveId: number): Promise<number> {
  const row = await db.prepare('SELECT board_trust FROM save_games WHERE id = ?').get(saveId);
  const parsed = parseRow(saveBoardTrustRowSchema.nullable(), row, 'board.getSaveBoardTrust');
  return parsed?.board_trust ?? 50;
}

export async function updateSaveBoardTrust(db: DbHandle, saveId: number, trust: number): Promise<void> {
  await db.prepare('UPDATE save_games SET board_trust = ? WHERE id = ?').run(trust, saveId);
}
