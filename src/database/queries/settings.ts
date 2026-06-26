import { z, ZodObject } from 'zod';
import { parseRow } from '../parse-rows';
import { DbHandle } from './players';

const appSettingsValueRowSchema = z.object({ value: z.string() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'app_settings', schema: appSettingsValueRowSchema },
];

export async function getSetting(db: DbHandle, key: string): Promise<string | null> {
  const row = parseRow(appSettingsValueRowSchema.nullable(), await db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key), 'getSetting');
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
