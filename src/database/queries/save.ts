import { DbHandle } from './players';

export async function markSaveEnded(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('UPDATE save_games SET ended = 1 WHERE id = ?').run(saveId);
}

export async function isSaveEnded(db: DbHandle, saveId: number): Promise<boolean> {
  const row = (await db
    .prepare('SELECT ended FROM save_games WHERE id = ?')
    .get(saveId)) as { ended: number } | undefined;
  return row?.ended === 1;
}
