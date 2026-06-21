# D7 — Acessibilidade + Settings Global Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`).

**Goal:** Entregar uma tela global de Settings (`SettingsScreen`) com idioma, reduce-motion, haptics, escala de fonte e dificuldade default, persistida em `app_settings` (key-value, **sem tabela nova**) e reidratada no boot; mais um `settings-store` (Zustand) que expõe os toggles para D2/D6, e `accessibilityLabel`/`testID` no kit (D3) e nas telas-alvo de D0.

**Architecture:** Espelha o padrão já existente de idioma (`i18n/persistence.ts` + `i18n-store`): um Zustand store de preferências (`settings-store.ts`) com `hydrate(db)` que lê chaves de `app_settings` via `getSetting`/`setSetting` (`queries/settings.ts`), e setters que persistem ao escrever. A `SettingsScreen` é uma tela pushável registrada no `RootNavigator` que consome o store + `changeLanguage`. Boot chama `hydrateSettings(dbHandle)` ao lado de `loadPersistedLanguage` (`App.tsx:18-22`). Sem tocar engine, sem `save_id` (preferências de app são globais, como `language`).

**Tech Stack:** TS 5.9 strict, Zustand, Jest+ts-jest, better-sqlite3 (testes), React Navigation v7, React Native (Switch/TouchableOpacity).

**Convenções:** TDD (store + persistência); SQLite real em memória, **nunca** mock; engine puro intocado; i18n pt/en com paridade (`__tests__/i18n/parity.test.ts`); tokens via `@/theme`; defaults `reduceMotion=false, haptics=true, fontScale=1, difficultyDefault='normal'`; branch `feat/d7-accessibility-settings`; **subagents NÃO commitam** (orquestrador commita). Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- `src/i18n/persistence.ts` — `loadPersistedLanguage`/`changeLanguage` (read+apply / set+persist).
- `src/store/training-store.ts` — store Zustand + funções `set*`/`load*` que casam store↔DB.
- `src/store/i18n-store.ts` — store mínimo de preferência.
- `__tests__/store/training-store.test.ts` — teste de store com DB real (`createTestDb`/`createTestDbHandle`).
- `__tests__/database/queries/settings.test.ts` — padrão de teste de `getSetting`/`setSetting`.
- `src/screens/MainMenuScreen.tsx:30-34,81-94` — toggle de idioma (`changeLanguage`, render de botões).
- `src/database/queries/settings.ts` — `getSetting`/`setSetting` (reuso, sem nova query).

---

## File Structure
- **Create** `src/store/settings-store.ts` — Zustand `useSettingsStore` + `hydrateSettings(db)`, `setReduceMotion/setHaptics/setFontScale/setDifficultyDefault` (persistem em `app_settings`).
- **Create** `src/screens/SettingsScreen.tsx` — tela: idioma (via `changeLanguage`), reduce-motion (Switch), haptics (Switch), fontScale (botões S/M/G), dificuldade default (botões). Tokens de `@/theme`.
- **Modify** `src/navigation/types.ts:13` — adicionar `Settings: undefined;` ao `RootStackParamList`.
- **Modify** `src/navigation/RootNavigator.tsx` — `import { SettingsScreen }` + `<Stack.Screen name="Settings" ...>`.
- **Modify** `App.tsx:18-22` — reidratar settings no boot ao lado de `loadPersistedLanguage`.
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` — `nav.settings` + bloco `settings.*` (paridade).
- **Test** `__tests__/store/settings-store.test.ts` — hydrate + setters persistem/reidratam (DB real).

**Contract (assinaturas exatas):**

```ts
// src/store/settings-store.ts
import { Difficulty } from '@/types/save'; // 'easy' | 'normal' | 'hard'
import { DbHandle } from '@/database/queries/players';

export interface SettingsState {
  reduceMotion: boolean;      // default false
  haptics: boolean;           // default true
  fontScale: number;          // default 1 (∈ {0.9, 1, 1.15})
  difficultyDefault: Difficulty; // default 'normal'
}
export const useSettingsStore: import('zustand').UseBoundStore<
  import('zustand').StoreApi<SettingsState>
>;

export function hydrateSettings(db: DbHandle): Promise<void>;            // lê app_settings → store
export function setReduceMotion(db: DbHandle, v: boolean): Promise<void>;
export function setHaptics(db: DbHandle, v: boolean): Promise<void>;
export function setFontScale(db: DbHandle, v: number): Promise<void>;
export function setDifficultyDefault(db: DbHandle, v: Difficulty): Promise<void>;

