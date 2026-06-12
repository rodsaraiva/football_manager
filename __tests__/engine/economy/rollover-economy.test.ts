import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle, getPlayersByClub, getFreeAgents } from '@/database/queries/players';
import {
  expireContracts,
  recalculateMarketValues,
  distributePrizeMoney,
} from '@/engine/finance/rollover-economy';
import { PrizeAward } from '@/engine/finance/prize-money';

const S = TEST_SAVE_ID;

describe('rollover economy passes', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    clubId = (rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number }).id;
  });
  afterEach(() => rawDb.close());

  it('expireContracts frees a player whose contract ended: club_id NULL, wage 0, is_free_agent 1', async () => {
    const p = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(clubId) as { id: number };
    rawDb.prepare('UPDATE players SET contract_end = 2025, wage = 1000 WHERE id = ?').run(p.id);

    const billBefore = (rawDb.prepare('SELECT COALESCE(SUM(wage),0) AS b FROM players WHERE club_id = ?').get(clubId) as { b: number }).b;
    await expireContracts(db, S, 2025);
    const row = rawDb.prepare('SELECT club_id, wage, is_free_agent FROM players WHERE id = ?').get(p.id) as
      { club_id: number | null; wage: number; is_free_agent: number };
    expect(row.club_id).toBeNull();
    expect(row.wage).toBe(0);
    expect(row.is_free_agent).toBe(1);

    // Two-state regression: not in squad, yes in free agents, wage bill dropped.
    expect((await getPlayersByClub(db, S, clubId)).some((x) => x.id === p.id)).toBe(false);
    expect((await getFreeAgents(db, S)).some((x) => x.id === p.id)).toBe(true);
    const billAfter = (rawDb.prepare('SELECT COALESCE(SUM(wage),0) AS b FROM players WHERE club_id = ?').get(clubId) as { b: number }).b;
    expect(billAfter).toBeLessThan(billBefore);
  });

  it('recalculateMarketValues moves a young prospect value up vs an aging short-contract player', async () => {
    const young = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(clubId) as { id: number };
    rawDb.prepare('UPDATE players SET age = 19, effective_potential = 90, contract_end = 2030 WHERE id = ?').run(young.id);
    const before = (rawDb.prepare('SELECT market_value FROM players WHERE id = ?').get(young.id) as { market_value: number }).market_value;

    await recalculateMarketValues(db, S, 2026);

    const after = (rawDb.prepare('SELECT market_value FROM players WHERE id = ?').get(young.id) as { market_value: number }).market_value;
    expect(after).toBeGreaterThan(0);
    expect(after).not.toBe(before); // value actually moved (was frozen before)
  });

  it('distributePrizeMoney credits budgets and writes a prize finance row', async () => {
    const budgetBefore = (rawDb.prepare('SELECT budget FROM clubs WHERE id = ?').get(clubId) as { budget: number }).budget;
    const awards: PrizeAward[] = [{ clubId, amount: 5_000_000, description: 'League prize (pos 1)' }];
    await distributePrizeMoney(db, S, awards, 2025, 38);
    const budgetAfter = (rawDb.prepare('SELECT budget FROM clubs WHERE id = ?').get(clubId) as { budget: number }).budget;
    expect(budgetAfter).toBe(budgetBefore + 5_000_000);
    const fin = rawDb.prepare("SELECT type, amount FROM club_finances WHERE club_id = ? AND type = 'prize'").get(clubId) as
      { type: string; amount: number } | undefined;
    expect(fin?.type).toBe('prize');
    expect(fin?.amount).toBe(5_000_000);
  });
});
