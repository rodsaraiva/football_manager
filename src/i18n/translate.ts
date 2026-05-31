import { pt } from './pt';
import { en } from './en';
import { Language } from './types';

export type TKey = keyof typeof pt;

const DICTS: Record<Language, Record<TKey, string>> = { pt, en };

/** Pure: resolve the key for the language and interpolate {var}. Fallback = the key. */
export function translate(
  lang: Language,
  key: TKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = DICTS[lang][key] ?? (key as string);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
