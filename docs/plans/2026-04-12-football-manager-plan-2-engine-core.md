# Football Manager — Plan 2: Engine Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the competition calendar system (leagues, cups, Champions League), fixture generation, match simulation engine, and player rating system. After this plan, a full season of fixtures can be generated and simulated with realistic results.

**Architecture:** All engine code lives in `src/engine/` as pure TypeScript — no React or database imports. Engine functions receive data as parameters and return results. The orchestration layer (Plan 3) will connect engine to database.

**Tech Stack:** TypeScript, SeededRng (from Plan 1), existing types and queries from Plan 1.

---

## File Structure

```
src/engine/
├── rng.ts                          # (exists) Seeded PRNG
├── competition/
│   ├── calendar.ts                 # Season calendar: creates competitions, assigns weeks
│   ├── fixture-generator.ts        # Generates fixtures for round-robin, knockout, group+knockout
│   └── standings.ts                # Calculates league standings from played fixtures
├── simulation/
│   ├── team-strength.ts            # Calculate team strength from squad + tactics
│   ├── match-engine.ts             # Core match simulation: produces result + events
│   └── player-rating.ts            # Calculate individual player ratings for a match
```

```
__tests__/engine/
├── rng.test.ts                     # (exists)
├── competition/
│   ├── calendar.test.ts
│   ├── fixture-generator.test.ts
│   └── standings.test.ts
├── simulation/
│   ├── team-strength.test.ts
│   ├── match-engine.test.ts
│   └── player-rating.test.ts
```

---

### Task 1: Fixture Generator (Round-Robin)

**Files:**
- Create: `src/engine/competition/fixture-generator.ts`
- Test: `__tests__/engine/competition/fixture-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/competition/fixture-generator.test.ts`:

```ts
import { generateRoundRobin, generateKnockoutRound } from '@/engine/competition/fixture-generator';

describe('generateRoundRobin', () => {
  it('generates correct number of fixtures for 20 teams', () => {
    const teamIds = Array.from({ length: 20 }, (_, i) => i + 1);
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 7 });
    // 20 teams, double round-robin = 20 * 19 = 380 matches
    expect(fixtures).toHaveLength(380);
  });

  it('generates correct number of fixtures for 18 teams', () => {
    const teamIds = Array.from({ length: 18 }, (_, i) => i + 1);
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 7 });
    // 18 teams, double round-robin = 18 * 17 = 306 matches
    expect(fixtures).toHaveLength(306);
  });

  it('every team plays every other team twice (home and away)', () => {
    const teamIds = [1, 2, 3, 4];
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 1 });
    // 4 teams: 4*3 = 12 matches
    expect(fixtures).toHaveLength(12);

    for (const a of teamIds) {
      for (const b of teamIds) {
        if (a === b) continue;
        const match = fixtures.find(f => f.homeClubId === a && f.awayClubId === b);
        expect(match).toBeDefined();
      }
    }
  });

  it('no team plays itself', () => {
    const teamIds = Array.from({ length: 20 }, (_, i) => i + 1);
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 7 });
    for (const f of fixtures) {
      expect(f.homeClubId).not.toBe(f.awayClubId);
    }
  });

  it('no team plays more than one match per week', () => {
    const teamIds = Array.from({ length: 20 }, (_, i) => i + 1);
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 7 });

    const weekMap = new Map<number, Set<number>>();
    for (const f of fixtures) {
      if (!weekMap.has(f.week)) weekMap.set(f.week, new Set());
      const teams = weekMap.get(f.week)!;
      expect(teams.has(f.homeClubId)).toBe(false);
      expect(teams.has(f.awayClubId)).toBe(false);
      teams.add(f.homeClubId);
      teams.add(f.awayClubId);
    }
  });

  it('assigns sequential weeks starting from startWeek', () => {
    const teamIds = [1, 2, 3, 4];
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 10 });
    const weeks = [...new Set(fixtures.map(f => f.week))].sort((a, b) => a - b);
    // 4 teams = 3 rounds per half * 2 halves = 6 rounds
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toBe(10);
  });

  it('returns FixtureInput objects with correct fields', () => {
    const fixtures = generateRoundRobin([1, 2, 3, 4], { competitionId: 5, season: 2, startWeek: 1 });
    for (const f of fixtures) {
      expect(f.competitionId).toBe(5);
      expect(f.season).toBe(2);
      expect(typeof f.homeClubId).toBe('number');
      expect(typeof f.awayClubId).toBe('number');
      expect(typeof f.week).toBe('number');
    }
  });
});

describe('generateKnockoutRound', () => {
  it('generates correct number of fixtures for 16 teams', () => {
    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const fixtures = generateKnockoutRound(teamIds, { competitionId: 1, season: 1, week: 20, round: 1 });
    expect(fixtures).toHaveLength(8); // 16/2
  });

  it('pairs teams sequentially (1v2, 3v4, ...)', () => {
    const teamIds = [10, 20, 30, 40];
    const fixtures = generateKnockoutRound(teamIds, { competitionId: 1, season: 1, week: 20, round: 1 });
    expect(fixtures[0].homeClubId).toBe(10);
    expect(fixtures[0].awayClubId).toBe(20);
    expect(fixtures[1].homeClubId).toBe(30);
    expect(fixtures[1].awayClubId).toBe(40);
  });

  it('assigns the specified round number', () => {
    const fixtures = generateKnockoutRound([1, 2], { competitionId: 1, season: 1, week: 30, round: 3 });
    expect(fixtures[0].round).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /root/rodrigo/football-manager && npx jest __tests__/engine/competition/fixture-generator.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement fixture generator**

Create `src/engine/competition/fixture-generator.ts`:

```ts
export interface FixtureInput {
  competitionId: number;
  season: number;
  week: number;
  round: number | null;
  homeClubId: number;
  awayClubId: number;
}

