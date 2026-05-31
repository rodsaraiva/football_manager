# Perfis de Ambição no New Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar perfis de ambição (Continental/Nacional/Acesso) como guia efêmero no `NewGameScreen`, filtrando sugestões de clube por país.

**Architecture:** Função pura testável em `engine/newgame/` decide os clubes sugeridos por perfil; uma query nova traz clubes por país com sua divisão; o `NewGameScreen` ganha 3 steps (`ambition` → `country` → `suggestions`) com um link que preserva o fluxo manual atual. O perfil vive em estado local e não persiste no save.

**Tech Stack:** TypeScript, React Native (Expo), Jest + better-sqlite3, SQLite.

**Spec:** `docs/superpowers/specs/2026-05-31-new-game-ambition-profiles-design.md`

---

### Task 1: Função pura de perfis de ambição

**Files:**
- Create: `src/engine/newgame/ambition.ts`
- Test: `__tests__/engine/newgame/ambition.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/engine/newgame/ambition.test.ts`:

```ts
import {
  suggestClubsForProfile,
  AMBITION_PROFILES,
  MAX_SUGGESTIONS,
  ClubForAmbition,
} from '@/engine/newgame/ambition';

const mk = (id: number, reputation: number, divisionLevel: number): ClubForAmbition => ({
  id,
  reputation,
  divisionLevel,
});

const SAMPLE: ClubForAmbition[] = [
  mk(1, 95, 1), // continental
  mk(2, 80, 1), // continental
  mk(3, 78, 1), // continental (boundary)
  mk(4, 77, 1), // nacional (boundary)
  mk(5, 50, 1), // nacional
  mk(6, 45, 2), // acesso
  mk(7, 30, 3), // acesso
];

describe('AMBITION_PROFILES', () => {
  it('has the three profiles in order continental, nacional, acesso', () => {
    expect(AMBITION_PROFILES.map((p) => p.id)).toEqual(['continental', 'nacional', 'acesso']);
  });
});

describe('suggestClubsForProfile', () => {
  it('continental: only div1 with rep >= 78', () => {
    const ids = suggestClubsForProfile('continental', SAMPLE).map((c) => c.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('nacional: div1 with rep < 78, excludes the continental elite', () => {
    const ids = suggestClubsForProfile('nacional', SAMPLE).map((c) => c.id);
    expect(ids).toEqual([4, 5]);
  });

  it('acesso: only division >= 2', () => {
    const ids = suggestClubsForProfile('acesso', SAMPLE).map((c) => c.id);
    expect(ids).toEqual([6, 7]);
  });

  it('returns empty array when no club matches the profile', () => {
    const onlyLower = [mk(10, 20, 2), mk(11, 15, 3)];
    expect(suggestClubsForProfile('continental', onlyLower)).toEqual([]);
  });

  it('sorts by reputation desc and caps at MAX_SUGGESTIONS', () => {
    const many = [
      mk(1, 90, 1), mk(2, 88, 1), mk(3, 86, 1),
      mk(4, 84, 1), mk(5, 82, 1), mk(6, 80, 1), mk(7, 79, 1),
    ];
    const result = suggestClubsForProfile('continental', many);
    expect(result).toHaveLength(MAX_SUGGESTIONS);
    expect(result.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves the original club object (extra fields kept)', () => {
    const enriched = [{ id: 1, reputation: 90, divisionLevel: 1, name: 'Foo FC' }];
    const result = suggestClubsForProfile('continental', enriched);
    expect(result[0]).toBe(enriched[0]);
    expect((result[0] as typeof enriched[number]).name).toBe('Foo FC');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/engine/newgame/ambition.test.ts`
Expected: FAIL — `Cannot find module '@/engine/newgame/ambition'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/newgame/ambition.ts`:

