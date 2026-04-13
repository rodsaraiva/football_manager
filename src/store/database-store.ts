import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { createAllTables } from '@/database/schema';
import { DbHandle } from '@/database/queries/players';

interface DatabaseState {
  db: SQLite.SQLiteDatabase | null;
  dbHandle: DbHandle | null;
  isReady: boolean;
  isWebMock: boolean;
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
  isWebMock: false,
  error: null,
  initialize: async () => {
    try {
      console.log('[DB] Opening database...');
      const db = await SQLite.openDatabaseAsync('football-manager.db');
      console.log('[DB] Database opened, setting pragmas...');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      console.log('[DB] Creating tables...');
      const handle = wrapExpoDb(db);
      createAllTables({ exec: (sql: string) => db.execSync(sql) });
      console.log('[DB] Database ready!');
      set({ db, dbHandle: handle, isReady: true, error: null });
    } catch (err) {
      const msg = (err as Error).message || 'Unknown database error';
      console.error('[DB] Initialization failed:', msg);
      set({ error: msg, isReady: false });
    }
  },
}));
