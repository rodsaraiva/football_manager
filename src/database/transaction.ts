import { DbHandle } from './queries/players';

/**
 * Runs `fn` inside a single SQLite transaction on the given handle.
 * Commits on success, rolls back on any error and re-throws the original error.
 * Backend-agnostic: drives BEGIN/COMMIT/ROLLBACK via DbHandle.prepare().run(),
 * the only interface common to wrapExpoDb (runtime) and createTestDbHandle (tests).
 * Does NOT support nesting — a nested call throws "cannot start a transaction
 * within a transaction", which is intentional (no savepoints; surface the bug).
 */
export async function runInTransaction<T>(
  db: DbHandle,
  fn: () => Promise<T>,
): Promise<T> {
  await db.prepare('BEGIN').run();
  try {
    const result = await fn();
    await db.prepare('COMMIT').run();
    return result;
  } catch (err) {
    try {
      await db.prepare('ROLLBACK').run();
    } catch {
      // Transaction already aborted by SQLite; swallow so the original error surfaces.
    }
    throw err;
  }
}