// Chaves em app_settings (globais, sem save_id):
//   'reduce_motion' = '1' | '0'
//   'haptics'       = '1' | '0'
//   'font_scale'    = '0.9' | '1' | '1.15'
//   'difficulty_default' = 'easy' | 'normal' | 'hard'
```

---

## Task 1: `settings-store` com `hydrateSettings` (TDD, DB real)

**Files:** Create `src/store/settings-store.ts`, Create `__tests__/store/settings-store.test.ts`.
**Interfaces:** Consumes: `getSetting`/`setSetting` (`@/database/queries/settings`), `Difficulty` (`@/types/save`), `DbHandle` (`@/database/queries/players`). · Produces: `useSettingsStore`, `hydrateSettings`, `setReduceMotion`, `setHaptics`, `setFontScale`, `setDifficultyDefault`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/store/settings-store.test.ts`:
```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getSetting } from '@/database/queries/settings';
import {
  useSettingsStore,
  hydrateSettings,
  setReduceMotion,
  setHaptics,
  setFontScale,
  setDifficultyDefault,
} from '@/store/settings-store';

const DEFAULTS = { reduceMotion: false, haptics: true, fontScale: 1, difficultyDefault: 'normal' } as const;

describe('settings store', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    db = createTestDbHandle(rawDb);
    useSettingsStore.setState({ ...DEFAULTS });
  });
  afterEach(() => rawDb.close());

  it('has documented defaults', () => {
    expect(useSettingsStore.getState()).toMatchObject(DEFAULTS);
  });

  it('hydrateSettings on empty db keeps defaults', async () => {
    await hydrateSettings(db);
    expect(useSettingsStore.getState()).toMatchObject(DEFAULTS);
  });

  it('setters persist to app_settings and update the store', async () => {
    await setReduceMotion(db, true);
    await setHaptics(db, false);
    await setFontScale(db, 1.15);
    await setDifficultyDefault(db, 'hard');

    expect(useSettingsStore.getState()).toMatchObject({
      reduceMotion: true, haptics: false, fontScale: 1.15, difficultyDefault: 'hard',
    });
    expect(await getSetting(db, 'reduce_motion')).toBe('1');
    expect(await getSetting(db, 'haptics')).toBe('0');
    expect(await getSetting(db, 'font_scale')).toBe('1.15');
    expect(await getSetting(db, 'difficulty_default')).toBe('hard');
  });

  it('hydrateSettings reads persisted values back into the store', async () => {
    await setReduceMotion(db, true);
    await setHaptics(db, false);
    await setFontScale(db, 0.9);
    await setDifficultyDefault(db, 'easy');
    useSettingsStore.setState({ ...DEFAULTS }); // wipe in-memory

    await hydrateSettings(db);
    expect(useSettingsStore.getState()).toMatchObject({
      reduceMotion: true, haptics: false, fontScale: 0.9, difficultyDefault: 'easy',
    });
  });

  it('hydrateSettings ignores invalid font_scale / difficulty', async () => {
    await db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('font_scale','99')").run();
    await db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('difficulty_default','lol')").run();
    await hydrateSettings(db);
    expect(useSettingsStore.getState().fontScale).toBe(1);
    expect(useSettingsStore.getState().difficultyDefault).toBe('normal');
  });
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente):** `npx jest __tests__/store/settings-store.test.ts`
  → esperado: `Cannot find module '@/store/settings-store'`.
- [ ] **Step 3 — implementar** `src/store/settings-store.ts`:
```ts
import { create } from 'zustand';
import { DbHandle } from '@/database/queries/players';
import { getSetting, setSetting } from '@/database/queries/settings';
import { Difficulty } from '@/types/save';

export interface SettingsState {
  reduceMotion: boolean;
  haptics: boolean;
  fontScale: number;
  difficultyDefault: Difficulty;
}

const VALID_FONT_SCALES = [0.9, 1, 1.15];
const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

const DEFAULTS: SettingsState = {
  reduceMotion: false,
  haptics: true,
  fontScale: 1,
  difficultyDefault: 'normal',
};

export const useSettingsStore = create<SettingsState>(() => ({ ...DEFAULTS }));

