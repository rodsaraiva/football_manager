# i18n — Infra + Telas Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a infra de i18n (solução própria, type-safe, pt-BR/EN) e aplicá-la às 7 telas core do football-manager.

**Architecture:** Dicionários flat type-safe (`pt.ts`/`en.ts`) + função pura `translate` + hook `useTranslation`. Store Zustand puro guarda o idioma; persistência via tabela SQLite `app_settings` orquestrada por helpers testáveis. Toggle no MainMenu, default pt-BR.

**Tech Stack:** TypeScript, React Native (Expo), Zustand, Jest + better-sqlite3, SQLite. **Sem dependências novas.**

**Spec:** `docs/superpowers/specs/2026-05-31-i18n-infra-core-screens-design.md`

---

### Task 1: Núcleo do i18n (dicionários + translate + hook)

**Files:**
- Create: `src/i18n/types.ts`, `src/i18n/pt.ts`, `src/i18n/en.ts`, `src/i18n/translate.ts`, `src/i18n/index.ts`
- Test: `__tests__/i18n/translate.test.ts`, `__tests__/i18n/parity.test.ts`

**Module boundaries (avoids an index↔store import cycle):** `types.ts` holds `Language` (no imports). `translate.ts` is pure (imports only `pt`/`en`/`types`). The `useTranslation` hook and the store come in Task 3. `index.ts` here only re-exports the pure pieces.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/i18n/translate.test.ts`:

```ts
import { translate } from '@/i18n/translate';

describe('translate', () => {
  it('resolves a key in pt and en', () => {
    expect(translate('pt', 'mainmenu.new_game')).toBe('Novo Jogo');
    expect(translate('en', 'mainmenu.new_game')).toBe('New Game');
  });

  it('interpolates a single variable', () => {
    expect(translate('pt', 'mainmenu.save_default', { id: 3 })).toBe('Jogo #3');
  });

  it('interpolates multiple variables', () => {
    expect(translate('en', 'mainmenu.save_meta', { season: 1, week: 2 }))
      .toBe('Season 1 — Week 2');
  });

  it('falls back to the key itself when missing (defensive)', () => {
    // @ts-expect-error intentionally passing an unknown key
    expect(translate('pt', 'does.not.exist')).toBe('does.not.exist');
  });
});
```

Create `__tests__/i18n/parity.test.ts`:

```ts
import { pt } from '@/i18n/pt';
import { en } from '@/i18n/en';

