import { create } from 'zustand';
import { DbHandle } from '@/database/queries/players';
import { TrainingFocus } from '@/engine/training/progression';
import { getClubTrainingFocus, setClubTrainingFocus } from '@/database/queries/clubs';

interface TrainingState {
  focus: TrainingFocus;
  setFocus: (focus: TrainingFocus) => void;
}

export const useTrainingStore = create<TrainingState>((set) => ({
  focus: 'balanced',
  setFocus: (focus) => set({ focus }),
}));

export async function setTrainingFocus(
  db: DbHandle,
  clubId: number,
  focus: TrainingFocus,
): Promise<void> {
  useTrainingStore.getState().setFocus(focus);
  await setClubTrainingFocus(db, clubId, focus);
}

export async function loadTrainingFocus(db: DbHandle, clubId: number): Promise<void> {
  const focus = await getClubTrainingFocus(db, clubId);
  useTrainingStore.getState().setFocus(focus);
}
