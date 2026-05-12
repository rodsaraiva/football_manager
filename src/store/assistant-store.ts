import { create } from 'zustand';
import { AssistantComment, AssistantWithQuality } from '@/types/assistant';

interface AssistantState {
  assistants: AssistantWithQuality[];
  pendingComment: AssistantComment | null;
  lastCommentWeek: number;
}

interface AssistantActions {
  setAssistants: (assistants: AssistantWithQuality[]) => void;
  setPendingComment: (comment: AssistantComment | null) => void;
  setLastCommentWeek: (week: number) => void;
  reset: () => void;
}

type AssistantStore = AssistantState & AssistantActions;

const initialState: AssistantState = {
  assistants: [],
  pendingComment: null,
  lastCommentWeek: -1,
};

export const useAssistantStore = create<AssistantStore>((set) => ({
  ...initialState,
  setAssistants: (assistants) => set({ assistants }),
  setPendingComment: (comment) => set({ pendingComment: comment }),
  setLastCommentWeek: (week) => set({ lastCommentWeek: week }),
  reset: () => set(initialState),
}));
