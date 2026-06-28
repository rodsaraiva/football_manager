import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  upsertManagerContract,
  getActiveManagerContract,
  clearManagerContract,
} from '@/database/queries/manager-contract';

const SAVE_A = TEST_SAVE_ID;
const SAVE_B = 2;

const terms = {
  clubId: 10, startSeason: 3, endSeason: 6,
  wagePerSeason: 5000, releaseClause: 2500, expectation: 70,
};

describe('manager-contract queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    rawDb
      .prepare(`INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (?, 'B', 1, '', '')`)
      .run(SAVE_B);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('upsert → get retorna os termos gravados', async () => {
    await upsertManagerContract(db, SAVE_A, terms);
    const got = await getActiveManagerContract(db, SAVE_A);
    expect(got).toMatchObject(terms);
  });

  it('UNIQUE(save_id): upsert substitui o contrato ativo', async () => {
    await upsertManagerContract(db, SAVE_A, terms);
    await upsertManagerContract(db, SAVE_A, { ...terms, clubId: 99, endSeason: 8 });
    const got = await getActiveManagerContract(db, SAVE_A);
    expect(got?.clubId).toBe(99);
    expect(got?.endSeason).toBe(8);
    const count = rawDb
      .prepare('SELECT COUNT(*) n FROM manager_contracts WHERE save_id = ?')
      .get(SAVE_A) as { n: number };
    expect(count.n).toBe(1);
  });

  it('clearManagerContract → get null', async () => {
    await upsertManagerContract(db, SAVE_A, terms);
    await clearManagerContract(db, SAVE_A);
    expect(await getActiveManagerContract(db, SAVE_A)).toBeNull();
  });

  it('isolamento por save_id (dois saves não vazam)', async () => {
    await upsertManagerContract(db, SAVE_A, terms);
    expect(await getActiveManagerContract(db, SAVE_B)).toBeNull();
  });
});
