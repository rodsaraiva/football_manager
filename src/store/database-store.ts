import { create } from 'zustand';
import * as SQLite from 'expo-sqlite';
import { createAllTables } from '@/database/schema';
import { DbHandle } from '@/database/queries/players';

interface DatabaseState {
  db: SQLite.SQLiteDatabase | null;
  dbHandle: DbHandle | null;
  isReady: boolean;
  error: string | null;
}

interface DatabaseActions {
  initialize: () => Promise<void>;
}

type DatabaseStore = DatabaseState & DatabaseActions;

/**
 * Wraps expo-sqlite database to match DbHandle interface used by query layer.
 */
export function wrapExpoDb(db: SQLite.SQLiteDatabase): DbHandle {
  return {
    prepare: (sql: string) => ({
      all: (...params: unknown[]) =>
        db.getAllSync(sql, params as SQLite.SQLiteBindParams) as unknown[],
      get: (...params: unknown[]) =>
        db.getFirstSync(sql, params as SQLite.SQLiteBindParams) as unknown,
      run: (...params: unknown[]) => {
        const result = db.runSync(sql, params as SQLite.SQLiteBindParams);
        return { lastInsertRowid: result.lastInsertRowId };
      },
    }),
  };
}

export const useDatabaseStore = create<DatabaseStore>((set) => ({
  db: null,
  dbHandle: null,
  isReady: false,
  error: null,
  initialize: async () => {
    try {
      const db = await SQLite.openDatabaseAsync('football-manager.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      const handle = wrapExpoDb(db);
      createAllTables({ exec: (sql: string) => db.execSync(sql) });
      set({ db, dbHandle: handle, isReady: true, error: null });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
