import { z, ZodObject } from 'zod';
import type { DbHandle } from './players';
import type { NewsItem, NewsCategory } from '@/engine/news/news-generator';
import type { TKey } from '@/i18n/translate';
import { parseRows, parseRow } from '../parse-rows';

export interface NewsItemInput {
  season: number;
  week: number;
  category: NewsCategory;
  titleKey: TKey;
  titleVars?: Record<string, string | number>;
  bodyKey: TKey;
  bodyVars?: Record<string, string | number>;
  icon: string;
  priority: number;
}

// Mapeia 1:1 a news_items (todas as colunas NOT NULL); select omite save_id, coberto por .passthrough().
const persistedNewsRowSchema = z
  .object({
    id: z.number(),
    season: z.number(),
    week: z.number(),
    category: z.string(),
    title_key: z.string(),
    title_vars: z.string(),
    body_key: z.string(),
    body_vars: z.string(),
    icon: z.string(),
    priority: z.number(),
    read: z.number(),
  })
  .passthrough();
export type PersistedNewsRow = z.infer<typeof persistedNewsRowSchema>;

// COUNT(*) AS n: projeção agregada, não é linha de tabela — fora de __rowSchemas.
const unreadCountRowSchema = z.object({ n: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'news_items', schema: persistedNewsRowSchema },
];

export async function insertNewsItem(db: DbHandle, saveId: number, input: NewsItemInput): Promise<number> {
  const result = (await db
    .prepare(
      `INSERT INTO news_items
        (save_id, season, week, category, title_key, title_vars, body_key, body_vars, icon, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      saveId,
      input.season,
      input.week,
      input.category,
      input.titleKey,
      JSON.stringify(input.titleVars ?? {}),
      input.bodyKey,
      JSON.stringify(input.bodyVars ?? {}),
      input.icon,
      input.priority,
    )) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function getNewsItems(db: DbHandle, saveId: number, season: number): Promise<PersistedNewsRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, season, week, category, title_key, title_vars, body_key, body_vars, icon, priority, read
       FROM news_items WHERE save_id = ? AND season = ?
       ORDER BY priority DESC, week DESC, id DESC`,
    )
    .all(saveId, season);
  return parseRows(persistedNewsRowSchema, rows, 'news.getNewsItems');
}

export async function markNewsRead(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('UPDATE news_items SET read = 1 WHERE save_id = ? AND read = 0').run(saveId);
}

export async function countUnread(db: DbHandle, saveId: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM news_items WHERE save_id = ? AND read = 0')
    .get(saveId);
  return row ? parseRow(unreadCountRowSchema, row, 'news.countUnread').n : 0;
}

function parseVars(json: string): Record<string, string | number> | undefined {
  if (!json || json === '{}') return undefined;
  try {
    const v = JSON.parse(json) as Record<string, string | number>;
    return Object.keys(v).length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export function toNewsItem(row: PersistedNewsRow): NewsItem {
  return {
    id: `persist-${row.id}`,
    icon: row.icon,
    title: { key: row.title_key as TKey, vars: parseVars(row.title_vars) },
    body: { key: row.body_key as TKey, vars: parseVars(row.body_vars) },
    category: row.category as NewsCategory,
    priority: row.priority,
  };
}
