# Navigation & Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make every implemented screen reachable and crash-safe: register the `PlayerDetail` route via a navigation-aware wrapper, add a root `ErrorBoundary`, wire orphan screens (Squad tab, Training, Youth Academy, Calendar, Match Report, Cup Bracket, Top Scorers) into the nav graph, replace web-only `window.confirm` with `Alert.alert`, and route board firing to a game-over screen.

**Architecture:** Pure navigation/UI wiring + one class `ErrorBoundary` at the root; **zero changes to `src/engine/`**. Two pieces of testable logic are extracted to **pure functions** so they can be unit-tested in the project's `node` Jest env (which has **no** component renderer): `resolveSeasonEndRoute` (game-over branch decision) and `buildTopScorers` / `buildCupBracket` (data shaping over rows returned by existing queries). `PlayerDetail` gets a `PlayerDetailRoute` wrapper that reads `route.params.playerId`, loads via the existing `getPlayerById`, and reuses the unchanged prop-based `PlayerDetailScreen`. React wiring (route registration, tab, entry points) is verified by `tsc` + Playwright, not by render tests.

**Tech Stack:** TypeScript 5.9 (strict), React Native 0.81 / Expo 54, React Navigation v7 (`@react-navigation/native-stack`, `@react-navigation/bottom-tabs`), Zustand, Jest 29 + ts-jest (`testEnvironment: 'node'`), better-sqlite3 (tests) / expo-sqlite (runtime). i18n via `@/i18n` (`useTranslation`/`t`, keys in `src/i18n/pt.ts` + `src/i18n/en.ts`). **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-05-31-navigation-screens-design.md`

---

## File Structure

| File | Action | Why |
|---|---|---|
| `src/components/ErrorBoundary.tsx` | **create** | Class component catching render/effect throws under the navigator; themed fallback + retry. Only `class` in the project — justified (only class components catch React errors). |
| `src/screens/squad/PlayerDetailRoute.tsx` | **create** | Navigation-aware wrapper: reads `route.params.playerId`, loads via `getPlayerById`, renders prop-based `PlayerDetailScreen`. |
| `src/screens/GameOverScreen.tsx` | **create** | Dismissal screen. Reads `lastTrustConsequence` from `useBoardStore`; "back to menu" → `clearGame()` + `navigation.reset` to `MainMenu`. |
| `src/screens/EndOfSeasonScreen.helpers.ts` | **create** | Pure `resolveSeasonEndRoute(consequence)` decision, unit-tested. |
| `src/screens/league/top-scorers.ts` | **create** | Pure-ish `buildTopScorers(db, season, competitionId)` over existing queries; DB-tested. |
| `src/screens/league/cup-bracket.ts` | **create** | Pure-ish `buildCupBracket(db, season, week, competitionId)` over existing queries; DB-tested. |
| `src/navigation/types.ts` | modify | Add `Calendar`, `CupBracket`, `TopScorers`, `Training`, `YouthAcademy`, `GameOver` to `RootStackParamList`; add `SquadTab` to `TabParamList`. |
| `src/navigation/RootNavigator.tsx` | modify | Register `PlayerDetail`, `MatchResult`, `Calendar`, `CupBracket`, `TopScorers`, `Training`, `YouthAcademy`, `GameOver` `Stack.Screen`s. |
| `src/navigation/TabNavigator.tsx` | modify | Add `SquadTab` (`SquadListScreen`, 👥) between Home and News. |
| `src/screens/squad/SquadListScreen.tsx` | modify | Replace inline `PlayerDetailScreen` embed (the `selectedPlayerId` state path) with `navigation.navigate('PlayerDetail', { playerId })`. |
| `src/screens/league/TopScorersScreen.tsx` | rewrite | Render real data via `buildTopScorers`. |
| `src/screens/league/CupBracketScreen.tsx` | rewrite | Render round-1 bracket via `buildCupBracket`; empty/"draw pending" states. |
| `src/screens/MainMenuScreen.tsx` | modify | Replace `window.confirm` (line 61) with `Alert.alert`; extract delete body to `doDelete`. |
| `src/screens/club/StaffScreen.tsx` | modify | Hire button → honest disabled "coming soon" state via `t()` instead of misleading Alert. |
| `src/screens/EndOfSeasonScreen.tsx` | modify | In `handleContinue` (line 528) branch on `resolveSeasonEndRoute(boardEval.consequence)`: `'GameOver'` → `navigation.reset`, else `navigate('Game')`. Skip new-season setup when fired. |
| `src/screens/home/HomeScreen.tsx` | modify | Add entry points (Calendar, Top Scorers, Cup Bracket) following the `LeagueStandings` shortcut pattern (line 368-380). |
| `App.tsx` | modify | Wrap `<RootNavigator/>` (line 50) with `<ErrorBoundary>`. |
| `src/i18n/pt.ts` / `src/i18n/en.ts` | modify | New keys: `gameover.*`, `topscorers.*`, `cupbracket.*`, `staff.*`, `nav.*`, `common.delete`. |
| Tests | create | `__tests__/screens/end-of-season-helpers.test.ts`, `__tests__/screens/top-scorers.test.ts`, `__tests__/screens/cup-bracket.test.ts`, `__tests__/navigation/root-navigator-routes.test.ts`. |

> **Testing constraint (verified):** `jest.config.js` uses `testEnvironment: 'node'` and the repo has **no** `@testing-library/react-native` or `react-test-renderer` (`node_modules` checked). Therefore React components are **not** rendered in tests. Logic is extracted to pure/DB functions tested with better-sqlite3 in-memory (per CLAUDE.md: real SQLite, never mocked). Route registration is asserted by importing the navigator module and inspecting the rendered element tree via `React.createElement` children (no DOM needed — plain object inspection), and ultimately by `tsc` + Playwright.

---

### Task 1: ErrorBoundary + wrap App (crash safety net)

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `App.tsx` (line 50, wrap `<RootNavigator/>`)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (add `common.*`/`errorboundary.*` keys)
- Test: none (UI-only; verified by `tsc`, parity test, Playwright in Task 11)

- [ ] **Step 1: Add i18n keys**

In `src/i18n/pt.ts` add (before the closing `} as const;`):

```ts
  'common.delete': 'Deletar',
  'errorboundary.title': 'Algo deu errado',
  'errorboundary.message': 'A tela encontrou um erro inesperado.',
  'errorboundary.retry': 'Tentar novamente',
```

In `src/i18n/en.ts` add the matching keys (same positions):

```ts
  'common.delete': 'Delete',
  'errorboundary.title': 'Something went wrong',
  'errorboundary.message': 'This screen hit an unexpected error.',
  'errorboundary.retry': 'Try again',
