# Feature A — Season History & Trophies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist champions, runners-up, relegated clubs, top scorers, top assisters, MVP, and breakthrough awards for every competition of every league at season end, and surface that history in a dedicated hub plus sections of club and player screens.

**Architecture:** Passive feature. A pure `season-archiver` module reads finished-season data (fixtures, match_events, player_stats) and writes to four new tables inside a single transaction when `advanceGameWeek` detects `isSeasonEnd`. Read queries in a new `queries/history.ts` module. UI adds one new screen (`HistoryScreen`) plus embedded sections in `ClubOverviewScreen` and `PlayerDetailScreen`.

**Tech Stack:** TypeScript, expo-sqlite (runtime) / better-sqlite3 (tests) via the project's `DbHandle` abstraction, Jest with ts-jest, React Native + Expo, React Navigation.

**Scope note:** This plan covers Feature A only. Features B (regens/retirement) and C (scouting with fog of war) are separate specs and plans.

**Spec:** `docs/superpowers/specs/2026-04-14-feature-a-season-history-design.md`

---

## File Structure

### Created

- `src/database/queries/player-stats.ts` — CRUD for the existing but unpopulated `player_stats` table.
- `src/database/queries/history.ts` — read queries for season history and career aggregates.
- `src/engine/history/season-archiver.ts` — pure archiver entry point plus helpers for each award/title type.
- `src/engine/history/types.ts` — internal types used by archiver.
- `src/screens/history/HistoryScreen.tsx` — the dedicated history hub.
- `__tests__/database/queries/player-stats.test.ts`
- `__tests__/database/queries/history.test.ts`
- `__tests__/engine/history/season-archiver.test.ts`

### Modified

- `src/database/schema.ts` — add 4 new tables + indexes + `TABLE_NAMES`.
- `src/store/database-store.ts` — add idempotent migrations in `initialize()`.
- `src/engine/game-loop.ts` — (a) call `upsertPlayerStats` after each simulated match, (b) call `archiveSeason` when `isSeasonEnd`.
- `src/types/player.ts` — no change expected; `PlayerStats` already defined.
- `src/navigation/types.ts` — add `SeasonHistory` route.
- `src/navigation/RootNavigator.tsx` — register `<Stack.Screen name="SeasonHistory">`.
- `src/screens/club/ClubOverviewScreen.tsx` — add "Trophy Cabinet" section.
- `src/screens/squad/PlayerDetailScreen.tsx` — add "Career" section.
- `__tests__/engine/game-loop.test.ts` — integration test that season-end triggers archiver.

---

## Task 1: Schema — add history tables

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/store/database-store.ts`

- [ ] **Step 1.1: Add table names to `TABLE_NAMES`**

In `src/database/schema.ts`, find the `TABLE_NAMES` array (top of file, around line 1-20) and add four entries:

```typescript
export const TABLE_NAMES = [
  // ... existing entries ...
  'season_competition_results',
  'season_relegated',
  'season_awards',
  'season_player_titles',
];
```

- [ ] **Step 1.2: Add CREATE TABLE statements to `SCHEMA_SQL`**

In `src/database/schema.ts`, append to `SCHEMA_SQL` (after the last existing CREATE TABLE):

```sql
CREATE TABLE IF NOT EXISTS season_competition_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  champion_club_id INTEGER NOT NULL REFERENCES clubs(id),
  runner_up_club_id INTEGER REFERENCES clubs(id),
  UNIQUE(season, competition_id)
);

CREATE TABLE IF NOT EXISTS season_relegated (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  final_position INTEGER NOT NULL,
  UNIQUE(season, league_id, club_id)
);

CREATE TABLE IF NOT EXISTS season_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  award_type TEXT NOT NULL CHECK(award_type IN ('top_scorer','top_assister','mvp','breakthrough')),
  rank INTEGER NOT NULL DEFAULT 1,
  player_id INTEGER NOT NULL REFERENCES players(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  value REAL NOT NULL,
  UNIQUE(season, competition_id, award_type, rank)
);

CREATE TABLE IF NOT EXISTS season_player_titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  UNIQUE(season, competition_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_awards_player       ON season_awards(player_id);
CREATE INDEX IF NOT EXISTS idx_awards_season_comp  ON season_awards(season, competition_id);
CREATE INDEX IF NOT EXISTS idx_results_season      ON season_competition_results(season);
CREATE INDEX IF NOT EXISTS idx_relegated_season    ON season_relegated(season);
CREATE INDEX IF NOT EXISTS idx_player_titles_player ON season_player_titles(player_id);
```

- [ ] **Step 1.3: Add migrations for existing saves**

In `src/store/database-store.ts`, inside `initialize()` after the existing `addColumnIfMissing`/`CREATE TABLE` block (around line 87), append:

```typescript
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS season_competition_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    champion_club_id INTEGER NOT NULL,
    runner_up_club_id INTEGER,
    UNIQUE(season, competition_id)
  );
`);
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS season_relegated (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER NOT NULL,
    league_id INTEGER NOT NULL,
    club_id INTEGER NOT NULL,
    final_position INTEGER NOT NULL,
    UNIQUE(season, league_id, club_id)
  );
`);
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS season_awards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    award_type TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 1,
    player_id INTEGER NOT NULL,
    club_id INTEGER NOT NULL,
    value REAL NOT NULL,
    UNIQUE(season, competition_id, award_type, rank)
  );
`);
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS season_player_titles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    club_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    UNIQUE(season, competition_id, player_id)
  );
`);
await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_awards_player ON season_awards(player_id);`);
await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_awards_season_comp ON season_awards(season, competition_id);`);
await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_results_season ON season_competition_results(season);`);
await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_relegated_season ON season_relegated(season);`);
await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_player_titles_player ON season_player_titles(player_id);`);
```

Note: migration statements intentionally omit `REFERENCES` FKs because SQLite does not enforce them unless `PRAGMA foreign_keys = ON`, and the existing migrations in this file follow that same pattern.

- [ ] **Step 1.4: Run test suite to confirm schema still builds**

Run: `npm test -- --testPathPattern="database"`
Expected: all existing db tests pass; no new failures from schema errors.

- [ ] **Step 1.5: Commit**

```bash
git add src/database/schema.ts src/store/database-store.ts
git commit -m "feat(history): add schema for season history + trophy tables"
```

---

## Task 2: Query module — `player-stats`

`player_stats` already exists in schema with composite PK `(player_id, season, competition_id)` but nothing writes to it. The archiver's MVP/breakthrough logic depends on populated `avg_rating`, `appearances`, `minutes_played`. This task creates the upsert; Task 3 wires it into `game-loop`.

**Files:**
- Create: `src/database/queries/player-stats.ts`
- Create: `__tests__/database/queries/player-stats.test.ts`

- [ ] **Step 2.1: Write failing test for `upsertPlayerStats`**

Create `__tests__/database/queries/player-stats.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import { upsertPlayerStats, getPlayerStatsByCompetition } from '../../../src/database/queries/player-stats';

describe('player-stats queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeAll(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterAll(() => {
    rawDb.close();
  });

  it('inserts a new row when none exists', async () => {
    await upsertPlayerStats(db, {
      playerId: 1, season: 1, competitionId: 1,
      appearances: 1, goals: 2, assists: 1,
      yellowCards: 0, redCards: 0, rating: 8.0, minutesPlayed: 90,
    });

    const rows = await getPlayerStatsByCompetition(db, 1, 1);
    const row = rows.find((r) => r.playerId === 1);
    expect(row).toBeDefined();
    expect(row!.appearances).toBe(1);
    expect(row!.goals).toBe(2);
    expect(row!.assists).toBe(1);
    expect(row!.avgRating).toBeCloseTo(8.0);
    expect(row!.minutesPlayed).toBe(90);
  });

  it('accumulates a second match and recalculates avg_rating weighted by minutes', async () => {
    await upsertPlayerStats(db, {
      playerId: 1, season: 1, competitionId: 1,
      appearances: 1, goals: 1, assists: 0,
      yellowCards: 1, redCards: 0, rating: 6.0, minutesPlayed: 90,
    });

    const rows = await getPlayerStatsByCompetition(db, 1, 1);
    const row = rows.find((r) => r.playerId === 1)!;
    expect(row.appearances).toBe(2);
    expect(row.goals).toBe(3);
    expect(row.assists).toBe(1);
    expect(row.yellowCards).toBe(1);
    expect(row.minutesPlayed).toBe(180);
    // weighted avg: (8.0*90 + 6.0*90) / 180 = 7.0
    expect(row.avgRating).toBeCloseTo(7.0);
  });

  it('isolates stats by (player, season, competition)', async () => {
    await upsertPlayerStats(db, {
      playerId: 1, season: 2, competitionId: 1,
      appearances: 1, goals: 5, assists: 0,
      yellowCards: 0, redCards: 0, rating: 9.0, minutesPlayed: 90,
    });

    const s1 = (await getPlayerStatsByCompetition(db, 1, 1)).find((r) => r.playerId === 1)!;
    const s2 = (await getPlayerStatsByCompetition(db, 2, 1)).find((r) => r.playerId === 1)!;
    expect(s1.goals).toBe(3);
    expect(s2.goals).toBe(5);
  });
});
```

