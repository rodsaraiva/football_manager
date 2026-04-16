# Football Manager — Plan 4.5: Real Engine Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simplified match simulation with the real match engine, and wire up player progression, transfer AI, and youth academy into the weekly/seasonal game loop.

**Architecture:** The HomeScreen's `handleAdvanceWeek` becomes the integration point. It calls engine functions with real data from the database, then persists results back.

**Tech Stack:** Existing engine modules + database queries.

---

## File Structure (changes only)

```
src/
├── engine/
│   └── game-loop.ts                # NEW: centralizes advance-week logic (extracted from HomeScreen)
├── screens/
│   └── home/
│       └── HomeScreen.tsx           # MODIFY: calls game-loop instead of inline logic
├── screens/
│   └── EndOfSeasonScreen.tsx        # MODIFY: adds progression, potential, youth
```

---

### Task 1: Extract Game Loop Module

**Files:**
- Create: `src/engine/game-loop.ts`
- Test: `__tests__/engine/game-loop.test.ts`

Extract the advance-week logic from HomeScreen into a pure engine module. This module coordinates all weekly systems.

**`src/engine/game-loop.ts` exports:**

```ts
interface AdvanceWeekParams {
  dbHandle: DbHandle;
  season: number;
  week: number;
  playerClubId: number;
  rng: SeededRng;
}

interface AdvanceWeekResult {
  newSeason: number;
  newWeek: number;
  isSeasonEnd: boolean;
  playerMatchResult: MatchResult | null;
  financeChanges: { clubId: number; netChange: number }[];
  playerClubFixture: Fixture | null;
}

function advanceGameWeek(params: AdvanceWeekParams): AdvanceWeekResult
```

The function:
1. Gets fixtures for this week from DB
2. For each fixture, loads both squads (players + attributes) and simulates using the REAL match engine
3. Persists fixture results and match events to DB
4. Processes weekly finances for the player's club
5. Applies player progression for the player's club squad
6. Updates fitness (played = -5 to -15, rested = +5 to +15)
7. Updates injury recovery (-1 week)
8. Saves week advancement to DB
9. Returns results for UI

**Key detail for real match simulation:**
For the player's match, load full squads and use `simulateMatch`. For OTHER matches (AI vs AI), use the simplified reputation-based simulation to avoid loading ~44 full squads per week (performance).

### Task 2: Wire Real Match Engine for Player's Match

Inside `game-loop.ts`, when the player's club has a fixture:

```ts
// Load player's squad with attributes
const playerSquad = getPlayersByClub(dbHandle, playerClubId);
const startingEleven = pickStartingEleven(playerSquad, tactic); // best 11 by position

// Load opponent squad
const opponentId = fixture.homeClubId === playerClubId ? fixture.awayClubId : fixture.homeClubId;
const opponentSquad = getPlayersByClub(dbHandle, opponentId);
const opponentEleven = pickStartingEleven(opponentSquad, opponentTactic);

// Build PlayerForStrength arrays
const homeSquadForSim = buildSquadForSimulation(homeEleven, dbHandle);
const awaySquadForSim = buildSquadForSimulation(awayEleven, dbHandle);

// Simulate
const result = simulateMatch({
  fixtureId: fixture.id,
  homeSquad: homeSquadForSim,
  awaySquad: awaySquadForSim,
  homeTactic, awayTactic,
  homeClubReputation, awayClubReputation,
  rng,
});

// Persist: update fixture, add match events, update player stats
```

Helper functions needed:
- `pickStartingEleven(players, tactic)` — picks best 11 from squad matching the formation
- `buildSquadForSimulation(players, dbHandle)` — loads attributes for each player, returns `PlayerForStrength[]`

### Task 3: Wire Player Progression into Weekly Loop

After matches are simulated, apply weekly progression for the player's club:

```ts
import { calculateWeeklyProgression } from '@/engine/training/progression';

for (const player of playerSquad) {
  const attrs = getPlayerById(dbHandle, player.id)?.attributes;
  if (!attrs) continue;

  const result = calculateWeeklyProgression({
    age: player.age,
    attributes: attrs,
    effectivePotential: player.effectivePotential,
    minutesPlayedRecent: getRecentMinutes(dbHandle, player.id, season, week),
    totalPossibleMinutes: 6 * 90, // last 6 weeks
    avgRatingRecent: getRecentRating(dbHandle, player.id, season, week),
    trainingFocus: 'balanced', // from game store later
    trainingFacilityLevel: club.trainingFacilities,
  });

  // Apply attribute changes to DB
  applyProgressionToDb(dbHandle, player.id, result.attributeChanges);
}
```

Need a new query: `updatePlayerAttributes(dbHandle, playerId, changes)` that applies delta changes.

### Task 4: Wire End-of-Season Systems

Update `EndOfSeasonScreen.tsx` to run at season end:

1. **Dynamic potential recalculation** for player's squad:
```ts
import { recalculatePotential } from '@/engine/training/potential';
// For each player, gather last 1-3 seasons of ratings, recalculate potential
```

2. **Youth academy generation:**
```ts
import { generateYouthPlayers } from '@/engine/youth/youth-academy';
const youth = generateYouthPlayers({
  clubId: playerClubId,
  academyLevel: club.youthAcademy,
  youthCoachBonus: staffEffects.youthQualityBonus,
  countryCode: country.code,
  rng,
});
// Insert new players into DB
```

3. **Age all players** (+1 year)

4. **Contract expiry** — players whose contractEnd === current season become free agents

### Task 5: Wire Transfer AI into Transfer Window Weeks

During transfer window weeks (1-6 preseason, 23-26 winter), the AI clubs make transfers:

```ts
import { generateAiTransfer } from '@/engine/transfer/transfer-ai';

if (isTransferWindow(week)) {
  // For ~5 random AI clubs per week, try a transfer
  for (const aiClub of pickRandomClubs(allClubs, 5, rng)) {
    const transfer = generateAiTransfer({
      clubId: aiClub.id,
      clubBudget: aiClub.budget,
      clubReputation: aiClub.reputation,
      squadPositions: getSquadPositions(dbHandle, aiClub.id),
      availablePlayers: getAvailablePlayers(dbHandle, aiClub.id),
      rng,
    });
    if (transfer) {
      executeTransfer(dbHandle, transfer, season);
    }
  }
}
```

### Task 6: Update HomeScreen to Use Game Loop

Replace the inline advance-week logic in HomeScreen with a call to `advanceGameWeek`:

```tsx
import { advanceGameWeek } from '@/engine/game-loop';

const handleAdvanceWeek = useCallback(async () => {
  if (isAdvancing || !dbHandle || !playerClubId) return;
  setAdvancing(true);
  try {
    const rng = new SeededRng(season * 1000 + week);
    const result = advanceGameWeek({ dbHandle, season, week, playerClubId, rng });

    updateWeek(result.newSeason, result.newWeek);
    if (result.playerMatchResult) setLastMatchResult(result.playerMatchResult);
    if (result.isSeasonEnd) setNewSeason(true);

    // Reload data
    const updatedClub = getClubById(dbHandle, playerClubId);
    if (updatedClub) setPlayerClub(updatedClub);
    const played = getFixturesByClub(dbHandle, playerClubId, result.newSeason === season ? season : season).filter(f => f.played);
    setRecentResults(played.slice(-5));
  } finally {
    setAdvancing(false);
  }
}, [/* deps */]);
```