```ts
export type AmbitionProfileId = 'continental' | 'nacional' | 'acesso';

export interface ClubForAmbition {
  id: number;
  reputation: number;
  divisionLevel: number;
}

export interface AmbitionProfile {
  id: AmbitionProfileId;
  labelPt: string;
  labelEn: string;
  descriptionPt: string;
  matches: (club: ClubForAmbition) => boolean;
}

/** Max number of suggested clubs shown per (profile, country). */
export const MAX_SUGGESTIONS = 5;

/** Reputation floor that separates Continental elite from the rest of div 1. */
const CONTINENTAL_MIN_REP = 78;

export const AMBITION_PROFILES: AmbitionProfile[] = [
  {
    id: 'continental',
    labelPt: 'Continental',
    labelEn: 'Continental',
    descriptionPt: 'Clubes de elite, candidatos à Champions.',
    matches: (c) => c.divisionLevel === 1 && c.reputation >= CONTINENTAL_MIN_REP,
  },
  {
    id: 'nacional',
    labelPt: 'Nacional',
    labelEn: 'National',
    descriptionPt: 'Primeira divisão, brigando pelo título nacional.',
    matches: (c) => c.divisionLevel === 1 && c.reputation < CONTINENTAL_MIN_REP,
  },
  {
    id: 'acesso',
    labelPt: 'Acesso',
    labelEn: 'Promotion',
    descriptionPt: 'Divisões inferiores lutando pela subida.',
    matches: (c) => c.divisionLevel >= 2,
  },
];

/**
 * Filters clubs of a SINGLE country by the chosen profile, sorts by reputation
 * desc and returns at most MAX_SUGGESTIONS. The original club objects are kept.
 */
export function suggestClubsForProfile<T extends ClubForAmbition>(
  profileId: AmbitionProfileId,
  clubs: T[],
): T[] {
  const profile = AMBITION_PROFILES.find((p) => p.id === profileId);
  if (!profile) return [];
  return clubs
    .filter((c) => profile.matches(c))
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, MAX_SUGGESTIONS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/engine/newgame/ambition.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/newgame/ambition.ts __tests__/engine/newgame/ambition.test.ts
git commit -m "feat(newgame): perfis de ambição — função pura de sugestão de clubes"
```

---

### Task 2: Query `getClubsByCountry`

**Files:**
- Modify: `src/database/queries/clubs.ts`
- Test: `__tests__/database/queries/clubs.test.ts`

- [ ] **Step 1: Write the failing test**

In `__tests__/database/queries/clubs.test.ts`, add `getClubsByCountry` to the import on line 4:

```ts
import { getClubById, getClubsByLeague, getAllClubs, updateClubBudget, getClubsByCountry } from '@/database/queries/clubs';
```

Then add this `describe` block inside the top-level `describe('clubs queries', ...)` (e.g. right after the `getClubsByLeague` block):

```ts
describe('getClubsByCountry', () => {
  it('returns clubs of the country, each with a numeric divisionLevel', async () => {
    const clubs = await getClubsByCountry(db, 1);
    expect(clubs.length).toBeGreaterThan(0);
    for (const c of clubs) {
      expect(c.countryId).toBe(1);
      expect(typeof c.divisionLevel).toBe('number');
      expect(c.divisionLevel).toBeGreaterThanOrEqual(1);
    }
  });

  it('spans more than one division (country has multiple tiers)', async () => {
    const clubs = await getClubsByCountry(db, 1);
    const divisions = new Set(clubs.map((c) => c.divisionLevel));
    expect(divisions.size).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/database/queries/clubs.test.ts`
Expected: FAIL — `getClubsByCountry is not a function` (import undefined).

- [ ] **Step 3: Write minimal implementation**

In `src/database/queries/clubs.ts`, add the exported type after the `Club` import block (top of file) and the function after `getClubsByLeague`:

