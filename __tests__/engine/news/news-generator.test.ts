import {
  generateHeadlines,
  generateHighScoringMatches,
  generateComeback,
  generateLeagueStories,
  generateRelevantTransfers,
  generateMatchStar,
  generateStreaks,
  generateSeasonRecap,
  sortNews,
} from '@/engine/news/news-generator';
import { Club, Fixture, MatchEvent, Transfer, League } from '@/types';
import { calculateStandings } from '@/engine/competition/standings';
import type { SeasonCompetitionSummary } from '@/database/queries/history';

function mkClub(id: number, name?: string): Club {
  return {
    id,
    name: name ?? `Club ${id}`,
    shortName: `C${id}`,
    countryId: 1,
    leagueId: 1,
    reputation: 50,
    budget: 10_000_000,
    wageBudget: 500_000,
    stadiumName: 'Stadium',
    stadiumCapacity: 30000,
    trainingFacilities: 3,
    youthAcademy: 3,
    medicalDepartment: 3,
    primaryColor: '#000',
    secondaryColor: '#fff',
    trainingFocus: 'balanced',
  };
}

function mkFixture(
  id: number,
  week: number,
  homeId: number,
  awayId: number,
  hg: number,
  ag: number,
): Fixture {
  return {
    id,
    competitionId: 1,
    season: 1,
    week,
    round: null,
    homeClubId: homeId,
    awayClubId: awayId,
    homeGoals: hg,
    awayGoals: ag,
    played: true,
    attendance: 25000,
  };
}

const clubMap = (() => {
  const m = new Map<number, Club>();
  for (let i = 1; i <= 6; i++) m.set(i, mkClub(i));
  return m;
})();

const clubIds = [1, 2, 3, 4, 5, 6];

