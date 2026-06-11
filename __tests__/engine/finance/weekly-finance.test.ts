import { computeWeeklyClubFinance, ClubFinanceInput } from '@/engine/finance/weekly-finance';

const base: ClubFinanceInput = {
  clubId: 7,
  reputation: 60,
  budget: 10_000_000,
  stadiumCapacity: 40_000,
  trainingFacilities: 3,
  youthAcademy: 3,
  medicalDepartment: 3,
  totalPlayerWages: 200_000,
  totalStaffWages: 20_000,
  hasHomeMatch: true,
  actualAttendance: 35_000,
  leaguePosition: 1,
};

describe('computeWeeklyClubFinance', () => {
  it('produces tv, sponsor, ticket, wages, maintenance entries for a home match', () => {
    const out = computeWeeklyClubFinance(base, 1, 5);
    const types = out.entries.map(e => e.type).sort();
    expect(types).toEqual(['maintenance', 'sponsor', 'ticket', 'tv', 'wages']);
    expect(out.entries.every(e => e.clubId === 7 && e.season === 1 && e.week === 5)).toBe(true);
  });

  it('omits ticket entry when no home match', () => {
    const out = computeWeeklyClubFinance({ ...base, hasHomeMatch: false, actualAttendance: null }, 1, 5);
    expect(out.entries.find(e => e.type === 'ticket')).toBeUndefined();
  });

  it('newBudget = budget + income - expenses', () => {
    const out = computeWeeklyClubFinance(base, 1, 5);
    const income = out.entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const expense = out.entries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
    expect(out.newBudget).toBe(base.budget + income + expense);
  });

  it('can drive the budget negative (no artificial floor)', () => {
    const out = computeWeeklyClubFinance(
      { ...base, budget: 0, totalPlayerWages: 5_000_000, hasHomeMatch: false, actualAttendance: null },
      1, 5,
    );
    expect(out.newBudget).toBeLessThan(0);
  });
});
