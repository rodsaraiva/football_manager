import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getSaveById } from '@/database/queries/saves';
import { ConfirmProvider } from '@/components/kit';

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

export interface RenderResult {
  /** Container DOM (jsdom) com a árvore renderizada via react-native-web. */
  container: HTMLElement;
  /** Texto visível concatenado, para asserts de i18n. */
  text: string;
  /** HTML serializado, estável para snapshot (detector de drift). */
  html: string;
  unmount: () => void;
}

/**
 * Renderiza um elemento RN (via react-native-web) em jsdom com react-dom; aguarda os
 * microtasks dos effects que carregam dados do DB real. NUNCA mocka store/DB.
 */
export async function renderWithRealDb(element: React.ReactElement): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<ConfirmProvider>{element}</ConfirmProvider>);
  });
  // drena os useEffect assíncronos (loaders das telas)
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return {
    container,
    text: container.textContent ?? '',
    html: container.innerHTML,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Coleta todo o texto renderizado para asserts de i18n. Aceita o RenderResult ou um container. */
export function collectText(source: RenderResult | HTMLElement): string {
  if (source instanceof HTMLElement) return source.textContent ?? '';
  return source.text;
}