describe('news-generator', () => {
  describe('generateHeadlines', () => {
    it('returns empty for no fixtures', () => {
      const items = generateHeadlines({
        allPlayedFixtures: [],
        clubIds,
        currentWeek: 0,
        clubMap,
        playerClubId: 1,
      });
      expect(items).toHaveLength(0);
    });

    it('detects leader streak when same club leads multiple weeks', () => {
      // Club 1 wins every match across 3 weeks
      const fixtures: Fixture[] = [
        mkFixture(1, 1, 1, 2, 3, 0),
        mkFixture(2, 2, 1, 3, 2, 0),
        mkFixture(3, 3, 1, 4, 4, 1),
      ];
      const items = generateHeadlines({
        allPlayedFixtures: fixtures,
        clubIds,
        currentWeek: 3,
        clubMap,
        playerClubId: 2,
      });
      const leaderItem = items.find((i) => i.id === 'headline-leader-streak');
      expect(leaderItem).toBeDefined();
      expect(leaderItem!.body).toContain('3 consecutive');
    });

    it('flags big movers between weeks', () => {
      // Week 1: club 2 loses (0-3). Week 2: club 2 wins big (5-0).
      const fixtures: Fixture[] = [
        mkFixture(1, 1, 1, 2, 3, 0),
        mkFixture(2, 1, 3, 4, 1, 0),
        mkFixture(3, 1, 5, 6, 2, 1),
        mkFixture(4, 2, 2, 5, 5, 0),
        mkFixture(5, 2, 1, 3, 0, 3),
        mkFixture(6, 2, 4, 6, 0, 0),
      ];
      const items = generateHeadlines({
        allPlayedFixtures: fixtures,
        clubIds,
        currentWeek: 2,
        clubMap,
        playerClubId: 1,
      });
      const mover = items.find((i) => i.id.startsWith('headline-mover-'));
      expect(mover).toBeDefined();
    });
  });

  describe('generateHighScoringMatches', () => {
    it('returns matches with 4+ goals', () => {
      const fixtures: Fixture[] = [
        mkFixture(1, 1, 1, 2, 2, 1), // 3 goals - ignored
        mkFixture(2, 1, 3, 4, 4, 2), // 6 goals
        mkFixture(3, 1, 5, 6, 3, 2), // 5 goals
      ];
      const items = generateHighScoringMatches(fixtures, clubMap, 1);
      expect(items).toHaveLength(2);
      // Sorted by goals desc
      expect(items[0].title).toContain('4 - 2');
      expect(items[1].title).toContain('3 - 2');
    });

    it('flags user match explicitly', () => {
      const fixtures: Fixture[] = [mkFixture(1, 1, 1, 2, 3, 3)];
      const items = generateHighScoringMatches(fixtures, clubMap, 1);
      expect(items[0].body).toContain('your match');
    });
  });

  describe('generateComeback', () => {
    it('detects away comeback from 2 down', () => {
      const fixture = mkFixture(1, 1, 10, 20, 2, 3);
      // Home scores first 2, then away scores 3
      const events: MatchEvent[] = [
        { fixtureId: 1, minute: 10, type: 'goal', playerId: 100, secondaryPlayerId: null },
        { fixtureId: 1, minute: 25, type: 'goal', playerId: 101, secondaryPlayerId: null },
        { fixtureId: 1, minute: 50, type: 'goal', playerId: 200, secondaryPlayerId: null },
        { fixtureId: 1, minute: 70, type: 'goal', playerId: 201, secondaryPlayerId: null },
        { fixtureId: 1, minute: 88, type: 'goal', playerId: 202, secondaryPlayerId: null },
      ];
      const playerToClub = new Map<number, number>([
        [100, 10], [101, 10],
        [200, 20], [201, 20], [202, 20],
      ]);
      const localClubMap = new Map<number, Club>([
        [10, mkClub(10, 'Home')],
        [20, mkClub(20, 'Away')],
      ]);
      const item = generateComeback({ fixture, events, playerToClub, clubMap: localClubMap });
      expect(item).not.toBeNull();
      expect(item!.title).toContain('comeback');
    });

    it('returns null for regular match', () => {
      const fixture = mkFixture(1, 1, 10, 20, 2, 0);
      const events: MatchEvent[] = [
        { fixtureId: 1, minute: 20, type: 'goal', playerId: 100, secondaryPlayerId: null },
        { fixtureId: 1, minute: 60, type: 'goal', playerId: 101, secondaryPlayerId: null },
      ];
      const playerToClub = new Map<number, number>([[100, 10], [101, 10]]);
      const localClubMap = new Map<number, Club>([[10, mkClub(10)], [20, mkClub(20)]]);
      const item = generateComeback({ fixture, events, playerToClub, clubMap: localClubMap });
      expect(item).toBeNull();
    });
  });

  describe('generateLeagueStories', () => {
    const league: League = {
      id: 1,
      name: 'Top League',
      countryId: 1,
      divisionLevel: 1,
      numTeams: 6,
      promotionSpots: 0,
      relegationSpots: 2,
    };

    it('detects title race when gap is <= 3', () => {
      const fixtures: Fixture[] = [
        // Enough matches to pass 40% threshold (e.g., 20 weeks / 46)
        mkFixture(1, 20, 1, 2, 1, 0),
        mkFixture(2, 20, 3, 4, 1, 0),
      ];
      const standings = calculateStandings(fixtures, clubIds);
      // Top two have same points? Force gap via manual standings
      standings[0].points = 30;
      standings[1].points = 28;
      const items = generateLeagueStories({
        standings,
        clubMap,
        league,
        playerClubId: 1,
        weeksPlayed: 20,
        totalWeeks: 46,
      });
      expect(items.some((i) => i.id === 'league-title-race')).toBe(true);
    });

    it('warns when player club is in relegation zone', () => {
      const fixtures: Fixture[] = [
        mkFixture(1, 1, 1, 5, 3, 0),
        mkFixture(2, 1, 2, 6, 3, 0),
        mkFixture(3, 1, 3, 4, 3, 0),
      ];
      const standings = calculateStandings(fixtures, clubIds);
      // Player's club is last - in zone (2 relegation spots means last 2)
      const playerClubId = standings[standings.length - 1].clubId;
      const items = generateLeagueStories({
        standings,
        clubMap,
        league,
        playerClubId,
        weeksPlayed: 1,
        totalWeeks: 46,
      });
      expect(items.some((i) => i.id === 'league-player-relegation')).toBe(true);
    });

    it('reports best attack and best defense', () => {
      const fixtures: Fixture[] = [mkFixture(1, 1, 1, 2, 5, 0)];
      const standings = calculateStandings(fixtures, clubIds);
      const items = generateLeagueStories({
        standings,
        clubMap,
        league,
        playerClubId: 1,
        weeksPlayed: 1,
        totalWeeks: 46,
      });
      expect(items.some((i) => i.id === 'league-best-attack')).toBe(true);
      expect(items.some((i) => i.id === 'league-best-defense')).toBe(true);
    });
  });

  describe('generateRelevantTransfers', () => {
    it('filters transfers below threshold', () => {
      const names = new Map<number, string>([[1, 'Player A'], [2, 'Player B']]);
      const transfers: Transfer[] = [
        { id: 1, playerId: 1, season: 1, fromClubId: 1, toClubId: 2, fee: 1_000_000, wageOffered: 50_000, type: 'transfer', loanEnd: null },
        { id: 2, playerId: 2, season: 1, fromClubId: 2, toClubId: 3, fee: 20_000_000, wageOffered: 100_000, type: 'transfer', loanEnd: null },
      ];
      const items = generateRelevantTransfers(transfers, names, clubMap);
      expect(items).toHaveLength(1);
      expect(items[0].title).toContain('Player B');
    });
  });

  describe('generateMatchStar', () => {
    it('picks player with most goals + assists', () => {
      const fixture = mkFixture(1, 1, 10, 20, 3, 1);
      const events: MatchEvent[] = [
        { fixtureId: 1, minute: 10, type: 'goal', playerId: 100, secondaryPlayerId: null },
        { fixtureId: 1, minute: 25, type: 'goal', playerId: 100, secondaryPlayerId: null },
        { fixtureId: 1, minute: 50, type: 'goal', playerId: 100, secondaryPlayerId: null }, // hat-trick
        { fixtureId: 1, minute: 70, type: 'goal', playerId: 200, secondaryPlayerId: null },
      ];
      const playerNames = new Map([[100, 'Striker'], [200, 'Other']]);
      const playerToClub = new Map([[100, 10], [200, 20]]);
      const localClubMap = new Map<number, Club>([[10, mkClub(10)], [20, mkClub(20)]]);
      const item = generateMatchStar({ fixture, events, playerNames, playerToClub, clubMap: localClubMap });
      expect(item).not.toBeNull();
      expect(item!.title).toContain('Striker');
      expect(item!.title.toLowerCase()).toContain('hat-trick');
    });

    it('returns null if no goal events', () => {
      const fixture = mkFixture(1, 1, 10, 20, 0, 0);
      const events: MatchEvent[] = [
        { fixtureId: 1, minute: 30, type: 'yellow', playerId: 100, secondaryPlayerId: null },
      ];
      const item = generateMatchStar({
        fixture,
        events,
        playerNames: new Map(),
        playerToClub: new Map(),
        clubMap: new Map(),
      });
      expect(item).toBeNull();
    });
  });

  describe('generateStreaks', () => {
    it('detects win streak', () => {
      const fixtures: Fixture[] = [
        mkFixture(1, 1, 1, 2, 2, 0), // W
        mkFixture(2, 2, 3, 1, 0, 1), // W
        mkFixture(3, 3, 1, 4, 3, 1), // W
      ];
      const items = generateStreaks({ playerClubId: 1, playerFixtures: fixtures });
      expect(items.some((i) => i.id === 'streak-wins')).toBe(true);
    });

    it('detects losing streak', () => {
      const fixtures: Fixture[] = [
        mkFixture(1, 1, 1, 2, 0, 2), // L
        mkFixture(2, 2, 3, 1, 3, 1), // L
        mkFixture(3, 3, 1, 4, 1, 2), // L
      ];
      const items = generateStreaks({ playerClubId: 1, playerFixtures: fixtures });
      expect(items.some((i) => i.id === 'streak-losses')).toBe(true);
    });

    it('detects unbeaten run (mixes of W and D)', () => {
      const fixtures: Fixture[] = [
        mkFixture(1, 1, 1, 2, 1, 0), // W
        mkFixture(2, 2, 1, 3, 1, 1), // D
        mkFixture(3, 3, 1, 4, 2, 1), // W
        mkFixture(4, 4, 1, 5, 0, 0), // D
        mkFixture(5, 5, 1, 6, 1, 0), // W
      ];
      const items = generateStreaks({ playerClubId: 1, playerFixtures: fixtures });
      expect(items.some((i) => i.id === 'streak-unbeaten')).toBe(true);
    });

    it('detects clean sheet run', () => {
      const fixtures: Fixture[] = [
        mkFixture(1, 1, 1, 2, 1, 0),
        mkFixture(2, 2, 3, 1, 0, 2),
        mkFixture(3, 3, 1, 4, 0, 0),
      ];
      const items = generateStreaks({ playerClubId: 1, playerFixtures: fixtures });
      expect(items.some((i) => i.id === 'streak-clean-sheets')).toBe(true);
    });
  });

  describe('sortNews', () => {
    it('sorts by priority desc', () => {
      const items = [
        { id: 'a', icon: '', title: '', body: '', category: 'info' as const, priority: 10 },
        { id: 'b', icon: '', title: '', body: '', category: 'info' as const, priority: 50 },
        { id: 'c', icon: '', title: '', body: '', category: 'info' as const, priority: 30 },
      ];
      const sorted = sortNews(items);
      expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
    });
  });
});

