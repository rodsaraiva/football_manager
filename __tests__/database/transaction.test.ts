import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import { runInTransaction } from '@/database/transaction';

describe('runInTransaction', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    rawDb.exec('CREATE TABLE IF NOT EXISTS tx_probe (id INTEGER PRIMARY KEY, v TEXT NOT NULL);');
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('commits all writes when fn resolves', async () => {
    await runInTransaction(db, async () => {
      await db.prepare('INSERT INTO tx_probe (id, v) VALUES (1, ?)').run('a');
      await db.prepare('INSERT INTO tx_probe (id, v) VALUES (2, ?)').run('b');
    });
    const count = rawDb.prepare('SELECT COUNT(*) AS c FROM tx_probe').get() as { c: number };
    expect(count.c).toBe(2);
  });

  it('rolls back every write when fn throws mid-batch', async () => {
    await expect(
      runInTransaction(db, async () => {
        await db.prepare('INSERT INTO tx_probe (id, v) VALUES (1, ?)').run('a');
        await db.prepare('INSERT INTO tx_probe (id, v) VALUES (2, ?)').run('b');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const count = rawDb.prepare('SELECT COUNT(*) AS c FROM tx_probe').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('propagates the return value of fn', async () => {
    const result = await runInTransaction(db, async () => {
      await db.prepare('INSERT INTO tx_probe (id, v) VALUES (1, ?)').run('a');
      return 42;
    });
    expect(result).toBe(42);
  });

  it('propagates the original error, not a ROLLBACK error', async () => {
    await expect(
      runInTransaction(db, async () => {
        throw new Error('original-cause');
      }),
    ).rejects.toThrow('original-cause');
  });

  it('throws on nested transactions (no savepoints by design)', async () => {
    await expect(
      runInTransaction(db, async () => {
        await runInTransaction(db, async () => {
          await db.prepare('INSERT INTO tx_probe (id, v) VALUES (1, ?)').run('a');
        });
      }),
    ).rejects.toThrow(/within a transaction/);
  });
});
