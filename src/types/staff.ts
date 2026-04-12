export type StaffRole = 'scout' | 'physio' | 'assistant' | 'youth_coach' | 'fitness_coach';

export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  clubId: number;
  ability: number;
  wage: number;
  contractEnd: number;
}
