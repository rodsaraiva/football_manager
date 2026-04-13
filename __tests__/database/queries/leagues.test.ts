import Database from 'better-sqlite3';
import { createTestDb, seedTestDb } from '../test-helpers';
import {
  getAllCountries,
  getAllLeagues,
  getLeagueById,
  createCompetition,
  getCompetitionsBySeason,
} from '@/database/queries/leagues';

describe('leagues queries', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
    seedTestDb(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('getAllCountries', () => {
    it('returns 5 countries', () => {
      const countries = getAllCountries(db);
      expect(countries).toHaveLength(5);
    });

    it('returns Country objects with expected fields', () => {
      const countries = getAllCountries(db);
      for (const c of countries) {
        expect(typeof c.id).toBe('number');
        expect(typeof c.name).toBe('string');
        expect(typeof c.code).toBe('string');
        expect(typeof c.continent).toBe('string');
      }
    });
  });

  describe('getAllLeagues', () => {
    it('returns 5 leagues', () => {
      const leagues = getAllLeagues(db);
      expect(leagues).toHaveLength(5);
    });

    it('returns League objects with expected fields', () => {
      const leagues = getAllLeagues(db);
      for (const l of leagues) {
        expect(typeof l.id).toBe('number');
        expect(typeof l.name).toBe('string');
        expect(typeof l.countryId).toBe('number');
        expect(typeof l.divisionLevel).toBe('number');
      }
    });
  });

  describe('getLeagueById', () => {
    it('returns the correct league', () => {
      const league = getLeagueById(db, 1);
      expect(league).not.toBeNull();
      expect(league!.id).toBe(1);
      expect(typeof league!.name).toBe('string');
    });

    it('returns null for non-existent league', () => {
      const league = getLeagueById(db, 999999);
      expect(league).toBeNull();
    });
  });

  describe('createCompetition and getCompetitionsBySeason', () => {
    it('creates a competition and retrieves it by season', () => {
      createCompetition(db, {
        id: 9001,
        name: 'Test Cup',
        type: 'cup',
        format: 'knockout',
        season: 9999,
        leagueId: null,
      });

      const comps = getCompetitionsBySeason(db, 9999);
      expect(comps).toHaveLength(1);
      expect(comps[0].id).toBe(9001);
      expect(comps[0].name).toBe('Test Cup');
      expect(comps[0].type).toBe('cup');
      expect(comps[0].format).toBe('knockout');
      expect(comps[0].season).toBe(9999);
      expect(comps[0].leagueId).toBeNull();
    });

    it('returns empty array for season with no competitions', () => {
      const comps = getCompetitionsBySeason(db, 0);
      expect(comps).toEqual([]);
    });
  });
});
