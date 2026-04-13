import { create } from 'zustand';

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface UIStore {
  isLoading: boolean;
  loadingMessage: string;
  notifications: Notification[];
  setLoading: (loading: boolean, message?: string) => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isLoading: false,
  loadingMessage: '',
  notifications: [],
  setLoading: (loading, message = '') => set({ isLoading: loading, loadingMessage: message }),
  addNotification: (n) =>
    set((s) => ({
      notifications: [...s.notifications, { ...n, id: Date.now().toString() }],
    })),
  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),
}));
