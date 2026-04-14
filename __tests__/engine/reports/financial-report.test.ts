import { buildFinancialReport } from '@/engine/reports/financial-report';

describe('buildFinancialReport', () => {
  it('aggregates income, expenses and computes net', () => {
    const r = buildFinancialReport({
      clubBudget: 50_000_000,
      clubWageBudget: 1_000_000,
      totalPlayerWages: 800_000,
      currentWeek: 10,
      seasonEntries: [
        { type: 'tv', amount: 500_000 },
        { type: 'sponsor', amount: 400_000 },
        { type: 'ticket', amount: 200_000 },
        { type: 'wages', amount: -600_000 },
        { type: 'maintenance', amount: -100_000 },
      ],
    });
    expect(r.seasonIncome).toBe(1_100_000);
    expect(r.seasonExpenses).toBe(700_000);
    expect(r.seasonNet).toBe(400_000);
  });

  it('computes transfer balance from transfer_in and transfer_out', () => {
    const r = buildFinancialReport({
      clubBudget: 50_000_000,
      clubWageBudget: 1_000_000,
      totalPlayerWages: 500_000,
      currentWeek: 5,
      seasonEntries: [
        { type: 'transfer_in', amount: 10_000_000 },
        { type: 'transfer_out', amount: -4_000_000 },
      ],
    });
    expect(r.transferBalance).toBe(6_000_000);
  });

  it('flags payroll overage with a suggestion', () => {
    const r = buildFinancialReport({
      clubBudget: 10_000_000,
      clubWageBudget: 500_000,
      totalPlayerWages: 600_000, // 120%
      currentWeek: 5,
      seasonEntries: [],
    });
    const hasOverage = r.suggestions.some((s) => s.includes('vender') || s.includes('renegociar'));
    expect(hasOverage).toBe(true);
    expect(r.payrollRatio).toBeCloseTo(1.2);
  });

  it('suggests reinvesting when transfer surplus is large', () => {
    const r = buildFinancialReport({
      clubBudget: 50_000_000,
      clubWageBudget: 1_000_000,
      totalPlayerWages: 700_000,
      currentWeek: 10,
      seasonEntries: [
        { type: 'transfer_in', amount: 20_000_000 },
        { type: 'transfer_out', amount: -2_000_000 },
      ],
    });
    expect(r.suggestions.some((s) => s.toLowerCase().includes('reforçar'))).toBe(true);
  });

  it('projects runway based on average weekly net', () => {
    const r = buildFinancialReport({
      clubBudget: 10_000_000,
      clubWageBudget: 500_000,
      totalPlayerWages: 450_000,
      currentWeek: 11, // 10 weeks elapsed
      seasonEntries: [{ type: 'wages', amount: -5_000_000 }], // avg -500k/week
    });
    // 10M - 500k * 10 = 5M
    expect(r.projectedBudgetIn10Weeks).toBe(5_000_000);
  });

  it('falls back to a neutral message when nothing stands out', () => {
    const r = buildFinancialReport({
      clubBudget: 10_000_000,
      clubWageBudget: 1_000_000,
      totalPlayerWages: 850_000,
      currentWeek: 5,
      seasonEntries: [],
    });
    expect(r.suggestions.length).toBeGreaterThan(0);
  });
});