```

Run: `npx jest __tests__/i18n/parity.test.ts`
Expected: PASS (keys present in both).

- [ ] **Step 2: Create the ErrorBoundary**

Create `src/components/ErrorBoundary.tsx` (note: a class component cannot call the `useTranslation` hook, so it reads the current language from the store directly via `useI18nStore.getState()` + the pure `translate`):

```tsx
import React, { Component, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, commonStyles, fontSize, spacing } from '@/theme';
import { translate } from '@/i18n/translate';
import { useI18nStore } from '@/store/i18n-store';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface to console for diagnosis; do not re-throw (would white-screen).
    console.error('ErrorBoundary caught:', error);
  }

  handleRetry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const lang = useI18nStore.getState().language;
      return (
        <View style={[commonStyles.screen, styles.centered]}>
          <Text style={styles.title}>{translate(lang, 'errorboundary.title')}</Text>
          <Text style={styles.message}>{translate(lang, 'errorboundary.message')}</Text>
          <Pressable style={styles.retry} onPress={this.handleRetry}>
            <Text style={styles.retryText}>{translate(lang, 'errorboundary.retry')}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { color: colors.danger, fontSize: fontSize.xxl, fontWeight: 'bold', marginBottom: spacing.md, textAlign: 'center' },
  message: { color: colors.text, fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.lg },
  retry: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  retryText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
});
```

- [ ] **Step 3: Wrap the navigator in App.tsx**

In `App.tsx`, add the import after line 5:

```ts
import { ErrorBoundary } from '@/components/ErrorBoundary';
```

Replace line 50 (`<RootNavigator />`) with:

```tsx
      <ErrorBoundary>
        <RootNavigator />
      </ErrorBoundary>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/ErrorBoundary.tsx App.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(nav): ErrorBoundary na raiz — throw no render vira fallback temado, não tela branca"
```

---

### Task 2: PlayerDetailRoute wrapper + register PlayerDetail/MatchResult routes (fixes the crash)

**Files:**
- Create: `src/screens/squad/PlayerDetailRoute.tsx`
- Modify: `src/navigation/RootNavigator.tsx` (imports + add two `Stack.Screen`s after line 49)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (add `nav.player_detail`, `nav.match_result`)
- Test: `__tests__/navigation/root-navigator-routes.test.ts`

This is the highest-value fix: `PlayerDetail` is navigated to from 10 call sites but unregistered → crash.

- [ ] **Step 1: Write the failing test**

Create `__tests__/navigation/root-navigator-routes.test.ts`. It renders the navigator element tree (no DOM — just inspects the React element children produced by `RootNavigator()`), collecting every `Stack.Screen`'s `name` prop, and asserts the previously-missing routes are present.

```ts
import React from 'react';

// Stub the native-stack factory so RootNavigator() returns a plain element tree
// we can walk without a renderer. Navigator/Screen become host-like markers.
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: (props: { name: string }) => props,
  }),
}));

// useClubAccent reads theme/store; stub to a constant so RootNavigator() is callable.
jest.mock('@/theme/useClubAccent', () => ({ useClubAccent: () => ({ accent: '#fff' }) }));

import { RootNavigator } from '@/navigation/RootNavigator';

function collectScreenNames(node: unknown, acc: string[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectScreenNames(n, acc);
    return;
  }
  if (node && typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    const el = node as { props?: { name?: string; children?: unknown } };
    if (typeof el.props?.name === 'string') acc.push(el.props.name);
    if (el.props?.children) collectScreenNames(el.props.children, acc);
  }
}

describe('RootNavigator route registration', () => {
  it('registers PlayerDetail and MatchResult (regression: these crashed when unregistered)', () => {
    const tree = (RootNavigator as unknown as () => unknown)();
    const names: string[] = [];
    collectScreenNames(tree, names);
    expect(names).toEqual(expect.arrayContaining(['PlayerDetail', 'MatchResult']));
  });
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npx jest __tests__/navigation/root-navigator-routes.test.ts`
Expected: FAIL — `names` lacks `PlayerDetail`/`MatchResult` (assertion fails).

- [ ] **Step 3: Create the PlayerDetailRoute wrapper**

Create `src/screens/squad/PlayerDetailRoute.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, commonStyles } from '@/theme';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayerById } from '@/database/queries/players';
import { Player, PlayerAttributes } from '@/types';
import { RootStackParamList } from '@/navigation/types';
import PlayerDetailScreen from './PlayerDetailScreen';

type DetailRoute = RouteProp<RootStackParamList, 'PlayerDetail'>;