```ts
export interface ClubWithDivision extends Club {
  divisionLevel: number;
}

export async function getClubsByCountry(
  db: DbHandle,
  countryId: number,
): Promise<ClubWithDivision[]> {
  const rows = (await db
    .prepare(
      `SELECT clubs.*, leagues.division_level AS division_level
       FROM clubs JOIN leagues ON clubs.league_id = leagues.id
       WHERE leagues.country_id = ?`,
    )
    .all(countryId)) as Array<ClubRow & { division_level: number }>;
  return rows.map((r) => ({ ...rowToClub(r), divisionLevel: r.division_level }));
}
```

Note: `ClubWithDivision` must be declared where `Club` is in scope (the file already imports `Club` on line 1). Place the `interface` near the top, below the `import` lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/database/queries/clubs.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/database/queries/clubs.ts __tests__/database/queries/clubs.test.ts
git commit -m "feat(db): getClubsByCountry com divisionLevel para perfis de ambição"
```

---

### Task 3: `NewGameScreen` — steps `ambition`, `country`, `suggestions`

**Files:**
- Modify: `src/screens/NewGameScreen.tsx`

No automated test (UI) — verified by `tsc` and the browser.

- [ ] **Step 1: Add imports**

In `src/screens/NewGameScreen.tsx`, after the existing `getClubsByLeague, getClubById` import (line 18), add the country query and the ambition module:

```ts
import { getClubsByLeague, getClubById, getClubsByCountry, ClubWithDivision } from '@/database/queries/clubs';
import { AMBITION_PROFILES, suggestClubsForProfile, AmbitionProfileId } from '@/engine/newgame/ambition';
```

- [ ] **Step 2: Extend the Step type and add state**

Change `type Step` (line 34):

```ts
type Step = 'ambition' | 'country' | 'suggestions' | 'league' | 'team' | 'confirm';
```

Change the initial step state (line 50) and add two new state fields next to it:

```ts
  const [step, setStep] = useState<Step>('ambition');
  const [selectedProfile, setSelectedProfile] = useState<AmbitionProfileId | null>(null);
  const [suggestions, setSuggestions] = useState<ClubWithDivision[]>([]);
```

- [ ] **Step 3: Add the handlers**

Add these handlers next to `handleSelectClub` (around line 111). Keep `handleSelectClub` as-is for the manual path:

```ts
  function handleSelectProfile(id: AmbitionProfileId) {
    setSelectedProfile(id);
    setStep('country');
  }

  async function handleSelectCountry(country: Country) {
    if (!dbHandle || !selectedProfile) return;
    try {
      const countryClubs = await getClubsByCountry(dbHandle, country.id);
      setSuggestions(suggestClubsForProfile(selectedProfile, countryClubs));
    } catch (err) {
      console.error('[NewGame] getClubsByCountry failed:', err);
      setSuggestions([]);
    }
    setStep('suggestions');
  }

  // Suggested-club path: also resolve the club's league (already loaded) so
  // handleStartGame's objective generation gets numTeams/divisionLevel right.
  function handleSelectSuggestedClub(club: ClubWithDivision) {
    setSelectedClub(club);
    setSelectedLeague(leagues.find((l) => l.id === club.leagueId) ?? null);
    setStep('confirm');
  }

  function handleExploreManually() {
    setSelectedProfile(null);
    setStep('league');
  }
```

- [ ] **Step 4: Extract a reusable club card renderer (DRY)**

The `team` step's `renderItem` (lines 343-362) and the new `suggestions` step render an identical club card. Add this helper inside the component, before the `if (loading)` block (around line 256):

```tsx
  function renderClubCard(item: Club, onPress: () => void) {
    return (
      <TouchableOpacity style={styles.clubCard} onPress={onPress} activeOpacity={0.8}>
        <View style={styles.clubCardHeader}>
          <Text style={styles.clubName}>{item.name}</Text>
          <Text style={styles.clubRep}>{item.reputation}</Text>
        </View>
        <View style={styles.reputationBarContainer}>
          <View style={[styles.reputationBarFill, { width: `${item.reputation}%` as `${number}%` }]} />
        </View>
        <Text style={styles.clubStadium}>{item.stadiumName}</Text>
      </TouchableOpacity>
    );
  }
