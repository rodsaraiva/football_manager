import { create } from 'zustand';

export type CelebrationKind = 'overall_up' | 'trophy' | 'transfer';

export interface Celebration {
  id: string;
  kind: CelebrationKind;
  titleKey: string;
  detail?: string;
}

interface CelebrationStore {
  queue: Celebration[];
  push: (c: Omit<Celebration, 'id'>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useCelebrationStore = create<CelebrationStore>((set) => ({
  queue: [],
  push: (c) => set((s) => ({ queue: [...s.queue, { ...c, id: `c${++counter}` }] })),
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((x) => x.id !== id) })),
  clear: () => set({ queue: [] }),
}));
