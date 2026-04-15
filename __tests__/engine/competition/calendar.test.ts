import { generateSeasonCalendar, ensureSeasonFixtures, SeasonCalendar } from '@/engine/competition/calendar';
import { League } from '@/types';
import { createTestDb, createTestDbHandle, seedTestDb } from '../../database/test-helpers';

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
    expect(leagueFixtures).toHaveLength(380);
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
      expect(f.week).toBeGreaterThanOrEqual(7);
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

describe('ensureSeasonFixtures', () => {
  it('generates fixtures for season 1 when none exist', async () => {
    const rawDb = createTestDb();
    seedTestDb(rawDb);
    const db = createTestDbHandle(rawDb);

    const result = await ensureSeasonFixtures(db, 1);
    expect(result).toBe(true);

    const { cnt } = rawDb.prepare('SELECT COUNT(*) as cnt FROM fixtures WHERE season = 1').get() as { cnt: number };
    expect(cnt).toBeGreaterThan(100);
  });

  it('returns false when fixtures already exist', async () => {
    const rawDb = createTestDb();
    seedTestDb(rawDb);
    const db = createTestDbHandle(rawDb);

    await ensureSeasonFixtures(db, 1);
    const result = await ensureSeasonFixtures(db, 1);
    expect(result).toBe(false);
  });

  it('generates season 2 fixtures without UNIQUE constraint error when season 1 exists', async () => {
    const rawDb = createTestDb();
    seedTestDb(rawDb);
    const db = createTestDbHandle(rawDb);

    // Generate season 1
    await ensureSeasonFixtures(db, 1);

    // Generate season 2 — must not throw and must use offset IDs
    const result = await ensureSeasonFixtures(db, 2);
    expect(result).toBe(true);

    const { cnt } = rawDb.prepare('SELECT COUNT(*) as cnt FROM fixtures WHERE season = 2').get() as { cnt: number };
    expect(cnt).toBeGreaterThan(100);

    // Fixture IDs for season 2 should be offset and not collide with season 1
    const minId2 = (rawDb.prepare('SELECT MIN(id) as m FROM fixtures WHERE season = 2').get() as { m: number }).m;
    const maxId1 = (rawDb.prepare('SELECT MAX(id) as m FROM fixtures WHERE season = 1').get() as { m: number }).m;
    expect(minId2).toBeGreaterThan(maxId1);
  });
});