describe('dictionary parity', () => {
  it('pt and en have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/i18n/`
Expected: FAIL — `Cannot find module '@/i18n'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/i18n/types.ts`:

```ts
export type Language = 'pt' | 'en';
```

Create `src/i18n/pt.ts`:

```ts
export const pt = {
  'common.back': 'Voltar',
  'common.cancel': 'Cancelar',
  'mainmenu.subtitle': 'Modo Carreira',
  'mainmenu.new_game': 'Novo Jogo',
  'mainmenu.load_game': 'CARREGAR JOGO',
  'mainmenu.no_saves': 'Nenhum jogo salvo',
  'mainmenu.save_default': 'Jogo #{id}',
  'mainmenu.save_meta': 'Temporada {season} — Semana {week}',
  'mainmenu.delete_confirm': 'Deletar "{name}"?',
} as const;
```

Create `src/i18n/en.ts`:

```ts
import { pt } from './pt';

export const en: Record<keyof typeof pt, string> = {
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'mainmenu.subtitle': 'Career Mode',
  'mainmenu.new_game': 'New Game',
  'mainmenu.load_game': 'LOAD GAME',
  'mainmenu.no_saves': 'No saved games',
  'mainmenu.save_default': 'Save #{id}',
  'mainmenu.save_meta': 'Season {season} — Week {week}',
  'mainmenu.delete_confirm': 'Delete "{name}"?',
};
```

Create `src/i18n/translate.ts` (pure — no store, no React):

```ts
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
```

Create `src/i18n/index.ts` (re-exports only the pure pieces for now; the `useTranslation` hook is added in Task 3):

```ts
export { translate } from './translate';
export type { TKey } from './translate';
export type { Language } from './types';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/i18n/`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/i18n __tests__/i18n
git commit -m "feat(i18n): núcleo type-safe (dicionários pt/en + translate + hook)"
```

---

### Task 2: Tabela `app_settings` + queries

**Files:**
- Modify: `src/database/schema.ts` (TABLE_NAMES + SCHEMA_SQL), `src/store/database-store.ts` (migração idempotente)
- Create: `src/database/queries/settings.ts`
- Test: `__tests__/database/queries/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/database/queries/settings.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getSetting, setSetting } from '@/database/queries/settings';

describe('settings queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('returns null for a missing key', async () => {
    expect(await getSetting(db, 'language')).toBeNull();
  });

  it('sets and reads a value', async () => {
    await setSetting(db, 'language', 'en');
    expect(await getSetting(db, 'language')).toBe('en');
  });

  it('overwrites an existing value (INSERT OR REPLACE)', async () => {
    await setSetting(db, 'language', 'en');
    await setSetting(db, 'language', 'pt');
    expect(await getSetting(db, 'language')).toBe('pt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/database/queries/settings.test.ts`
Expected: FAIL — `Cannot find module '@/database/queries/settings'` (and, once that resolves, `no such table: app_settings`).

- [ ] **Step 3: Write minimal implementation**

In `src/database/schema.ts`, add `'app_settings'` to the `TABLE_NAMES` array, and add this block inside the `SCHEMA_SQL` template (e.g. before the trailing index declarations):

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

In `src/store/database-store.ts`, add an idempotent migration alongside the others in `initialize` (e.g. near the `board_trust`/assistants migrations):

```ts
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
```

Create `src/database/queries/settings.ts`:

```ts
import { DbHandle } from './players';

export async function getSetting(db: DbHandle, key: string): Promise<string | null> {
  const row = (await db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key)) as { value: string } | undefined;
  return row?.value ?? null;
}

export async function setSetting(db: DbHandle, key: string, value: string): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    .run(key, value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/database/queries/settings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/schema.ts src/store/database-store.ts src/database/queries/settings.ts __tests__/database/queries/settings.test.ts
git commit -m "feat(db): tabela app_settings + queries getSetting/setSetting"
```

---

### Task 3: Store de idioma + persistência + boot

**Files:**
- Create: `src/store/i18n-store.ts`, `src/i18n/useTranslation.ts`, `src/i18n/persistence.ts`
- Modify: `src/i18n/index.ts` (append hook re-export), `App.tsx` (boot load)
- Test: `__tests__/i18n/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/i18n/persistence.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { setSetting } from '@/database/queries/settings';
import { useI18nStore } from '@/store/i18n-store';
import { loadPersistedLanguage, changeLanguage } from '@/i18n/persistence';

describe('i18n persistence', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    rawDb.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    db = createTestDbHandle(rawDb);
    useI18nStore.setState({ language: 'pt' });
  });
  afterEach(() => rawDb.close());

  it('setLanguage changes only the store state', () => {
    useI18nStore.getState().setLanguage('en');
    expect(useI18nStore.getState().language).toBe('en');
  });

  it('changeLanguage persists and updates the store', async () => {
    await changeLanguage(db, 'en');
    expect(useI18nStore.getState().language).toBe('en');
    expect(await import('@/database/queries/settings').then(m => m.getSetting(db, 'language'))).toBe('en');
  });

  it('loadPersistedLanguage applies a saved value', async () => {
    await setSetting(db, 'language', 'en');
    await loadPersistedLanguage(db);
    expect(useI18nStore.getState().language).toBe('en');
  });

  it('loadPersistedLanguage keeps default pt when nothing saved', async () => {
    await loadPersistedLanguage(db);
    expect(useI18nStore.getState().language).toBe('pt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/i18n/persistence.test.ts`
Expected: FAIL — `Cannot find module '@/store/i18n-store'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/store/i18n-store.ts` (imports `Language` from `./types` — NOT from `@/i18n` — to avoid a cycle):

```ts
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
```

Create `src/i18n/useTranslation.ts` (the hook — depends on the store):

```ts
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
```

Append the hook re-export to `src/i18n/index.ts` (so screens can `import { useTranslation } from '@/i18n'`):

```ts
export { useTranslation } from './useTranslation';
```

Create `src/i18n/persistence.ts`:

```ts
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
```

In `App.tsx`, pull `dbHandle` from the store and load the language once the DB is ready. Change the destructuring (line 11) and add an effect after it:

```ts
  const { isReady, error, initialize, dbHandle } = useDatabaseStore();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (isReady && dbHandle) {
      import('@/i18n/persistence').then((m) => m.loadPersistedLanguage(dbHandle));
    }
  }, [isReady, dbHandle]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/i18n/persistence.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the i18n core tests again (module graph now complete)**

Run: `npx jest __tests__/i18n/ && npx tsc --noEmit`
Expected: PASS + tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/store/i18n-store.ts src/i18n/useTranslation.ts src/i18n/index.ts src/i18n/persistence.ts App.tsx __tests__/i18n/persistence.test.ts
git commit -m "feat(i18n): store de idioma + hook + persistência SQLite + boot load"
```

---

### Task 4: Toggle no MainMenu + extração do MainMenuScreen

**Files:**
- Modify: `src/screens/MainMenuScreen.tsx`

No unit test (UI). Verified by `tsc` and the browser (Task 11).

- [ ] **Step 1: Add imports and the language toggle**

In `src/screens/MainMenuScreen.tsx`, add the i18n imports:

```ts
import { useTranslation } from '@/i18n';
import { useI18nStore } from '@/store/i18n-store';
import { changeLanguage } from '@/i18n/persistence';
```

Inside the component, get `t` and wire the toggle:

```ts
  const { t } = useTranslation();
  const language = useI18nStore((s) => s.language);

  function handleSetLanguage(lang: 'pt' | 'en') {
    if (dbHandle) changeLanguage(dbHandle, lang);
  }
```

Add a compact toggle at the top of the returned `<View style={commonStyles.screen}>` (before `titleSection`):

```tsx
      <View style={styles.langToggle}>
        {(['pt', 'en'] as const).map((lng) => (
          <TouchableOpacity
            key={lng}
            style={[styles.langButton, language === lng && styles.langButtonActive]}
            onPress={() => handleSetLanguage(lng)}
            activeOpacity={0.7}
          >
            <Text style={[styles.langButtonText, language === lng && styles.langButtonTextActive]}>
              {lng.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
```

And these styles in the `StyleSheet.create`:

```ts
  langToggle: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  langButton: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langButtonText: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' },
  langButtonTextActive: { color: colors.text },
```

- [ ] **Step 2: Replace the hardcoded strings with `t(...)`**

Apply these exact replacements (the `mainmenu.*`/`common.*` keys already exist from Task 1; "FOOTBALL MANAGER" stays literal — it's the game name):

```tsx
        <Text style={styles.subtitle}>{t('mainmenu.subtitle')}</Text>
```
```tsx
          <Text style={styles.primaryButtonText}>{t('mainmenu.new_game').toUpperCase()}</Text>
```
```tsx
            <Text style={styles.savesLabel}>{t('mainmenu.load_game')}</Text>
```
```tsx
                    <Text style={styles.saveName}>{save.name || t('mainmenu.save_default', { id: save.id })}</Text>
```
```tsx
                    <Text style={styles.saveMeta}>
                      {t('mainmenu.save_meta', { season: save.currentSeason, week: save.currentWeek })}
                    </Text>
```
```tsx
            <Text style={styles.noSavesText}>{t('mainmenu.no_saves')}</Text>
```

And the delete confirm (line 52):

```ts
    const confirmed = window.confirm(t('mainmenu.delete_confirm', { name: save.name || t('mainmenu.save_default', { id: save.id }) }));
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/screens/MainMenuScreen.tsx
git commit -m "feat(i18n): toggle PT/EN no MainMenu + extração de strings"
```

---

### Tasks 5–10: Extração das telas core restantes

Each task below is **mechanical string extraction** following the exact pattern established in Task 4:

1. Open the screen file and find every user-visible literal string in its body (in `<Text>`, `Alert`/`window.confirm` messages, placeholders, accessibility labels).
2. For each, add a key under the screen's namespace to **both** `src/i18n/pt.ts` and `src/i18n/en.ts` (pt = correct Portuguese, en = correct English; pick the right meaning regardless of which language the current literal happens to be in). Use `{var}` interpolation for dynamic pieces.
3. Replace the literal with `t('<namespace>.<key>', vars?)`. Add `import { useTranslation } from '@/i18n';` and `const { t } = useTranslation();` if not present.
4. Leave proper nouns, club/player names, and engine-generated text as-is (out of scope).
5. Run `npx tsc --noEmit` (exit 0) and the parity test (`npx jest __tests__/i18n/parity.test.ts`) — both must pass before committing.

Keys must stay flat and namespaced; reuse `common.*` for shared words ("Voltar", "Cancelar", etc.).

- [ ] **Task 5 — `src/screens/NewGameScreen.tsx`** (namespace `newgame.*`). Includes the ambition/country/suggestions steps ("Qual sua ambição?", "Escolha o país", "Clubes sugeridos", "Explorar todas as ligas →", "Select League", "Confirm Selection", "START GAME", "DIFFICULTY", Easy/Normal/Hard, etc.). Commit: `feat(i18n): extrai strings do NewGameScreen`.

- [ ] **Task 6 — `src/screens/home/HomeScreen.tsx`** (namespace `home.*`). E.g. "ADVANCE WEEK", "NEXT MATCH", "Recent Results", "OBJECTIVE", "TRUST", "No upcoming matches this week". Use interpolation for "Season {season} — Week {week}" (reuse `mainmenu.save_meta` or add `home.season_week`). Commit: `feat(i18n): extrai strings do HomeScreen`.

- [ ] **Task 7 — `src/screens/news/NewsScreen.tsx`** (namespace `news.*`). Static UI labels/headers only; engine-generated headline text stays as-is. Commit: `feat(i18n): extrai strings do NewsScreen`.

- [ ] **Task 8 — `src/screens/tactics/TacticsScreen.tsx`** (namespace `tactics.*`). E.g. "Technical/Mental/Physical", "Morale", "Fitness", "Arraste para trocar jogadores", section titles. Commit: `feat(i18n): extrai strings do TacticsScreen`.

- [ ] **Task 9 — `src/screens/club/ClubOverviewScreen.tsx`** (namespace `club.*`). E.g. budget/reputation labels, navigation row labels. Commit: `feat(i18n): extrai strings do ClubOverviewScreen`.

- [ ] **Task 10 — `src/screens/reports/ReportsHubScreen.tsx`** (namespace `reports.*`). The hub's category/section labels. Commit: `feat(i18n): extrai strings do ReportsHubScreen`.

---

### Task 11: Verificação final

- [ ] **Step 1: Full suite + type-check**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green (516 anteriores + ~12 novos = ~528).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Browser validation (Playwright MCP)**

Start the web server (per the project's web-dev-server notes: harness background `CI=1 npx expo start --web --port 19006`, navigate `localhost:8082`). Then:
- MainMenu shows the **PT/EN toggle**; default is PT.
- Tap **EN** → MainMenu strings switch to English; tap **PT** → back to Portuguese.
- Reload the page → language persists (read from `app_settings`).
- Walk MainMenu → NewGame → Home and the News/Tactics/Club/Reports tabs in both languages — no leftover hardcoded strings in the core screens, no missing-key fallbacks showing raw keys.

- [ ] **Step 3: Push (com autorização do usuário)**

```bash
git push origin main
```

---

## Notas de implementação

- **Ordem 1→2→3 é obrigatória**: a Task 3 adiciona o hook ao `index.ts` e depende das queries (Task 2) e do núcleo puro (Task 1). O ciclo index↔store é evitado por `types.ts` (tipo `Language`) e pela separação `translate.ts` (puro) / `useTranslation.ts` (hook).
- O texto "FOOTBALL MANAGER" (nome do jogo) permanece literal.
- Strings geradas pela engine (objetivos, manchetes) e títulos de header do RootNavigator estão **fora de escopo** (sub-projeto 2 / plano futuro).
- A garantia de paridade pt/en é dupla: tipo (`Record<keyof typeof pt, string>`) + teste runtime (`parity.test.ts`).