- [ ] **Step 2.2: Run test to confirm it fails**

Run: `npm test -- --testPathPattern="player-stats"`
Expected: FAIL — `Cannot find module '../../../src/database/queries/player-stats'`.

- [ ] **Step 2.3: Create `player-stats.ts` query module**

Create `src/database/queries/player-stats.ts`:

```typescript
import { DbHandle } from './players';
import { PlayerStats } from '../../types/player';

interface PlayerStatsRow {
  player_id: number;
  season: number;
  competition_id: number;
  appearances: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  avg_rating: number;
  minutes_played: number;
}

function rowToPlayerStats(row: PlayerStatsRow): PlayerStats {
  return {
    playerId: row.player_id,
    season: row.season,
    competitionId: row.competition_id,
    appearances: row.appearances,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    avgRating: row.avg_rating,
    minutesPlayed: row.minutes_played,
  };
}

export interface UpsertPlayerStatsInput {
  playerId: number;
  season: number;
  competitionId: number;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number;          // this match's rating
  minutesPlayed: number;   // this match's minutes
}

export async function upsertPlayerStats(db: DbHandle, input: UpsertPlayerStatsInput): Promise<void> {
  const existing = await db
    .prepare('SELECT * FROM player_stats WHERE player_id = ? AND season = ? AND competition_id = ?')
    .get(input.playerId, input.season, input.competitionId) as PlayerStatsRow | undefined;

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO player_stats
          (player_id, season, competition_id, appearances, goals, assists,
           yellow_cards, red_cards, avg_rating, minutes_played)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.playerId, input.season, input.competitionId,
        input.appearances, input.goals, input.assists,
        input.yellowCards, input.redCards, input.rating, input.minutesPlayed,
      );
    return;
  }

  const newMinutes = existing.minutes_played + input.minutesPlayed;
  const newAvgRating =
    newMinutes > 0
      ? (existing.avg_rating * existing.minutes_played + input.rating * input.minutesPlayed) / newMinutes
      : existing.avg_rating;

  await db
    .prepare(
      `UPDATE player_stats SET
        appearances = appearances + ?,
        goals = goals + ?,
        assists = assists + ?,
        yellow_cards = yellow_cards + ?,
        red_cards = red_cards + ?,
        avg_rating = ?,
        minutes_played = ?
       WHERE player_id = ? AND season = ? AND competition_id = ?`,
    )
    .run(
      input.appearances, input.goals, input.assists,
      input.yellowCards, input.redCards,
      newAvgRating, newMinutes,
      input.playerId, input.season, input.competitionId,
    );
}

export async function getPlayerStatsByCompetition(
  db: DbHandle,
  season: number,
  competitionId: number,
): Promise<PlayerStats[]> {
  const rows = await db
    .prepare('SELECT * FROM player_stats WHERE season = ? AND competition_id = ?')
    .all(season, competitionId) as PlayerStatsRow[];
  return rows.map(rowToPlayerStats);
}

export async function getPlayerStatsForPlayer(
  db: DbHandle,
  playerId: number,
): Promise<PlayerStats[]> {
  const rows = await db
    .prepare('SELECT * FROM player_stats WHERE player_id = ? ORDER BY season ASC, competition_id ASC')
    .all(playerId) as PlayerStatsRow[];
  return rows.map(rowToPlayerStats);
}
```

- [ ] **Step 2.4: Run the test to verify it passes**

Run: `npm test -- --testPathPattern="player-stats"`
Expected: PASS — all three test cases green.

- [ ] **Step 2.5: Commit**

```bash
git add src/database/queries/player-stats.ts __tests__/database/queries/player-stats.test.ts
git commit -m "feat(player-stats): upsert + read queries with weighted avg_rating"
```

---

## Task 3: Populate `player_stats` from the game loop

The match engine returns ratings in memory but never persists them. This task wires the upsert into `advanceGameWeek` after each simulated match.

**Files:**
- Modify: `src/engine/game-loop.ts`
- Modify: `__tests__/engine/game-loop.test.ts`

- [ ] **Step 3.1: Locate the post-match block in `game-loop.ts`**

Open `src/engine/game-loop.ts` and locate where a match result is produced. You should find the area around line 295 where `playerMatchResult = matchResult` is set, and similar places where AI matches are simulated. Read the `MatchResult` type (likely in `src/types/match.ts`) — it has `homeRatings` and `awayRatings: PlayerRating[]`. Each `PlayerRating` includes `playerId`, `rating`, and the player's match stats: goals, assists, yellow, red, minutes.

If the `PlayerRating` type does not already expose all the required fields, stop and adjust the type first (add them where `calculatePlayerRatings` emits them). Do not proceed until the rating objects carry: `playerId`, `rating`, `goals`, `assists`, `yellowCards`, `redCards`, `minutesPlayed`.

- [ ] **Step 3.2: Write failing test — season-long league run populates player_stats**

Append to `__tests__/engine/game-loop.test.ts` a new test:

```typescript
import { getPlayerStatsByCompetition } from '../../src/database/queries/player-stats';

it('populates player_stats after simulating a match', async () => {
  // (Adapt the existing test harness in this file: create a test db, seed,
  //  advance one week that includes at least one match in competition id = 1.)
  const { db, rawDb } = setupSeededGame(); // helper already used elsewhere in this file

  await advanceGameWeek(db, /* existing args */);

  const stats = await getPlayerStatsByCompetition(db, 1, 1);
  expect(stats.length).toBeGreaterThan(0);
  const withAppearance = stats.filter((s) => s.appearances > 0);
  expect(withAppearance.length).toBeGreaterThanOrEqual(22); // at least one 11-a-side match = ~22 players

  rawDb.close();
});
```

Note: this test requires adapting to the existing helpers of `game-loop.test.ts`. If a `setupSeededGame` helper does not exist, follow the pattern used by the sibling tests in that file for creating the test db and running `advanceGameWeek`.

- [ ] **Step 3.3: Run test to confirm it fails**

Run: `npm test -- --testPathPattern="game-loop"`
Expected: FAIL — `player_stats` is empty, assertion on `stats.length` fails.

- [ ] **Step 3.4: Wire `upsertPlayerStats` into `advanceGameWeek`**

In `src/engine/game-loop.ts`, after each block where a `MatchResult` is produced (both the player's match and AI matches), add:

```typescript
import { upsertPlayerStats } from '../database/queries/player-stats';

// ... inside the match-processing loop, after the match is simulated and the fixture is recorded:
async function persistMatchStats(
  db: DbHandle,
  fixture: Fixture,
  result: MatchResult,
): Promise<void> {
  const allRatings = [...result.homeRatings, ...result.awayRatings];
  for (const r of allRatings) {
    await upsertPlayerStats(db, {
      playerId: r.playerId,
      season: fixture.season,
      competitionId: fixture.competitionId,
      appearances: 1,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
      yellowCards: r.yellowCards ?? 0,
      redCards: r.redCards ?? 0,
      rating: r.rating,
      minutesPlayed: r.minutesPlayed ?? 90,
    });
  }
}

// call it right after each match simulation:
await persistMatchStats(db, fixture, matchResult);
```

Place the import at the top of the file next to the other query imports. Place `persistMatchStats` as a local helper near the top of the file, and invoke it in every code path that produces a `MatchResult` — verify by grepping for where `matchResult` or similar variable is used after simulation. All paths (player match + AI matches if simulated with the real engine) must call it.

If AI matches are resolved via the simplified reputation path and do not produce full `MatchResult` objects (likely, per the initial project survey), still call a lightweight variant that upserts only goals and assists per the simplified event list — OR skip player-stats for those matches explicitly. **Default for this plan: skip player-stats for AI-vs-AI matches that don't produce full ratings.** This keeps MVP/breakthrough honest (only awarded in competitions the player's club plays real engine games in) and avoids fabricating data.

- [ ] **Step 3.5: Run tests**

Run: `npm test -- --testPathPattern="game-loop"`
Expected: PASS — `player_stats` populated after at least one week.

- [ ] **Step 3.6: Commit**

```bash
git add src/engine/game-loop.ts __tests__/engine/game-loop.test.ts
git commit -m "feat(stats): persist player_stats from match engine ratings"
```

---

## Task 4: Archiver — skeleton and result/relegation logic

**Files:**
- Create: `src/engine/history/season-archiver.ts`
- Create: `src/engine/history/types.ts`
- Create: `__tests__/engine/history/season-archiver.test.ts`

- [ ] **Step 4.1: Create internal types file**

Create `src/engine/history/types.ts`:

```typescript
export interface LeagueStanding {
  clubId: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
}
```

- [ ] **Step 4.2: Write failing test — league champion, runner-up, relegated**

