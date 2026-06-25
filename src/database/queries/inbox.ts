import type { DbHandle } from './players';
import type {
  InboxCategory, InboxActionKind, InboxRefKind,
  InboxThread, InboxMessage, InboxThreadView,
} from '@/engine/inbox/inbox-types';
import type { TKey } from '@/i18n/translate';

export interface NewThreadInput {
  category: InboxCategory;
  refKind?: InboxRefKind;
  refId?: number | null;
  actionKind?: InboxActionKind;
  deadlineSeason?: number | null;
  deadlineWeek?: number | null;
}
export interface NewMessageInput {
  season: number;
  week: number;
  titleKey: TKey;
  titleVars?: Record<string, string | number>;
  bodyKey: TKey;
  bodyVars?: Record<string, string | number>;
  icon: string;
  fromSelf?: boolean;
}

interface ThreadRow {
  id: number; category: string; ref_kind: string; ref_id: number | null;
  action_kind: string; status: string; deadline_season: number | null;
  deadline_week: number | null; read: number; last_season: number; last_week: number;
}
interface MessageRow {
  id: number; thread_id: number; season: number; week: number;
  title_key: string; title_vars: string; body_key: string; body_vars: string;
  icon: string; from_self: number;
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

export function toInboxThread(row: ThreadRow): InboxThread {
  return {
    id: row.id,
    category: row.category as InboxCategory,
    refKind: row.ref_kind as InboxRefKind,
    refId: row.ref_id,
    actionKind: row.action_kind as InboxActionKind,
    status: row.status as InboxThread['status'],
    deadlineSeason: row.deadline_season,
    deadlineWeek: row.deadline_week,
    read: row.read === 1,
    lastSeason: row.last_season,
    lastWeek: row.last_week,
  };
}

export function toInboxMessage(row: MessageRow): InboxMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    season: row.season,
    week: row.week,
    icon: row.icon,
    title: { key: row.title_key as TKey, vars: parseVars(row.title_vars) },
    body: { key: row.body_key as TKey, vars: parseVars(row.body_vars) },
    fromSelf: row.from_self === 1,
  };
}

async function insertMessage(db: DbHandle, saveId: number, threadId: number, msg: NewMessageInput): Promise<number> {
  const result = (await db
    .prepare(
      `INSERT INTO inbox_messages
         (save_id, thread_id, season, week, title_key, title_vars, body_key, body_vars, icon, from_self)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      saveId, threadId, msg.season, msg.week,
      msg.titleKey, JSON.stringify(msg.titleVars ?? {}),
      msg.bodyKey, JSON.stringify(msg.bodyVars ?? {}),
      msg.icon, msg.fromSelf ? 1 : 0,
    )) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function openThread(
  db: DbHandle, saveId: number, thread: NewThreadInput, first: NewMessageInput,
): Promise<number> {
  const result = (await db
    .prepare(
      `INSERT INTO inbox_threads
         (save_id, category, ref_kind, ref_id, action_kind, status, deadline_season, deadline_week, read, last_season, last_week)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, 0, ?, ?)`,
    )
    .run(
      saveId, thread.category, thread.refKind ?? 'none', thread.refId ?? null,
      thread.actionKind ?? 'none', thread.deadlineSeason ?? null, thread.deadlineWeek ?? null,
      first.season, first.week,
    )) as { lastInsertRowid: number | bigint };
  const threadId = Number(result.lastInsertRowid);
  await insertMessage(db, saveId, threadId, first);
  return threadId;
}

export async function appendMessage(
  db: DbHandle, saveId: number, threadId: number, msg: NewMessageInput,
): Promise<number> {
  const id = await insertMessage(db, saveId, threadId, msg);
  await db
    .prepare('UPDATE inbox_threads SET last_season = ?, last_week = ?, read = 0 WHERE save_id = ? AND id = ?')
    .run(msg.season, msg.week, saveId, threadId);
  return id;
}

export async function getThreadView(
  db: DbHandle, saveId: number, threadId: number,
): Promise<InboxThreadView | null> {
  const row = (await db
    .prepare(
      `SELECT id, category, ref_kind, ref_id, action_kind, status, deadline_season, deadline_week, read, last_season, last_week
       FROM inbox_threads WHERE save_id = ? AND id = ?`,
    )
    .get(saveId, threadId)) as ThreadRow | undefined;
  if (!row) return null;
  const msgRows = (await db
    .prepare(
      `SELECT id, thread_id, season, week, title_key, title_vars, body_key, body_vars, icon, from_self
       FROM inbox_messages WHERE save_id = ? AND thread_id = ? ORDER BY id ASC`,
    )
    .all(saveId, threadId)) as MessageRow[];
  return { ...toInboxThread(row), messages: msgRows.map(toInboxMessage) };
}

export async function getThreads(
  db: DbHandle, saveId: number, opts?: { category?: InboxCategory },
): Promise<InboxThread[]> {
  const where = opts?.category ? 'save_id = ? AND category = ?' : 'save_id = ?';
  const params = opts?.category ? [saveId, opts.category] : [saveId];
  const rows = (await db
    .prepare(
      `SELECT id, category, ref_kind, ref_id, action_kind, status, deadline_season, deadline_week, read, last_season, last_week
       FROM inbox_threads WHERE ${where}
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END,
                CASE WHEN deadline_season IS NULL THEN 1 ELSE 0 END,
                deadline_season ASC, deadline_week ASC,
                last_season DESC, last_week DESC, id DESC`,
    )
    .all(...params)) as ThreadRow[];
  return rows.map(toInboxThread);
}

export async function markThreadRead(db: DbHandle, saveId: number, threadId: number): Promise<void> {
  await db.prepare('UPDATE inbox_threads SET read = 1 WHERE save_id = ? AND id = ?').run(saveId, threadId);
}

export async function setThreadStatus(
  db: DbHandle, saveId: number, threadId: number, status: 'open' | 'resolved' | 'expired',
): Promise<void> {
  await db.prepare('UPDATE inbox_threads SET status = ? WHERE save_id = ? AND id = ?').run(status, saveId, threadId);
}

export async function countUnreadThreads(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db
    .prepare('SELECT COUNT(*) AS n FROM inbox_threads WHERE save_id = ? AND read = 0')
    .get(saveId)) as { n: number } | undefined;
  return row?.n ?? 0;
}

export async function countActionableThreads(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db
    .prepare("SELECT COUNT(*) AS n FROM inbox_threads WHERE save_id = ? AND status = 'open' AND action_kind != 'none'")
    .get(saveId)) as { n: number } | undefined;
  return row?.n ?? 0;
}

export async function getExpiredActionableThreads(
  db: DbHandle, saveId: number, season: number, week: number,
): Promise<InboxThread[]> {
  const rows = (await db
    .prepare(
      `SELECT id, category, ref_kind, ref_id, action_kind, status, deadline_season, deadline_week, read, last_season, last_week
       FROM inbox_threads
       WHERE save_id = ? AND status = 'open' AND action_kind != 'none'
         AND deadline_season IS NOT NULL AND deadline_week IS NOT NULL
         AND (deadline_season < ? OR (deadline_season = ? AND deadline_week <= ?))`,
    )
    .all(saveId, season, season, week)) as ThreadRow[];
  return rows.map(toInboxThread);
}