/** Reads persisted preferences into the store. Missing/invalid → keeps defaults. */
export async function hydrateSettings(db: DbHandle): Promise<void> {
  const reduce = await getSetting(db, 'reduce_motion');
  const haptics = await getSetting(db, 'haptics');
  const scaleRaw = await getSetting(db, 'font_scale');
  const diffRaw = await getSetting(db, 'difficulty_default');

  const scale = scaleRaw === null ? DEFAULTS.fontScale : Number(scaleRaw);
  const diff = diffRaw as Difficulty | null;

  useSettingsStore.setState({
    reduceMotion: reduce === null ? DEFAULTS.reduceMotion : reduce === '1',
    haptics: haptics === null ? DEFAULTS.haptics : haptics === '1',
    fontScale: VALID_FONT_SCALES.includes(scale) ? scale : DEFAULTS.fontScale,
    difficultyDefault:
      diff && VALID_DIFFICULTIES.includes(diff) ? diff : DEFAULTS.difficultyDefault,
  });
}

export async function setReduceMotion(db: DbHandle, v: boolean): Promise<void> {
  useSettingsStore.setState({ reduceMotion: v });
  await setSetting(db, 'reduce_motion', v ? '1' : '0');
}

export async function setHaptics(db: DbHandle, v: boolean): Promise<void> {
  useSettingsStore.setState({ haptics: v });
  await setSetting(db, 'haptics', v ? '1' : '0');
}

export async function setFontScale(db: DbHandle, v: number): Promise<void> {
  useSettingsStore.setState({ fontScale: v });
  await setSetting(db, 'font_scale', String(v));
}

export async function setDifficultyDefault(db: DbHandle, v: Difficulty): Promise<void> {
  useSettingsStore.setState({ difficultyDefault: v });
  await setSetting(db, 'difficulty_default', v);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/store/settings-store.test.ts` → 5 testes verdes. Depois `npx tsc --noEmit` (exit 0).
- [ ] **Step 5 — commit:** (orquestrador commita) `git add src/store/settings-store.ts __tests__/store/settings-store.test.ts` · msg: `feat(d7): settings-store com hydrate e persistência em app_settings`.

---

## Task 2: i18n pt/en das strings de Settings (paridade)

**Files:** Modify `src/i18n/pt.ts`, `src/i18n/en.ts`.
**Interfaces:** Consumes: nada. · Produces: chaves `nav.settings`, `settings.*` (consumidas pela Task 3).

- [ ] **Step 1 — teste falhando:** o teste é a paridade existente. Antes de adicionar chaves, garantir que a suíte está verde como baseline: `npx jest __tests__/i18n/parity.test.ts` (verde). A "falha" será deliberada: adicionar as chaves só em `pt.ts` e ver `parity` quebrar no Step 2.
- [ ] **Step 2 — adicionar só em `pt.ts` e ver quebrar:** inserir antes do fechamento `} as const;` de `src/i18n/pt.ts` (após o bloco `hints.*`):
```ts
  'nav.settings': 'Configurações',
  'settings.title': 'Configurações',
  'settings.language': 'Idioma',
  'settings.reduce_motion': 'Reduzir animações',
  'settings.reduce_motion_desc': 'Desliga transições e efeitos de movimento.',
  'settings.haptics': 'Vibração',
  'settings.haptics_desc': 'Feedback tátil em ações e celebrações.',
  'settings.font_scale': 'Tamanho da fonte',
  'settings.font_scale_small': 'Pequeno',
  'settings.font_scale_medium': 'Médio',
  'settings.font_scale_large': 'Grande',
  'settings.difficulty': 'Dificuldade padrão',
  'settings.difficulty_desc': 'Aplica-se a novos jogos. Não altera saves existentes.',
  'settings.difficulty_easy': 'Fácil',
  'settings.difficulty_normal': 'Normal',
  'settings.difficulty_hard': 'Difícil',
