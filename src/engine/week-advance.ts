import { calculateWeeklyIncome, calculateWeeklyExpenses } from './finance/finance-engine';
import { StaffEffects } from './staff/staff-effects';
import { SeededRng } from './rng';

export interface ClubWeekData {
  id: number;
  reputation: number;
  budget: number;
  wageBudget: number;
  stadiumCapacity: number;
  trainingFacilities: number;
  youthAcademy: number;
  medicalDepartment: number;
  totalPlayerWages: number;
  totalStaffWages: number;
  staffEffects: StaffEffects;
}

export interface WeekAdvanceInput {
  season: number;
  week: number;
  allClubs: ClubWeekData[];
  injuredPlayers: { playerId: number; weeksLeft: number }[];
  playerFitness: { playerId: number; fitness: number; played: boolean }[];
  rng: SeededRng;
}

export interface FinanceEntry {
  clubId: number;
  season: number;
  week: number;
  type: string;
  amount: number;
  description: string;
}

export interface WeekAdvanceResult {
  newWeek: number;
  newSeason: number;
  isSeasonEnd: boolean;
  financeEntries: FinanceEntry[];
  injuryUpdates: { playerId: number; newWeeksLeft: number }[];
  fitnessUpdates: { playerId: number; newFitness: number }[];
}

const SEASON_LENGTH = 46;

export function advanceWeek(input: WeekAdvanceInput): WeekAdvanceResult {
  const { season, week, allClubs, injuredPlayers, playerFitness, rng } = input;

  // --- Season wrap ---
  const isSeasonEnd = week >= SEASON_LENGTH;
  const newWeek = isSeasonEnd ? 1 : week + 1;
  const newSeason = isSeasonEnd ? season + 1 : season;

  // --- Finances ---
  const financeEntries: FinanceEntry[] = [];
  const hasHomeMatch = week % 2 !== 0; // odd weeks = home match approximation

  for (const club of allClubs) {
    const income = calculateWeeklyIncome({
      clubReputation: club.reputation,
      stadiumCapacity: club.stadiumCapacity,
      hasHomeMatch,
      leaguePosition: 1, // default; not tracked per-week here
      season,
      week,
    });

    const expenses = calculateWeeklyExpenses({
      totalPlayerWages: club.totalPlayerWages,
      totalStaffWages: club.totalStaffWages,
      stadiumCapacity: club.stadiumCapacity,
      trainingFacilities: club.trainingFacilities,
      youthAcademy: club.youthAcademy,
      medicalDepartment: club.medicalDepartment,
    });

    // Income entries (positive amounts)
    financeEntries.push({
      clubId: club.id,
      season,
      week,
      type: 'tv',
      amount: income.tv,
      description: 'Weekly TV rights income',
    });

    financeEntries.push({
      clubId: club.id,
      season,
      week,
      type: 'sponsor',
      amount: income.sponsor,
      description: 'Weekly sponsorship income',
    });

    if (hasHomeMatch && income.ticket > 0) {
      financeEntries.push({
        clubId: club.id,
        season,
        week,
        type: 'ticket',
        amount: income.ticket,
        description: 'Home match ticket sales',
      });
    }

    // Expense entries (negative amounts)
    financeEntries.push({
      clubId: club.id,
      season,
      week,
      type: 'wages',
      amount: -expenses.wages,
      description: 'Weekly wages (players + staff)',
    });

    financeEntries.push({
      clubId: club.id,
      season,
      week,
      type: 'maintenance',
      amount: -expenses.maintenance,
      description: 'Stadium and facility maintenance',
    });
  }

  // --- Injuries ---
  const injuryUpdates = injuredPlayers.map(({ playerId, weeksLeft }) => ({
    playerId,
    newWeeksLeft: Math.max(0, weeksLeft - 1),
  }));

  // --- Fitness ---
  const fitnessUpdates = playerFitness.map(({ playerId, fitness, played }) => {
    if (played) {
      const drop = rng.nextInt(5, 15);
      return { playerId, newFitness: Math.max(30, fitness - drop) };
    } else {
      const gain = rng.nextInt(5, 15);
      return { playerId, newFitness: Math.min(100, fitness + gain) };
    }
  });

  return {
    newWeek,
    newSeason,
    isSeasonEnd,
    financeEntries,
    injuryUpdates,
    fitnessUpdates,
  };
}
