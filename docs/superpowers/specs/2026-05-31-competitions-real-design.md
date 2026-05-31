# Design: Competitions Real — Knockouts, Promotion/Relegation, Calendar

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `competitions-real`
**Escopo:** football-manager — `src/engine/competition/`, `src/engine/history/season-archiver.ts`, `src/engine/game-loop.ts`, `src/screens/EndOfSeasonScreen.tsx`

---

## 1. Goal

Make cups and the Champions League actually progress round-by-round to a real champion (with byes seeded by reputation and penalty shootouts for draws), physically move clubs between divisions on promotion/relegation, stop calendar weeks from colliding, and add a head-to-head league tiebreaker.

---

## 2. Problem / current state

This epic fixes six confirmed audit findings (`docs/audit/2026-05-31-gap-audit.md`):

1. **"Cups and Champions League never advance past the first round / group stage."**
   `generateSeasonCalendar` (`calendar.ts:97-106`) only ever emits cup **round 1** at week 10 with the comment `// subsequent rounds generated dynamically` — but `generateKnockoutRound` (`fixture-generator.ts:70`) has exactly **one** call site (`calendar.ts:99`). The CL emits only group-stage round-robin (`calendar.ts:128-143`); no knockout/final is ever generated despite `format: 'group_knockout'`. `advanceGameWeek` (`game-loop.ts:323-556`) only simulates fixtures that already exist; it never creates next-round fixtures. So `archiveKnockout` (`season-archiver.ts:288-327`) sees `maxRound === 1` and crowns a first-round winner.

2. **"Promotion/relegation is recorded but never physically moves clubs between divisions."**
   `archiveLeague` (`season-archiver.ts:349-356`) inserts bottom clubs into `season_relegated`, but a full-tree grep for `UPDATE clubs SET league_id` returns nothing. `EndOfSeasonScreen.handleContinue` (`EndOfSeasonScreen.tsx:431-465`) rebuilds the calendar from the **unchanged** `getClubsByLeague(...)` per league. There is no `season_promoted` table (`schema.ts:281` has only `season_relegated`), and `EndOfSeasonScreen.tsx:295` hardcodes `wasPromoted: false`.

3. **"Calendar weeks collide and only one fixture per club per week is ever simulated."**
   League fixtures run weeks 7-44 (`calendar.ts:69`, double round-robin of 20 teams = 38 rounds). Cup round 1 lands at week 10 (`calendar.ts:102`) and CL group at weeks 13-18 (`calendar.ts:137-141`) — directly **on top of** league weeks. In `advanceGameWeek` the player's match is `fixtures.find(...)` (`game-loop.ts:331`), returning **only the first** matching fixture; any second same-week fixture for the player's club is silently resolved by `simulateAiMatch`, so the player never plays one of their two matches that week.

4. **"Cup bracket math leaves most teams stranded with byes."**
   `nextPowerOfTwo`/`byeCount` logic (`calendar.ts:33-37, 86-90`) sends `byeCount = bracket - n` teams straight to round 2, but since round 2 is never generated, those bye teams simply vanish from the cup. With 20 teams (bracket 32), 12 teams get a bye into a non-existent round.

5. **"Knockout ties have no extra time or penalty shootout (home team arbitrarily advances)."**
   Known TODO at `season-archiver.ts:319-320`: on a drawn final, `championClubId = final.home_club_id` deterministically. No shootout anywhere (`grep shootout` → only this TODO).

6. **"Standings tiebreakers omit head-to-head and use club id as final decider."**
   `computeStandings` (`season-archiver.ts:77-82`) sorts by points → GD → GF → `a.clubId - b.clubId`. `calculateStandings` (`standings.ts:38`) sorts by points → GD → GF only (no final stable tiebreak, no H2H).

---

## 3. Approach

Introduce a single pure module, `src/engine/competition/knockout.ts`, that decides a knockout tie winner from its played fixtures (shootout via seeded RNG on a draw) and computes the next round's pairings (winners + reputation-seeded byes). Wire it into `advanceGameWeek` as a **post-week hook** (`maybeGenerateNextKnockoutRound`) that, after a knockout round's fixtures for a competition are all played, persists the next round; repeat until one club remains. Move all knockout/CL-knockout weeks **after** the league finishes (weeks 47+) so a club never has two fixtures in one week — this is simpler and more correct than teaching the loop to simulate multiple fixtures per club per week, and it keeps `advanceGameWeek` largely intact.