export function PlayerDetailRoute() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation();
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const playerId = route.params.playerId;

  const [player, setPlayer] = useState<(Player & { attributes: PlayerAttributes }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle) return;
    let cancelled = false;
    (async () => {
      const loaded = await getPlayerById(dbHandle, playerId);
      if (!cancelled) {
        setPlayer(loaded);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dbHandle, playerId]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <PlayerDetailScreen player={player} onBack={() => navigation.goBack()} />;
}
```

> `getPlayerById` (`src/database/queries/players.ts:136-156`) returns `(Player & { attributes: PlayerAttributes }) | null` — exactly the shape `PlayerDetailScreen`'s `player` prop expects (`PlayerDetailScreen.tsx:30-33`). `player === null` is already handled inside the component (`PlayerDetailScreen.tsx:134-145`, "Player not found").

- [ ] **Step 4: Add i18n keys**

In `src/i18n/pt.ts`:

```ts
  'nav.player_detail': 'Jogador',
  'nav.match_result': 'Resultado da Partida',
```

In `src/i18n/en.ts`:

```ts
  'nav.player_detail': 'Player',
  'nav.match_result': 'Match Result',
```

- [ ] **Step 5: Register the two routes in RootNavigator**

In `src/navigation/RootNavigator.tsx`, add imports after line 28:

```ts
import { PlayerDetailRoute } from '@/screens/squad/PlayerDetailRoute';
import { MatchResultScreen } from '@/screens/home/MatchResultScreen';
```

After line 49 (the `EndOfSeason` screen, before `{/* Club sub-screens */}`), add:

```tsx
      <Stack.Screen name="PlayerDetail" component={PlayerDetailRoute} options={{ title: 'Player' }} />
      <Stack.Screen name="MatchResult" component={MatchResultScreen} options={{ title: 'Match Result' }} />
```

> Titles stay literal here (header titles are out of i18n scope per the i18n plan); the `nav.*` keys are added now so i18n-completion can swap them later without a schema change.

- [ ] **Step 6: Run the test (expect PASS) + type-check**

Run: `npx jest __tests__/navigation/root-navigator-routes.test.ts && npx tsc --noEmit`
Expected: PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/screens/squad/PlayerDetailRoute.tsx src/navigation/RootNavigator.tsx src/navigation/types.ts src/i18n/pt.ts src/i18n/en.ts __tests__/navigation/root-navigator-routes.test.ts
git commit -m "fix(nav): registra rota PlayerDetail (wrapper navigation-aware) + MatchResult — fim do crash ao tocar jogador"
```

> `types.ts` already declares `PlayerDetail`/`MatchResult` (lines 5-6); no edit needed there for this task — it is listed in `git add` only if a stray change exists. If `git status` shows it unchanged, drop it from the `add`.

---

### Task 3: window.confirm → Alert.alert in MainMenu (native crash fix)

**Files:**
- Modify: `src/screens/MainMenuScreen.tsx` (import `Alert`; replace `handleDeleteSave` body, lines 60-65)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (`mainmenu.delete_title` if desired; reuse `common.cancel`/`common.delete`)
- Test: none (UI; `window` removal verified by grep in Step 3 + Playwright)

- [ ] **Step 1: Add i18n key**

In `src/i18n/pt.ts`:

```ts
  'mainmenu.delete_title': 'Deletar save',
```

In `src/i18n/en.ts`:

```ts
  'mainmenu.delete_title': 'Delete save',
```

- [ ] **Step 2: Replace window.confirm with Alert.alert**

In `src/screens/MainMenuScreen.tsx`, add `Alert` to the `react-native` import (line 2-9 block):

```ts
  Alert,
```

Replace `handleDeleteSave` (lines 60-65) with:

```ts
  function handleDeleteSave(save: SaveGame) {
    const label = save.name || t('mainmenu.save_default', { id: save.id });
    Alert.alert(
      t('mainmenu.delete_title'),
      t('mainmenu.delete_confirm', { name: label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => doDelete(save) },
      ],
    );
  }

  async function doDelete(save: SaveGame) {
    if (!dbHandle) return;
    await deleteSave(dbHandle, save.id);
    setSaves((prev) => prev.filter((s) => s.id !== save.id));
  }
```

- [ ] **Step 3: Verify no `window` reference remains + type-check**

Run: `grep -rn "window\." src/screens/ ; npx tsc --noEmit`
Expected: no `window.confirm` match in `MainMenuScreen.tsx`; tsc exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/screens/MainMenuScreen.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "fix(menu): troca window.confirm por Alert.alert no delete de save — não crasha em nativo"
```

---

### Task 4: SquadTab + Squad screen unifies through PlayerDetail route

**Files:**
- Modify: `src/navigation/types.ts` (add `SquadTab` to `TabParamList`)
- Modify: `src/navigation/TabNavigator.tsx` (import `SquadListScreen`; add tab between Home and News)
- Modify: `src/screens/squad/SquadListScreen.tsx` (drop inline embed; navigate to `PlayerDetail`)
- Test: none (UI; verified by `tsc` + Playwright)

- [ ] **Step 1: Add the tab type**

In `src/navigation/types.ts`, in `TabParamList` (lines 38-44), add after `HomeTab`:

```ts
  SquadTab: undefined;
```

- [ ] **Step 2: Register the tab**

In `src/navigation/TabNavigator.tsx`, add import after line 5:

```ts
import { SquadListScreen } from '@/screens/squad/SquadListScreen';
```

Add a `Tab.Screen` between the `HomeTab` (ends line 28) and `NewsTab` blocks:

```tsx
      <Tab.Screen
        name="SquadTab"
        component={SquadListScreen}
        options={{ title: 'Squad', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text> }}
      />
```

- [ ] **Step 3: Make SquadListScreen navigate to the PlayerDetail route**

In `src/screens/squad/SquadListScreen.tsx`:

Add navigation imports after line 9:

```ts
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
```

Remove the now-unused `PlayerDetailScreen` import (line 17) and the `selectedPlayerId` state (line 54), the `handleBack` callback (lines 94-96), and the inline-render block (lines 98-106).

Add inside the component (after line 49, the `dbHandle` line):

```ts
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
```

Replace `handleSelectPlayer` (lines 90-92) with:

```ts
  const handleSelectPlayer = useCallback(
    (id: number) => navigation.navigate('PlayerDetail', { playerId: id }),
    [navigation],
  );
```

> After this, both report taps and the Squad tab converge on the single `PlayerDetailRoute` wrapper (registered in Task 2). The `useState`/`Position`/`PlayerAttributes` imports stay (still used for `players` state shape).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (no unused-import errors — confirm `PlayerDetailScreen` import was removed).

- [ ] **Step 5: Commit**

```bash
git add src/navigation/types.ts src/navigation/TabNavigator.tsx src/screens/squad/SquadListScreen.tsx
git commit -m "feat(nav): aba Squad + unifica tap de jogador na rota PlayerDetail (remove embed inline)"
```

---

### Task 5: Register orphan routes — Calendar, Training, YouthAcademy + HomeScreen entry points

**Files:**
- Modify: `src/navigation/types.ts` (`Calendar`, `Training`, `YouthAcademy` in `RootStackParamList`)
- Modify: `src/navigation/RootNavigator.tsx` (imports + `Stack.Screen`s)
- Modify: `src/screens/home/HomeScreen.tsx` (Calendar entry point following line 368-380 pattern)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (`home.calendar_title`/`home.calendar_sub`)
- Test: none (UI; `tsc` + Playwright)

- [ ] **Step 1: Add route param types**

In `src/navigation/types.ts`, in `RootStackParamList` add (e.g. after `SeasonHistory`, line 35):

```ts
  Calendar: undefined;
  Training: undefined;
  YouthAcademy: undefined;
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n/pt.ts`:

```ts
  'home.calendar_title': 'Calendário',
  'home.calendar_sub': 'Veja o calendário completo da temporada',
```

In `src/i18n/en.ts`:

```ts
  'home.calendar_title': 'Calendar',
  'home.calendar_sub': 'View the full season calendar',
```

- [ ] **Step 3: Register the routes**

In `src/navigation/RootNavigator.tsx`, add imports after line 28:

```ts
import { CalendarScreen } from '@/screens/home/CalendarScreen';
import { TrainingScreen } from '@/screens/tactics/TrainingScreen';
import { YouthAcademyScreen } from '@/screens/squad/YouthAcademyScreen';
```

After the `SeasonHistory` screen (line 76), add:

```tsx
      {/* Orphan screens wired in */}
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar' }} />
      <Stack.Screen name="Training" component={TrainingScreen} options={{ title: 'Training' }} />
      <Stack.Screen name="YouthAcademy" component={YouthAcademyScreen} options={{ title: 'Youth Academy' }} />
```

- [ ] **Step 4: Add the Calendar entry point on HomeScreen**

In `src/screens/home/HomeScreen.tsx`, after the League Table shortcut block (ends line 380), add a sibling shortcut reusing the same styles:

```tsx
      {/* Calendar shortcut */}
      <TouchableOpacity
        style={styles.leagueTableBtn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Calendar')}
      >
        <Text style={styles.leagueTableIcon}>📅</Text>
        <View style={styles.leagueTableContent}>
          <Text style={styles.leagueTableTitle}>{t('home.calendar_title')}</Text>
          <Text style={styles.leagueTableSub}>{t('home.calendar_sub')}</Text>
        </View>
        <Text style={styles.leagueTableChevron}>›</Text>
      </TouchableOpacity>
```

> Training and YouthAcademy become reachable routes now (e.g. linkable from Tactics/Squad in a later pass); per the spec they only need an entry point to be non-orphan. Add a Training shortcut from the Tactics tab and a Youth shortcut from the Squad tab in Step 5 if quick; otherwise the route registration + Calendar entry satisfies "reachable from the graph" and Playwright confirms navigation works.

- [ ] **Step 5: Add Training + Youth entry points (reachability)**

In `src/screens/tactics/TrainingScreen.tsx` the screen is self-contained; reachability comes from a button. Add to `src/screens/tactics/TacticsScreen.tsx` a shortcut to `Training` and to `src/screens/squad/SquadListScreen.tsx` a header shortcut to `YouthAcademy`, both via `navigation.navigate(...)`. Concretely, in `SquadListScreen.tsx` add above the filter row (inside the returned `<View style={commonStyles.screen}>`, before `{/* Filter chips */}`):

```tsx
      <TouchableOpacity
        style={styles.youthLink}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('YouthAcademy')}
      >
        <Text style={styles.youthLinkText}>🌱 {t('home.youth_academy_link')}</Text>
      </TouchableOpacity>
```

Add `import { TouchableOpacity } from 'react-native'` to the existing import list, `import { useTranslation } from '@/i18n'` + `const { t } = useTranslation();`, the keys `home.youth_academy_link` (pt: `'Academia de Base'`, en: `'Youth Academy'`) and `home.training_link` (pt: `'Treino'`, en: `'Training'`), and these styles:

```ts
  youthLink: { marginHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.xs, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  youthLinkText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
```

In `src/screens/tactics/TacticsScreen.tsx`, add a matching `navigation.navigate('Training')` button (reuse the screen's existing button style or a small `TouchableOpacity` with the same `youthLink`-equivalent style + `t('home.training_link')`). Read the file first to place it inside the scroll body.

- [ ] **Step 6: Type-check + parity**

Run: `npx tsc --noEmit && npx jest __tests__/i18n/parity.test.ts`
Expected: exit 0 + PASS.

- [ ] **Step 7: Commit**

```bash
git add src/navigation/types.ts src/navigation/RootNavigator.tsx src/screens/home/HomeScreen.tsx src/screens/squad/SquadListScreen.tsx src/screens/tactics/TacticsScreen.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(nav): pluga Calendar/Training/YouthAcademy no grafo + entry points (Home/Squad/Tactics)"
```

---

### Task 6: Top Scorers — real data (pure builder + DB test)

**Files:**
- Create: `src/screens/league/top-scorers.ts` (pure-ish `buildTopScorers`)
- Test: `__tests__/screens/top-scorers.test.ts`
- Modify (next task): `src/screens/league/TopScorersScreen.tsx`, route registration

The data shaping is extracted to a function so it can be DB-tested in the `node` env.

- [ ] **Step 1: Write the failing test**

Create `__tests__/screens/top-scorers.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { buildTopScorers } from '@/screens/league/top-scorers';

function insertPlayer(raw: Database.Database, id: number, name: string) {
  raw.prepare(
    `INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage,
      contract_end, market_value, base_potential, effective_potential, morale, fitness,
      injury_weeks_left, is_free_agent, preferred_foot, weak_foot_ability, is_transfer_listed,
      is_loan_listed, asking_price, loan_wage_share, consecutive_low_morale_weeks, will_retire_at_season_end)
     VALUES (?, ?, 'BR', 25, 'ST', NULL, 1, 1000, 5, 1000000, 80, 80, 80, 100, 0, 0, 'right', 3, 0, 0, NULL, NULL, 0, 0)`,
  ).run(id, name);
  raw.prepare(
    `INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading,
      long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
      pace, stamina, strength, agility, jumping)
     VALUES (?, 80,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70)`,
  ).run(id);
}

function insertStats(raw: Database.Database, playerId: number, goals: number, assists: number) {
  raw.prepare(
    `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists,
      yellow_cards, red_cards, avg_rating, minutes_played)
     VALUES (?, 1, 100, 10, ?, ?, 0, 0, 7.0, 900)`,
  ).run(playerId, goals, assists);
}

describe('buildTopScorers', () => {
  let raw: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    raw = createTestDb();
    db = createTestDbHandle(raw);
    // FK enforcement is off in createTestDb today (db-hardening owns turning it on).
    // If that lands, seed a competitions row (id 100) and clubs for player_stats/players FKs.
    insertPlayer(raw, 1, 'Striker A');
    insertPlayer(raw, 2, 'Striker B');
    insertPlayer(raw, 3, 'No Goals');
    insertStats(raw, 1, 12, 3);
    insertStats(raw, 2, 20, 1);
    insertStats(raw, 3, 0, 5);
  });
  afterEach(() => raw.close());

  it('orders by goals desc and resolves player names', async () => {
    const rows = await buildTopScorers(db, 1, 100);
    expect(rows.map((r) => r.name)).toEqual(['Striker B', 'Striker A']);
    expect(rows[0]).toMatchObject({ playerId: 2, goals: 20, assists: 1 });
  });

  it('excludes players with zero goals', async () => {
    const rows = await buildTopScorers(db, 1, 100);
    expect(rows.find((r) => r.playerId === 3)).toBeUndefined();
  });

  it('returns empty for a competition with no stats', async () => {
    expect(await buildTopScorers(db, 1, 999)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npx jest __tests__/screens/top-scorers.test.ts`
Expected: FAIL — `Cannot find module '@/screens/league/top-scorers'`.

- [ ] **Step 3: Implement buildTopScorers**

Create `src/screens/league/top-scorers.ts`:

```ts
import { DbHandle, getPlayerById } from '@/database/queries/players';
import { getPlayerStatsByCompetition } from '@/database/queries/player-stats';

export interface TopScorerRow {
  playerId: number;
  name: string;
  goals: number;
  assists: number;
}

/** Real top scorers for a competition+season, goals desc, zero-goal players excluded. */
export async function buildTopScorers(
  db: DbHandle,
  season: number,
  competitionId: number,
): Promise<TopScorerRow[]> {
  const stats = await getPlayerStatsByCompetition(db, season, competitionId);
  const scored = stats.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals);
  const rows: TopScorerRow[] = [];
  for (const s of scored) {
    const player = await getPlayerById(db, s.playerId);
    rows.push({
      playerId: s.playerId,
      name: player?.name ?? `#${s.playerId}`,
      goals: s.goals,
      assists: s.assists,
    });
  }
  return rows;
}
```

> Uses existing `getPlayerStatsByCompetition` (`player-stats.ts:92`) and `getPlayerById` (`players.ts:136`). No new query.

- [ ] **Step 4: Run the test (expect PASS)**

Run: `npx jest __tests__/screens/top-scorers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/screens/league/top-scorers.ts __tests__/screens/top-scorers.test.ts
git commit -m "feat(league): buildTopScorers — artilheiros reais via player_stats (goals desc)"
```

---

### Task 7: Wire TopScorersScreen to real data + register route

**Files:**
- Rewrite: `src/screens/league/TopScorersScreen.tsx`
- Modify: `src/navigation/types.ts` (`TopScorers: undefined`), `src/navigation/RootNavigator.tsx` (import + screen), `src/screens/home/HomeScreen.tsx` (entry point)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (`topscorers.*`, `home.top_scorers_title`/`_sub`)
- Test: none new (logic covered by Task 6; UI via Playwright)

- [ ] **Step 1: Add types + i18n keys**

In `src/navigation/types.ts` `RootStackParamList`:

```ts
  TopScorers: undefined;
```

In `src/i18n/pt.ts`:

```ts
  'topscorers.title': 'Artilheiros',
  'topscorers.empty': 'Sem dados ainda — jogue algumas partidas',
  'topscorers.goals': 'gols',
  'topscorers.assists': 'assist.',
  'home.top_scorers_title': 'Artilheiros',
  'home.top_scorers_sub': 'Quem está marcando na liga',
```

In `src/i18n/en.ts`:

```ts
  'topscorers.title': 'Top Scorers',
  'topscorers.empty': 'No data yet — play some matches',
  'topscorers.goals': 'goals',
  'topscorers.assists': 'assists',
  'home.top_scorers_title': 'Top Scorers',
  'home.top_scorers_sub': "Who's scoring in the league",
```

- [ ] **Step 2: Rewrite the screen**

Replace `src/screens/league/TopScorersScreen.tsx` entirely with (resolves the league competition exactly like `StandingsScreen.tsx:41-44`):

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useTranslation } from '@/i18n';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { buildTopScorers, TopScorerRow } from './top-scorers';

export function TopScorersScreen() {
  const { playerClub, season } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const [rows, setRows] = useState<TopScorerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle || !playerClub) {
      setLoading(false);
      return;
    }
    (async () => {
      const competitions = await getCompetitionsBySeason(dbHandle, season);
      const leagueComp = competitions.find(
        (c) => c.leagueId === playerClub.leagueId && c.type === 'league',
      );
      if (leagueComp) {
        setRows(await buildTopScorers(dbHandle, season, leagueComp.id));
      }
      setLoading(false);
    })();
  }, [dbHandle, playerClub, season]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.empty}>{t('topscorers.empty')}</Text>
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.playerId)}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.goals}>{item.goals} {t('topscorers.goals')}</Text>
            <Text style={styles.assists}>{item.assists} {t('topscorers.assists')}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  list: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  rank: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: 'bold', width: 28 },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', flex: 1 },
  goals: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700', marginRight: spacing.sm },
  assists: { color: colors.textSecondary, fontSize: fontSize.xs },
});
```

- [ ] **Step 3: Register the route + entry point**

In `src/navigation/RootNavigator.tsx`, add import after line 28:

```ts
import { TopScorersScreen } from '@/screens/league/TopScorersScreen';
```

Add after the `Calendar`/`Training`/`YouthAcademy` block (Task 5):

```tsx
      <Stack.Screen name="TopScorers" component={TopScorersScreen} options={{ title: 'Top Scorers' }} />
```

In `src/screens/home/HomeScreen.tsx`, add a shortcut after the Calendar shortcut (same style):

```tsx
      {/* Top scorers shortcut */}
      <TouchableOpacity
        style={styles.leagueTableBtn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('TopScorers')}
      >
        <Text style={styles.leagueTableIcon}>⚽</Text>
        <View style={styles.leagueTableContent}>
          <Text style={styles.leagueTableTitle}>{t('home.top_scorers_title')}</Text>
          <Text style={styles.leagueTableSub}>{t('home.top_scorers_sub')}</Text>
        </View>
        <Text style={styles.leagueTableChevron}>›</Text>
      </TouchableOpacity>
```

- [ ] **Step 4: Type-check + parity**

Run: `npx tsc --noEmit && npx jest __tests__/i18n/parity.test.ts`
Expected: exit 0 + PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/league/TopScorersScreen.tsx src/navigation/types.ts src/navigation/RootNavigator.tsx src/screens/home/HomeScreen.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(league): TopScorersScreen com dados reais + rota + atalho na Home"
```

---

### Task 8: Cup Bracket — real round-1 data (pure builder + DB test) + screen + route

**Files:**
- Create: `src/screens/league/cup-bracket.ts` (`buildCupBracket`)
- Test: `__tests__/screens/cup-bracket.test.ts`
- Rewrite: `src/screens/league/CupBracketScreen.tsx`
- Modify: `src/navigation/types.ts` (`CupBracket: undefined`), `src/navigation/RootNavigator.tsx`, `src/screens/home/HomeScreen.tsx`
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (`cupbracket.*`, `home.cup_bracket_title`/`_sub`)

> `Fixture.round` is `number | null` after `rowToFixture` (`fixtures.ts:9,33`). Multi-round generation belongs to `competitions-real`; this builder renders whatever exists (round 1 in practice) — graceful per spec §6.

- [ ] **Step 1: Write the failing test**

Create `__tests__/screens/cup-bracket.test.ts`:

```ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { buildCupBracket } from '@/screens/league/cup-bracket';

// NOTE: clubs has NOT NULL country_id, league_id, wage_budget, stadium_name,
// medical_department (schema.ts:50-66) — all must be supplied or the insert throws.
function insertClub(raw: Database.Database, id: number, name: string) {
  raw.prepare(
    `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget,
      wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy,
      medical_department, primary_color, secondary_color)
     VALUES (?, ?, ?, 1, 1, 70, 1000000, 500000, 'Stadium', 30000, 3, 3, 3, '#000', '#fff')`,
  ).run(id, name, name.slice(0, 3).toUpperCase());
}

// fixtures.round is TEXT (schema.ts:173); createFixture stringifies it and rowToFixture
// (fixtures.ts:33) returns it as `number | null`. SQLite reads a stored integer back as a
// number under TEXT affinity only loosely — store the round as the bare value the engine
// writes. The builder normalizes via `f.round ?? 1`, so the round key compares as a number.
function insertFixture(
  raw: Database.Database,
  id: number, competitionId: number, week: number, round: number,
  home: number, away: number,
) {
  raw.prepare(
    `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, played)
     VALUES (?, ?, 1, ?, ?, ?, ?, 0)`,
  ).run(id, competitionId, week, String(round), home, away);
}

describe('buildCupBracket', () => {
  let raw: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    raw = createTestDb();
    db = createTestDbHandle(raw);
    insertClub(raw, 1, 'Alpha');
    insertClub(raw, 2, 'Beta');
    insertClub(raw, 3, 'Gamma');
    insertClub(raw, 4, 'Delta');
    // cup competition id 200; two round-1 ties in week 3
    insertFixture(raw, 1, 200, 3, 1, 1, 2);
    insertFixture(raw, 2, 200, 3, 1, 3, 4);
    // a league fixture (competition 100) must NOT appear
    insertFixture(raw, 3, 100, 3, 1, 1, 3);
  });
  afterEach(() => raw.close());

  it('groups cup fixtures by round with resolved club names', async () => {
    const bracket = await buildCupBracket(db, 1, 5, 200);
    expect(bracket).toHaveLength(1);
    expect(bracket[0].round).toBe(1);
    expect(bracket[0].ties).toEqual([
      { homeClubId: 1, awayClubId: 2, homeName: 'Alpha', awayName: 'Beta', homeGoals: null, awayGoals: null },
      { homeClubId: 3, awayClubId: 4, homeName: 'Gamma', awayName: 'Delta', homeGoals: null, awayGoals: null },
    ]);
  });

  it('returns empty when the competition has no fixtures', async () => {
    expect(await buildCupBracket(db, 1, 5, 999)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npx jest __tests__/screens/cup-bracket.test.ts`
Expected: FAIL — `Cannot find module '@/screens/league/cup-bracket'`.

- [ ] **Step 3: Implement buildCupBracket**

Create `src/screens/league/cup-bracket.ts`:

```ts
import { DbHandle } from '@/database/queries/players';
import { getFixturesByWeek } from '@/database/queries/fixtures';
import { getClubById } from '@/database/queries/clubs';

export interface CupTie {
  homeClubId: number;
  awayClubId: number;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface CupRound {
  round: number;
  ties: CupTie[];
}

/** Cup fixtures up to `maxWeek`, grouped by round (asc). Renders whatever exists. */
export async function buildCupBracket(
  db: DbHandle,
  season: number,
  maxWeek: number,
  competitionId: number,
): Promise<CupRound[]> {
  const byRound = new Map<number, CupTie[]>();
  const nameCache = new Map<number, string>();

  async function nameOf(clubId: number): Promise<string> {
    const cached = nameCache.get(clubId);
    if (cached) return cached;
    const club = await getClubById(db, clubId);
    const name = club?.name ?? `#${clubId}`;
    nameCache.set(clubId, name);
    return name;
  }

  for (let w = 1; w <= maxWeek; w++) {
    const weekFixtures = await getFixturesByWeek(db, season, w);
    for (const f of weekFixtures) {
      if (f.competitionId !== competitionId) continue;
      // fixtures.round is a TEXT column (schema.ts:173) typed as `number | null` by
      // rowToFixture; coerce to a real number so Map keys / sort / output are numeric.
      const round = Number(f.round ?? 1);
      const tie: CupTie = {
        homeClubId: f.homeClubId,
        awayClubId: f.awayClubId,
        homeName: await nameOf(f.homeClubId),
        awayName: await nameOf(f.awayClubId),
        homeGoals: f.homeGoals,
        awayGoals: f.awayGoals,
      };
      const list = byRound.get(round) ?? [];
      list.push(tie);
      byRound.set(round, list);
    }
  }

  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((round) => ({ round, ties: byRound.get(round)! }));
}
```

> Uses existing `getFixturesByWeek` (`fixtures.ts:81`) and `getClubById` (`clubs.ts:42`). No new query. `getClubById` returns `Club | null` — `club?.name` handles the null branch.

- [ ] **Step 4: Run the test (expect PASS)**

Run: `npx jest __tests__/screens/cup-bracket.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add types + i18n keys**

In `src/navigation/types.ts` `RootStackParamList`:

```ts
  CupBracket: undefined;
```

In `src/i18n/pt.ts`:

```ts
  'cupbracket.title': 'Chave da Copa',
  'cupbracket.round': 'Fase {n}',
  'cupbracket.empty': 'Sorteio pendente — a copa ainda não começou',
  'cupbracket.draw_pending': 'Próximas fases serão sorteadas conforme a copa avança',
  'home.cup_bracket_title': 'Copa',
  'home.cup_bracket_sub': 'Acompanhe a chave do mata-mata',
```

In `src/i18n/en.ts`:

```ts
  'cupbracket.title': 'Cup Bracket',
  'cupbracket.round': 'Round {n}',
  'cupbracket.empty': 'Draw pending — the cup has not started yet',
  'cupbracket.draw_pending': 'Later rounds are drawn as the cup progresses',
  'home.cup_bracket_title': 'Cup',
  'home.cup_bracket_sub': 'Follow the knockout bracket',
```

- [ ] **Step 6: Rewrite the screen**

Replace `src/screens/league/CupBracketScreen.tsx` entirely with (finds the cup competition for the season, then builds the bracket up to current week):

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useTranslation } from '@/i18n';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { buildCupBracket, CupRound } from './cup-bracket';

export function CupBracketScreen() {
  const { season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const [rounds, setRounds] = useState<CupRound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle) {
      setLoading(false);
      return;
    }
    (async () => {
      const competitions = await getCompetitionsBySeason(dbHandle, season);
      const cup = competitions.find((c) => c.type === 'cup');
      if (cup) {
        setRounds(await buildCupBracket(dbHandle, season, week, cup.id));
      }
      setLoading(false);
    })();
  }, [dbHandle, season, week]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (rounds.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.empty}>{t('cupbracket.empty')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content}>
      {rounds.map((r) => (
        <View key={r.round} style={styles.roundBlock}>
          <Text style={styles.roundTitle}>{t('cupbracket.round', { n: r.round })}</Text>
          {r.ties.map((tie, i) => (
            <View key={i} style={styles.tie}>
              <Text style={styles.team}>{tie.homeName}</Text>
              <Text style={styles.score}>
                {tie.homeGoals != null && tie.awayGoals != null
                  ? `${tie.homeGoals} - ${tie.awayGoals}`
                  : 'vs'}
              </Text>
              <Text style={[styles.team, styles.teamRight]}>{tie.awayName}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.pending}>{t('cupbracket.draw_pending')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  content: { padding: spacing.md },
  roundBlock: { marginBottom: spacing.lg },
  roundTitle: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  tie: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  team: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600', flex: 1 },
  teamRight: { textAlign: 'right' },
  score: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700', marginHorizontal: spacing.sm },
  pending: { color: colors.textMuted, fontSize: fontSize.xs, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.md },
});
```

- [ ] **Step 7: Register the route + entry point**

In `src/navigation/RootNavigator.tsx`, add import after line 28:

```ts
import { CupBracketScreen } from '@/screens/league/CupBracketScreen';
```

Add after the `TopScorers` screen:

```tsx
      <Stack.Screen name="CupBracket" component={CupBracketScreen} options={{ title: 'Cup Bracket' }} />
```

In `src/screens/home/HomeScreen.tsx`, add a Cup shortcut after the Top Scorers shortcut (same style, icon 🏆, `t('home.cup_bracket_title')`/`_sub`, `onPress={() => navigation.navigate('CupBracket')}`).

- [ ] **Step 8: Type-check + parity**

Run: `npx tsc --noEmit && npx jest __tests__/i18n/parity.test.ts`
Expected: exit 0 + PASS.

- [ ] **Step 9: Commit**

```bash
git add src/screens/league/cup-bracket.ts __tests__/screens/cup-bracket.test.ts src/screens/league/CupBracketScreen.tsx src/navigation/types.ts src/navigation/RootNavigator.tsx src/screens/home/HomeScreen.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(league): CupBracketScreen com dados reais de round 1 + rota + atalho (multi-round depende de competitions-real)"
```

---

### Task 9: Game-over routing — pure decision + GameOverScreen + EndOfSeason branch

**Files:**
- Create: `src/screens/EndOfSeasonScreen.helpers.ts` (`resolveSeasonEndRoute`)
- Create: `src/screens/GameOverScreen.tsx`
- Test: `__tests__/screens/end-of-season-helpers.test.ts`
- Modify: `src/navigation/types.ts` (`GameOver: undefined`), `src/navigation/RootNavigator.tsx`, `src/screens/EndOfSeasonScreen.tsx` (`handleContinue`, lines 325-530)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (`gameover.*`)

- [ ] **Step 1: Write the failing test**

Create `__tests__/screens/end-of-season-helpers.test.ts`:

```ts
import { resolveSeasonEndRoute } from '@/screens/EndOfSeasonScreen.helpers';
import { TrustConsequence } from '@/types/board';

describe('resolveSeasonEndRoute', () => {
  it('routes a fired manager to GameOver', () => {
    expect(resolveSeasonEndRoute('fired')).toBe('GameOver');
  });

  it('continues the save for non-firing consequences', () => {
    const others: TrustConsequence[] = ['none', 'budget_cut', 'budget_bonus'];
    for (const c of others) {
      expect(resolveSeasonEndRoute(c)).toBe('Game');
    }
  });

  it('continues when consequence is null (board not yet evaluated)', () => {
    expect(resolveSeasonEndRoute(null)).toBe('Game');
  });
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npx jest __tests__/screens/end-of-season-helpers.test.ts`
Expected: FAIL — `Cannot find module '@/screens/EndOfSeasonScreen.helpers'`.

- [ ] **Step 3: Implement the pure decision**

Create `src/screens/EndOfSeasonScreen.helpers.ts`:

```ts
import { TrustConsequence } from '@/types/board';

export type SeasonEndRoute = 'Game' | 'GameOver';

/** Pure: a fired manager goes to the game-over screen; everything else continues. */
export function resolveSeasonEndRoute(consequence: TrustConsequence | null): SeasonEndRoute {
  return consequence === 'fired' ? 'GameOver' : 'Game';
}
```

- [ ] **Step 4: Run the test (expect PASS)**

Run: `npx jest __tests__/screens/end-of-season-helpers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add types + i18n keys**

In `src/navigation/types.ts` `RootStackParamList`:

```ts
  GameOver: undefined;
```

In `src/i18n/pt.ts`:

```ts
  'gameover.title': 'Você foi demitido',
  'gameover.message': 'A diretoria encerrou seu contrato. A temporada acaba aqui.',
  'gameover.back_to_menu': 'Voltar ao menu',
```

In `src/i18n/en.ts`:

```ts
  'gameover.title': 'You have been dismissed',
  'gameover.message': 'The board has terminated your contract. This is where the season ends.',
  'gameover.back_to_menu': 'Back to menu',
```

- [ ] **Step 6: Create GameOverScreen**

Create `src/screens/GameOverScreen.tsx`:

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { colors, commonStyles, fontSize, spacing } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useBoardStore } from '@/store/board-store';
import { useTranslation } from '@/i18n';

export function GameOverScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const clearGame = useGameStore((s) => s.clearGame);
  const objective = useBoardStore((s) => s.currentObjective);

  function handleBackToMenu() {
    clearGame();
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'MainMenu' }] }),
    );
  }

  return (
    <View style={[commonStyles.screen, styles.centered]}>
      <Text style={styles.icon}>🚪</Text>
      <Text style={styles.title}>{t('gameover.title')}</Text>
      <Text style={styles.message}>{t('gameover.message')}</Text>
      {objective && <Text style={styles.objective}>{objective.description}</Text>}
      <Pressable style={styles.button} onPress={handleBackToMenu}>
        <Text style={styles.buttonText}>{t('gameover.back_to_menu')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  icon: { fontSize: 56, marginBottom: spacing.md },
  title: { color: colors.danger, fontSize: fontSize.xxl, fontWeight: 'bold', marginBottom: spacing.md, textAlign: 'center' },
  message: { color: colors.text, fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.sm },
  objective: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic', textAlign: 'center', marginBottom: spacing.lg },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  buttonText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
});
```

> `clearGame` is `game-store.ts:110`; `currentObjective` is on `useBoardStore` (`board-store.ts:5`). `CommonActions.reset` is used (rather than `navigation.reset` typed against a specific param list) so the untyped `useNavigation()` compiles — `MainMenu` is a valid root route.

- [ ] **Step 7: Register the route**

In `src/navigation/RootNavigator.tsx`, add import after line 28:

```ts
import { GameOverScreen } from '@/screens/GameOverScreen';
```

Add after the `CupBracket` screen:

```tsx
      <Stack.Screen name="GameOver" component={GameOverScreen} options={{ headerShown: false }} />
```

- [ ] **Step 8: Branch handleContinue on the consequence**

In `src/screens/EndOfSeasonScreen.tsx`, add the import after line 35:

```ts
import { resolveSeasonEndRoute } from './EndOfSeasonScreen.helpers';
```

At the top of `handleContinue` (after line 327, `setStarting(true);`), short-circuit when fired so the new-season setup is skipped entirely:

```ts
      if (resolveSeasonEndRoute(boardEval?.consequence ?? null) === 'GameOver') {
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: 'GameOver' }] }),
        );
        return;
      }
```

Add `CommonActions` to the navigation import (top of file): change line 10 to

```ts
import { useNavigation, CommonActions } from '@react-navigation/native';
```

> `boardEval` is component state (`EndOfSeasonScreen.tsx:190`) holding `consequence: TrustConsequence`. The early `return` runs inside the `try`; the `finally` (line 526-529) still fires — but it calls `navigation.navigate('Game')`. To avoid double-navigation, guard the `finally`: wrap its `navigation.navigate('Game')` so it only runs when not fired. Concretely, hoist a `let fired = resolveSeasonEndRoute(boardEval?.consequence ?? null) === 'GameOver';` above the `try`, dispatch the reset and `return` when `fired`, and change the `finally` block (line 526-529) to:

```ts
    } finally {
      setStarting(false);
      if (!fired) navigation.navigate('Game');
    }
```

Remove the now-duplicated `navigation.dispatch(...)` from inside the `try` if you keep the `finally`-based navigation; the single source of truth is: `fired` → reset to `GameOver` (do it once, e.g. right before `return` inside `try`), else `finally` navigates to `Game`. Read lines 325-530 and apply consistently so exactly one navigation happens.

- [ ] **Step 9: Type-check + run helper test**

Run: `npx jest __tests__/screens/end-of-season-helpers.test.ts && npx tsc --noEmit`
Expected: PASS + exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/screens/EndOfSeasonScreen.helpers.ts src/screens/GameOverScreen.tsx src/navigation/types.ts src/navigation/RootNavigator.tsx src/screens/EndOfSeasonScreen.tsx src/i18n/pt.ts src/i18n/en.ts __tests__/screens/end-of-season-helpers.test.ts
git commit -m "feat(board): demissão roteia para GameOver (reset) em vez de continuar o save demitido"
```

---

### Task 10: Staff Hire — honest disabled state (remove misleading dead-end)

**Files:**
- Modify: `src/screens/club/StaffScreen.tsx` (replace `handleHireStaff`/footer, lines 88-90 + 116-120)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts` (`staff.*`)
- Test: none (UI; `tsc` + parity + Playwright)

- [ ] **Step 1: Add i18n keys**

In `src/i18n/pt.ts`:

```ts
  'staff.hire_coming_soon': 'Contratação de comissão em breve',
```

In `src/i18n/en.ts`:

```ts
  'staff.hire_coming_soon': 'Staff hiring coming soon',
```

- [ ] **Step 2: Replace the misleading Alert with an honest disabled footer**

In `src/screens/club/StaffScreen.tsx`, add the i18n import after line 16:

```ts
import { useTranslation } from '@/i18n';
```

Inside `StaffScreen` (after line 70, `const [staff, setStaff] = ...`), add:

```ts
  const { t } = useTranslation();
```

Delete `handleHireStaff` (lines 88-90). Replace the `ListFooterComponent` (lines 116-120) with a non-pressable, visibly-disabled note:

```tsx
        ListFooterComponent={
          <View style={[styles.hireButton, styles.hireButtonDisabled]}>
            <Text style={styles.hireButtonTextDisabled}>{t('staff.hire_coming_soon')}</Text>
          </View>
        }
```

Add these styles to the `StyleSheet.create`:

```ts
  hireButtonDisabled: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  hireButtonTextDisabled: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
```

> Removes the `Alert` import usage for hiring; if `Alert` is now unused, drop it from the `react-native` import to keep `tsc` clean. The button no longer pretends to do something — it reads as a disabled "coming soon" card (honest, per spec §3).

- [ ] **Step 3: Type-check + parity**

Run: `npx tsc --noEmit && npx jest __tests__/i18n/parity.test.ts`
Expected: exit 0 + PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/club/StaffScreen.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "fix(club): botão Hire vira estado 'em breve' honesto (remove Alert enganoso)"
```

---

### Task 11: Final verification (full suite, tsc, browser)

- [ ] **Step 1: Full suite + type-check**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green — baseline 62 suites / 536 tests plus the 4 new suites (`root-navigator-routes`, `top-scorers`, `cup-bracket`, `end-of-season-helpers`) ≈ 66 suites / ~550 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Browser validation (Playwright MCP)**

Start the web server per the project's web-dev-server notes (harness background `CI=1 npx expo start --web --port 19006`, then navigate to `localhost:8082`). Load an existing save and verify:
- **PlayerDetail (crash fix):** open any report (Reports tab → Assistente Técnico), tap a player row → the **PlayerDetail** screen renders with attributes; Back returns to the report. No crash, no white screen.
- **Squad tab:** the 👥 tab is present; tap a player → same PlayerDetail screen.
- **Orphans reachable:** Home shortcuts open **Calendar**, **Top Scorers** (real ordered list after matches), **Cup** (round-1 ties or "draw pending"); Squad header opens **Youth Academy**; Tactics opens **Training**.
- **window.confirm fix:** MainMenu → tap a save's **X** → a native-style Alert appears (Cancel / Delete); Cancel keeps the save, Delete removes it.
- **Game-over:** (if a fired state can be reached/forced) End of Season showing "FIRED" → Continue routes to the **GameOver** screen; "Back to menu" returns to MainMenu and the save no longer auto-loads. Back gesture does not re-enter the dismissed save.
- **Staff:** the Hire footer reads as a disabled "coming soon" card, not a misleading button.
- **ErrorBoundary:** no regressions in normal navigation (covered implicitly — every screen above renders without hitting the fallback).

- [ ] **Step 3: Push (with user authorization)**

```bash
git push origin main
```

---

## Sequencing & dependencies

Order within this epic: **Task 1 (ErrorBoundary) → Task 2 (PlayerDetail route, the crash fix) → Task 3 (window.confirm)** are independent, highest-value, ship first. **Task 4 (Squad tab)** depends on Task 2 (reuses the registered `PlayerDetail` route). **Task 5 (orphan routes)** is independent of 6-8 but shares `RootNavigator`/`HomeScreen`/`types.ts` edits, so land it before 7/8 to avoid merge churn. **Tasks 6→7 (Top Scorers)** and **8 (Cup Bracket)** are independent of each other. **Task 9 (game-over)** depends only on its own helper. **Task 10 (Staff)** is independent. **Task 11** runs last.

Cross-epic (from the spec §8, assume siblings own these; do not redesign here):
- **competitions-real** — owns generation of cup rounds ≥2 and CL knockout fixtures. `buildCupBracket` renders whatever exists (round 1 today); no schema invented here.
- **progression-wired** — owns `training_focus` persistence and real Youth Academy prospect data. This epic only makes `TrainingScreen`/`YouthAcademyScreen` reachable; their data plumbing is that epic's.
- **economy-depth/progression** — owns functional staff hiring. This epic only removes the misleading dead-end.
- **board-stakes** — conceptual owner of dismissal effects. This epic delivers the screen + routing; extra effects (new-job offer, coach reputation) plug into `GameOverScreen` later. If board-stakes already created `GameOverScreen`, drop Task 9 Step 6 and keep only the `handleContinue` wiring.
- **i18n-completion** — guarantees pt/en parity + translation review. This epic adds every key it uses to both dictionaries and runs `parity.test.ts` each task.
- **save-isolation / db-hardening** — no schema dependency; no table/column added by this epic (spec §5).

## Definition of done

- `npx tsc --noEmit` exits 0.
- `npx jest --no-cache` fully green: baseline 62/536 plus 4 new suites (`root-navigator-routes`, `top-scorers`, `cup-bracket`, `end-of-season-helpers`), and `__tests__/i18n/parity.test.ts` passes (every new key in both `pt.ts` and `en.ts`).
- Browser-validated (Playwright): tapping a player no longer crashes; Squad/Calendar/Training/Youth/TopScorers/CupBracket reachable; save delete uses a native Alert; a fired manager lands on GameOver; Staff Hire is an honest disabled card.
- No `window.confirm` remains in `src/screens/`.
- `git diff` reviewed before each commit; commits scoped per task as listed.
