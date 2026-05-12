import { create } from 'zustand';
import { BoardObjective, ReputationHistoryEntry, TrustConsequence, TrustOutcome } from '@/types/board';

interface BoardState {
  currentObjective: BoardObjective | null;
  currentTrust: number;
  lastTrustOutcome: TrustOutcome | null;
  lastTrustConsequence: TrustConsequence | null;
  reputationHistory: ReputationHistoryEntry[];
}

interface BoardActions {
  setCurrentObjective: (obj: BoardObjective | null) => void;
  setCurrentTrust: (trust: number) => void;
  setLastTrustResult: (outcome: TrustOutcome, consequence: TrustConsequence) => void;
  setReputationHistory: (history: ReputationHistoryEntry[]) => void;
  reset: () => void;
}

type BoardStore = BoardState & BoardActions;

const initialState: BoardState = {
  currentObjective: null,
  currentTrust: 50,
  lastTrustOutcome: null,
  lastTrustConsequence: null,
  reputationHistory: [],
};

export const useBoardStore = create<BoardStore>((set) => ({
  ...initialState,
  setCurrentObjective: (obj) => set({ currentObjective: obj }),
  setCurrentTrust: (trust) => set({ currentTrust: trust }),
  setLastTrustResult: (outcome, consequence) =>
    set({ lastTrustOutcome: outcome, lastTrustConsequence: consequence }),
  setReputationHistory: (history) => set({ reputationHistory: history }),
  reset: () => set(initialState),
}));
