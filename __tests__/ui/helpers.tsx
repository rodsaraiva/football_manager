import React from 'react';
import TestRenderer, { ReactTestRenderer } from 'react-test-renderer';
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getSaveById } from '@/database/queries/saves';

/** Mesma forma de createTestDbHandle: better-sqlite3 -> DbHandle assíncrono. */
export function wrapBetterSqlite(db: Database.Database): DbHandle {
  return {
    prepare: (sql: string) => ({
      all: async (...p: unknown[]) => db.prepare(sql).all(...p),
      get: async (...p: unknown[]) => db.prepare(sql).get(...p) ?? null,
      run: async (...p: unknown[]) => {
        const r = db.prepare(sql).run(...p);
        return { lastInsertRowid: Number(r.lastInsertRowid) };
      },
    }),
  };
}

/** Cria DB real seedado (save_id=1), injeta o handle no database-store e carrega o save no game-store. */
export async function seedAndStartGame(): Promise<{ raw: Database.Database; db: DbHandle }> {
  const raw = createTestDb();
  seedTestDb(raw);
  const db = wrapBetterSqlite(raw);
  useDatabaseStore.setState({ db: null, dbHandle: db, isReady: true, error: null });
  const save = await getSaveById(db, TEST_SAVE_ID);
  if (save) useGameStore.getState().loadSave(save);
  return { raw, db };
}

/** Renderiza um elemento; aguarda microtasks (effects que carregam dados do DB). */
export async function renderWithRealDb(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(element);
  });
  // drena os useEffect assíncronos (loaders das telas)
  await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return tree;
}

/** Coleta todo o texto renderizado (recursivo) para asserts de i18n. */
export function collectText(json: unknown): string {
  if (json == null) return '';
  if (typeof json === 'string') return json;
  if (Array.isArray(json)) return json.map(collectText).join(' ');
  const node = json as { children?: unknown };
  return collectText(node.children ?? '');
}
