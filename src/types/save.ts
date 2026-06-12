export type Difficulty = 'easy' | 'normal' | 'hard';

export interface SaveGame {
  id: number;
  name: string;
  currentSeason: number;
  currentWeek: number;
  playerClubId: number;
  difficulty: Difficulty;
  preseasonPending: boolean;
  createdAt: string;
  updatedAt: string;
}