```
  Rodar `npx jest __tests__/i18n/parity.test.ts` → esperado: **falha** (chaves em pt ausentes em en).
- [ ] **Step 3 — adicionar em `en.ts`:** inserir antes do fechamento `};` de `src/i18n/en.ts` (após o bloco `hints.*`):
```ts
  'nav.settings': 'Settings',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.reduce_motion': 'Reduce motion',
  'settings.reduce_motion_desc': 'Turns off transitions and motion effects.',
  'settings.haptics': 'Haptics',
  'settings.haptics_desc': 'Tactile feedback on actions and celebrations.',
  'settings.font_scale': 'Font size',
  'settings.font_scale_small': 'Small',
  'settings.font_scale_medium': 'Medium',
  'settings.font_scale_large': 'Large',
  'settings.difficulty': 'Default difficulty',
  'settings.difficulty_desc': 'Applies to new games. Does not change existing saves.',
  'settings.difficulty_easy': 'Easy',
  'settings.difficulty_normal': 'Normal',
  'settings.difficulty_hard': 'Hard',
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/i18n/parity.test.ts` → verde. `npx tsc --noEmit` (exit 0; `TKey` agora inclui as novas chaves).
- [ ] **Step 5 — commit:** `git add src/i18n/pt.ts src/i18n/en.ts` · msg: `feat(d7): i18n pt/en das strings de Settings (paridade)`.

---

## Task 3: `SettingsScreen` + registro no `RootNavigator`

**Files:** Create `src/screens/SettingsScreen.tsx`, Modify `src/navigation/types.ts`, Modify `src/navigation/RootNavigator.tsx`.
**Interfaces:** Consumes: `useSettingsStore`+setters (Task 1), `changeLanguage` (`@/i18n/persistence`), `useI18nStore`, `useDatabaseStore` (`dbHandle`), `useTranslation`, tokens de `@/theme`. · Produces: rota `Settings` no `RootStackParamList`.

- [ ] **Step 1 — tipos da rota (compila, ainda sem tela):** em `src/navigation/types.ts`, adicionar dentro de `RootStackParamList` (logo após `Game: undefined;`, linha 4):
```ts
  Settings: undefined;
```
  Rodar `npx tsc --noEmit` → esperado: ainda **verde** (rota tipada, ainda não usada).
- [ ] **Step 2 — criar a tela:** `src/screens/SettingsScreen.tsx`:
```tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useI18nStore } from '@/store/i18n-store';
import { changeLanguage } from '@/i18n/persistence';
import { useDatabaseStore } from '@/store/database-store';
import {
  useSettingsStore,
  setReduceMotion,
  setHaptics,
  setFontScale,
  setDifficultyDefault,
} from '@/store/settings-store';
import { Difficulty } from '@/types/save';

