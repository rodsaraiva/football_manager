import { useCallback } from 'react';
import { useI18nStore } from '@/store/i18n-store';
import { translate, TKey } from './translate';

export function useTranslation() {
  const lang = useI18nStore((state) => state.language);
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
  return { t, lang };
}
