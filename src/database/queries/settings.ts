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

const HINT_PREFIX = 'hint_seen_';

export async function isHintSeen(db: DbHandle, screen: string): Promise<boolean> {
  return (await getSetting(db, `${HINT_PREFIX}${screen}`)) === '1';
}

export async function markHintSeen(db: DbHandle, screen: string): Promise<void> {
  await setSetting(db, `${HINT_PREFIX}${screen}`, '1');
}