Create `__tests__/engine/history/season-archiver.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import { archiveSeason } from '../../../src/engine/history/season-archiver';

function finishAllFixturesForLeague(
  rawDb: Database.Database,
  competitionId: number,
  season: number,
  scoreFn: (homeId: number, awayId: number) => [number, number],
): void {
  const rows = rawDb
    .prepare('SELECT id, home_club_id, away_club_id FROM fixtures WHERE competition_id = ? AND season = ?')
    .all(competitionId, season) as Array<{ id: number; home_club_id: number; away_club_id: number }>;
  for (const r of rows) {
    const [h, a] = scoreFn(r.home_club_id, r.away_club_id);
    rawDb.prepare('UPDATE fixtures SET home_goals = ?, away_goals = ?, played = 1 WHERE id = ?').run(h, a, r.id);
  }
}

describe('archiveSeason — league titles', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('writes champion and runner-up for the top league by points', async () => {
    // Seed: make club 1 always win, club 2 always lose, and club 3 always win against non-top clubs.
    finishAllFixturesForLeague(rawDb, 1, 1, (home, away) => {
      if (home === 1) return [3, 0];
      if (away === 1) return [0, 3];
      if (home === 2) return [0, 3];
      if (away === 2) return [3, 0];
      return [1, 1];
    });

    await archiveSeason(db, 1);

    const result = rawDb
      .prepare('SELECT * FROM season_competition_results WHERE season = ? AND competition_id = ?')
      .get(1, 1) as { champion_club_id: number; runner_up_club_id: number } | undefined;
    expect(result).toBeDefined();
    expect(result!.champion_club_id).toBe(1);
    expect(result!.runner_up_club_id).not.toBe(2);
  });

  it('writes relegated clubs for the league', async () => {
    finishAllFixturesForLeague(rawDb, 1, 1, (home, away) => {
      if (home === 2) return [0, 3];
      if (away === 2) return [3, 0];
      return [1, 1];
    });

    await archiveSeason(db, 1);

    const relegated = rawDb
      .prepare('SELECT * FROM season_relegated WHERE season = ? AND league_id = ?')
      .all(1, 1) as Array<{ club_id: number; final_position: number }>;
    expect(relegated.length).toBeGreaterThan(0);
    expect(relegated.some((r) => r.club_id === 2)).toBe(true);
  });

  it('is idempotent — running twice does not duplicate rows', async () => {
    finishAllFixturesForLeague(rawDb, 1, 1, () => [1, 1]);
    await archiveSeason(db, 1);
    await archiveSeason(db, 1);
    const count = (rawDb
      .prepare('SELECT COUNT(*) AS c FROM season_competition_results WHERE season = 1 AND competition_id = 1')
      .get() as { c: number }).c;
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 4.3: Run test to verify it fails**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: FAIL — module not found.

- [ ] **Step 4.4: Create the archiver with league logic**

Create `src/engine/history/season-archiver.ts`:

```typescript
import { DbHandle } from '../../database/queries/players';
import { LeagueStanding } from './types';

interface CompetitionRow {
  id: number;
  type: 'league' | 'cup' | 'continental';
  format: 'round_robin' | 'knockout' | 'group_knockout';
  league_id: number | null;
}

interface LeagueRow {
  id: number;
  relegation_spots: number;
}

interface FixtureRow {
  id: number;
  home_club_id: number;
  away_club_id: number;
  home_goals: number | null;
  away_goals: number | null;
  played: number;
  round: number | null;
}

async function getCompetitionsForSeason(db: DbHandle, season: number): Promise<CompetitionRow[]> {
  return (await db
    .prepare(
      `SELECT DISTINCT c.id, c.type, c.format, c.league_id
       FROM competitions c
       JOIN fixtures f ON f.competition_id = c.id
       WHERE f.season = ? AND f.played = 1`,
    )
    .all(season)) as CompetitionRow[];
}

async function getLeague(db: DbHandle, leagueId: number): Promise<LeagueRow | undefined> {
  return (await db
    .prepare('SELECT id, relegation_spots FROM leagues WHERE id = ?')
    .get(leagueId)) as LeagueRow | undefined;
}

async function getPlayedFixtures(
  db: DbHandle,
  competitionId: number,
  season: number,
): Promise<FixtureRow[]> {
  return (await db
    .prepare(
      `SELECT id, home_club_id, away_club_id, home_goals, away_goals, played, round
       FROM fixtures WHERE competition_id = ? AND season = ? AND played = 1`,
    )
    .all(competitionId, season)) as FixtureRow[];
}

function computeStandings(fixtures: FixtureRow[]): LeagueStanding[] {
  const table = new Map<number, LeagueStanding>();
  const touch = (clubId: number): LeagueStanding => {
    let s = table.get(clubId);
    if (!s) {
      s = { clubId, points: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0 };
      table.set(clubId, s);
    }
    return s;
  };
  for (const f of fixtures) {
    if (f.home_goals == null || f.away_goals == null) continue;
    const h = touch(f.home_club_id);
    const a = touch(f.away_club_id);
    h.goalsFor += f.home_goals; h.goalsAgainst += f.away_goals;
    a.goalsFor += f.away_goals; a.goalsAgainst += f.home_goals;
    if (f.home_goals > f.away_goals) h.points += 3;
    else if (f.home_goals < f.away_goals) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  for (const s of table.values()) s.goalDiff = s.goalsFor - s.goalsAgainst;
  return [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.clubId - b.clubId; // deterministic tiebreak
  });
}

async function insertResultIgnore(
  db: DbHandle,
  season: number,
  competitionId: number,
  championClubId: number,
  runnerUpClubId: number | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_competition_results
         (season, competition_id, champion_club_id, runner_up_club_id)
       VALUES (?, ?, ?, ?)`,
    )
    .run(season, competitionId, championClubId, runnerUpClubId);
}

async function insertRelegatedIgnore(
  db: DbHandle,
  season: number,
  leagueId: number,
  clubId: number,
  finalPosition: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_relegated
         (season, league_id, club_id, final_position)
       VALUES (?, ?, ?, ?)`,
    )
    .run(season, leagueId, clubId, finalPosition);
}

async function archiveLeague(
  db: DbHandle,
  competition: CompetitionRow,
  season: number,
): Promise<void> {
  if (competition.league_id == null) return;
  const league = await getLeague(db, competition.league_id);
  if (!league) return;

  const fixtures = await getPlayedFixtures(db, competition.id, season);
  if (fixtures.length === 0) return;

  const standings = computeStandings(fixtures);
  if (standings.length === 0) return;

  const champion = standings[0].clubId;
  const runnerUp = standings.length > 1 ? standings[1].clubId : null;
  await insertResultIgnore(db, season, competition.id, champion, runnerUp);

  const relegatedCount = league.relegation_spots ?? 0;
  if (relegatedCount > 0 && standings.length >= relegatedCount) {
    const relegated = standings.slice(-relegatedCount);
    for (let i = 0; i < relegated.length; i++) {
      const finalPosition = standings.length - relegated.length + i + 1;
      await insertRelegatedIgnore(db, season, league.id, relegated[i].clubId, finalPosition);
    }
  }
}

