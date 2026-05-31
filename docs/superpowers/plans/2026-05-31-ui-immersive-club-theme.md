# UI Imersiva — Tema por Clube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar identidade visual ao save com a cor do clube: navegação (tab/headers) tingida + um ClubBanner em Home/Club, com derivação segura de contraste.

**Architecture:** Função pura `deriveClubAccent` (luminância → cor legível sobre o fundo dark + cor de texto) testável; hook `useClubAccent` reativo ao `game-store`; componente `ClubBanner` substitui os headers existentes; navegação lê o hook. Botões de ação permanecem azuis.

**Tech Stack:** TypeScript, React Native (Expo), Zustand, Jest. Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-05-31-ui-immersive-club-theme-design.md`

---

### Task 1: Derivação segura (função pura)

**Files:**
- Create: `src/theme/club-accent.ts`
- Test: `__tests__/theme/club-accent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/theme/club-accent.test.ts`:

```ts
import { deriveClubAccent, luminance, mixWithWhite } from '@/theme/club-accent';

describe('luminance', () => {
  it('is 0 for black and 255 for white', () => {
    expect(Math.round(luminance('#000000'))).toBe(0);
    expect(Math.round(luminance('#FFFFFF'))).toBe(255);
  });
  it('treats invalid input as 0', () => {
    expect(luminance('nope')).toBe(0);
  });
});

describe('mixWithWhite', () => {
  it('blends black toward white by t', () => {
    expect(mixWithWhite('#000000', 0.65)).toBe('#a6a6a6');
  });
});

