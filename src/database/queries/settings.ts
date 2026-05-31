import { DbHandle } from './players';

export async function getSetting(db: DbHandle, key: string): Promise<string | null> {
  const row = (await db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key)) as { value: string } | undefined;
  return row?.value ?? null;
}

export async function setSetting(db: DbHandle, key: string, value: string): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    .run(key, value);
}
