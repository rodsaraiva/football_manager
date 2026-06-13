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

export async function setPreseasonPending(db: DbHandle, saveId: number, pending: boolean): Promise<void> {
  await db.prepare('UPDATE save_games SET preseason_pending = ? WHERE id = ?').run(pending ? 1 : 0, saveId);
}

export async function isPreseasonPending(db: DbHandle, saveId: number): Promise<boolean> {
  const row = (await db
    .prepare('SELECT preseason_pending FROM save_games WHERE id = ?')
    .get(saveId)) as { preseason_pending: number } | undefined;
  return row?.preseason_pending === 1;
}

export async function setPressPending(db: DbHandle, saveId: number, pending: boolean): Promise<void> {
  await db.prepare('UPDATE save_games SET press_pending = ? WHERE id = ?').run(pending ? 1 : 0, saveId);
}

export async function isPressPending(db: DbHandle, saveId: number): Promise<boolean> {
  const row = (await db
    .prepare('SELECT press_pending FROM save_games WHERE id = ?')
    .get(saveId)) as { press_pending: number } | undefined;
  return row?.press_pending === 1;
}