const FONT_SCALES: { value: number; key: 'small' | 'medium' | 'large' }[] = [
  { value: 0.9, key: 'small' },
  { value: 1, key: 'medium' },
  { value: 1.15, key: 'large' },
];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export function SettingsScreen() {
  const { t } = useTranslation();
  const { dbHandle } = useDatabaseStore();
  const language = useI18nStore((s) => s.language);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const haptics = useSettingsStore((s) => s.haptics);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const difficultyDefault = useSettingsStore((s) => s.difficultyDefault);

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content} testID="settings-screen">
      {/* Idioma */}
      <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
      <View style={styles.segment}>
        {(['pt', 'en'] as const).map((lng) => (
          <TouchableOpacity
            key={lng}
            testID={`settings-language-${lng}`}
            accessibilityRole="button"
            accessibilityLabel={t('settings.language')}
            accessibilityState={{ selected: language === lng }}
            style={[styles.segmentItem, language === lng && styles.segmentItemActive]}
            onPress={() => dbHandle && changeLanguage(dbHandle, lng)}
          >
            <Text style={[styles.segmentText, language === lng && styles.segmentTextActive]}>
              {lng.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reduce motion */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelWrap}>
          <Text style={styles.rowLabel}>{t('settings.reduce_motion')}</Text>
          <Text style={styles.rowDesc}>{t('settings.reduce_motion_desc')}</Text>
        </View>
        <Switch
          testID="settings-reduce-motion"
          accessibilityLabel={t('settings.reduce_motion')}
          value={reduceMotion}
          onValueChange={(v) => dbHandle && setReduceMotion(dbHandle, v)}
        />
      </View>

      {/* Haptics */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelWrap}>
          <Text style={styles.rowLabel}>{t('settings.haptics')}</Text>
          <Text style={styles.rowDesc}>{t('settings.haptics_desc')}</Text>
        </View>
        <Switch
          testID="settings-haptics"
          accessibilityLabel={t('settings.haptics')}
          value={haptics}
          onValueChange={(v) => dbHandle && setHaptics(dbHandle, v)}
        />
      </View>

      {/* Font scale */}
      <Text style={styles.sectionLabel}>{t('settings.font_scale')}</Text>
      <View style={styles.segment}>
        {FONT_SCALES.map(({ value, key }) => (
          <TouchableOpacity
            key={key}
            testID={`settings-font-scale-${key}`}
            accessibilityRole="button"
            accessibilityLabel={t(`settings.font_scale_${key}`)}
            accessibilityState={{ selected: fontScale === value }}
            style={[styles.segmentItem, fontScale === value && styles.segmentItemActive]}
            onPress={() => dbHandle && setFontScale(dbHandle, value)}
          >
            <Text style={[styles.segmentText, fontScale === value && styles.segmentTextActive]}>
              {t(`settings.font_scale_${key}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Difficulty default */}
      <Text style={styles.sectionLabel}>{t('settings.difficulty')}</Text>
      <Text style={styles.rowDesc}>{t('settings.difficulty_desc')}</Text>
      <View style={styles.segment}>
        {DIFFICULTIES.map((d) => (
          <TouchableOpacity
            key={d}
            testID={`settings-difficulty-${d}`}
            accessibilityRole="button"
            accessibilityLabel={t(`settings.difficulty_${d}`)}
            accessibilityState={{ selected: difficultyDefault === d }}
            style={[styles.segmentItem, difficultyDefault === d && styles.segmentItemActive]}
            onPress={() => dbHandle && setDifficultyDefault(dbHandle, d)}
          >
            <Text style={[styles.segmentText, difficultyDefault === d && styles.segmentTextActive]}>
              {t(`settings.difficulty_${d}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  segmentItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  segmentTextActive: { color: colors.text },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleLabelWrap: { flex: 1 },
  rowLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowDesc: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
});
```
  > Nota: confirmar que `radius.md` existe em `@/theme` (`tokens.ts:50`); se a chave for `radius.sm`/`radius.lg`, ajustar para a equivalente em uso. `colors.border`/`colors.surface`/`colors.textSecondary`/`colors.primary` já existem (usados em `MainMenuScreen.tsx:256-270`).
- [ ] **Step 3 — registrar no navigator:** em `src/navigation/RootNavigator.tsx`:
  1. import após a linha 11 (`import { UpgradesScreen } ...`):
```ts
import { SettingsScreen } from '@/screens/SettingsScreen';
```
  2. adicionar a `<Stack.Screen>` no bloco de telas (após a linha 84, `ClubAssistantHiring`):
```tsx
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
```
- [ ] **Step 4 — rodar (passa):** `npx tsc --noEmit` (exit 0) e `npx jest` (suíte completa verde, incluindo `parity`).
- [ ] **Step 5 — commit:** `git add src/screens/SettingsScreen.tsx src/navigation/types.ts src/navigation/RootNavigator.tsx` · msg: `feat(d7): SettingsScreen (idioma/motion/haptics/fonte/dificuldade) registrada no RootNavigator`.

---

## Task 4: Reidratar settings no boot (`App.tsx`)

**Files:** Modify `App.tsx`.
**Interfaces:** Consumes: `hydrateSettings` (Task 1). · Produces: settings reidratados quando `isReady && dbHandle`.

- [ ] **Step 1 — escrever a mudança (TDD via boot effect):** D7 não adiciona teste de `App.tsx` (componente de raiz, validado no browser); a garantia de reidratação já está coberta pelo teste de `hydrateSettings` (Task 1). Editar o `useEffect` de boot em `App.tsx:18-22`, espelhando `loadPersistedLanguage`:
```tsx
  useEffect(() => {
    if (isReady && dbHandle) {
      import('@/i18n/persistence').then((m) => m.loadPersistedLanguage(dbHandle));
      import('@/store/settings-store').then((m) => m.hydrateSettings(dbHandle));
    }
  }, [isReady, dbHandle]);
```
- [ ] **Step 2 — rodar:** `npx tsc --noEmit` (exit 0).
- [ ] **Step 3 — rodar suíte:** `npx jest` (verde — nenhum teste de boot quebra; engine intocado).
- [ ] **Step 4 — browser (Playwright MCP):** subir o dev server (`npm run web`, porta 8082), abrir o app, navegar até Settings (via a entrada que o D5 cabeará — por ora navegar manualmente `navigation.navigate('Settings')` pelo MainMenu ou via deep-link de teste), alternar idioma/reduce-motion/haptics/fonte/dificuldade, **recarregar a página** e confirmar que os valores reidratam (persistência em `app_settings`). 0 erros de console.
- [ ] **Step 5 — commit:** `git add App.tsx` · msg: `feat(d7): reidratar settings no boot ao lado de loadPersistedLanguage`.

---

## Task 5: `accessibilityLabel`/`testID` no kit (D3) + telas-alvo de D0

**Files:** Modify (D3 kit, criados no plano D3): `src/components/Button.tsx`, `src/components/Card.tsx`, `src/components/Chip.tsx`, `src/components/StatBar.tsx`, `src/components/EmptyState.tsx`, `src/components/Toast.tsx`, `src/components/useConfirm.tsx`. Modify telas-alvo de D0: `src/screens/club/transfers/TransferMarketScreen.tsx`, `src/screens/club/transfers/FreeAgentsScreen.tsx` (beachhead).
**Interfaces:** Consumes: props `testID?`/`accessibilityLabel?` já presentes no contract do kit (ex.: `Button` em §D3). · Produces: queries estáveis para os smoke tests de D0.
**Pré-requisito:** D3 (kit) e D5 (migração das telas) entregues. Se D3/D5 ainda não existirem na execução, esta task fica **bloqueada** — registrar como dependência e pular sem marcar como concluída.

- [ ] **Step 1 — teste falhando (smoke por testID):** estender o smoke test de D0 da beachhead (`__tests__/screens/TransferMarketScreen.test.tsx`, criado em D0) para asserir presença dos `testID` do kit. Exemplo de asserção a adicionar (react-test-renderer):
```ts
// dentro do teste de render já existente em D0:
const tree = renderer.create(<Wrapped><TransferMarketScreen /></Wrapped>);
// botão primário do kit precisa de testID estável:
expect(tree.root.findAllByProps({ testID: 'transfer-make-offer' }).length).toBeGreaterThan(0);
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/screens/TransferMarketScreen.test.tsx` → falha (testID ausente).
- [ ] **Step 3 — implementar:** garantir que cada pressable/CTA do kit aceita e repassa `testID`/`accessibilityLabel` ao `Pressable`/`TouchableOpacity` subjacente (no D3 o contract de `Button` já expõe `testID?`/`accessibilityLabel?` — apenas garantir o repasse), e preencher esses props nas telas migradas (ex.: `<Button label={t('transfer.make_offer')} testID="transfer-make-offer" accessibilityLabel={t('transfer.make_offer')} ... />`). Sem strings hardcoded: labels via `t(...)`.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/screens/` (smoke das telas-alvo verde) e `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/components/ src/screens/club/transfers/` (apenas os arquivos tocados) · msg: `feat(d7): accessibilityLabel/testID no kit e na beachhead para queries estáveis`.

---

## Self-Review
1. **Cobertura do spec (§D7):** `settings-store` com `hydrate(db)` + setters persistindo em `app_settings` (Task 1); chaves `reduce_motion`/`haptics`/`font_scale`/`difficulty_default`, **sem nova tabela** (reuso `getSetting`/`setSetting`); `SettingsScreen` com idioma (`changeLanguage`)/reduce-motion/haptics/fontScale/dificuldade, registrada no `RootNavigator` (Task 3); reidratação no boot ao lado de `loadPersistedLanguage` (Task 4); i18n pt/en com paridade (Task 2); `accessibilityLabel`/`testID` no kit + telas-alvo de D0 (Task 5). DoD do spec coberto.
2. **Placeholder scan:** sem "TBD"/"adicionar depois". Único ponto condicional explícito: `radius.md` (Task 3) — instrução de ajustar para a chave real de `tokens.ts` se diferir; Task 5 depende de D3/D5 e está marcada como bloqueante se ausentes — não é placeholder de comportamento.
3. **Consistência de tipos:** `Difficulty` importado de `@/types/save` (`'easy'|'normal'|'hard'`, confirmado em `save.ts:1`); `DbHandle` de `@/database/queries/players`; `useSettingsStore`/`hydrateSettings`/setters batem com o contract; chaves de `app_settings` consistentes entre store, teste e `SettingsScreen`. `fontScale ∈ {0.9,1,1.15}` consistente entre store (validação), teste e UI. Zero `Math.random`/`Date.now`; engine intocado.
