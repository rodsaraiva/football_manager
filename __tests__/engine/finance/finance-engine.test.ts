import Database from 'better-sqlite3';
import { DbHandle } from '@/database/queries/players';
import { createTestDb, seedTestDb } from '../../database/test-helpers';
import {
  calculateWeeklyIncome,
  calculateWeeklyExpenses,
  calculateUpgradeCost,
  WeeklyIncomeInput,
  WeeklyExpensesInput,
} from '@/engine/finance/finance-engine';
import { applyUpgrade } from '@/engine/finance/upgrades';

describe('calculateWeeklyIncome', () => {
  const baseInput: WeeklyIncomeInput = {
    clubReputation: 80,
    stadiumCapacity: 50000,
    hasHomeMatch: true,
    leaguePosition: 5,
    season: 1,
    week: 15,
  };

  it('generates ticket revenue for home matches', () => {
    const income = calculateWeeklyIncome(baseInput);
    expect(income.ticket).toBeGreaterThan(0);
  });

  it('generates zero ticket revenue for away matches', () => {
    const income = calculateWeeklyIncome({ ...baseInput, hasHomeMatch: false });
    expect(income.ticket).toBe(0);
  });

  it('higher reputation generates more ticket revenue', () => {
    const low = calculateWeeklyIncome({ ...baseInput, clubReputation: 40 });
    const high = calculateWeeklyIncome({ ...baseInput, clubReputation: 95 });
    expect(high.ticket).toBeGreaterThan(low.ticket);
  });

  it('generates weekly TV income', () => {
    const income = calculateWeeklyIncome(baseInput);
    expect(income.tv).toBeGreaterThan(0);
  });

  it('generates weekly sponsor income', () => {
    const income = calculateWeeklyIncome(baseInput);
    expect(income.sponsor).toBeGreaterThan(0);
  });
});

describe('calculateWeeklyExpenses', () => {
  const baseInput: WeeklyExpensesInput = {
    totalPlayerWages: 2000000,
    totalStaffWages: 200000,
    stadiumCapacity: 50000,
    trainingFacilities: 3,
    youthAcademy: 3,
    medicalDepartment: 3,
  };

  it('includes player and staff wages', () => {
    const expenses = calculateWeeklyExpenses(baseInput);
    expect(expenses.wages).toBe(2200000);
  });

  it('includes maintenance based on facilities', () => {
    const expenses = calculateWeeklyExpenses(baseInput);
    expect(expenses.maintenance).toBeGreaterThan(0);
  });

  it('higher facilities cost more to maintain', () => {
    const low = calculateWeeklyExpenses({ ...baseInput, trainingFacilities: 1, youthAcademy: 1, medicalDepartment: 1 });
    const high = calculateWeeklyExpenses({ ...baseInput, trainingFacilities: 5, youthAcademy: 5, medicalDepartment: 5 });
    expect(high.maintenance).toBeGreaterThan(low.maintenance);
  });
});

describe('calculateUpgradeCost', () => {
  it('stadium upgrades cost more at higher levels', () => {
    const cost1 = calculateUpgradeCost('stadium', 1);
    const cost4 = calculateUpgradeCost('stadium', 4);
    expect(cost4.cost).toBeGreaterThan(cost1.cost);
  });

  it('returns cost and weeks for all facility types', () => {
    for (const type of ['stadium', 'training', 'youth', 'medical'] as const) {
      const result = calculateUpgradeCost(type, 2);
      expect(result.cost).toBeGreaterThan(0);
      expect(result.weeks).toBeGreaterThan(0);
    }
  });
});

describe('applyUpgrade', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = rawDb as unknown as DbHandle;
  });

  afterEach(() => rawDb.close());

  it('debits the club budget by the upgrade cost', async () => {
    const clubId = 1;
    const { cost: expectedCost } = calculateUpgradeCost('training', 1);

    // Set budget high enough and current level to 1
    rawDb.prepare('UPDATE clubs SET budget = 50000000, training_facilities = 1 WHERE id = ?').run(clubId);

    await applyUpgrade(db, clubId, 'training', 1, 1, 5);

    const after = (rawDb.prepare('SELECT budget FROM clubs WHERE id = ?').get(clubId) as { budget: number }).budget;
    expect(after).toBe(50000000 - expectedCost);
  });

  it('increments the facility column', async () => {
    const clubId = 1;
    rawDb.prepare('UPDATE clubs SET budget = 50000000, youth_academy = 2 WHERE id = ?').run(clubId);

    await applyUpgrade(db, clubId, 'youth', 2, 1, 5);

    const row = rawDb.prepare('SELECT youth_academy FROM clubs WHERE id = ?').get(clubId) as { youth_academy: number };
    expect(row.youth_academy).toBe(3);
  });

  it('writes an upgrade finance entry', async () => {
    const clubId = 1;
    rawDb.prepare('UPDATE clubs SET budget = 50000000, medical_department = 1 WHERE id = ?').run(clubId);

    await applyUpgrade(db, clubId, 'medical', 1, 1, 5);

    const entries = rawDb
      .prepare("SELECT * FROM club_finances WHERE club_id = ? AND type = 'upgrade'")
      .all(clubId) as Array<{ amount: number; description: string }>;
    expect(entries.length).toBe(1);
    expect(entries[0].amount).toBeLessThan(0);
    expect(entries[0].description).toContain('Medical Department');
  });

  it('returns failure when budget is insufficient', async () => {
    const clubId = 1;
    rawDb.prepare('UPDATE clubs SET budget = 100, training_facilities = 1 WHERE id = ?').run(clubId);

    const result = await applyUpgrade(db, clubId, 'training', 1, 1, 5);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/budget/i);
  });

  it('returns failure when already at max level', async () => {
    const clubId = 1;
    rawDb.prepare('UPDATE clubs SET budget = 50000000, training_facilities = 5 WHERE id = ?').run(clubId);

    const result = await applyUpgrade(db, clubId, 'training', 5, 1, 5);

    expect(result.success).toBe(false);
  });
});