interface RoundRobinOptions {
  competitionId: number;
  season: number;
  startWeek: number;
}

/**
 * Generate a double round-robin schedule (home & away) for a list of teams.
 * Uses the circle method to ensure no team plays twice in the same week.
 */
export function generateRoundRobin(teamIds: number[], options: RoundRobinOptions): FixtureInput[] {
  const n = teamIds.length;
  const teams = [...teamIds];

  // If odd number of teams, add a bye (-1)
  if (n % 2 !== 0) teams.push(-1);

  const totalTeams = teams.length;
  const roundsPerHalf = totalTeams - 1;
  const matchesPerRound = totalTeams / 2;
  const fixtures: FixtureInput[] = [];

  // Circle method: fix team[0], rotate the rest
  for (let half = 0; half < 2; half++) {
    const rotatingTeams = teams.slice(1);

    for (let round = 0; round < roundsPerHalf; round++) {
      const week = options.startWeek + half * roundsPerHalf + round;
      const roundTeams = [teams[0], ...rotatingTeams];

      for (let match = 0; match < matchesPerRound; match++) {
        const home = roundTeams[match];
        const away = roundTeams[totalTeams - 1 - match];

        if (home === -1 || away === -1) continue; // skip bye

        if (half === 0) {
          fixtures.push({
            competitionId: options.competitionId,
            season: options.season,
            week,
            round: null,
            homeClubId: home,
            awayClubId: away,
          });
        } else {
          // Reverse home/away for second half
          fixtures.push({
            competitionId: options.competitionId,
            season: options.season,
            week,
            round: null,
            homeClubId: away,
            awayClubId: home,
          });
        }
      }

      // Rotate: move last element to position 1
      rotatingTeams.unshift(rotatingTeams.pop()!);
    }
  }

  return fixtures;
}

interface KnockoutOptions {
  competitionId: number;
  season: number;
  week: number;
  round: number;
}

/**
 * Generate a single knockout round: pairs teams sequentially.
 * teamIds must have even length.
 */
