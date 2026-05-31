import { create } from 'zustand';
import { Language } from '@/i18n/types';

interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  language: 'pt',
  setLanguage: (language) => set({ language }),
}));
