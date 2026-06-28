import { z, ZodObject } from 'zod';
import { SaveGame, Difficulty } from '@/types';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';

// Só os campos consumidos por rowToSaveGame; .passthrough() deixa as demais colunas passarem.
// Booleanos/reputação são NOT NULL no schema, mas o cast anterior os tipava como number|null
// (e o código faz `=== 1` / `?? 50`) — mantém .nullable() por fidelidade.
const saveGameRowSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    current_season: z.number(),
    current_week: z.number(),
    player_club_id: z.number(),
    difficulty: z.string(),
    preseason_pending: z.number().nullable(),
    press_pending: z.number().nullable(),
    job_offers_pending: z.number().nullable(),
    unemployed: z.number().nullable(),
    manager_reputation: z.number().nullable(),
    onboarding_seen: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
type SaveGameRow = z.infer<typeof saveGameRowSchema>;

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'save_games', schema: saveGameRowSchema },
];

function rowToSaveGame(row: SaveGameRow): SaveGame {
  return {
    id: row.id,
    name: row.name,
    currentSeason: row.current_season,
    currentWeek: row.current_week,
    playerClubId: row.player_club_id,
    difficulty: row.difficulty as Difficulty,
    preseasonPending: row.preseason_pending === 1,
    pressPending: row.press_pending === 1,
    jobOffersPending: row.job_offers_pending === 1,
    unemployed: row.unemployed === 1,
    managerReputation: row.manager_reputation ?? 50,
    onboardingSeen: row.onboarding_seen === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateSaveInput {
  name: string;
  playerClubId: number;
  difficulty?: Difficulty;
  currentSeason?: number;
  currentWeek?: number;
}

export async function createSave(db: DbHandle, input: CreateSaveInput): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO save_games (name, current_season, current_week, player_club_id, difficulty, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.currentSeason ?? 1,
      input.currentWeek ?? 1,
      input.playerClubId,
      input.difficulty ?? 'normal',
      now,
      now,
    ) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function getAllSaves(db: DbHandle): Promise<SaveGame[]> {
  const rows = await db
    .prepare('SELECT * FROM save_games ORDER BY updated_at DESC')
    .all();
  return parseRows(saveGameRowSchema, rows, 'saves.getAllSaves').map(rowToSaveGame);
}

export async function getSaveById(db: DbHandle, saveId: number): Promise<SaveGame | null> {
  const row = await db
    .prepare('SELECT * FROM save_games WHERE id = ?')
    .get(saveId);
  const parsed = parseRow(saveGameRowSchema.nullable(), row, 'saves.getSaveById');
  return parsed ? rowToSaveGame(parsed) : null;
}

export async function updateSaveWeek(
  db: DbHandle,
  saveId: number,
  currentSeason: number,
  currentWeek: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    'UPDATE save_games SET current_season = ?, current_week = ?, updated_at = ? WHERE id = ?',
  ).run(currentSeason, currentWeek, now, saveId);
}

// Children before parents (clubs last) — but the clubs<->save_games FK cycle means no
// topological order satisfies FK-on. We disable FK for the wipe (PRAGMA can't change inside
// a transaction, so this runs un-transacted) and restore it after. In tests FK is already off.
const DELETE_BY_SAVE_TABLES = [
  'player_attributes', 'players', 'club_finances', 'competition_entries', 'fixtures', 'friendlies',
  'transfers', 'transfer_offers', 'transfer_blocks', 'tactics', 'staff', 'board_objectives',
  'board_trust_history', 'club_reputation_history', 'season_competition_results',
  'season_relegated', 'season_promoted', 'season_awards', 'season_player_titles', 'player_stats',
  'job_offers', 'achievements', 'competitions', 'assistants', 'clubs',
];

export async function deleteSave(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('PRAGMA foreign_keys = OFF').run();
  try {
    // owner-derived tables first (no own save_id): match_events via fixtures, tactic_* via tactics
    await db.prepare('DELETE FROM match_events WHERE fixture_id IN (SELECT id FROM fixtures WHERE save_id = ?)').run(saveId);
    await db.prepare('DELETE FROM tactic_positions WHERE tactic_id IN (SELECT id FROM tactics WHERE save_id = ?)').run(saveId);
    await db.prepare('DELETE FROM tactic_lineup WHERE tactic_id IN (SELECT id FROM tactics WHERE save_id = ?)').run(saveId);
    for (const t of DELETE_BY_SAVE_TABLES) {
      await db.prepare(`DELETE FROM ${t} WHERE save_id = ?`).run(saveId);
    }
    await db.prepare('DELETE FROM save_games WHERE id = ?').run(saveId);
  } finally {
    await db.prepare('PRAGMA foreign_keys = ON').run();
  }
}