```

Then replace the `team` step's `renderItem` (lines 343-362) body with:

```tsx
          renderItem={({ item }) => renderClubCard(item, () => handleSelectClub(item))}
```

- [ ] **Step 5: Add the three new render blocks**

Insert these three blocks immediately before `if (step === 'league') {` (line 266):

```tsx
  if (step === 'ambition') {
    return (
      <View style={commonStyles.screen}>
        <Text style={styles.stepTitle}>Qual sua ambição?</Text>
        <Text style={styles.stepSubtitle}>Escolha um perfil — ele guia as sugestões de clube</Text>
        <ScrollView contentContainerStyle={styles.listContent}>
          {AMBITION_PROFILES.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.leagueCard}
              onPress={() => handleSelectProfile(p.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.leagueName}>{p.labelPt}</Text>
              <Text style={styles.profileDesc}>{p.descriptionPt}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.exploreLink} onPress={handleExploreManually} activeOpacity={0.7}>
            <Text style={styles.exploreLinkText}>Explorar todas as ligas →</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (step === 'country') {
    const countriesWithLeagues = countries.filter((c) => leagues.some((l) => l.countryId === c.id));
    return (
      <View style={commonStyles.screen}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('ambition')}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Escolha o país</Text>
        <ScrollView contentContainerStyle={styles.listContent}>
          {countriesWithLeagues.map((country) => (
            <TouchableOpacity
              key={country.id}
              style={styles.leagueCard}
              onPress={() => handleSelectCountry(country)}
              activeOpacity={0.8}
            >
              <Text style={styles.leagueName}>
                {(COUNTRY_FLAGS[country.code] ?? '🌍') + '  ' + country.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (step === 'suggestions') {
    const profileLabel = AMBITION_PROFILES.find((p) => p.id === selectedProfile)?.labelPt ?? '';
    return (
      <View style={commonStyles.screen}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('country')}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Clubes sugeridos</Text>
        <Text style={styles.stepSubtitle}>{profileLabel}</Text>
        <FlatList
          data={suggestions}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum clube neste perfil.</Text>}
          renderItem={({ item }) => renderClubCard(item, () => handleSelectSuggestedClub(item))}
        />
      </View>
    );
  }
```

- [ ] **Step 6: Add the new styles**

In the `StyleSheet.create({...})` (starts line 422), add these three entries (e.g. after `leagueMeta`):

```ts
  profileDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  exploreLink: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  exploreLinkText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors).

- [ ] **Step 8: Validate in the browser (Playwright MCP)**

Start the web server if not running (`nohup npm run web >/tmp/fm-web.log 2>&1 & disown`), open `localhost:8082`, then:
- New Game shows the 3 ambition cards + "Explorar todas as ligas".
- Continental → país (ex.: Espanha) → vê clubes de elite (Real, Barça) ordenados por reputação.
- Voltar e testar Nacional/Acesso mostram conjuntos diferentes.
- "Explorar todas as ligas" cai no fluxo país→liga→clube atual.
- Escolher um clube sugerido → confirm → START GAME entra no jogo sem erro.

- [ ] **Step 9: Commit**

```bash
git add src/screens/NewGameScreen.tsx
git commit -m "feat(newgame): UI dos perfis de ambição (ambition → país → sugestões)"
```

---

### Task 4: Verificação final

- [ ] **Step 1: Full suite + type-check**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all green (507 anteriores + 9 novos = 516).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Push (com autorização do usuário)**

```bash
git push origin main
```

---

## Notas de implementação

- O perfil **não persiste**: `selectedProfile` é só estado de UI; nada vai para o save.
- `handleStartGame` **não muda** — `handleSelectSuggestedClub` preenche `selectedLeague` a partir das `leagues` já carregadas, então a geração do objetivo da temporada 1 continua correta.
- Os critérios (`CONTINENTAL_MIN_REP = 78`, Acesso = div ≥ 2) ficam centralizados em `ambition.ts`.