export async function archiveSeason(db: DbHandle, season: number): Promise<void> {
  const competitions = await getCompetitionsForSeason(db, season);
  for (const competition of competitions) {
    if (competition.type === 'league') {
      await archiveLeague(db, competition, season);
    }
    // cup + continental added in Task 5; awards in Tasks 6-7; player_titles in Task 8.
  }
}
```

- [ ] **Step 4.5: Run tests to confirm pass**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: PASS — three tests green.

- [ ] **Step 4.6: Commit**

```bash
git add src/engine/history/season-archiver.ts src/engine/history/types.ts __tests__/engine/history/season-archiver.test.ts
git commit -m "feat(history): archiver skeleton with league champion/runner-up/relegation"
```

---

## Task 5: Archiver — cup and continental titles

**Files:**
- Modify: `src/engine/history/season-archiver.ts`
- Modify: `__tests__/engine/history/season-archiver.test.ts`

- [ ] **Step 5.1: Write failing test for cup final**

Append to `__tests__/engine/history/season-archiver.test.ts`:

```typescript
describe('archiveSeason — cup & continental', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('writes champion and runner-up from the cup final', async () => {
    // Find a cup competition in the seed; adjust id if your seed differs.
    const cup = rawDb
      .prepare("SELECT id FROM competitions WHERE type = 'cup' LIMIT 1")
      .get() as { id: number } | undefined;
    if (!cup) return; // seed has no cup — test skipped meaningfully

    // Mark one final-round fixture as played, others not final
    const fixtures = rawDb
      .prepare('SELECT id, round FROM fixtures WHERE competition_id = ? AND season = ?')
      .all(cup.id, 1) as Array<{ id: number; round: number | null }>;
    const maxRound = Math.max(...fixtures.map((f) => f.round ?? 0));
    const finalFixture = fixtures.find((f) => f.round === maxRound)!;
    const other = fixtures.find((f) => f.id !== finalFixture.id);

    rawDb.prepare('UPDATE fixtures SET home_goals = 2, away_goals = 1, played = 1 WHERE id = ?').run(finalFixture.id);
    if (other) {
      rawDb.prepare('UPDATE fixtures SET home_goals = 1, away_goals = 0, played = 1 WHERE id = ?').run(other.id);
    }

    await archiveSeason(db, 1);

    const result = rawDb
      .prepare('SELECT * FROM season_competition_results WHERE season = 1 AND competition_id = ?')
      .get(cup.id) as { champion_club_id: number; runner_up_club_id: number | null } | undefined;
    expect(result).toBeDefined();
    const finalRow = rawDb
      .prepare('SELECT home_club_id, away_club_id, home_goals, away_goals FROM fixtures WHERE id = ?')
      .get(finalFixture.id) as { home_club_id: number; away_club_id: number };
    expect(result!.champion_club_id).toBe(finalRow.home_club_id);
    expect(result!.runner_up_club_id).toBe(finalRow.away_club_id);
  });
});
```

- [ ] **Step 5.2: Run — test fails because archiver does not handle `cup`**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: FAIL — no row inserted for cup competition.

- [ ] **Step 5.3: Add cup/continental handling**

In `src/engine/history/season-archiver.ts`, add helper + branch:

```typescript
async function archiveKnockout(
  db: DbHandle,
  competition: CompetitionRow,
  season: number,
): Promise<void> {
  const fixtures = await getPlayedFixtures(db, competition.id, season);
  if (fixtures.length === 0) return;

  // Final = highest `round` value among played fixtures with a defined round.
  const rounds = fixtures.map((f) => f.round ?? -1);
  const maxRound = Math.max(...rounds);
  if (maxRound < 0) return;

  const finals = fixtures.filter((f) => (f.round ?? -1) === maxRound);
  if (finals.length === 0) return;
  // If multiple finals (shouldn't happen), take the last by id for determinism.
  const final = finals.sort((a, b) => b.id - a.id)[0];
  if (final.home_goals == null || final.away_goals == null) return;

  let championClubId: number;
  let runnerUpClubId: number | null;
  if (final.home_goals > final.away_goals) {
    championClubId = final.home_club_id;
    runnerUpClubId = final.away_club_id;
  } else if (final.away_goals > final.home_goals) {
    championClubId = final.away_club_id;
    runnerUpClubId = final.home_club_id;
  } else {
    // Tie with no shootout modelled — pick home as champion deterministically.
    // TODO once penalty shootouts exist, read the actual winner from match_events.
    championClubId = final.home_club_id;
    runnerUpClubId = final.away_club_id;
  }

  await insertResultIgnore(db, season, competition.id, championClubId, runnerUpClubId);
}
```

And in `archiveSeason`, extend the branch:

```typescript
for (const competition of competitions) {
  if (competition.type === 'league') {
    await archiveLeague(db, competition, season);
  } else if (competition.type === 'cup' || competition.type === 'continental') {
    await archiveKnockout(db, competition, season);
  }
}
```

- [ ] **Step 5.4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/engine/history/season-archiver.ts __tests__/engine/history/season-archiver.test.ts
git commit -m "feat(history): archiver supports cup and continental finals"
```

---

## Task 6: Archiver — top scorers and top assisters

**Files:**
- Modify: `src/engine/history/season-archiver.ts`
- Modify: `__tests__/engine/history/season-archiver.test.ts`

- [ ] **Step 6.1: Write failing test for top_scorer and top_assister awards**

Append to the "archiveSeason — cup & continental" describe, OR create a new describe block:

```typescript
describe('archiveSeason — top scorers / assisters', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('writes top 5 scorers and top 5 assisters from match_events', async () => {
    // Mark all league fixtures as played so the competition is archivable.
    const fixtures = rawDb
      .prepare('SELECT id, home_club_id, away_club_id FROM fixtures WHERE competition_id = 1 AND season = 1')
      .all() as Array<{ id: number; home_club_id: number; away_club_id: number }>;
    for (const f of fixtures) {
      rawDb.prepare('UPDATE fixtures SET home_goals = 1, away_goals = 0, played = 1 WHERE id = ?').run(f.id);
    }
    // Seed goals: player 1 = 5 goals with player 2 as assister each time in fixture 1.
    const f1 = fixtures[0].id;
    const players = rawDb.prepare('SELECT id, club_id FROM players LIMIT 10').all() as Array<{ id: number; club_id: number }>;
    for (let i = 0; i < 5; i++) {
      rawDb
        .prepare(
          `INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id)
           VALUES (?, ?, 'goal', ?, ?)`,
        )
        .run(f1, 10 + i, players[0].id, players[1].id);
    }
    // Another goal by player 3, no assist
    rawDb
      .prepare(
        `INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id)
         VALUES (?, ?, 'goal', ?, NULL)`,
      )
      .run(f1, 80, players[2].id);

    await archiveSeason(db, 1);

    const scorers = rawDb
      .prepare("SELECT * FROM season_awards WHERE season = 1 AND competition_id = 1 AND award_type = 'top_scorer' ORDER BY rank ASC")
      .all() as Array<{ rank: number; player_id: number; value: number }>;
    expect(scorers.length).toBeGreaterThanOrEqual(2);
    expect(scorers[0].player_id).toBe(players[0].id);
    expect(scorers[0].value).toBe(5);
    expect(scorers[0].rank).toBe(1);

    const assisters = rawDb
      .prepare("SELECT * FROM season_awards WHERE season = 1 AND competition_id = 1 AND award_type = 'top_assister' ORDER BY rank ASC")
      .all() as Array<{ rank: number; player_id: number; value: number }>;
    expect(assisters.length).toBeGreaterThanOrEqual(1);
    expect(assisters[0].player_id).toBe(players[1].id);
    expect(assisters[0].value).toBe(5);
  });
});
```

- [ ] **Step 6.2: Run — test fails**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: FAIL — no rows in `season_awards`.

- [ ] **Step 6.3: Implement top scorers/assisters**

Add to `src/engine/history/season-archiver.ts`:

```typescript
interface ScorerRow { player_id: number; club_id: number; goals: number; }
interface AssisterRow { secondary_player_id: number; club_id: number; assists: number; }

async function insertAwardIgnore(
  db: DbHandle,
  season: number,
  competitionId: number,
  awardType: 'top_scorer' | 'top_assister' | 'mvp' | 'breakthrough',
  rank: number,
  playerId: number,
  clubId: number,
  value: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO season_awards
         (season, competition_id, award_type, rank, player_id, club_id, value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(season, competitionId, awardType, rank, playerId, clubId, value);
}

async function archiveTopScorers(db: DbHandle, competitionId: number, season: number): Promise<void> {
  const rows = (await db
    .prepare(
      `SELECT me.player_id AS player_id, p.club_id AS club_id, COUNT(*) AS goals
       FROM match_events me
       JOIN fixtures f ON f.id = me.fixture_id
       JOIN players  p ON p.id = me.player_id
       WHERE f.competition_id = ? AND f.season = ? AND me.type = 'goal'
       GROUP BY me.player_id
       ORDER BY goals DESC, me.player_id ASC
       LIMIT 5`,
    )
    .all(competitionId, season)) as ScorerRow[];
  for (let i = 0; i < rows.length; i++) {
    await insertAwardIgnore(db, season, competitionId, 'top_scorer', i + 1, rows[i].player_id, rows[i].club_id, rows[i].goals);
  }
}

async function archiveTopAssisters(db: DbHandle, competitionId: number, season: number): Promise<void> {
  const rows = (await db
    .prepare(
      `SELECT me.secondary_player_id AS secondary_player_id, p.club_id AS club_id, COUNT(*) AS assists
       FROM match_events me
       JOIN fixtures f ON f.id = me.fixture_id
       JOIN players  p ON p.id = me.secondary_player_id
       WHERE f.competition_id = ? AND f.season = ? AND me.type = 'goal' AND me.secondary_player_id IS NOT NULL
       GROUP BY me.secondary_player_id
       ORDER BY assists DESC, me.secondary_player_id ASC
       LIMIT 5`,
    )
    .all(competitionId, season)) as AssisterRow[];
  for (let i = 0; i < rows.length; i++) {
    await insertAwardIgnore(
      db, season, competitionId, 'top_assister', i + 1,
      rows[i].secondary_player_id, rows[i].club_id, rows[i].assists,
    );
  }
}
```

And in the main `archiveSeason` loop, after the title handling for each competition, call:

```typescript
await archiveTopScorers(db, competition.id, season);
await archiveTopAssisters(db, competition.id, season);
```

(Both calls belong inside the `for (const competition of competitions)` loop, unconditional on competition type.)

- [ ] **Step 6.4: Run tests — green**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: PASS.

- [ ] **Step 6.5: Commit**

```bash
git add src/engine/history/season-archiver.ts __tests__/engine/history/season-archiver.test.ts
git commit -m "feat(history): archive top 5 scorers and assisters per competition"
```

---

## Task 7: Archiver — MVP and Breakthrough awards

MVP/Breakthrough read `player_stats.avg_rating` — populated by Task 3. Minimum games requirement:
- For leagues: half of `(num_clubs - 1) * 2`.
- For cups/continental: half of the fixtures the player's club actually contested (derived per-club).

**Files:**
- Modify: `src/engine/history/season-archiver.ts`
- Modify: `__tests__/engine/history/season-archiver.test.ts`

- [ ] **Step 7.1: Write failing tests for MVP and Breakthrough**

Append new describe block:

```typescript
describe('archiveSeason — MVP & breakthrough', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('writes MVP as the player with highest avg_rating meeting the minimum games threshold', async () => {
    // Finish all league fixtures
    rawDb.prepare('UPDATE fixtures SET home_goals = 1, away_goals = 0, played = 1 WHERE competition_id = 1 AND season = 1').run();

    // Seed two players' stats: player 10 has high rating with many games, player 11 has higher rating but few games.
    const numClubs = (rawDb.prepare('SELECT COUNT(*) AS c FROM clubs WHERE league_id = 1').get() as { c: number }).c;
    const maxPossible = (numClubs - 1) * 2;
    const threshold = Math.ceil(maxPossible / 2);

    const clubOfPlayer10 = (rawDb.prepare('SELECT club_id FROM players WHERE id = 10').get() as { club_id: number }).club_id;
    rawDb.prepare(
      `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played)
       VALUES (10, 1, 1, ?, 0, 0, 0, 0, 8.2, ?)`,
    ).run(threshold, threshold * 90);
    rawDb.prepare(
      `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played)
       VALUES (11, 1, 1, 1, 0, 0, 0, 0, 9.5, 90)`,
    ).run();

    await archiveSeason(db, 1);

    const mvp = rawDb
      .prepare("SELECT * FROM season_awards WHERE season = 1 AND competition_id = 1 AND award_type = 'mvp'")
      .get() as { player_id: number; club_id: number; value: number } | undefined;
    expect(mvp).toBeDefined();
    expect(mvp!.player_id).toBe(10); // player 11 disqualified by minimum games
    expect(mvp!.club_id).toBe(clubOfPlayer10);
    expect(mvp!.value).toBeCloseTo(8.2);
  });

  it('writes breakthrough only for players aged <= 21', async () => {
    rawDb.prepare('UPDATE fixtures SET home_goals = 1, away_goals = 0, played = 1 WHERE competition_id = 1 AND season = 1').run();
    const numClubs = (rawDb.prepare('SELECT COUNT(*) AS c FROM clubs WHERE league_id = 1').get() as { c: number }).c;
    const threshold = Math.ceil(((numClubs - 1) * 2) / 2);

    // Pick two players: one aged 20, one aged 28.
    rawDb.prepare('UPDATE players SET age = 20 WHERE id = 10').run();
    rawDb.prepare('UPDATE players SET age = 28 WHERE id = 11').run();

    rawDb.prepare(
      `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played)
       VALUES (10, 1, 1, ?, 0, 0, 0, 0, 8.0, ?)`,
    ).run(threshold, threshold * 90);
    rawDb.prepare(
      `INSERT INTO player_stats (player_id, season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played)
       VALUES (11, 1, 1, ?, 0, 0, 0, 0, 9.0, ?)`,
    ).run(threshold, threshold * 90);

    await archiveSeason(db, 1);

    const breakthrough = rawDb
      .prepare("SELECT * FROM season_awards WHERE season = 1 AND competition_id = 1 AND award_type = 'breakthrough'")
      .get() as { player_id: number; value: number } | undefined;
    expect(breakthrough).toBeDefined();
    expect(breakthrough!.player_id).toBe(10);
  });

  it('does not write MVP if nobody meets the minimum games threshold', async () => {
    rawDb.prepare('UPDATE fixtures SET home_goals = 1, away_goals = 0, played = 1 WHERE competition_id = 1 AND season = 1').run();
    // player_stats left empty for competition 1 — nobody eligible
    await archiveSeason(db, 1);
    const mvp = rawDb
      .prepare("SELECT * FROM season_awards WHERE season = 1 AND competition_id = 1 AND award_type = 'mvp'")
      .get();
    expect(mvp).toBeUndefined();
  });
});
```

- [ ] **Step 7.2: Run — failing**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: FAIL for all three MVP/breakthrough tests.

- [ ] **Step 7.3: Implement MVP and Breakthrough**

Add to `src/engine/history/season-archiver.ts`:

```typescript
interface MvpCandidateRow {
  player_id: number;
  club_id: number;
  avg_rating: number;
  appearances: number;
  age: number;
}

async function getLeagueClubCount(db: DbHandle, leagueId: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM clubs WHERE league_id = ?')
    .get(leagueId) as { c: number };
  return row.c;
}

async function getClubFixturesPlayed(
  db: DbHandle,
  competitionId: number,
  season: number,
  clubId: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM fixtures
       WHERE competition_id = ? AND season = ? AND played = 1
         AND (home_club_id = ? OR away_club_id = ?)`,
    )
    .get(competitionId, season, clubId, clubId) as { c: number };
  return row.c;
}

async function getCandidates(
  db: DbHandle,
  competitionId: number,
  season: number,
): Promise<MvpCandidateRow[]> {
  return (await db
    .prepare(
      `SELECT ps.player_id AS player_id, p.club_id AS club_id,
              ps.avg_rating AS avg_rating, ps.appearances AS appearances, p.age AS age
       FROM player_stats ps
       JOIN players p ON p.id = ps.player_id
       WHERE ps.competition_id = ? AND ps.season = ?
       ORDER BY ps.avg_rating DESC, ps.player_id ASC`,
    )
    .all(competitionId, season)) as MvpCandidateRow[];
}

async function minGamesForCompetition(
  db: DbHandle,
  competition: CompetitionRow,
  season: number,
  clubId: number,
): Promise<number> {
  if (competition.type === 'league' && competition.league_id != null) {
    const n = await getLeagueClubCount(db, competition.league_id);
    if (n < 2) return 0;
    return Math.ceil(((n - 1) * 2) / 2);
  }
  // cup/continental: 50% of the club's played fixtures in this competition
  const clubGames = await getClubFixturesPlayed(db, competition.id, season, clubId);
  return Math.ceil(clubGames / 2);
}

async function archiveMvpAndBreakthrough(
  db: DbHandle,
  competition: CompetitionRow,
  season: number,
): Promise<void> {
  const candidates = await getCandidates(db, competition.id, season);
  if (candidates.length === 0) return;

  // MVP: any age. Breakthrough: age <= 21.
  let mvp: MvpCandidateRow | null = null;
  let breakthrough: MvpCandidateRow | null = null;

  for (const c of candidates) {
    const minGames = await minGamesForCompetition(db, competition, season, c.club_id);
    if (c.appearances < minGames) continue;
    if (!mvp) mvp = c;
    if (!breakthrough && c.age <= 21) breakthrough = c;
    if (mvp && breakthrough) break;
  }

  if (mvp) {
    await insertAwardIgnore(db, season, competition.id, 'mvp', 1, mvp.player_id, mvp.club_id, mvp.avg_rating);
  }
  if (breakthrough) {
    await insertAwardIgnore(db, season, competition.id, 'breakthrough', 1, breakthrough.player_id, breakthrough.club_id, breakthrough.avg_rating);
  }
}
```

And inside `archiveSeason`'s loop, after the top-scorers/assisters calls:

```typescript
await archiveMvpAndBreakthrough(db, competition, season);
```

- [ ] **Step 7.4: Run tests**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: PASS — three new tests green.

- [ ] **Step 7.5: Commit**

```bash
git add src/engine/history/season-archiver.ts __tests__/engine/history/season-archiver.test.ts
git commit -m "feat(history): archive MVP and breakthrough awards per competition"
```

---

## Task 8: Archiver — champion squad snapshot (`season_player_titles`)

**Files:**
- Modify: `src/engine/history/season-archiver.ts`
- Modify: `__tests__/engine/history/season-archiver.test.ts`

- [ ] **Step 8.1: Write failing test**

Append:

```typescript
describe('archiveSeason — champion squad snapshot', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('records every player of the champion club at archive time', async () => {
    // Make club 1 win every league match
    const fixtures = rawDb
      .prepare('SELECT id, home_club_id, away_club_id FROM fixtures WHERE competition_id = 1 AND season = 1')
      .all() as Array<{ id: number; home_club_id: number; away_club_id: number }>;
    for (const f of fixtures) {
      const [h, a] = f.home_club_id === 1 ? [3, 0] : f.away_club_id === 1 ? [0, 3] : [1, 1];
      rawDb.prepare('UPDATE fixtures SET home_goals = ?, away_goals = ?, played = 1 WHERE id = ?').run(h, a, f.id);
    }

    await archiveSeason(db, 1);

    const playersOfClub1 = rawDb
      .prepare('SELECT id FROM players WHERE club_id = 1')
      .all() as Array<{ id: number }>;
    const titles = rawDb
      .prepare('SELECT player_id FROM season_player_titles WHERE season = 1 AND competition_id = 1 AND club_id = 1')
      .all() as Array<{ player_id: number }>;
    expect(titles.length).toBe(playersOfClub1.length);
    expect(titles.map((t) => t.player_id).sort()).toEqual(playersOfClub1.map((p) => p.id).sort());
  });
});
```

- [ ] **Step 8.2: Run — fails**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: FAIL — no rows in `season_player_titles`.

- [ ] **Step 8.3: Implement snapshot**

Add to `src/engine/history/season-archiver.ts`:

```typescript
async function snapshotChampionSquad(
  db: DbHandle,
  season: number,
  competitionId: number,
  championClubId: number,
): Promise<void> {
  const players = (await db
    .prepare('SELECT id FROM players WHERE club_id = ?')
    .all(championClubId)) as Array<{ id: number }>;
  for (const p of players) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO season_player_titles
           (season, competition_id, club_id, player_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(season, competitionId, championClubId, p.id);
  }
}
```

Refactor `archiveLeague` and `archiveKnockout` to call `snapshotChampionSquad(db, season, competition.id, champion)` immediately after writing the result row. Both functions now own the champion id locally — pass it directly.

```typescript
// Inside archiveLeague, after insertResultIgnore(...):
await snapshotChampionSquad(db, season, competition.id, champion);

