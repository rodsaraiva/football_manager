import { advanceWeek, WeekAdvanceInput } from '@/engine/week-advance';
import { SeededRng } from '@/engine/rng';
import { StaffEffects } from '@/engine/staff/staff-effects';

const defaultStaffEffects: StaffEffects = {
  trainingBonus: 0.15, injuryRecoveryBonus: 0.3, scoutAccuracy: 0.6, youthQualityBonus: 5, tacticBonus: 0.05,
};

const makeMinimalInput = (overrides: Partial<WeekAdvanceInput> = {}): WeekAdvanceInput => ({
  season: 1,
  week: 15,
  allClubs: [
    {
      id: 1, reputation: 80, budget: 50_000_000, wageBudget: 2_000_000,
      stadiumCapacity: 50000, trainingFacilities: 3, youthAcademy: 3, medicalDepartment: 3,
      totalPlayerWages: 1_500_000, totalStaffWages: 150_000,
      staffEffects: defaultStaffEffects,
    },
  ],
  injuredPlayers: [],
  playerFitness: [],
  rng: new SeededRng(42),
  ...overrides,
});

describe('advanceWeek', () => {
  it('returns updated week number', () => {
    const result = advanceWeek(makeMinimalInput());
    expect(result.newWeek).toBe(16);
  });

  it('processes financial transactions', () => {
    const result = advanceWeek(makeMinimalInput());
    expect(result.financeEntries.length).toBeGreaterThan(0);
  });

  it('generates income entries for each club', () => {
    const result = advanceWeek(makeMinimalInput());
    const incomeEntries = result.financeEntries.filter(e => e.amount > 0);
    expect(incomeEntries.length).toBeGreaterThan(0);
  });

  it('generates expense entries for each club', () => {
    const result = advanceWeek(makeMinimalInput());
    const expenseEntries = result.financeEntries.filter(e => e.amount < 0);
    expect(expenseEntries.length).toBeGreaterThan(0);
  });

  it('reduces injury recovery weeks', () => {
    const input = makeMinimalInput({ injuredPlayers: [{ playerId: 1, weeksLeft: 3 }] });
    const result = advanceWeek(input);
    const updated = result.injuryUpdates.find(u => u.playerId === 1);
    expect(updated).toBeDefined();
    expect(updated!.newWeeksLeft).toBe(2);
  });

  it('recovers fitness for players who did not play', () => {
    const input = makeMinimalInput({ playerFitness: [{ playerId: 1, fitness: 70, played: false }] });
    const result = advanceWeek(input);
    const updated = result.fitnessUpdates.find(u => u.playerId === 1);
    expect(updated).toBeDefined();
    expect(updated!.newFitness).toBeGreaterThan(70);
  });

  it('does not recover fitness above 100', () => {
    const input = makeMinimalInput({ playerFitness: [{ playerId: 1, fitness: 98, played: false }] });
    const result = advanceWeek(input);
    const updated = result.fitnessUpdates.find(u => u.playerId === 1);
    expect(updated!.newFitness).toBeLessThanOrEqual(100);
  });

  it('reduces fitness for players who played', () => {
    const input = makeMinimalInput({ playerFitness: [{ playerId: 1, fitness: 90, played: true }] });
    const result = advanceWeek(input);
    const updated = result.fitnessUpdates.find(u => u.playerId === 1);
    expect(updated!.newFitness).toBeLessThan(90);
  });

  it('wraps to next season at week 58', () => {
    const input = makeMinimalInput({ week: 58 });
    const result = advanceWeek(input);
    expect(result.newWeek).toBe(1);
    expect(result.newSeason).toBe(2);
    expect(result.isSeasonEnd).toBe(true);
  });

  it('does not trigger season end for normal weeks', () => {
    const result = advanceWeek(makeMinimalInput());
    expect(result.isSeasonEnd).toBe(false);
    expect(result.newSeason).toBe(1);
  });
});
