// expo-sqlite é um módulo ESM nativo que não roda no ambiente node do Jest. database-store
// só o usa como TIPO em wrapExpoDb (o DB real do teste vem de better-sqlite3 via expoLike),
// então um stub vazio basta — NÃO é mock de DB, apenas evita o import quebrar.
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

import Database from 'better-sqlite3';
import { wrapExpoDb } from '@/store/database-store';
import { createTestDb, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createSave, getSaveById, getAllSaves } from '@/database/queries/saves';
import { getPlayersByClub } from '@/database/queries/players';
import { saveOffset } from '@/database/constants';

/**
 * Shim: wrapExpoDb consome a API expo-sqlite (getAllAsync/getFirstAsync/runAsync).
 * better-sqlite3 é síncrono; embrulhamos em Promise para alimentar wrapExpoDb com
 * uma fonte de verdade real (sem mock de DB).
 */
function expoLike(db: Database.Database) {
  return {
    getAllAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid) };
    },
  } as unknown as Parameters<typeof wrapExpoDb>[0];
}

describe('wrapExpoDb adapter', () => {
  let raw: Database.Database;
  beforeEach(() => { raw = createTestDb(); });
  afterEach(() => raw.close());

  it('expõe prepare().all/.get/.run mapeando para a API expo-sqlite', async () => {
    const handle = wrapExpoDb(expoLike(raw));
    raw.pragma('foreign_keys = OFF');
    await handle.prepare("INSERT INTO countries (id,name,code,continent) VALUES (1,'Brazil','BR','SA')").run();
    const all = await handle.prepare('SELECT * FROM countries').all();
    expect(all).toHaveLength(1);
    const one = await handle.prepare('SELECT * FROM countries WHERE id = ?').get(1) as { name: string };
    expect(one.name).toBe('Brazil');
  });

  it('run() devolve lastInsertRowid a partir de lastInsertRowId', async () => {
    const handle = wrapExpoDb(expoLike(raw));
    raw.pragma('foreign_keys = OFF');
    const r = await handle.prepare("INSERT INTO countries (name,code,continent) VALUES ('X','XX','SA')").run();
    expect(r).not.toBeUndefined();
    expect(typeof r!.lastInsertRowid).toBe('number');
    expect(r!.lastInsertRowid).toBeGreaterThan(0);
  });
});

describe('save lifecycle + isolamento por saveId (DB real)', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof wrapExpoDb>;
  beforeEach(() => {
    raw = createTestDb();
    raw.pragma('foreign_keys = OFF'); // FK circular clubs<->save_games; seed roda FK-off
    db = wrapExpoDb(expoLike(raw));
  });
  afterEach(() => raw.close());

  it('createSave -> getSaveById -> getAllSaves reflete o ciclo', async () => {
    const data = generateSeedData(7);
    seedReferenceTables(raw, data); // countries + leagues globais
    const clubId = data.clubs[0].id;
    const saveId = await createSave(db, { name: 'Carreira A', playerClubId: clubId });
    const loaded = await getSaveById(db, saveId);
    expect(loaded?.id).toBe(saveId);
    expect(loaded?.playerClubId).toBe(clubId);
    const all = await getAllSaves(db);
    expect(all.some((s) => s.id === saveId)).toBe(true);
  });

  it('dois saves não vazam dados entre si (isolamento por save_id)', async () => {
    const dataA = generateSeedData(7);
    seedReferenceTables(raw, dataA);
    const saveA = await createSave(db, { name: 'A', playerClubId: dataA.clubs[0].id });
    seedWorldForSave(raw, dataA, saveA);

    const dataB = generateSeedData(7);
    const saveB = await createSave(db, { name: 'B', playerClubId: dataB.clubs[0].id });
    seedWorldForSave(raw, dataB, saveB);

    // seedWorldForSave deslocou os ids por saveOffset(saveId): cada save tem seu próprio mundo.
    const clubAId = dataA.clubs[0].id + saveOffset(saveA);
    const clubBId = dataB.clubs[0].id + saveOffset(saveB);
    const playersA = await getPlayersByClub(db, saveA, clubAId);
    const playersB = await getPlayersByClub(db, saveB, clubBId);
    expect(playersA.length).toBeGreaterThan(0);
    expect(playersB.length).toBeGreaterThan(0);

    // O mundo do save A não vaza para o save B (consultar o clube de A sob o saveId de B = vazio).
    const leak = await getPlayersByClub(db, saveB, clubAId);
    expect(leak).toHaveLength(0);

    const countA = raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id = ?').get(saveA) as { c: number };
    const countB = raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id = ?').get(saveB) as { c: number };
    expect(countA.c).toBeGreaterThan(0);
    expect(countB.c).toBeGreaterThan(0);
    expect(playersA.every((p) => p != null)).toBe(true);
    expect(playersB.every((p) => p != null)).toBe(true);
  });
});