// Inside archiveKnockout, after insertResultIgnore(...):
await snapshotChampionSquad(db, season, competition.id, championClubId);
```

- [ ] **Step 8.4: Run tests — green**

Run: `npm test -- --testPathPattern="season-archiver"`
Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/engine/history/season-archiver.ts __tests__/engine/history/season-archiver.test.ts
git commit -m "feat(history): snapshot champion squad per competition for career titles"
```

---

## Task 9: Wire archiver into the game loop

**Files:**
- Modify: `src/engine/game-loop.ts`
- Modify: `__tests__/engine/game-loop.test.ts`

- [ ] **Step 9.1: Write failing integration test**

Append to `__tests__/engine/game-loop.test.ts`:

```typescript
it('calls archiveSeason when isSeasonEnd triggers', async () => {
  const { db, rawDb } = setupSeededGame(); // existing or newly written helper

  // Fast-forward to season end: set current week to 46, simulate the final week.
  rawDb.prepare('UPDATE save_games SET current_week = 46').run();
  // Finish all league fixtures for season 1 so the archiver has something to write
  rawDb.prepare('UPDATE fixtures SET home_goals = 1, away_goals = 0, played = 1 WHERE competition_id = 1 AND season = 1').run();

  await advanceGameWeek(db, /* existing args */);

  const archived = rawDb
    .prepare('SELECT COUNT(*) AS c FROM season_competition_results WHERE season = 1')
    .get() as { c: number };
  expect(archived.c).toBeGreaterThan(0);

  rawDb.close();
});
```

Adapt the helpers to whatever this file already uses; the core assertion is that after `isSeasonEnd`, `season_competition_results` has at least one row for `season = 1`.

- [ ] **Step 9.2: Run — fails**

Run: `npm test -- --testPathPattern="game-loop"`
Expected: FAIL — no rows archived.

- [ ] **Step 9.3: Add archiver call in `advanceGameWeek`**

In `src/engine/game-loop.ts`, near the top with other imports:

```typescript
import { archiveSeason } from './history/season-archiver';
```

Find the block around line 483:

```typescript
const isSeasonEnd = week >= 46;
const newWeek = isSeasonEnd ? 1 : week + 1;
const newSeason = isSeasonEnd ? season + 1 : season;
```

Insert archiver call immediately before `const newWeek`:

```typescript
const isSeasonEnd = week >= 46;
if (isSeasonEnd) {
  await archiveSeason(db, season);
}
const newWeek = isSeasonEnd ? 1 : week + 1;
const newSeason = isSeasonEnd ? season + 1 : season;
```

The archiver is idempotent (see Task 4 test) so calling it again on crash/rerun is safe.

- [ ] **Step 9.4: Run tests — green**

Run: `npm test -- --testPathPattern="game-loop"`
Expected: PASS.

- [ ] **Step 9.5: Run full suite as smoke check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 9.6: Commit**

```bash
git add src/engine/game-loop.ts __tests__/engine/game-loop.test.ts
git commit -m "feat(history): archive season automatically at season end"
```

---

## Task 10: Read queries — `history.ts`

**Files:**
- Create: `src/database/queries/history.ts`
- Create: `__tests__/database/queries/history.test.ts`

- [ ] **Step 10.1: Write failing tests for the five read functions**

Create `__tests__/database/queries/history.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import {
  getSeasonSummary,
  getCompetitionHistory,
  getClubTrophies,
  getPlayerAwards,
  getPlayerTitles,
} from '../../../src/database/queries/history';

describe('history queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);

    // Seed a minimal archived season manually.
    rawDb.prepare(
      `INSERT INTO season_competition_results (season, competition_id, champion_club_id, runner_up_club_id)
       VALUES (1, 1, 1, 2), (2, 1, 2, 1), (1, 2, 3, 4)`
    ).run();
    rawDb.prepare(
      `INSERT INTO season_relegated (season, league_id, club_id, final_position)
       VALUES (1, 1, 10, 18), (1, 1, 11, 19), (1, 1, 12, 20)`
    ).run();
    rawDb.prepare(
      `INSERT INTO season_awards (season, competition_id, award_type, rank, player_id, club_id, value)
       VALUES
         (1, 1, 'top_scorer', 1, 100, 1, 25),
         (1, 1, 'top_scorer', 2, 101, 2, 22),
         (1, 1, 'mvp', 1, 100, 1, 8.4),
         (2, 1, 'top_scorer', 1, 100, 2, 19)`
    ).run();
    rawDb.prepare(
      `INSERT INTO season_player_titles (season, competition_id, club_id, player_id)
       VALUES (1, 1, 1, 100), (2, 1, 2, 100), (1, 2, 3, 200)`
    ).run();
  });

  afterEach(() => {
    rawDb.close();
  });

  it('getSeasonSummary returns competitions with champion, runner-up, relegated, awards', async () => {
    const summary = await getSeasonSummary(db, 1);
    expect(summary.length).toBeGreaterThanOrEqual(2);
    const liga = summary.find((s) => s.competitionId === 1)!;
    expect(liga.championClubId).toBe(1);
    expect(liga.runnerUpClubId).toBe(2);
    expect(liga.relegated.map((r) => r.clubId).sort()).toEqual([10, 11, 12]);
    expect(liga.topScorers[0].playerId).toBe(100);
    expect(liga.mvp?.playerId).toBe(100);
  });

  it('getCompetitionHistory lists champions by season ascending', async () => {
    const history = await getCompetitionHistory(db, 1);
    expect(history.map((h) => h.season)).toEqual([1, 2]);
    expect(history[0].championClubId).toBe(1);
    expect(history[1].championClubId).toBe(2);
  });

  it('getClubTrophies aggregates titles and runner-ups per competition', async () => {
    const trophies = await getClubTrophies(db, 1);
    const liga = trophies.find((t) => t.competitionId === 1)!;
    expect(liga.titles).toBe(1);
    expect(liga.runnerUps).toBe(1);
    expect(liga.titleYears).toEqual([1]);
    expect(liga.runnerUpYears).toEqual([2]);
  });

  it('getPlayerAwards returns all awards of a player chronologically', async () => {
    const awards = await getPlayerAwards(db, 100);
    expect(awards.length).toBe(3);
    expect(awards[0].season).toBeLessThanOrEqual(awards[awards.length - 1].season);
  });

  it('getPlayerTitles returns titles snapshotted for the player', async () => {
    const titles = await getPlayerTitles(db, 100);
    expect(titles.length).toBe(2);
    expect(titles.map((t) => ({ season: t.season, clubId: t.clubId }))).toEqual([
      { season: 1, clubId: 1 },
      { season: 2, clubId: 2 },
    ]);
  });
});
```

- [ ] **Step 10.2: Run — fails (module missing)**

Run: `npm test -- --testPathPattern="queries/history"`
Expected: FAIL — module not found.

- [ ] **Step 10.3: Create `history.ts`**

Create `src/database/queries/history.ts`:

