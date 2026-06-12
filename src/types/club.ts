import { TrainingFocus } from '@/engine/training/progression';

export interface Club {
  id: number;
  name: string;
  shortName: string;
  countryId: number;
  leagueId: number;
  reputation: number;
  budget: number;
  wageBudget: number;
  stadiumName: string;
  stadiumCapacity: number;
  trainingFacilities: number;
  youthAcademy: number;
  medicalDepartment: number;
  primaryColor: string;
  secondaryColor: string;
  trainingFocus: TrainingFocus;
}