describe('deriveClubAccent', () => {
  it('null club → default blue accent, white text', () => {
    expect(deriveClubAccent(null)).toEqual({ accent: '#4361ee', onAccent: '#ffffff' });
  });

  it('bright primary → uses primary; black text when light', () => {
    // Fulham white primary
    expect(deriveClubAccent({ primaryColor: '#FFFFFF', secondaryColor: '#000000' }))
      .toEqual({ accent: '#FFFFFF', onAccent: '#000000' });
  });

  it('dark primary + bright secondary → uses secondary', () => {
    // Newcastle near-black primary, white secondary
    expect(deriveClubAccent({ primaryColor: '#241F20', secondaryColor: '#FFFFFF' }))
      .toEqual({ accent: '#FFFFFF', onAccent: '#000000' });
  });

  it('mid-dark primary → keeps primary with white text', () => {
    // Man Red
    expect(deriveClubAccent({ primaryColor: '#DA291C', secondaryColor: '#FFE500' }))
      .toEqual({ accent: '#DA291C', onAccent: '#ffffff' });
  });

  it('both colors too dark → lightens to a readable accent', () => {
    const r = deriveClubAccent({ primaryColor: '#101010', secondaryColor: '#050505' });
    expect(luminance(r.accent)).toBeGreaterThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/theme/club-accent.test.ts`
Expected: FAIL — `Cannot find module '@/theme/club-accent'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/theme/club-accent.ts`:

```ts
export interface ClubAccent {
  accent: string;
  onAccent: string;
}

const MIN_LUM = 60;
const TEXT_FLIP_LUM = 140;
const DEFAULT_ACCENT = '#4361ee';

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

export function mixWithWhite(hex: string, t: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const mix = rgb.map((c) => Math.round(c + (255 - c) * t));
  return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function deriveClubAccent(
  club: { primaryColor: string; secondaryColor: string } | null,
): ClubAccent {
  if (!club) return { accent: DEFAULT_ACCENT, onAccent: '#ffffff' };
  let accent: string;
  if (luminance(club.primaryColor) >= MIN_LUM) accent = club.primaryColor;
  else if (luminance(club.secondaryColor) >= MIN_LUM) accent = club.secondaryColor;
  else accent = mixWithWhite(club.primaryColor, 0.65);
  const onAccent = luminance(accent) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff';
  return { accent, onAccent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/theme/club-accent.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/theme/club-accent.ts __tests__/theme/club-accent.test.ts
git commit -m "feat(theme): deriveClubAccent — cor de clube legível sobre o dark"
```

---

### Task 2: Hook `useClubAccent`

**Files:**
- Create: `src/theme/useClubAccent.ts`

No unit test (thin hook over the pure fn + store). Verified by `tsc` and downstream use.

- [ ] **Step 1: Implement the hook**

Create `src/theme/useClubAccent.ts`:

```ts
import { useMemo } from 'react';
import { useGameStore } from '@/store/game-store';
import { deriveClubAccent, ClubAccent } from './club-accent';

export function useClubAccent(): ClubAccent {
  const club = useGameStore((s) => s.playerClub);
  return useMemo(
    () => deriveClubAccent(club ? { primaryColor: club.primaryColor, secondaryColor: club.secondaryColor } : null),
    [club?.primaryColor, club?.secondaryColor],
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/theme/useClubAccent.ts
git commit -m "feat(theme): useClubAccent hook (reativo ao clube do save)"
```

---

### Task 3: `ClubBanner` + aplicar em Home e ClubOverview

**Files:**
- Create: `src/components/ClubBanner.tsx`
- Modify: `src/screens/home/HomeScreen.tsx`, `src/screens/club/ClubOverviewScreen.tsx`

No unit test (UI). Verified by `tsc` and the browser (Task 5).

- [ ] **Step 1: Create the ClubBanner component**

Create `src/components/ClubBanner.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, fontSize } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useClubAccent } from '@/theme/useClubAccent';

export function ClubBanner({ subtitle }: { subtitle?: string }) {
  const club = useGameStore((s) => s.playerClub);
  const { accent, onAccent } = useClubAccent();
  if (!club) return null;
  return (
    <View style={[styles.banner, { backgroundColor: accent }]}>
      <Text style={[styles.name, { color: onAccent }]}>{club.name}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: onAccent }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  name: { fontSize: fontSize.xl, fontWeight: 'bold' },
  subtitle: { fontSize: fontSize.sm, marginTop: 2, opacity: 0.9 },
});
```

- [ ] **Step 2: Use it in HomeScreen (replace the header card)**

In `src/screens/home/HomeScreen.tsx`, add the import:

```ts
import { ClubBanner } from '@/components/ClubBanner';
```

Replace the header card block (currently lines ~310-316):

```tsx
      {/* Header Card */}
      <View style={styles.headerCard}>
        <Text style={styles.clubName}>{playerClub?.name ?? t('home.no_club')}</Text>
        <Text style={styles.seasonInfo}>
          {t('home.season_week', { season, week })}
        </Text>
      </View>
```

with:

```tsx
      <ClubBanner subtitle={t('home.season_week', { season, week })} />
```

(The `styles.headerCard`, `styles.clubName`, `styles.seasonInfo` entries become unused — leaving them is harmless; remove them only if trivially safe.)

- [ ] **Step 3: Use it in ClubOverviewScreen (replace the name header, keep the stats)**

In `src/screens/club/ClubOverviewScreen.tsx`, add the import:

```ts
import { ClubBanner } from '@/components/ClubBanner';
```

Replace the club-name part of the header (currently lines ~94-97):

```tsx
      {/* Club name header */}
      <View style={styles.header}>
        <Text style={styles.clubName}>{club.name}</Text>
        <Text style={styles.clubShort}>{club.shortName}</Text>
        <View style={styles.headerStats}>
```

with (banner replaces name+short; the stats row stays, now in its own card):

```tsx
      <ClubBanner subtitle={club.shortName} />
      <View style={styles.header}>
        <View style={styles.headerStats}>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/ClubBanner.tsx src/screens/home/HomeScreen.tsx src/screens/club/ClubOverviewScreen.tsx
git commit -m "feat(ui): ClubBanner tingido com a cor do clube em Home e Club"
```

---

### Task 4: Navegação tingida

**Files:**
- Modify: `src/navigation/TabNavigator.tsx`, `src/navigation/RootNavigator.tsx`

No unit test (UI/navegação). Verified by `tsc` and the browser (Task 5).

- [ ] **Step 1: Tinge the tab bar active tint**

In `src/navigation/TabNavigator.tsx`, add the import and read the accent inside the component, then use it for `tabBarActiveTintColor`:

```ts
import { useClubAccent } from '@/theme/useClubAccent';
```

Inside `TabNavigator()`, before the `return`:

```ts
  const { accent } = useClubAccent();
```

Change `tabBarActiveTintColor: colors.primary,` to `tabBarActiveTintColor: accent,`.

- [ ] **Step 2: Tinge the stack header tint**

In `src/navigation/RootNavigator.tsx`, add the import and read the accent inside the component:

```ts
import { useClubAccent } from '@/theme/useClubAccent';
```

Inside `RootNavigator()`, before the `return`:

```ts
  const { accent } = useClubAccent();
```

Change the stack `screenOptions` `headerTintColor: colors.text,` to `headerTintColor: accent,`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/TabNavigator.tsx src/navigation/RootNavigator.tsx
git commit -m "feat(ui): tab bar e header tint usam a cor do clube"
```

---

### Task 5: Verificação final

- [ ] **Step 1: Full suite + type-check**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green (528 anteriores + 8 novos = 536).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Browser validation (Playwright MCP) — two clubs**

Start the web server (harness background `CI=1 npx expo start --web --port 19006 --clear`, navigate `localhost:8082`). Then:
- Load/start a save with a **bright-colored club** (e.g. Real Madrid): Home banner + ClubOverview banner show the club color with legible text; tab bar active tint and screen headers use that color.
- Start a second save with a **dark/different-colored club**: banner and navigation tint change accordingly; banner text stays legible (derivation picked a readable color).
- Confirm action buttons (ADVANCE WEEK, START GAME) remain blue.

- [ ] **Step 3: Push (com autorização do usuário)**

```bash
git push origin main
```

---

## Notas de implementação

- `club-accent.ts` é puro (sem React/store) → testável isolado. `useClubAccent.ts` é a única ponte com o `game-store`.
- A navegação re-renderiza ao mudar `playerClub` (entra no jogo / troca de save), atualizando o tint.
- Os ~156 usos de `colors.primary` (ação) permanecem inalterados — identidade (clube) vs ação (azul).
- No MainMenu/NewGame `playerClub` é `null` → accent = azul default, e o `ClubBanner` não renderiza.