describe('generateSeasonRecap', () => {
  const recapClubMap = new Map<number, Club>([
    [1, { id: 1, name: 'Manchester United', shortName: 'MUN', leagueId: 1, countryId: 1, reputation: 80, budget: 100_000_000, wageBudget: 5_000_000, stadiumName: 'Old Trafford', stadiumCapacity: 75000, trainingFacilities: 5, youthAcademy: 5, medicalDepartment: 5, primaryColor: '#ff0000', secondaryColor: '#ffffff' } as Club],
    [2, { id: 2, name: 'Arsenal', shortName: 'ARS', leagueId: 1, countryId: 1, reputation: 75, budget: 80_000_000, wageBudget: 4_000_000, stadiumName: 'Emirates', stadiumCapacity: 60000, trainingFacilities: 4, youthAcademy: 4, medicalDepartment: 4, primaryColor: '#ef0107', secondaryColor: '#ffffff' } as Club],
    [10, { id: 10, name: 'Southampton', shortName: 'SOU', leagueId: 1, countryId: 1, reputation: 50, budget: 20_000_000, wageBudget: 1_000_000, stadiumName: 'St Marys', stadiumCapacity: 32000, trainingFacilities: 3, youthAcademy: 3, medicalDepartment: 3, primaryColor: '#d71920', secondaryColor: '#ffffff' } as Club],
    [11, { id: 11, name: 'Leicester', shortName: 'LEI', leagueId: 1, countryId: 1, reputation: 50, budget: 20_000_000, wageBudget: 1_000_000, stadiumName: 'King Power', stadiumCapacity: 32000, trainingFacilities: 3, youthAcademy: 3, medicalDepartment: 3, primaryColor: '#003090', secondaryColor: '#ffffff' } as Club],
  ]);

  const makeSummary = (overrides: Partial<SeasonCompetitionSummary> = {}): SeasonCompetitionSummary => ({
    season: 1,
    competitionId: 1,
    competitionName: 'Premier League',
    championClubId: 1,
    runnerUpClubId: 2,
    relegated: [{ clubId: 10, finalPosition: 19 }, { clubId: 11, finalPosition: 20 }],
    topScorers: [{ season: 1, competitionId: 1, awardType: 'top_scorer', rank: 1, playerId: 100, clubId: 1, value: 25 }],
    topAssisters: [],
    mvp: { season: 1, competitionId: 1, awardType: 'mvp', rank: 1, playerId: 101, clubId: 1, value: 8.4 },
    breakthrough: { season: 1, competitionId: 1, awardType: 'breakthrough', rank: 1, playerId: 102, clubId: 2, value: 7.9 },
    ...overrides,
  });

  it('returns empty when summary is empty', () => {
    const items = generateSeasonRecap({
      previousSeason: 1,
      summary: [],
      clubMap: recapClubMap,
      playerClubId: 1,
      playerLeagueId: 1,
    });
    expect(items).toEqual([]);
  });

  it('emits a personal champion headline when player club won', () => {
    const items = generateSeasonRecap({
      previousSeason: 1,
      summary: [makeSummary()],
      clubMap: recapClubMap,
      playerClubId: 1,
      playerLeagueId: 1,
    });
    const personal = items.find((i) => i.id.startsWith('recap-you-champion-'));
    expect(personal).toBeDefined();
    expect(personal!.priority).toBe(100);
  });

  it('emits a generic champion card when player is not the champion', () => {
    const items = generateSeasonRecap({
      previousSeason: 1,
      summary: [makeSummary()],
      clubMap: recapClubMap,
      playerClubId: 99, // not involved
      playerLeagueId: 1,
    });
    const generic = items.find((i) => i.id === 'recap-champion-1-1');
    expect(generic).toBeDefined();
    expect(generic!.title).toContain('Manchester United');
  });

  it('emits a runner-up personal headline when player club was runner-up', () => {
    const items = generateSeasonRecap({
      previousSeason: 1,
      summary: [makeSummary()],
      clubMap: recapClubMap,
      playerClubId: 2,
      playerLeagueId: 1,
    });
    const personal = items.find((i) => i.id.startsWith('recap-you-runnerup-'));
    expect(personal).toBeDefined();
  });

  it('emits a relegated personal headline when player club was relegated', () => {
    const items = generateSeasonRecap({
      previousSeason: 1,
      summary: [makeSummary()],
      clubMap: recapClubMap,
      playerClubId: 10,
      playerLeagueId: 1,
    });
    const personal = items.find((i) => i.id.startsWith('recap-you-relegated-'));
    expect(personal).toBeDefined();
    expect(personal!.priority).toBeGreaterThanOrEqual(99);
  });

  it('emits a relegation summary when any clubs were relegated', () => {
    const items = generateSeasonRecap({
      previousSeason: 1,
      summary: [makeSummary()],
      clubMap: recapClubMap,
      playerClubId: 1,
      playerLeagueId: 1,
    });
    const rel = items.find((i) => i.id === 'recap-relegated-1-1');
    expect(rel).toBeDefined();
    expect(rel!.body).toContain('SOU');
    expect(rel!.body).toContain('LEI');
  });

  it('emits top scorer, MVP, and breakthrough award cards', () => {
    const items = generateSeasonRecap({
      previousSeason: 1,
      summary: [makeSummary()],
      clubMap: recapClubMap,
      playerClubId: 1,
      playerLeagueId: 1,
    });
    expect(items.find((i) => i.id === 'recap-topscorer-1-1')).toBeDefined();
    expect(items.find((i) => i.id === 'recap-mvp-1-1')).toBeDefined();
    expect(items.find((i) => i.id === 'recap-breakthrough-1-1')).toBeDefined();
  });

  it('skips award cards when the summary has none', () => {
    const items = generateSeasonRecap({
      previousSeason: 1,
      summary: [makeSummary({ topScorers: [], mvp: null, breakthrough: null })],
      clubMap: recapClubMap,
      playerClubId: 1,
      playerLeagueId: 1,
    });
    expect(items.find((i) => i.id.startsWith('recap-topscorer-'))).toBeUndefined();
    expect(items.find((i) => i.id.startsWith('recap-mvp-'))).toBeUndefined();
    expect(items.find((i) => i.id.startsWith('recap-breakthrough-'))).toBeUndefined();
  });
});