```typescript
import { DbHandle } from './players';

export interface SeasonAward {
  season: number;
  competitionId: number;
  competitionName?: string;
  awardType: 'top_scorer' | 'top_assister' | 'mvp' | 'breakthrough';
  rank: number;
  playerId: number;
  clubId: number;
  value: number;
}

export interface SeasonRelegated {
  clubId: number;
  finalPosition: number;
}

export interface SeasonCompetitionSummary {
  season: number;
  competitionId: number;
  competitionName: string;
  championClubId: number;
  runnerUpClubId: number | null;
  relegated: SeasonRelegated[];
  topScorers: SeasonAward[];
  topAssisters: SeasonAward[];
  mvp: SeasonAward | null;
  breakthrough: SeasonAward | null;
}

export interface CompetitionHistoryEntry {
  season: number;
  competitionId: number;
  championClubId: number;
  runnerUpClubId: number | null;
}

export interface ClubTrophySummary {
  competitionId: number;
  competitionName: string;
  titles: number;
  runnerUps: number;
  titleYears: number[];
  runnerUpYears: number[];
}

export interface PlayerTitle {
  season: number;
  competitionId: number;
  competitionName: string;
  clubId: number;
}

interface ResultRow {
  season: number;
  competition_id: number;
  competition_name: string | null;
  champion_club_id: number;
  runner_up_club_id: number | null;
}

interface RelegatedRow { season: number; league_id: number; club_id: number; final_position: number; }
interface AwardRow {
  season: number; competition_id: number; competition_name: string | null;
  award_type: 'top_scorer' | 'top_assister' | 'mvp' | 'breakthrough';
  rank: number; player_id: number; club_id: number; value: number;
}

function mapAward(row: AwardRow): SeasonAward {
  return {
    season: row.season,
    competitionId: row.competition_id,
    competitionName: row.competition_name ?? undefined,
    awardType: row.award_type,
    rank: row.rank,
    playerId: row.player_id,
    clubId: row.club_id,
    value: row.value,
  };
}

export async function getSeasonSummary(
  db: DbHandle,
  season: number,
): Promise<SeasonCompetitionSummary[]> {
  const results = (await db
    .prepare(
      `SELECT r.season, r.competition_id, c.name AS competition_name,
              r.champion_club_id, r.runner_up_club_id
       FROM season_competition_results r
       LEFT JOIN competitions c ON c.id = r.competition_id
       WHERE r.season = ?
       ORDER BY r.competition_id ASC`,
    )
    .all(season)) as ResultRow[];

  const awards = (await db
    .prepare(
      `SELECT a.season, a.competition_id, c.name AS competition_name,
              a.award_type, a.rank, a.player_id, a.club_id, a.value
       FROM season_awards a
       LEFT JOIN competitions c ON c.id = a.competition_id
       WHERE a.season = ?
       ORDER BY a.competition_id ASC, a.award_type ASC, a.rank ASC`,
    )
    .all(season)) as AwardRow[];

  const relegated = (await db
    .prepare(
      `SELECT season, league_id, club_id, final_position
       FROM season_relegated
       WHERE season = ?
       ORDER BY final_position ASC`,
    )
    .all(season)) as RelegatedRow[];

  return results.map((r) => {
    const compAwards = awards.filter((a) => a.competition_id === r.competition_id);
    // League relegations: we look up league_id via the competitions table.
    // For simplicity we return any relegated rows whose league_id matches the competition's league_id when provided.
    // Callers can cross-reference if needed.
    return {
      season: r.season,
      competitionId: r.competition_id,
      competitionName: r.competition_name ?? '',
      championClubId: r.champion_club_id,
      runnerUpClubId: r.runner_up_club_id,
      relegated: relegated
        .filter((rel) => rel.season === r.season)
        .map((rel) => ({ clubId: rel.club_id, finalPosition: rel.final_position })),
      topScorers: compAwards.filter((a) => a.award_type === 'top_scorer').map(mapAward),
      topAssisters: compAwards.filter((a) => a.award_type === 'top_assister').map(mapAward),
      mvp: compAwards.find((a) => a.award_type === 'mvp') ? mapAward(compAwards.find((a) => a.award_type === 'mvp')!) : null,
      breakthrough: compAwards.find((a) => a.award_type === 'breakthrough') ? mapAward(compAwards.find((a) => a.award_type === 'breakthrough')!) : null,
    };
  });
}

export async function getCompetitionHistory(
  db: DbHandle,
  competitionId: number,
): Promise<CompetitionHistoryEntry[]> {
  const rows = (await db
    .prepare(
      `SELECT season, competition_id, champion_club_id, runner_up_club_id
       FROM season_competition_results
       WHERE competition_id = ?
       ORDER BY season ASC`,
    )
    .all(competitionId)) as ResultRow[];
  return rows.map((r) => ({
    season: r.season,
    competitionId: r.competition_id,
    championClubId: r.champion_club_id,
    runnerUpClubId: r.runner_up_club_id,
  }));
}

export async function getClubTrophies(
  db: DbHandle,
  clubId: number,
): Promise<ClubTrophySummary[]> {
  const rows = (await db
    .prepare(
      `SELECT r.competition_id, c.name AS competition_name, r.season,
              r.champion_club_id, r.runner_up_club_id
       FROM season_competition_results r
       LEFT JOIN competitions c ON c.id = r.competition_id
       WHERE r.champion_club_id = ? OR r.runner_up_club_id = ?
       ORDER BY r.competition_id ASC, r.season ASC`,
    )
    .all(clubId, clubId)) as Array<ResultRow>;

  const byComp = new Map<number, ClubTrophySummary>();
  for (const r of rows) {
    let entry = byComp.get(r.competition_id);
    if (!entry) {
      entry = {
        competitionId: r.competition_id,
        competitionName: r.competition_name ?? '',
        titles: 0,
        runnerUps: 0,
        titleYears: [],
        runnerUpYears: [],
      };
      byComp.set(r.competition_id, entry);
    }
    if (r.champion_club_id === clubId) {
      entry.titles += 1;
      entry.titleYears.push(r.season);
    }
    if (r.runner_up_club_id === clubId) {
      entry.runnerUps += 1;
      entry.runnerUpYears.push(r.season);
    }
  }
  return [...byComp.values()];
}

export async function getPlayerAwards(
  db: DbHandle,
  playerId: number,
): Promise<SeasonAward[]> {
  const rows = (await db
    .prepare(
      `SELECT a.season, a.competition_id, c.name AS competition_name,
              a.award_type, a.rank, a.player_id, a.club_id, a.value
       FROM season_awards a
       LEFT JOIN competitions c ON c.id = a.competition_id
       WHERE a.player_id = ?
       ORDER BY a.season ASC, a.competition_id ASC, a.award_type ASC, a.rank ASC`,
    )
    .all(playerId)) as AwardRow[];
  return rows.map(mapAward);
}

interface TitleRow {
  season: number;
  competition_id: number;
  competition_name: string | null;
  club_id: number;
  player_id: number;
}

export async function getPlayerTitles(
  db: DbHandle,
  playerId: number,
): Promise<PlayerTitle[]> {
  const rows = (await db
    .prepare(
      `SELECT t.season, t.competition_id, c.name AS competition_name, t.club_id, t.player_id
       FROM season_player_titles t
       LEFT JOIN competitions c ON c.id = t.competition_id
       WHERE t.player_id = ?
       ORDER BY t.season ASC, t.competition_id ASC`,
    )
    .all(playerId)) as TitleRow[];
  return rows.map((r) => ({
    season: r.season,
    competitionId: r.competition_id,
    competitionName: r.competition_name ?? '',
    clubId: r.club_id,
  }));
}
```

- [ ] **Step 10.4: Run tests — pass**

Run: `npm test -- --testPathPattern="queries/history"`
Expected: PASS — five tests green.

- [ ] **Step 10.5: Commit**

```bash
git add src/database/queries/history.ts __tests__/database/queries/history.test.ts
git commit -m "feat(history): read queries — season summary, club trophies, player awards/titles"
```

---

## Task 11: UI — `HistoryScreen` hub

**Files:**
- Create: `src/screens/history/HistoryScreen.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/MainMenuScreen.tsx` OR `src/screens/ReportsScreen.tsx` (pick the Reports hub to add a card)

- [ ] **Step 11.1: Add route type**

In `src/navigation/types.ts`:

```typescript
export type RootStackParamList = {
  // ... existing ...
  SeasonHistory: undefined;
};
```

- [ ] **Step 11.2: Create `HistoryScreen.tsx`**

Create `src/screens/history/HistoryScreen.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useDatabase } from '../../store/database-store';
import { getSeasonSummary, SeasonCompetitionSummary } from '../../database/queries/history';
import { useGameStore } from '../../store/game-store';

export default function HistoryScreen() {
  const db = useDatabase((s) => s.db);
  const currentSeason = useGameStore((s) => s.currentSeason);
  const [selectedSeason, setSelectedSeason] = useState<number>(currentSeason > 1 ? currentSeason - 1 : 1);
  const [summary, setSummary] = useState<SeasonCompetitionSummary[]>([]);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    (async () => {
      const data = await getSeasonSummary(db, selectedSeason);
      if (!cancelled) setSummary(data);
    })();
    return () => { cancelled = true; };
  }, [db, selectedSeason]);

  const seasons: number[] = [];
  for (let s = 1; s < currentSeason; s++) seasons.push(s);

  return (
    <View style={styles.root}>
      <ScrollView horizontal contentContainerStyle={styles.seasonBar}>
        {seasons.length === 0 && (
          <Text style={styles.empty}>No completed seasons yet.</Text>
        )}
        {seasons.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setSelectedSeason(s)}
            style={[styles.seasonChip, selectedSeason === s && styles.seasonChipActive]}
          >
            <Text style={[styles.seasonChipText, selectedSeason === s && styles.seasonChipTextActive]}>
              Season {s}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.body}>
        {summary.map((s) => (
          <View key={s.competitionId} style={styles.compCard}>
            <Text style={styles.compName}>{s.competitionName}</Text>
            <Text style={styles.row}>Champion: Club {s.championClubId}</Text>
            {s.runnerUpClubId != null && <Text style={styles.row}>Runner-up: Club {s.runnerUpClubId}</Text>}
            {s.relegated.length > 0 && (
              <Text style={styles.row}>Relegated: {s.relegated.map((r) => `Club ${r.clubId}`).join(', ')}</Text>
            )}
            {s.topScorers.length > 0 && (
              <Text style={styles.row}>
                Top scorer: Player {s.topScorers[0].playerId} ({s.topScorers[0].value} goals)
              </Text>
            )}
            {s.topAssisters.length > 0 && (
              <Text style={styles.row}>
                Top assister: Player {s.topAssisters[0].playerId} ({s.topAssisters[0].value} assists)
              </Text>
            )}
            {s.mvp && <Text style={styles.row}>MVP: Player {s.mvp.playerId}</Text>}
            {s.breakthrough && <Text style={styles.row}>Breakthrough: Player {s.breakthrough.playerId}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  seasonBar: { padding: 12, gap: 8, flexDirection: 'row' },
  seasonChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#1c2530' },
  seasonChipActive: { backgroundColor: '#3d8bfd' },
  seasonChipText: { color: '#9bb0c4', fontSize: 13 },
  seasonChipTextActive: { color: '#fff', fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  compCard: { backgroundColor: '#141a22', borderRadius: 10, padding: 14 },
  compName: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  row: { color: '#c5d1de', fontSize: 13, marginTop: 2 },
  empty: { color: '#9bb0c4', fontSize: 13, padding: 8 },
});
```

