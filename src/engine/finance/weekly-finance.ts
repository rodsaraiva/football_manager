import { calculateWeeklyIncome, calculateWeeklyExpenses } from './finance-engine';
import { FinanceType } from '@/types/finance';

export interface ClubFinanceInput {
  clubId: number;
  reputation: number;
  budget: number;
  stadiumCapacity: number;
  trainingFacilities: number;
  youthAcademy: number;
  medicalDepartment: number;
  totalPlayerWages: number;
  totalStaffWages: number;
  hasHomeMatch: boolean;
  actualAttendance: number | null;
  leaguePosition: number;
}

export interface FinanceEntry {
  clubId: number;
  season: number;
  week: number;
  type: FinanceType;
  amount: number;
  description: string;
}

export interface ClubFinanceResult {
  entries: FinanceEntry[];
  newBudget: number;
}

/**
 * Pure per-club weekly finance — consolidates the legacy advanceWeek logic so
 * the human and every AI club run the same income/expense model.
 */
export function computeWeeklyClubFinance(
  input: ClubFinanceInput,
  season: number,
  week: number,
): ClubFinanceResult {
  const income = calculateWeeklyIncome({
    clubReputation: input.reputation,
    stadiumCapacity: input.stadiumCapacity,
    hasHomeMatch: input.hasHomeMatch,
    leaguePosition: input.leaguePosition,
    season,
    week,
    actualAttendance: input.actualAttendance,
  });

  const expenses = calculateWeeklyExpenses({
    totalPlayerWages: input.totalPlayerWages,
    totalStaffWages: input.totalStaffWages,
    stadiumCapacity: input.stadiumCapacity,
    trainingFacilities: input.trainingFacilities,
    youthAcademy: input.youthAcademy,
    medicalDepartment: input.medicalDepartment,
  });

  const entries: FinanceEntry[] = [
    { clubId: input.clubId, season, week, type: 'tv', amount: income.tv, description: 'Weekly TV rights income' },
    { clubId: input.clubId, season, week, type: 'sponsor', amount: income.sponsor, description: 'Weekly sponsorship income' },
  ];

  if (input.hasHomeMatch && income.ticket > 0) {
    entries.push({ clubId: input.clubId, season, week, type: 'ticket', amount: income.ticket, description: 'Home match ticket sales' });
  }

  entries.push(
    { clubId: input.clubId, season, week, type: 'wages', amount: -expenses.wages, description: 'Weekly wages (players + staff)' },
    { clubId: input.clubId, season, week, type: 'maintenance', amount: -expenses.maintenance, description: 'Stadium and facility maintenance' },
  );

  const totalIncome = income.tv + income.sponsor + (input.hasHomeMatch ? income.ticket : 0);
  const totalExpenses = expenses.wages + expenses.maintenance;
  const newBudget = input.budget + totalIncome - totalExpenses;

  return { entries, newBudget };
}
