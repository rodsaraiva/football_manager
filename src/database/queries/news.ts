import type { DbHandle } from './players';
import type { NewsItem, NewsCategory } from '@/engine/news/news-generator';
import type { TKey } from '@/i18n/translate';

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

export interface PersistedNewsRow {
  id: number;
  season: number;
  week: number;
  category: string;
  title_key: string;
  title_vars: string;
  body_key: string;
  body_vars: string;
  icon: string;
  priority: number;
  read: number;
}

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
  return (await db
    .prepare(
      `SELECT id, season, week, category, title_key, title_vars, body_key, body_vars, icon, priority, read
       FROM news_items WHERE save_id = ? AND season = ?
       ORDER BY priority DESC, week DESC, id DESC`,
    )
    .all(saveId, season)) as PersistedNewsRow[];
}

export async function markNewsRead(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('UPDATE news_items SET read = 1 WHERE save_id = ? AND read = 0').run(saveId);
}

export async function countUnread(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db
    .prepare('SELECT COUNT(*) AS n FROM news_items WHERE save_id = ? AND read = 0')
    .get(saveId)) as { n: number } | undefined;
  return row?.n ?? 0;
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
