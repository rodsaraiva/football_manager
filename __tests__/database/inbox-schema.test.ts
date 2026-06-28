import { createTestDb } from './test-helpers';

describe('inbox schema', () => {
  it('cria inbox_threads e inbox_messages com as colunas esperadas', () => {
    const db = createTestDb();
    const threadCols = (db.prepare("PRAGMA table_info('inbox_threads')").all() as Array<{ name: string }>).map((c) => c.name);
    expect(threadCols).toEqual(expect.arrayContaining([
      'id', 'save_id', 'category', 'ref_kind', 'ref_id', 'action_kind',
      'status', 'deadline_season', 'deadline_week', 'read', 'last_season', 'last_week',
    ]));
    const msgCols = (db.prepare("PRAGMA table_info('inbox_messages')").all() as Array<{ name: string }>).map((c) => c.name);
    expect(msgCols).toEqual(expect.arrayContaining([
      'id', 'save_id', 'thread_id', 'season', 'week',
      'title_key', 'title_vars', 'body_key', 'body_vars', 'icon', 'from_self',
    ]));
    db.close();
  });
});
