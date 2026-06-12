import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { signFreeAgent } from '@/engine/transfer/free-agent-signing';

const S = TEST_SAVE_ID;

describe('signFreeAgent wage-budget enforcement', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let faId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const club = rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number };
    clubId = club.id;
    const p = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(clubId) as { id: number };
    faId = p.id;
    rawDb.prepare('UPDATE players SET is_free_agent = 1, club_id = NULL, wage = 0 WHERE id = ?').run(faId);
    rawDb.prepare('UPDATE clubs SET budget = 100000000 WHERE id = ?').run(clubId);
  });
  afterEach(() => rawDb.close());

  it('rejects a signing that would push the wage bill over wage_budget', async () => {
    const bill = (rawDb
      .prepare('SELECT COALESCE(SUM(wage),0) AS b FROM players WHERE club_id = ? AND is_free_agent = 0')
      .get(clubId) as { b: number }).b;
    rawDb.prepare('UPDATE clubs SET wage_budget = ? WHERE id = ?').run(bill + 1000, clubId);

    const res = await signFreeAgent(db, S, {
      playerId: faId,
      clubId,
      wageOffered: 50000,
      contractYears: 2,
      playerOverall: 60,
      season: 2025,
      week: 1,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/wage budget/i);

    const p = rawDb.prepare('SELECT club_id FROM players WHERE id = ?').get(faId) as { club_id: number | null };
    expect(p.club_id).toBeNull();
  });

  it('allows a signing that fits under wage_budget', async () => {
    const bill = (rawDb
      .prepare('SELECT COALESCE(SUM(wage),0) AS b FROM players WHERE club_id = ? AND is_free_agent = 0')
      .get(clubId) as { b: number }).b;
    rawDb.prepare('UPDATE clubs SET wage_budget = ? WHERE id = ?').run(bill + 100000, clubId);

    const res = await signFreeAgent(db, S, {
      playerId: faId,
      clubId,
      wageOffered: 20000,
      contractYears: 2,
      playerOverall: 60,
      season: 2025,
      week: 1,
    });
    expect(res.success).toBe(true);
    const p = rawDb.prepare('SELECT club_id FROM players WHERE id = ?').get(faId) as { club_id: number | null };
    expect(p.club_id).toBe(clubId);
  });

  it('treats wage_budget = 0 as "no cap" (legacy)', async () => {
    rawDb.prepare('UPDATE clubs SET wage_budget = 0 WHERE id = ?').run(clubId);
    const res = await signFreeAgent(db, S, {
      playerId: faId,
      clubId,
      wageOffered: 20000,
      contractYears: 2,
      playerOverall: 60,
      season: 2025,
      week: 1,
    });
    expect(res.success).toBe(true);
  });
});