export function generateKnockoutRound(teamIds: number[], options: KnockoutOptions): FixtureInput[] {
  const fixtures: FixtureInput[] = [];
  for (let i = 0; i < teamIds.length; i += 2) {
    fixtures.push({
      competitionId: options.competitionId,
      season: options.season,
      week: options.week,
      round: options.round,
      homeClubId: teamIds[i],
      awayClubId: teamIds[i + 1],
    });
  }
  return fixtures;
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /root/rodrigo/football-manager && npx jest __tests__/engine/competition/fixture-generator.test.ts
```

Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/competition/ __tests__/engine/competition/ && git commit -m "feat: add round-robin and knockout fixture generators"
```

---

### Task 2: League Standings Calculator

**Files:**
- Create: `src/engine/competition/standings.ts`
- Test: `__tests__/engine/competition/standings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/competition/standings.test.ts`:

```ts
import { calculateStandings, StandingsEntry } from '@/engine/competition/standings';
import { Fixture } from '@/types';

function makeFixture(home: number, away: number, homeGoals: number, awayGoals: number): Fixture {
  return {
    id: 0, competitionId: 1, season: 1, week: 1, round: null,
    homeClubId: home, awayClubId: away,
    homeGoals, awayGoals, played: true, attendance: null,
  };
}

describe('calculateStandings', () => {
  it('awards 3 points for a win', () => {
    const fixtures = [makeFixture(1, 2, 3, 0)];
    const standings = calculateStandings(fixtures, [1, 2]);
    const team1 = standings.find(s => s.clubId === 1)!;
    expect(team1.points).toBe(3);
    expect(team1.wins).toBe(1);
    expect(team1.goalsFor).toBe(3);
  });

  it('awards 1 point each for a draw', () => {
    const fixtures = [makeFixture(1, 2, 1, 1)];
    const standings = calculateStandings(fixtures, [1, 2]);
    expect(standings[0].points).toBe(1);
    expect(standings[1].points).toBe(1);
    expect(standings[0].draws).toBe(1);
  });

  it('awards 0 points for a loss', () => {
    const fixtures = [makeFixture(1, 2, 0, 2)];
    const standings = calculateStandings(fixtures, [1, 2]);
    const team1 = standings.find(s => s.clubId === 1)!;
    expect(team1.points).toBe(0);
    expect(team1.losses).toBe(1);
  });

  it('sorts by points, then goal difference, then goals scored', () => {
    const fixtures = [
      makeFixture(1, 2, 2, 0), // team 1: 3pts, +2 GD
      makeFixture(3, 4, 5, 0), // team 3: 3pts, +5 GD
      makeFixture(2, 3, 1, 1), // draw
    ];
    const standings = calculateStandings(fixtures, [1, 2, 3, 4]);
    expect(standings[0].clubId).toBe(3); // better GD
    expect(standings[1].clubId).toBe(1);
  });

  it('ignores unplayed fixtures', () => {
    const played = makeFixture(1, 2, 2, 0);
    const unplayed: Fixture = {
      id: 0, competitionId: 1, season: 1, week: 2, round: null,
      homeClubId: 1, awayClubId: 2,
      homeGoals: null, awayGoals: null, played: false, attendance: null,
    };
    const standings = calculateStandings([played, unplayed], [1, 2]);
    expect(standings[0].played).toBe(1);
  });

  it('calculates goal difference correctly', () => {
    const fixtures = [
      makeFixture(1, 2, 3, 1),
      makeFixture(2, 1, 2, 0),
    ];
    const standings = calculateStandings(fixtures, [1, 2]);
    const team1 = standings.find(s => s.clubId === 1)!;
    expect(team1.goalsFor).toBe(3);
    expect(team1.goalsAgainst).toBe(3);
    expect(team1.goalDifference).toBe(0);
  });

  it('includes all teams even with no matches', () => {
    const standings = calculateStandings([], [1, 2, 3]);
    expect(standings).toHaveLength(3);
    for (const s of standings) {
      expect(s.points).toBe(0);
      expect(s.played).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement standings calculator**

Create `src/engine/competition/standings.ts`:

```ts
import { Fixture } from '@/types';

export interface StandingsEntry {
  clubId: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

/**
 * Calculate league standings from a list of fixtures.
 * Only considers played fixtures (played === true).
 * Sorts by: points DESC, goal difference DESC, goals scored DESC.
 */
export function calculateStandings(fixtures: Fixture[], clubIds: number[]): StandingsEntry[] {
  const map = new Map<number, StandingsEntry>();

  for (const id of clubIds) {
    map.set(id, {
      clubId: id,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    });
  }

  for (const f of fixtures) {
    if (!f.played || f.homeGoals === null || f.awayGoals === null) continue;

    const home = map.get(f.homeClubId);
    const away = map.get(f.awayClubId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += f.homeGoals;
    home.goalsAgainst += f.awayGoals;
    away.goalsFor += f.awayGoals;
    away.goalsAgainst += f.homeGoals;

    if (f.homeGoals > f.awayGoals) {
      home.wins++;
      home.points += 3;
      away.losses++;
    } else if (f.homeGoals < f.awayGoals) {
      away.wins++;
      away.points += 3;
      home.losses++;
    } else {
      home.draws++;
      away.draws++;
      home.points += 1;
      away.points += 1;
    }
  }

  const entries = Array.from(map.values());
  for (const e of entries) {
    e.goalDifference = e.goalsFor - e.goalsAgainst;
  }

  entries.sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor
  );

  return entries;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/competition/standings.ts __tests__/engine/competition/standings.test.ts && git commit -m "feat: add league standings calculator with sorting by points/GD/GF"
```

---

### Task 3: Season Calendar Generator

**Files:**
- Create: `src/engine/competition/calendar.ts`
- Test: `__tests__/engine/competition/calendar.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/competition/calendar.test.ts`:

```ts
import { generateSeasonCalendar, SeasonCalendar } from '@/engine/competition/calendar';
import { League } from '@/types';

const mockLeagues: League[] = [
  { id: 1, name: 'Premier League', countryId: 1, divisionLevel: 1, numTeams: 20, promotionSpots: 0, relegationSpots: 3 },
  { id: 2, name: 'La Liga', countryId: 2, divisionLevel: 1, numTeams: 20, promotionSpots: 0, relegationSpots: 3 },
];

const mockClubsByLeague: Record<number, number[]> = {
  1: Array.from({ length: 20 }, (_, i) => i + 1),
  2: Array.from({ length: 20 }, (_, i) => i + 21),
};

describe('generateSeasonCalendar', () => {
  let calendar: SeasonCalendar;

  beforeAll(() => {
    calendar = generateSeasonCalendar({
      season: 1,
      leagues: mockLeagues,
      clubsByLeague: mockClubsByLeague,
      championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
    });
  });

  it('creates one league competition per league', () => {
    const leagueComps = calendar.competitions.filter(c => c.type === 'league');
    expect(leagueComps).toHaveLength(2);
  });

  it('creates one cup competition per league', () => {
    const cupComps = calendar.competitions.filter(c => c.type === 'cup');
    expect(cupComps).toHaveLength(2);
  });

  it('creates one continental competition', () => {
    const continental = calendar.competitions.filter(c => c.type === 'continental');
    expect(continental).toHaveLength(1);
    expect(continental[0].name).toContain('Champions');
  });

  it('generates league fixtures with correct count', () => {
    const leagueComp = calendar.competitions.find(c => c.type === 'league' && c.leagueId === 1)!;
    const leagueFixtures = calendar.fixtures.filter(f => f.competitionId === leagueComp.id);
    expect(leagueFixtures).toHaveLength(380); // 20 teams double round-robin
  });

  it('generates cup fixtures (first round)', () => {
    const cupComps = calendar.competitions.filter(c => c.type === 'cup');
    for (const cup of cupComps) {
      const cupFixtures = calendar.fixtures.filter(f => f.competitionId === cup.id);
      expect(cupFixtures.length).toBeGreaterThan(0);
    }
  });

  it('league fixtures fall within correct week range', () => {
    const leagueFixtures = calendar.fixtures.filter(f => {
      const comp = calendar.competitions.find(c => c.id === f.competitionId);
      return comp?.type === 'league';
    });
    for (const f of leagueFixtures) {
      expect(f.week).toBeGreaterThanOrEqual(7);  // after preseason
      expect(f.week).toBeLessThanOrEqual(44);
    }
  });

  it('assigns unique fixture IDs', () => {
    const ids = calendar.fixtures.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns unique competition IDs', () => {
    const ids = calendar.competitions.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement season calendar generator**

Create `src/engine/competition/calendar.ts`:

```ts
import { Competition, CompetitionType, CompetitionFormat, League } from '@/types';
import { generateRoundRobin, generateKnockoutRound, FixtureInput } from './fixture-generator';

export interface SeasonCalendarInput {
  season: number;
  leagues: League[];
  clubsByLeague: Record<number, number[]>;
  championsLeagueClubs: number[]; // 8 qualified clubs (top from each league)
}

export interface SeasonCalendar {
  competitions: Competition[];
  fixtures: FixtureInput[];
  entries: { competitionId: number; clubId: number; groupName: string | null; seed: number }[];
}

/**
 * Generate a full season calendar:
 * - One league competition per league (round-robin, weeks 7-44)
 * - One cup competition per league (knockout, staggered weeks)
 * - One Champions League (group_knockout format)
 */
export function generateSeasonCalendar(input: SeasonCalendarInput): SeasonCalendar {
  const competitions: Competition[] = [];
  const fixtures: FixtureInput[] = [];
  const entries: SeasonCalendar['entries'] = [];

  let compId = 1;
  let fixtureId = 1;

  // --- League competitions ---
  for (const league of input.leagues) {
    const clubIds = input.clubsByLeague[league.id];
    if (!clubIds) continue;

    const comp: Competition = {
      id: compId,
      name: `${league.name} ${input.season}`,
      type: 'league',
      format: 'round_robin',
      season: input.season,
      leagueId: league.id,
    };
    competitions.push(comp);

    for (const clubId of clubIds) {
      entries.push({ competitionId: compId, clubId, groupName: null, seed: 0 });
    }

    const leagueFixtures = generateRoundRobin(clubIds, {
      competitionId: compId,
      season: input.season,
      startWeek: 7,
    });

    for (const f of leagueFixtures) {
      fixtures.push({ ...f, id: fixtureId++ } as FixtureInput & { id: number });
    }

    compId++;
  }

  // --- Cup competitions (one per league) ---
  const cupWeeks = [10, 15, 20, 30, 38]; // rounds spread across season

  for (const league of input.leagues) {
    const clubIds = input.clubsByLeague[league.id];
    if (!clubIds) continue;

    const comp: Competition = {
      id: compId,
      name: `${league.name} Cup ${input.season}`,
      type: 'cup',
      format: 'knockout',
      season: input.season,
      leagueId: league.id,
    };
    competitions.push(comp);

    for (const clubId of clubIds) {
      entries.push({ competitionId: compId, clubId, groupName: null, seed: 0 });
    }

    // Generate first round only; later rounds generated as results come in
    // For N teams: need to reduce to power of 2
    let bracketSize = 1;
    while (bracketSize < clubIds.length) bracketSize *= 2;

    // First round: teams that need to play to reduce to bracket
    const byeCount = bracketSize - clubIds.length;
    const playingCount = clubIds.length - byeCount;
    const firstRoundTeams = clubIds.slice(0, playingCount);

    if (firstRoundTeams.length >= 2) {
      const round1 = generateKnockoutRound(firstRoundTeams, {
        competitionId: compId,
        season: input.season,
        week: cupWeeks[0],
        round: 1,
      });
      for (const f of round1) {
        fixtures.push({ ...f, id: fixtureId++ } as FixtureInput & { id: number });
      }
    }

    compId++;
  }

  // --- Champions League ---
  const clClubs = input.championsLeagueClubs;
  if (clClubs.length >= 8) {
    const comp: Competition = {
      id: compId,
      name: `Champions League ${input.season}`,
      type: 'continental',
      format: 'group_knockout',
      season: input.season,
      leagueId: null,
    };
    competitions.push(comp);

    // 8 clubs → 2 groups of 4
    const groupA = clClubs.slice(0, 4);
    const groupB = clClubs.slice(4, 8);

    for (const clubId of groupA) {
      entries.push({ competitionId: compId, clubId, groupName: 'A', seed: 0 });
    }
    for (const clubId of groupB) {
      entries.push({ competitionId: compId, clubId, groupName: 'B', seed: 0 });
    }

    // Group stage: each group plays round-robin (home & away) in weeks 13-22
    for (const group of [groupA, groupB]) {
      const groupFixtures = generateRoundRobin(group, {
        competitionId: compId,
        season: input.season,
        startWeek: 13,
      });
      for (const f of groupFixtures) {
        fixtures.push({ ...f, id: fixtureId++ } as FixtureInput & { id: number });
      }
    }

    compId++;
  }

  return { competitions, fixtures, entries };
}
```

**IMPORTANT:** The `FixtureInput` from `fixture-generator.ts` doesn't have an `id` field. Add an `id` field to the fixtures returned by `generateSeasonCalendar` — extend the type locally or add `id` as optional to `FixtureInput`. Choose whichever approach keeps the code cleanest.

- [ ] **Step 4: Run tests to verify all pass**

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/competition/calendar.ts __tests__/engine/competition/calendar.test.ts && git commit -m "feat: add season calendar generator with leagues, cups, and Champions League"
```

---

### Task 4: Team Strength Calculator

**Files:**
- Create: `src/engine/simulation/team-strength.ts`
- Test: `__tests__/engine/simulation/team-strength.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/simulation/team-strength.test.ts`:

```ts
import { calculateTeamStrength, TeamStrengthInput, TeamStrength } from '@/engine/simulation/team-strength';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';

const makePlayer = (id: number, position: Position, overall: number, morale: number = 70, fitness: number = 90) => {
  const attrs: PlayerAttributes = {
    finishing: overall, passing: overall, crossing: overall, dribbling: overall,
    heading: overall, longShots: overall, freeKicks: overall,
    vision: overall, composure: overall, decisions: overall,
    positioning: overall, aggression: overall, leadership: overall,
    pace: overall, stamina: overall, strength: overall, agility: overall, jumping: overall,
  };
  return { id, position, secondaryPosition: null as Position | null, attributes: attrs, morale, fitness };
};

const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
};

describe('calculateTeamStrength', () => {
  it('returns a positive strength value', () => {
    const players = [
      makePlayer(1, 'GK', 70), makePlayer(2, 'CB', 70), makePlayer(3, 'CB', 70),
      makePlayer(4, 'LB', 70), makePlayer(5, 'RB', 70), makePlayer(6, 'CM', 70),
      makePlayer(7, 'CM', 70), makePlayer(8, 'LM', 70), makePlayer(9, 'RM', 70),
      makePlayer(10, 'ST', 70), makePlayer(11, 'ST', 70),
    ];
    const result = calculateTeamStrength({ players, tactic: defaultTactic, isHome: false });
    expect(result.overall).toBeGreaterThan(0);
    expect(result.attack).toBeGreaterThan(0);
    expect(result.midfield).toBeGreaterThan(0);
    expect(result.defense).toBeGreaterThan(0);
  });

  it('stronger squad produces higher strength', () => {
    const weak = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 50));
    const strong = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 85));
    const weakStr = calculateTeamStrength({ players: weak, tactic: defaultTactic, isHome: false });
    const strongStr = calculateTeamStrength({ players: strong, tactic: defaultTactic, isHome: false });
    expect(strongStr.overall).toBeGreaterThan(weakStr.overall);
  });

  it('home advantage adds bonus', () => {
    const players = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70));
    const home = calculateTeamStrength({ players, tactic: defaultTactic, isHome: true });
    const away = calculateTeamStrength({ players, tactic: defaultTactic, isHome: false });
    expect(home.overall).toBeGreaterThan(away.overall);
  });

  it('high morale increases strength', () => {
    const lowMorale = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70, 30, 90));
    const highMorale = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70, 90, 90));
    const low = calculateTeamStrength({ players: lowMorale, tactic: defaultTactic, isHome: false });
    const high = calculateTeamStrength({ players: highMorale, tactic: defaultTactic, isHome: false });
    expect(high.overall).toBeGreaterThan(low.overall);
  });

  it('low fitness decreases strength', () => {
    const fit = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70, 70, 100));
    const tired = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70, 70, 40));
    const fitStr = calculateTeamStrength({ players: fit, tactic: defaultTactic, isHome: false });
    const tiredStr = calculateTeamStrength({ players: tired, tactic: defaultTactic, isHome: false });
    expect(fitStr.overall).toBeGreaterThan(tiredStr.overall);
  });

  it('separates attack/midfield/defense based on positions', () => {
    const players = [
      makePlayer(1, 'GK', 70), makePlayer(2, 'CB', 90), makePlayer(3, 'CB', 90),
      makePlayer(4, 'LB', 90), makePlayer(5, 'RB', 90), makePlayer(6, 'CM', 50),
      makePlayer(7, 'CM', 50), makePlayer(8, 'LM', 50), makePlayer(9, 'RM', 50),
      makePlayer(10, 'ST', 50), makePlayer(11, 'ST', 50),
    ];
    const result = calculateTeamStrength({ players, tactic: defaultTactic, isHome: false });
    expect(result.defense).toBeGreaterThan(result.attack);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement team strength calculator**

Create `src/engine/simulation/team-strength.ts`:

```ts
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { calculateOverall } from '@/utils/overall';

export interface PlayerForStrength {
  id: number;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
  morale: number;  // 1-100
  fitness: number; // 1-100
}

export interface TeamStrengthInput {
  players: PlayerForStrength[]; // 11 starting players
  tactic: Tactic;
  isHome: boolean;
}

export interface TeamStrength {
  overall: number;
  attack: number;
  midfield: number;
  defense: number;
}

const ATTACK_POSITIONS: Position[] = ['ST', 'LW', 'RW'];
const MIDFIELD_POSITIONS: Position[] = ['CAM', 'CM', 'CDM', 'LM', 'RM'];
const DEFENSE_POSITIONS: Position[] = ['CB', 'LB', 'RB'];

const HOME_BONUS = 1.07; // 7% boost

/**
 * Calculate team strength from starting 11 + tactic.
 * Returns overall, attack, midfield, defense ratings.
 */
export function calculateTeamStrength(input: TeamStrengthInput): TeamStrength {
  const { players, tactic, isHome } = input;

  let attackSum = 0, attackCount = 0;
  let midfieldSum = 0, midfieldCount = 0;
  let defenseSum = 0, defenseCount = 0;

  for (const player of players) {
    const overall = calculateOverall(player.attributes, player.position);

    // Morale modifier: 50 is neutral, above adds up to +5%, below subtracts up to -5%
    const moraleMod = 1 + (player.morale - 50) / 1000;

    // Fitness modifier: 100 is neutral, below reduces (down to -15% at fitness 0)
    const fitnessMod = 0.85 + (player.fitness / 100) * 0.15;

    const effective = overall * moraleMod * fitnessMod;

    if (player.position === 'GK') {
      defenseSum += effective;
      defenseCount++;
    } else if (ATTACK_POSITIONS.includes(player.position)) {
      attackSum += effective;
      attackCount++;
    } else if (MIDFIELD_POSITIONS.includes(player.position)) {
      midfieldSum += effective;
      midfieldCount++;
    } else if (DEFENSE_POSITIONS.includes(player.position)) {
      defenseSum += effective;
      defenseCount++;
    }
  }

  const attack = attackCount > 0 ? attackSum / attackCount : 0;
  const midfield = midfieldCount > 0 ? midfieldSum / midfieldCount : 0;
  const defense = defenseCount > 0 ? defenseSum / defenseCount : 0;

  // Overall = weighted average (attack, midfield, defense have equal weight)
  let overall = (attack + midfield + defense) / 3;

  if (isHome) {
    overall *= HOME_BONUS;
  }

  return {
    overall,
    attack,
    midfield,
    defense,
  };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulation/ __tests__/engine/simulation/ && git commit -m "feat: add team strength calculator with morale/fitness/home modifiers"
```

---

### Task 5: Player Rating System

**Files:**
- Create: `src/engine/simulation/player-rating.ts`
- Test: `__tests__/engine/simulation/player-rating.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/simulation/player-rating.test.ts`:

```ts
import { calculatePlayerRatings, PlayerMatchInput } from '@/engine/simulation/player-rating';
import { SeededRng } from '@/engine/rng';
import { MatchEvent } from '@/types';

const makePlayerInput = (id: number, overall: number): PlayerMatchInput => ({
  id,
  overall,
  isHome: true,
});

describe('calculatePlayerRatings', () => {
  const rng = new SeededRng(42);

  it('returns a rating for every player', () => {
    const players = Array.from({ length: 11 }, (_, i) => makePlayerInput(i + 1, 70));
    const events: MatchEvent[] = [];
    const ratings = calculatePlayerRatings(players, events, true, rng);
    expect(ratings).toHaveLength(11);
    for (const r of ratings) {
      expect(r.rating).toBeGreaterThanOrEqual(4.0);
      expect(r.rating).toBeLessThanOrEqual(10.0);
    }
  });

  it('goal scorers get higher ratings', () => {
    const players = [makePlayerInput(1, 70), makePlayerInput(2, 70)];
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 30, type: 'goal', playerId: 1, secondaryPlayerId: null },
      { fixtureId: 1, minute: 60, type: 'goal', playerId: 1, secondaryPlayerId: null },
    ];
    const ratings = calculatePlayerRatings(players, events, true, rng);
    const scorer = ratings.find(r => r.playerId === 1)!;
    const nonScorer = ratings.find(r => r.playerId === 2)!;
    expect(scorer.rating).toBeGreaterThan(nonScorer.rating);
  });

  it('assist providers get a rating boost', () => {
    const players = [makePlayerInput(1, 70), makePlayerInput(2, 70)];
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 30, type: 'goal', playerId: 3, secondaryPlayerId: null },
      { fixtureId: 1, minute: 30, type: 'assist', playerId: 1, secondaryPlayerId: null },
    ];
    const ratings = calculatePlayerRatings(players, events, true, rng);
    const assister = ratings.find(r => r.playerId === 1)!;
    const nonAssister = ratings.find(r => r.playerId === 2)!;
    expect(assister.rating).toBeGreaterThan(nonAssister.rating);
  });

  it('red card reduces rating significantly', () => {
    const players = [makePlayerInput(1, 70), makePlayerInput(2, 70)];
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 30, type: 'red', playerId: 1, secondaryPlayerId: null },
    ];
    const ratings = calculatePlayerRatings(players, events, true, rng);
    const redCarded = ratings.find(r => r.playerId === 1)!;
    const clean = ratings.find(r => r.playerId === 2)!;
    expect(redCarded.rating).toBeLessThan(clean.rating);
  });

  it('higher overall leads to slightly higher base rating', () => {
    const rng1 = new SeededRng(100);
    const rng2 = new SeededRng(100);
    const weak = [makePlayerInput(1, 50)];
    const strong = [makePlayerInput(1, 90)];
    const weakRating = calculatePlayerRatings(weak, [], true, rng1)[0].rating;
    const strongRating = calculatePlayerRatings(strong, [], true, rng2)[0].rating;
    expect(strongRating).toBeGreaterThanOrEqual(weakRating);
  });

  it('winning team gets a small boost', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    const players = [makePlayerInput(1, 70)];
    const winRating = calculatePlayerRatings(players, [], true, rng1)[0].rating;
    const loseRating = calculatePlayerRatings(players, [], false, rng2)[0].rating;
    expect(winRating).toBeGreaterThanOrEqual(loseRating);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement player rating system**

Create `src/engine/simulation/player-rating.ts`:

```ts
import { MatchEvent } from '@/types';
import { SeededRng } from '@/engine/rng';

export interface PlayerMatchInput {
  id: number;
  overall: number; // pre-calculated positional overall
  isHome: boolean;
}

export interface PlayerRating {
  playerId: number;
  rating: number; // 4.0 - 10.0
}

/**
 * Calculate individual player ratings for a match.
 * Base rating comes from overall + random variance.
 * Events (goals, assists, cards) modify the rating.
 */
export function calculatePlayerRatings(
  players: PlayerMatchInput[],
  events: MatchEvent[],
  teamWon: boolean,
  rng: SeededRng,
): PlayerRating[] {
  return players.map(player => {
    // Base rating: 6.0 + scaled by overall (50 overall → 6.0, 90 overall → 7.2)
    let rating = 6.0 + (player.overall - 50) * 0.03;

    // Random variance: ±0.5
    rating += rng.nextFloat(-0.5, 0.5);

    // Event bonuses
    const playerEvents = events.filter(e => e.playerId === player.id);

    for (const event of playerEvents) {
      switch (event.type) {
        case 'goal':
          rating += 0.8;
          break;
        case 'assist':
          rating += 0.5;
          break;
        case 'penalty_scored':
          rating += 0.6;
          break;
        case 'penalty_missed':
          rating -= 0.8;
          break;
        case 'yellow':
          rating -= 0.3;
          break;
        case 'red':
          rating -= 1.5;
          break;
        case 'injury':
          rating -= 0.2;
          break;
      }
    }

    // Also check secondary player (assists are sometimes recorded with secondaryPlayerId)
    const assistEvents = events.filter(e => e.secondaryPlayerId === player.id && e.type === 'goal');
    rating += assistEvents.length * 0.5;

    // Winning team bonus
    if (teamWon) {
      rating += 0.3;
    }

    // Clamp to [4.0, 10.0], round to 1 decimal
    rating = Math.round(Math.max(4.0, Math.min(10.0, rating)) * 10) / 10;

    return { playerId: player.id, rating };
  });
}
```

- [ ] **Step 4: Run tests to verify all pass**

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulation/player-rating.ts __tests__/engine/simulation/player-rating.test.ts && git commit -m "feat: add player match rating system with event bonuses"
```

---

### Task 6: Match Simulation Engine

**Files:**
- Create: `src/engine/simulation/match-engine.ts`
- Test: `__tests__/engine/simulation/match-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/simulation/match-engine.test.ts`:

```ts
import { simulateMatch, MatchInput, MatchResult } from '@/engine/simulation/match-engine';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

const makeAttrs = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base,
  vision: base, composure: base, decisions: base,
  positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});

const makeSquad = (overall: number) => Array.from({ length: 11 }, (_, i) => ({
  id: i + 1,
  position: (['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall),
  morale: 70,
  fitness: 90,
}));

const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
};

function makeInput(homeOverall: number, awayOverall: number): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeSquad(homeOverall),
    awaySquad: makeSquad(awayOverall).map((p, i) => ({ ...p, id: i + 100 })),
    homeTactic: defaultTactic,
    awayTactic: { ...defaultTactic, id: 2, clubId: 2 },
    homeClubReputation: 80,
    awayClubReputation: 80,
    rng: new SeededRng(42),
  };
}

describe('simulateMatch', () => {
  it('returns a valid match result', () => {
    const result = simulateMatch(makeInput(70, 70));
    expect(result.homeGoals).toBeGreaterThanOrEqual(0);
    expect(result.awayGoals).toBeGreaterThanOrEqual(0);
    expect(result.events.length).toBeGreaterThanOrEqual(0);
    expect(result.homeRatings).toHaveLength(11);
    expect(result.awayRatings).toHaveLength(11);
    expect(typeof result.attendance).toBe('number');
  });

  it('is deterministic with same seed', () => {
    const input1 = makeInput(70, 70);
    const input2 = makeInput(70, 70);
    const r1 = simulateMatch(input1);
    const r2 = simulateMatch(input2);
    expect(r1.homeGoals).toBe(r2.homeGoals);
    expect(r1.awayGoals).toBe(r2.awayGoals);
  });

  it('stronger team wins more often over many simulations', () => {
    let strongWins = 0;
    let weakWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      const input = makeInput(85, 55);
      input.rng = new SeededRng(seed);
      const result = simulateMatch(input);
      if (result.homeGoals > result.awayGoals) strongWins++;
      if (result.awayGoals > result.homeGoals) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
  });

  it('events contain only valid types', () => {
    const result = simulateMatch(makeInput(75, 75));
    const validTypes = ['goal', 'assist', 'yellow', 'red', 'substitution', 'injury', 'penalty_scored', 'penalty_missed'];
    for (const event of result.events) {
      expect(validTypes).toContain(event.type);
    }
  });

  it('events have minutes in valid range (1-90)', () => {
    const result = simulateMatch(makeInput(75, 75));
    for (const event of result.events) {
      expect(event.minute).toBeGreaterThanOrEqual(1);
      expect(event.minute).toBeLessThanOrEqual(90);
    }
  });

  it('number of goals matches events', () => {
    for (let seed = 0; seed < 50; seed++) {
      const input = makeInput(70, 70);
      input.rng = new SeededRng(seed);
      const result = simulateMatch(input);
      const homeGoalEvents = result.events.filter(e =>
        e.type === 'goal' && input.homeSquad.some(p => p.id === e.playerId)
      ).length;
      const awayGoalEvents = result.events.filter(e =>
        e.type === 'goal' && input.awaySquad.some(p => p.id === e.playerId)
      ).length;
      const homePens = result.events.filter(e =>
        e.type === 'penalty_scored' && input.homeSquad.some(p => p.id === e.playerId)
      ).length;
      const awayPens = result.events.filter(e =>
        e.type === 'penalty_scored' && input.awaySquad.some(p => p.id === e.playerId)
      ).length;
      expect(homeGoalEvents + homePens).toBe(result.homeGoals);
      expect(awayGoalEvents + awayPens).toBe(result.awayGoals);
    }
  });

  it('substitutions only happen in second half (46+) or for injuries', () => {
    for (let seed = 0; seed < 100; seed++) {
      const input = makeInput(70, 70);
      input.rng = new SeededRng(seed);
      const result = simulateMatch(input);
      const subs = result.events.filter(e => e.type === 'substitution');
      for (const sub of subs) {
        // Either minute >= 46 (second half) or there was an injury for that team before
        const isSecondHalf = sub.minute >= 46;
        if (!isSecondHalf) {
          // Must be preceded by an injury event for same team
          const injuryBefore = result.events.find(e =>
            e.type === 'injury' && e.minute <= sub.minute
          );
          expect(injuryBefore).toBeDefined();
        }
      }
    }
  });

  it('produces match statistics', () => {
    const result = simulateMatch(makeInput(70, 70));
    expect(result.stats).toBeDefined();
    expect(typeof result.stats.homePossession).toBe('number');
    expect(typeof result.stats.awayPossession).toBe('number');
    expect(result.stats.homePossession + result.stats.awayPossession).toBeCloseTo(100, 0);
    expect(typeof result.stats.homeShots).toBe('number');
    expect(typeof result.stats.awayShots).toBe('number');
    expect(typeof result.stats.homeFouls).toBe('number');
    expect(typeof result.stats.awayFouls).toBe('number');
    expect(typeof result.stats.homeCorners).toBe('number');
    expect(typeof result.stats.awayCorners).toBe('number');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement match engine**

Create `src/engine/simulation/match-engine.ts`:

The match engine:
- Takes two squads (11 players each), their tactics, and a seeded RNG
- Calculates team strength for each side using `calculateTeamStrength`
- Iterates 90 minutes in blocks of ~5 minutes (18 blocks)
- In each block, calculates probability of:
  - **Goal:** Based on attacking team's attack vs defending team's defense. Stronger difference = higher chance. Base probability ~2-4% per block per team (resulting in ~2-3 goals average per match)
  - **Yellow card:** ~1% per block per team (roughly 2-3 per match)
  - **Red card:** ~0.1% per block (rare)
  - **Injury:** ~0.3% per block per team
  - **Substitution (AI):** Only in second half (minute >= 46) or after injury. Max 3 per team.
- When a goal happens, assigns it to a specific player (weighted by finishing/positioning for forwards, heading for corners, etc.)
- For each goal, 70% chance of an assist from another player
- Generates match statistics (possession, shots, fouls, corners)
- Calculates player ratings using `calculatePlayerRatings`
- Returns `MatchResult`

```ts
import { MatchEvent, MatchEventType, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { calculateTeamStrength, PlayerForStrength, TeamStrength } from './team-strength';
import { calculatePlayerRatings, PlayerRating } from './player-rating';
import { calculateOverall } from '@/utils/overall';

export interface MatchInput {
  fixtureId: number;
  homeSquad: PlayerForStrength[];
  awaySquad: PlayerForStrength[];
  homeTactic: Tactic;
  awayTactic: Tactic;
  homeClubReputation: number;
  awayClubReputation: number;
  rng: SeededRng;
}

export interface MatchStats {
  homePossession: number;
  awayPossession: number;
  homeShots: number;
  awayShots: number;
  homeFouls: number;
  awayFouls: number;
  homeCorners: number;
  awayCorners: number;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  homeRatings: PlayerRating[];
  awayRatings: PlayerRating[];
  stats: MatchStats;
  attendance: number;
}

export function simulateMatch(input: MatchInput): MatchResult {
  // ... implementation
  // See detailed algorithm described above.
  // Key: iterate 18 blocks, generate events, track subs (max 3 per team),
  // ensure substitutions only in 2nd half or after injury.
}
```

The implementation should be ~150-200 lines. Key constants:
- `GOAL_BASE_PROB = 0.025` per block per team (~2.25 goals per match average)
- `YELLOW_PROB = 0.012` per block per team
- `RED_PROB = 0.001` per block per team  
- `INJURY_PROB = 0.003` per block per team
- `SUB_PROB = 0.15` per block per team (in 2nd half only, max 3)
- Strength ratio affects goal probability: `goalProb = GOAL_BASE_PROB * (attackStrength / defenseStrength)`
- Attendance = `stadiumCapacity * occupancy` where occupancy = `0.6 + reputation/250`

When picking a goal scorer: weight outfield players by their `finishing` + `positioning` attributes. Forwards get 2x weight.
When picking an assist provider: weight by `passing` + `vision`. Cannot be the scorer.

- [ ] **Step 4: Run tests to verify all pass**

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulation/match-engine.ts __tests__/engine/simulation/match-engine.test.ts && git commit -m "feat: add match simulation engine with events, stats, and ratings"
```

---

## Summary

After completing all 6 tasks, the Engine Core is in place:

- **Fixture generator:** Round-robin (double, for leagues) and knockout (for cups/CL)
- **Standings calculator:** Points, GD, GF sorting
- **Season calendar:** Creates all competitions (5 leagues + 5 cups + Champions League) with fixtures spread across weeks 7-44
- **Team strength calculator:** Positional overall + morale + fitness + home advantage
- **Player rating system:** Base from overall, boosted by goals/assists, penalized by cards
- **Match engine:** Full simulation producing goals, events, stats, ratings. Substitutions only in 2nd half or after injury.

**Next plan:** Plan 3 (Engine Systems) — Finances, transfers, player progression, staff effects, week advancement orchestrator.