Note: the component displays raw IDs ("Club 3", "Player 100") for MVP speed. A polish pass can resolve names with joins, but the data model supports it and names can be added later without breaking the shape.

- [ ] **Step 11.3: Register the route**

In `src/navigation/RootNavigator.tsx`, add:

```typescript
import HistoryScreen from '../screens/history/HistoryScreen';

// inside the <Stack.Navigator>:
<Stack.Screen name="SeasonHistory" component={HistoryScreen} options={{ title: 'History' }} />
```

- [ ] **Step 11.4: Add entry point from Reports**

In `src/screens/ReportsScreen.tsx` (or whichever file renders the Reports hub), add a card/button that navigates to `SeasonHistory`:

```typescript
<TouchableOpacity onPress={() => navigation.navigate('SeasonHistory')} style={styles.hubCard}>
  <Text style={styles.hubCardTitle}>History</Text>
  <Text style={styles.hubCardSubtitle}>Past champions, awards & records</Text>
</TouchableOpacity>
```

Follow the exact pattern the other hub cards in that file use — if the file uses a `<HubCard>` component, use that instead.

- [ ] **Step 11.5: Manual smoke test**

Run: `npm start` (or the dev command used by the project).
Expected: navigate from Reports → History → see "No completed seasons yet" on a fresh save; if you advance through a full season in a test save, the screen lists the competitions of the previous season with champion/runner-up/awards.

If the project has no quick way to fast-forward a full season manually, rely on the integration test from Task 9 for functional coverage and verify the screen renders something (placeholder for season 0) without errors.

- [ ] **Step 11.6: Commit**

```bash
git add src/screens/history/HistoryScreen.tsx src/navigation/types.ts src/navigation/RootNavigator.tsx src/screens/ReportsScreen.tsx
git commit -m "feat(history): season history hub screen + Reports entry point"
```

---

## Task 12: UI — Club trophy cabinet in `ClubOverviewScreen`

**Files:**
- Modify: `src/screens/club/ClubOverviewScreen.tsx`

- [ ] **Step 12.1: Add a "Trophy Cabinet" section**

Open `src/screens/club/ClubOverviewScreen.tsx`. Locate where the hub cards render (`HubCard` stack). Below them, add:

```typescript
import { useEffect, useState } from 'react';
import { getClubTrophies, ClubTrophySummary } from '../../database/queries/history';

// inside the component:
const [trophies, setTrophies] = useState<ClubTrophySummary[]>([]);
useEffect(() => {
  if (!db || !playerClubId) return;
  let cancelled = false;
  (async () => {
    const t = await getClubTrophies(db, playerClubId);
    if (!cancelled) setTrophies(t);
  })();
  return () => { cancelled = true; };
}, [db, playerClubId]);

// in the render, below the hub cards:
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Trophy Cabinet</Text>
  {trophies.length === 0 && <Text style={styles.empty}>No trophies yet.</Text>}
  {trophies.map((t) => (
    <View key={t.competitionId} style={styles.trophyRow}>
      <Text style={styles.trophyComp}>{t.competitionName}</Text>
      <Text style={styles.trophyCount}>
        {t.titles} {t.titles === 1 ? 'title' : 'titles'}
        {t.runnerUps > 0 ? ` · ${t.runnerUps} runner-up` : ''}
      </Text>
      {t.titleYears.length > 0 && (
        <Text style={styles.trophyYears}>Years: {t.titleYears.join(', ')}</Text>
      )}
    </View>
  ))}
</View>
```

Add corresponding styles (`section`, `sectionTitle`, `empty`, `trophyRow`, `trophyComp`, `trophyCount`, `trophyYears`) matching the project's existing style vocabulary. Reuse tokens from nearby sections if they exist.

Use `useDatabase` and the existing club-id selector the file already uses — do not introduce new store access patterns.

- [ ] **Step 12.2: Manual smoke test**

Run: `npm start`. Open the Club Overview screen. Expected: "No trophies yet." on a fresh save; after an archived season, the cabinet lists competitions the club has won/been runner-up in.

- [ ] **Step 12.3: Commit**

```bash
git add src/screens/club/ClubOverviewScreen.tsx
git commit -m "feat(history): trophy cabinet in club overview"
```

---

## Task 13: UI — Career section in `PlayerDetailScreen`

**Files:**
- Modify: `src/screens/squad/PlayerDetailScreen.tsx`

- [ ] **Step 13.1: Add Career section after the Contract section**

Open `src/screens/squad/PlayerDetailScreen.tsx`. After the "Contract" section (around line 175), add:

```typescript
import { useEffect, useState } from 'react';
import { getPlayerAwards, getPlayerTitles, SeasonAward, PlayerTitle } from '../../database/queries/history';

// inside the component:
const [awards, setAwards] = useState<SeasonAward[]>([]);
const [titles, setTitles] = useState<PlayerTitle[]>([]);
useEffect(() => {
  if (!db) return;
  let cancelled = false;
  (async () => {
    const [a, t] = await Promise.all([
      getPlayerAwards(db, player.id),
      getPlayerTitles(db, player.id),
    ]);
    if (!cancelled) { setAwards(a); setTitles(t); }
  })();
  return () => { cancelled = true; };
}, [db, player.id]);

// in the render, after the Contract section:
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Career</Text>

  <Text style={styles.subHeading}>Titles</Text>
  {titles.length === 0 && <Text style={styles.empty}>No titles yet.</Text>}
  {titles.map((t, i) => (
    <Text key={i} style={styles.row}>
      {t.competitionName} — Season {t.season}
    </Text>
  ))}

  <Text style={styles.subHeading}>Individual Awards</Text>
  {awards.length === 0 && <Text style={styles.empty}>No awards yet.</Text>}
  {awards.map((a, i) => (
    <Text key={i} style={styles.row}>
      {awardLabel(a)} — {a.competitionName} ({a.season}){a.awardType === 'top_scorer' || a.awardType === 'top_assister' ? ` · ${a.value}` : ''}
    </Text>
  ))}
</View>
```

Add a helper inside the component file:

```typescript
function awardLabel(a: SeasonAward): string {
  switch (a.awardType) {
    case 'top_scorer': return `Top Scorer (rank ${a.rank})`;
    case 'top_assister': return `Top Assister (rank ${a.rank})`;
    case 'mvp': return 'MVP';
    case 'breakthrough': return 'Breakthrough Player';
  }
}
```

Add `subHeading` to the StyleSheet if not present. Reuse `section`, `sectionTitle`, `row`, `empty` from existing styles where possible.

- [ ] **Step 13.2: Manual smoke test**

Run: `npm start`. Open any player's detail. Expected: "No titles yet." and "No awards yet." on a fresh save; on a save with an archived season, appropriate lines appear.

- [ ] **Step 13.3: Commit**

```bash
git add src/screens/squad/PlayerDetailScreen.tsx
git commit -m "feat(history): career section with titles and awards in player detail"
```

---

## Task 14: Final full-suite run + commit docs

- [ ] **Step 14.1: Run full suite**

Run: `npm test`
Expected: all tests pass, no regressions.

- [ ] **Step 14.2: Type-check**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 14.3: Smoke test end-to-end**

Run: `npm start`. Open the app. Navigate: Reports → History → see the empty state. Open Club Overview → see empty trophy cabinet. Open a player → see empty career. Confirm no runtime errors.

- [ ] **Step 14.4 (optional): Mark plan complete in a follow-up commit**

If you want to track completion in-tree, edit this plan file to add a "Status: complete" line under the header and commit:

```bash
git add docs/superpowers/plans/2026-04-14-feature-a-season-history.md
git commit -m "docs(plan): mark feature A season history as complete"
```

---

## Self-review notes (for implementer)

- **`player_stats` was empty before this feature.** Task 2+3 fixes that and is a prerequisite of MVP/Breakthrough. Do not merge only the archiver without those tasks.
- **Archiver is idempotent**, but the `game-loop` call happens only when `week >= 46`. If someone reruns the loop over an already-archived season, the `INSERT OR IGNORE`s protect duplicates.
- **Ties in the cup final without a shootout model**: the archiver falls back to home team as champion. This is a known limitation — documented inline in the code.
- **Tiebreak for top scorers/assisters**: lowest `player_id` wins. Documented in the spec and in the code.
- **AI-vs-AI matches without full engine ratings**: `player_stats` is not populated for those. Consequently, MVP/Breakthrough only land for competitions the player's club actually plays real engine matches in. That is the honest behavior given the current engine state.
- **UI shows raw IDs** for clubs and players in this first pass. Upgrading to names is a cosmetic follow-up that touches only the three screens, not the data layer.
