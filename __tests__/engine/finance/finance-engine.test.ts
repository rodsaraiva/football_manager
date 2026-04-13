import {
  calculateWeeklyIncome,
  calculateWeeklyExpenses,
  calculateUpgradeCost,
  WeeklyIncomeInput,
  WeeklyExpensesInput,
} from '@/engine/finance/finance-engine';

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
