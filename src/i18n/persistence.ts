import { DbHandle } from '@/database/queries/players';
import { getSetting, setSetting } from '@/database/queries/settings';
import { useI18nStore } from '@/store/i18n-store';
import { Language } from '@/i18n/types';

/** Reads the saved language and applies it. Missing/invalid → keeps default 'pt'. */
export async function loadPersistedLanguage(db: DbHandle): Promise<void> {
  const saved = await getSetting(db, 'language');
  if (saved === 'pt' || saved === 'en') {
    useI18nStore.getState().setLanguage(saved as Language);
  }
}

/** Switches the language and persists it. Used by the toggle. */
export async function changeLanguage(db: DbHandle, lang: Language): Promise<void> {
  useI18nStore.getState().setLanguage(lang);
  await setSetting(db, 'language', lang);
}
