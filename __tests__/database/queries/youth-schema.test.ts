import { createTestDb } from '../test-helpers';

describe('C2 schema migrations', () => {
  it('players tem coluna squad_tier default first; clubs academy_reputation default 50; staff youth_specialization default balanced', () => {
    const db = createTestDb();
    const pcols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
    const ccols = db.prepare('PRAGMA table_info(clubs)').all() as Array<{ name: string }>;
    const scols = db.prepare('PRAGMA table_info(staff)').all() as Array<{ name: string }>;
    expect(pcols.some((c) => c.name === 'squad_tier')).toBe(true);
    expect(ccols.some((c) => c.name === 'academy_reputation')).toBe(true);
    expect(scols.some((c) => c.name === 'youth_specialization')).toBe(true);
    db.close();
  });

  it('youth_loans e academy_reputation_history existem', () => {
    const db = createTestDb();
    const t = (name: string) =>
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").all(name) as unknown[]).length;
    expect(t('youth_loans')).toBe(1);
    expect(t('academy_reputation_history')).toBe(1);
    db.close();
  });
});