**Chosen alternative for the calendar:** *reschedule knockouts to dedicated post-league weeks* (rather than *multi-fixture-per-week simulation*). Rationale: the round-robin generator already guarantees one league fixture per club per week; the only collisions are cup/CL bleeding into league weeks. Giving knockouts their own week band removes collisions with zero change to the weekly-simulation contract, and naturally accommodates dynamic round generation (each new round gets the next free week). `SEASON_END_WEEK` moves from 46 to accommodate the longest bracket.

**Promotion/relegation:** a pure `computeDivisionSwaps()` decides which clubs swap between each linked division pair from final standings; `EndOfSeasonScreen.handleContinue` applies the `UPDATE clubs SET league_id` swaps **before** regenerating the new-season calendar.

---

## 4. Architecture & components

Engine stays pure (no React/Expo imports). New/changed modules:

### 4.1 `src/engine/competition/knockout.ts` (NEW — pure)

Single responsibility: knockout-tie resolution and next-round generation.

```typescript
export interface PlayedKnockoutFixture {
  homeClubId: number;
  awayClubId: number;
  homeGoals: number;
  awayGoals: number;
  round: number;
}

export interface KnockoutWinner {
  winnerClubId: number;
  loserClubId: number;
  viaShootout: boolean;
  shootoutScore: [number, number] | null; // [winner pens, loser pens]
}

/** Resolve one single-leg tie. Draw → penalty shootout via the seeded RNG. */
export function resolveKnockoutTie(
  fixture: PlayedKnockoutFixture,
  rng: SeededRng,
): KnockoutWinner;

export interface NextRoundInput {
  competitionId: number;
  season: number;
  completedRound: number;     // round just finished
  winners: number[];          // winnerClubId per tie, in fixture order
  pendingByeClubIds: number[]; // clubs that received a bye in completedRound and haven't played yet
  week: number;               // dedicated week for the new round
  reputationByClubId: Map<number, number>; // for bye seeding when next bracket is odd
}

/** Returns the FixtureInput[] for the next round, plus any clubs carried as a bye again. */
export function buildNextKnockoutRound(input: NextRoundInput): {
  fixtures: FixtureInput[];
  byeClubIds: number[];
};

/** True when the competition has exactly one club left (a champion exists). */
export function isKnockoutComplete(winners: number[], byeClubIds: number[]): boolean;
```

Shootout: deterministic best-of-5-then-sudden-death using `rng.next()` per kick, seeded by the caller so results are reproducible. The shootout outcome is **persisted as a `match_event`** (`type: 'penalty_shootout'`, `player_id = winnerClubId` as a sentinel — see §6) so `archiveKnockout` can read the real winner instead of guessing.

Bye seeding: when the surviving field is odd, the **highest-reputation** remaining club gets the bye (mirrors real seeding and the existing `sort((a,b) => b.reputation - a.reputation)` convention in `calendar.ts:183` / `EndOfSeasonScreen.tsx:438`).

### 4.2 `src/engine/competition/calendar.ts` (CHANGED)

- **Cup bracket fix:** pair the first round so byes are correct. Keep `nextPowerOfTwo`, but generate round 1 only among `firstRoundTeams` and **return the bye clubs as competition entries with `round`/seeding metadata** so the dynamic generator can pick them up (byes are stored in `competition_entries.seed`, already seeded by reputation order). The bye list is recoverable at runtime from entries minus round-1 participants.
- **Reschedule knockouts:** cup round 1 → fixed week `KNOCKOUT_START_WEEK` (47); CL knockout begins after the group stage *and* after the league ends. Group stage stays in its current weeks (13-18) only if it does not collide — but since group fixtures are CL-only clubs that **also** play league fixtures, the group stage **also** moves to a post-league band. New week layout documented in §5.
- **CL:** after group stage, top 2 of each group (4 clubs) feed a 2-round knockout (semis + final) generated dynamically by the same `buildNextKnockoutRound` path. Initial CL knockout seeding (which group winners/runners-up meet) is produced by a small helper `seedClChampionsKnockout(groupStandings)`.

