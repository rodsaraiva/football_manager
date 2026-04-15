import { SaveGame, Difficulty } from '@/types';
import { DbHandle } from './players';

interface SaveGameRow {
  id: number;
  name: string;
  current_season: number;
  current_week: number;
  player_club_id: number;
  difficulty: string;
  created_at: string;
  updated_at: string;
}

function rowToSaveGame(row: SaveGameRow): SaveGame {
  return {
    id: row.id,
    name: row.name,
    currentSeason: row.current_season,
    currentWeek: row.current_week,
    playerClubId: row.player_club_id,
    difficulty: row.difficulty as Difficulty,
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
    .all() as SaveGameRow[];
  return rows.map(rowToSaveGame);
}

export async function getSaveById(db: DbHandle, saveId: number): Promise<SaveGame | null> {
  const row = await db
    .prepare('SELECT * FROM save_games WHERE id = ?')
    .get(saveId) as SaveGameRow | undefined;
  return row ? rowToSaveGame(row) : null;
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

export async function deleteSave(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('DELETE FROM save_games WHERE id = ?').run(saveId);
}
