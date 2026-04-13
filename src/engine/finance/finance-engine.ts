export interface WeeklyIncomeInput {
  clubReputation: number;
  stadiumCapacity: number;
  hasHomeMatch: boolean;
  leaguePosition: number;
  season: number;
  week: number;
}

export interface WeeklyIncome {
  ticket: number;
  tv: number;
  sponsor: number;
}

export interface WeeklyExpensesInput {
  totalPlayerWages: number;
  totalStaffWages: number;
  stadiumCapacity: number;
  trainingFacilities: number;
  youthAcademy: number;
  medicalDepartment: number;
}

export interface WeeklyExpenses {
  wages: number;
  maintenance: number;
}

export interface UpgradeCost {
  cost: number;
  weeks: number;
}

export type FacilityType = 'stadium' | 'training' | 'youth' | 'medical';

export function calculateWeeklyIncome(input: WeeklyIncomeInput): WeeklyIncome {
  const occupancy = Math.min(0.95, 0.4 + (input.clubReputation / 100) * 0.55);
  const avgTicketPrice = 30 + (input.clubReputation / 100) * 40;
  const ticket = input.hasHomeMatch ? Math.round(input.stadiumCapacity * occupancy * avgTicketPrice) : 0;
  const annualTvBase = 50_000_000;
  const tvShare = 0.3 + (input.clubReputation / 100) * 0.7;
  const tv = Math.round((annualTvBase * tvShare) / 46);
  const annualSponsor = input.clubReputation * input.clubReputation * 100;
  const sponsor = Math.round(annualSponsor / 46);
  return { ticket, tv, sponsor };
}

export function calculateWeeklyExpenses(input: WeeklyExpensesInput): WeeklyExpenses {
  const wages = input.totalPlayerWages + input.totalStaffWages;
  const stadiumMaint = Math.round(input.stadiumCapacity * 2);
  const facilityLevel = input.trainingFacilities + input.youthAcademy + input.medicalDepartment;
  const facilityMaint = facilityLevel * 15000;
  const maintenance = stadiumMaint + facilityMaint;
  return { wages, maintenance };
}

export function calculateUpgradeCost(type: FacilityType, currentLevel: number): UpgradeCost {
  const baseCosts: Record<FacilityType, number> = { stadium: 10_000_000, training: 5_000_000, youth: 4_000_000, medical: 3_000_000 };
  const baseWeeks: Record<FacilityType, number> = { stadium: 12, training: 8, youth: 8, medical: 6 };
  const multiplier = Math.pow(1.8, currentLevel);
  const cost = Math.round(baseCosts[type] * multiplier);
  const weeks = Math.round(baseWeeks[type] * (1 + currentLevel * 0.3));
  return { cost, weeks };
}