### 4.3 `src/engine/competition/standings.ts` (CHANGED)

Add head-to-head tiebreaker to `calculateStandings`. New comparator: points → GD → GF → **head-to-head points among tied clubs** → GF (stable). Implementation: when 2+ clubs tie on points/GD/GF, compute a mini-table from only the fixtures between exactly those clubs and rank by H2H points then H2H goal difference; final fallback stays deterministic (`a.clubId - b.clubId`) to avoid non-determinism.

### 4.4 `src/engine/history/season-archiver.ts` (CHANGED)

- `computeStandings` (the archiver's private copy, lines 56-83) gets the **same** H2H tiebreaker (kept in sync with `standings.ts`; extract the shared comparator into `standings.ts` and import it to avoid drift).
- `archiveKnockout` (288-327): on a drawn final, read the `penalty_shootout` match_event for that fixture to get the real winner; remove the `TODO`/home-team fallback. If no shootout event exists (legacy data), keep the deterministic home pick as a guarded fallback.
- New `computeDivisionSwaps` lives in a new pure helper (see 4.5); the archiver additionally records promotions into a new `season_promoted` table (mirror of `insertRelegatedIgnore`).

### 4.5 `src/engine/competition/promotion.ts` (NEW — pure)

Single responsibility: decide division movements.

```typescript
export interface DivisionPair {
  higherLeagueId: number;
  lowerLeagueId: number;
  relegationSpots: number; // from higher league
  promotionSpots: number;  // from lower league
}

export interface ClubSwap { clubId: number; fromLeagueId: number; toLeagueId: number; }

/** From each pair's final standings, swap the bottom `relegationSpots` of the higher
 *  league with the top `promotionSpots` of the lower league. Counts are reconciled to
 *  min(relegationSpots, promotionSpots) so league sizes stay constant. */
export function computeDivisionSwaps(
  pairs: DivisionPair[],
  standingsByLeague: Map<number, number[]>, // leagueId → club ids in final order (1st..last)
): ClubSwap[];
```

League pairs are derived from seed metadata: leagues are linked by `(country_id, division_level)` and `division_level+1` (e.g. Premier League div 1 ↔ Championship div 2). `promotion_spots`/`relegation_spots` are already in the `leagues` table (`schema.ts:46-47`, seeded from `scripts/data/leagues.ts:16-18`).

### 4.6 `src/engine/game-loop.ts` (CHANGED)

Add a post-simulation hook after the AI loop (`game-loop.ts:556`), before transfers:

```typescript
await maybeGenerateNextKnockoutRound(db, season, week, rng);
```

`maybeGenerateNextKnockoutRound` (new, in `game-loop.ts` or a thin `competition/round-progression.ts` helper that calls the pure `knockout.ts`): for each cup/continental competition this season, if its current max round is fully played and >1 club remains, resolve ties, build the next round via `buildNextKnockoutRound`, and persist fixtures (`createFixture`) + any shootout `match_event`. Idempotent: it only generates a round that does not yet exist.

### 4.7 `src/screens/EndOfSeasonScreen.tsx` (CHANGED)

In `handleContinue`, before calendar regeneration (currently line 431):
1. Compute final standings per league (reuse the existing `calculateStandings` flow already present for the player's league at 242-257, generalized to all leagues).
2. Build `DivisionPair[]` from `getAllLeagues` grouped by country + division level.
3. `computeDivisionSwaps(...)` → apply each `UPDATE clubs SET league_id = ?`.
4. Set `wasPromoted` for the player's club by checking whether `playerClubId` is in the promoted set (replaces hardcoded `false` at line 295 — note that board processing happens in the `useEffect`, so `wasPromoted` must be derived there too; see §5).
5. Regenerate the calendar from the **post-swap** `getClubsByLeague`.

`CupBracketScreen.tsx` rendering real brackets is **out of scope** (see §10) — it stays a stub this epic; the data it would need (`fixtures` with `round`) now exists for a future UI epic.

---

## 5. Data flow

**Within a season (weekly):**
`HomeScreen.advance` → `advanceGameWeek` → simulate player + AI fixtures for `week` → **`maybeGenerateNextKnockoutRound`** reads played knockout fixtures, resolves ties (shootout via the same `rng`), persists next-round fixtures for a future `week` and a `penalty_shootout` event on drawn ties → subsequent weeks naturally pick up the new fixtures via `getFixturesByWeek`.

**Calendar week bands (new):** league weeks 7-44 (unchanged); a 2-week buffer; **knockout band starts at `KNOCKOUT_START_WEEK = 47`**. Cup round 1 → 47, each subsequent cup round → next free knockout week (49, 51, …). CL group stage → 47-52 (CL clubs have no league collision now because they no longer overlap league weeks)… *(see §7 for the collision check that enforces this)*. CL knockout (semis, final) follow the cup. `SEASON_END_WEEK` rises from 46 to cover the longest bracket (cup of 20 clubs → 5 rounds → final around week 55; set `SEASON_END_WEEK = 58` with margin). `RETIREMENT_ANNOUNCE_WINDOW_*` offsets in `balance.ts:24-25` are relative to `SEASON_END_WEEK`, so they shift automatically.

**Season rollover:** `advanceGameWeek` (isSeasonEnd) → `archiveSeason` records champions, relegated **and promoted** clubs → `HomeScreen` sets `newSeason` → `EndOfSeasonScreen` useEffect runs board eval (now with real `wasPromoted`) → `handleContinue` applies division swaps, then regenerates next season's calendar from updated `league_id`s.

**`wasPromoted` threading:** the board `useEffect` (`EndOfSeasonScreen.tsx:279-304`) currently derives `wasRelegated` by querying `season_relegated`. Add a symmetric query against the new `season_promoted` table for `wasPromoted`, replacing the hardcoded `false` at line 295. The physical `league_id` swap stays in `handleContinue` (after board eval, before calendar regen) so the board sees the *finished* season's outcome while the new calendar uses the *new* divisions.

---

## 6. Schema changes

Two additions. Both follow the existing **idempotent migration mechanism** owned by `save-isolation`/`db-hardening` (`addColumnIfMissing` + `CREATE TABLE IF NOT EXISTS` in `database-store.ts:25-34, 107`). This epic does **not** introduce a new migration framework — it appends to `SCHEMA_SQL` (`schema.ts`) and to the idempotent block in `database-store.ts`.

1. **`season_promoted` table** (mirror of `season_relegated` at `schema.ts:281-288`):
   ```sql
   CREATE TABLE IF NOT EXISTS season_promoted (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     season         INTEGER NOT NULL,
     league_id      INTEGER NOT NULL REFERENCES leagues(id),  -- destination (higher) league
     club_id        INTEGER NOT NULL REFERENCES clubs(id),
     final_position INTEGER NOT NULL,                          -- position in the lower league
     UNIQUE(season, league_id, club_id)
   );
   CREATE INDEX IF NOT EXISTS idx_promoted_season ON season_promoted(season);
   ```
   Add `'season_promoted'` to `TABLE_NAMES` (`schema.ts:1-30`).

2. **`match_events.type` gains `'penalty_shootout'`.** `match_events` (`schema.ts:182-189`) has a free-text `type` column (no CHECK constraint), and `MatchEventType` is a TS union (`src/types/match.ts`). Add `'penalty_shootout'` to the `MatchEventType` union and to `addMatchEvent` usage — **no DDL change** required, only the type. For a shootout, persist one event with `minute = 120`, `player_id = winnerClubId`, `secondary_player_id = loserClubId` (sentinel encoding; documented in `knockout.ts`). `persistMatchStats` (`game-loop.ts:53-85`) ignores unknown event types, so this does not corrupt player stats.

**Coordination with `save-isolation`:** when `save_id` is added to world tables, `season_promoted` and `season_relegated` must both carry it; this epic adds the column to `season_promoted`'s definition only if save-isolation lands first, otherwise save-isolation adds it uniformly (listed as a dependency in §9). The knockout fixtures/competitions this epic creates inherit whatever `save_id` scoping `createFixture`/`createCompetition` adopt — no extra work here beyond passing the value through if those signatures change.

---

## 7. Error handling & edge cases

- **Odd number of survivors / byes:** `buildNextKnockoutRound` always pairs an even count; an odd survivor list grants exactly one reputation-seeded bye, carried as `byeClubIds` into the next round. Verified terminal: a single remaining club ⇒ `isKnockoutComplete` true ⇒ no further rounds.
- **Drawn knockout tie:** always resolved by shootout (never persisted as an unresolved draw). Shootout is deterministic given the seeded `rng`, so re-running the same week reproduces the result.
- **Drawn final with legacy/missing shootout event:** `archiveKnockout` falls back to the deterministic home pick (guarded), preserving old saves.
- **Knockout round not yet fully played:** `maybeGenerateNextKnockoutRound` is a no-op until every fixture of the current max round has `played = 1`. Prevents partial-round generation.
- **Idempotency / re-entry:** generating a round checks it does not already exist (max round in DB). Safe if `advanceGameWeek` is retried after a failure (HomeScreen does not advance the week on error — `game-loop.ts` / `HomeScreen.tsx:253-256`).
- **Division swap when sizes differ:** `computeDivisionSwaps` reconciles counts to `min(relegationSpots, promotionSpots)` so each league keeps a constant team count. Top-division leagues have `promotion_spots: 0` (`leagues.ts:28`) and bottom divisions whatever; only **linked** pairs swap, and the lowest division never relegates out of the pyramid (no lower league to receive it).
- **Player's club relegated/promoted:** squad follows `club_id` automatically (no per-player league field). The player's league pointer in the store is refreshed via the existing `setPlayerClub(getClubById(...))` reload in `HomeScreen` after rollover; `EndOfSeasonScreen` reads `playerClub.leagueId` post-swap for the new calendar.
- **Calendar collision guard (regression net):** add an assertion-style test that, for every club in a generated season, no two fixtures share a week. This is the concrete defense for finding #3 and catches future band miscalculations.
- **CL clubs also in league:** because CL knockout/group now sit in the post-league band, CL clubs no longer have a league fixture the same week. The collision test covers CL clubs specifically.

---

## 8. Testing strategy

SQLite real (`better-sqlite3`) per `testing.md`; TDD (engine/database). Mirror existing `__tests__/engine/competition/` and `__tests__/engine/history/season-archiver.test.ts` patterns.

**Pure unit (`knockout.ts`, `promotion.ts`, `standings.ts`) — no DB:**
- `resolveKnockoutTie`: home win, away win, draw→shootout returns a winner; same seed ⇒ same shootout result (determinism); shootout score is a valid best-of-5+SD.
- `buildNextKnockoutRound`: 8 winners → 4 fixtures round N+1; 5 survivors → 2 fixtures + 1 bye (highest reputation); 2 survivors → 1 fixture (final); 1 survivor → `isKnockoutComplete`.
- `computeDivisionSwaps`: 3-down/3-up swaps exact clubs; `promotion_spots = 0` top league never sends clubs up; mismatched spots reconcile to the min; league sizes invariant after swap.
- `calculateStandings` H2H: two clubs equal on pts/GD/GF but one won the head-to-head ranks higher; three-way tie resolves by H2H mini-table; fully-equal clubs fall back to club id (deterministic).

**Integration (real DB):**
- **Full cup to a champion:** seed a cup competition with N clubs, drive rounds via `maybeGenerateNextKnockoutRound` + `updateFixtureResult` until one remains; assert `season_competition_results.champion_club_id` is the last winner (and a multi-round bracket exists, not just round 1). Include a round decided by shootout and assert the shootout-winner advances and is archived as champion.
- **CL group → knockout → final:** seed 8 clubs / 2 groups, finish group stage, assert top-2-per-group advance, knockout generates, final crowns a champion.
- **Promotion/relegation moves clubs:** seed two linked divisions, finish both, run rollover swap; assert bottom-3 of div 1 now have `league_id = div2` and top-3 of div 2 now have `league_id = div1`; assert `season_promoted` + `season_relegated` rows written; assert each league still has its original team count.
- **No same-week double fixture:** generate a full season calendar; for every club, assert at most one fixture per `(season, week)`. Edge: the player's club is in a cup and CL.
- **`wasPromoted` wired:** after a season where the player's club finishes top of a lower division, the board `useEffect` reads `wasPromoted = true` (query `season_promoted`).
- **Archiver shootout read:** a drawn final with a `penalty_shootout` event archives the shootout winner (not the home club).

**Existing tests to keep green:** `fixture-generator.test.ts`, `season-archiver.test.ts` (the manual round-1/round-2 seeding test stays valid — the archiver logic is unchanged for already-existing rounds). Any test asserting `SEASON_END_WEEK === 46` or the old week numbers must be updated to the new constant.

---

## 9. Dependencies & sequencing

- **`save-isolation` (must land first or co-design):** owns adding `save_id` to world tables + the idempotent migration in `database-store.ts`. This epic's `season_promoted` table and the knockout fixtures/competitions must be `save_id`-scoped consistently. If save-isolation lands first, this epic simply includes `save_id` in `season_promoted` and passes it through `createFixture`/`createCompetition`. **Schema additions this epic needs:** `season_promoted` table; `'penalty_shootout'` event type (TS-only).
- **`db-hardening` (coordinate):** owns indexes, transaction wrapping, FK-on in tests. The new per-week round generation benefits from an index on `fixtures(competition_id, round, played)`; this epic requests it from db-hardening rather than defining its own. The division-swap `UPDATE clubs SET league_id` batch and round-generation inserts should run inside db-hardening's transaction wrapper for the rollover/week-advance.
- **`ai-world-alive` (coordinate, parallel):** AI-vs-AI knockout matches should run through the real engine that ai-world-alive introduces; until then, `simulateAiMatch` (reputation coin-flip) resolves AI knockout ties — which is acceptable because `resolveKnockoutTie` only needs goals + a draw flag, both produced by the existing AI sim. No ordering dependency.
- **`match-consequences` (coordinate, parallel):** the penalty shootout uses the seeded RNG exactly as match-consequences expects; the shootout event type is additive and does not conflict with suspension/injury tracking.

**Suggested order:** save-isolation → (db-hardening ‖ competitions-real). competitions-real can begin against the current schema and rebase onto `save_id` when it lands.

---

## 10. Out of scope

- **Cup bracket UI** (`CupBracketScreen.tsx` stays a stub) — rendering the live bracket is a separate screens/i18n epic; this epic only makes the *data* real.
- **Two-leg ties** — single-leg + shootout only this epic (the design note allows either; single-leg is chosen for the smaller surface and to keep the post-league week band short). The `KnockoutWinner`/`buildNextKnockoutRound` shapes leave room for a future aggregate-score variant.
- **Continental qualification rules** beyond "top 2 per top league into CL" — already the existing heuristic (`calendar.ts:185`, `EndOfSeasonScreen.tsx:441`); unchanged.
- **i18n strings** for any new UI — owned by the i18n epic; this epic adds no user-facing strings (`pt.ts`/`en.ts` currently have no competition keys).
- **AI club youth/finance/decay** so leagues don't hollow out — owned by `ai-world-alive`/`progression-wired`; promotion just moves whatever squads exist.
- **Playoff finals for promotion** (e.g. real Championship playoffs) — straight top-N promotion only.

---

## Spec self-review

- Placeholder scan: no TBD/FIXME/`...` left; every cited path/line verified against the source (calendar.ts, fixture-generator.ts, standings.ts, season-archiver.ts, game-loop.ts, EndOfSeasonScreen.tsx, schema.ts, balance.ts, database-store.ts, leagues.ts).
- Internal consistency: `SEASON_END_WEEK` change (46→58) is reflected in both §5 and §8 (tests asserting the old constant must update). `wasPromoted` threading is reconciled between the board `useEffect` (reads `season_promoted`) and `handleContinue` (applies the physical swap) in §4.7 and §5.
- Ambiguity resolved: the calendar fix is explicitly the "dedicated knockout week band" alternative (not multi-fixture-per-week); the collision **test** is the regression net for finding #3. Shootout winner is **persisted** as a `match_event` so `archiveKnockout` reads a real winner rather than re-deriving — removing the `season-archiver.ts:319-320` TODO while keeping a guarded legacy fallback.
- Engine purity preserved: `knockout.ts`, `promotion.ts`, `standings.ts` import no React/Expo; persistence and screen wiring live in `game-loop.ts` and `EndOfSeasonScreen.tsx`.
