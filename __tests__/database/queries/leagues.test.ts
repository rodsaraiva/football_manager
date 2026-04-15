import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getAllCountries,
  getAllLeagues,
  getLeagueById,
  createCompetition,
  getCompetitionsBySeason,
} from '@/database/queries/leagues';

describe('leagues queries', () => {
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

  describe('getAllCountries', () => {
    it('returns 5 countries', async () => {
      const countries = await getAllCountries(db);
      expect(countries).toHaveLength(5);
    });

    it('returns Country objects with expected fields', async () => {
      const countries = await getAllCountries(db);
      for (const c of countries) {
        expect(typeof c.id).toBe('number');
        expect(typeof c.name).toBe('string');
        expect(typeof c.code).toBe('string');
        expect(typeof c.continent).toBe('string');
      }
    });
  });

  describe('getAllLeagues', () => {
    it('returns 17 leagues', async () => {
      const leagues = await getAllLeagues(db);
      expect(leagues).toHaveLength(17);
    });

    it('returns League objects with expected fields', async () => {
      const leagues = await getAllLeagues(db);
      for (const l of leagues) {
        expect(typeof l.id).toBe('number');
        expect(typeof l.name).toBe('string');
        expect(typeof l.countryId).toBe('number');
        expect(typeof l.divisionLevel).toBe('number');
      }
    });
  });

  describe('getLeagueById', () => {
    it('returns the correct league', async () => {
      const league = await getLeagueById(db, 1);
      expect(league).not.toBeNull();
      expect(league!.id).toBe(1);
      expect(typeof league!.name).toBe('string');
    });

    it('returns null for non-existent league', async () => {
      const league = await getLeagueById(db, 999999);
      expect(league).toBeNull();
    });
  });

  describe('createCompetition and getCompetitionsBySeason', () => {
    it('creates a competition and retrieves it by season', async () => {
      await createCompetition(db, {
        id: 9001,
        name: 'Test Cup',
        type: 'cup',
        format: 'knockout',
        season: 9999,
        leagueId: null,
      });

      const comps = await getCompetitionsBySeason(db, 9999);
      expect(comps).toHaveLength(1);
      expect(comps[0].id).toBe(9001);
      expect(comps[0].name).toBe('Test Cup');
      expect(comps[0].type).toBe('cup');
      expect(comps[0].format).toBe('knockout');
      expect(comps[0].season).toBe(9999);
      expect(comps[0].leagueId).toBeNull();
    });

    it('returns empty array for season with no competitions', async () => {
      const comps = await getCompetitionsBySeason(db, 0);
      expect(comps).toEqual([]);
    });
  });
});
