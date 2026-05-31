import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getClubById, getClubsByLeague, getAllClubs, updateClubBudget, getClubsByCountry } from '@/database/queries/clubs';

describe('clubs queries', () => {
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

  describe('getClubsByLeague', () => {
    it('returns 20 clubs for league 1', async () => {
      const clubs = await getClubsByLeague(db, 1);
      expect(clubs).toHaveLength(20);
    });

    it('returns clubs all belonging to the given league', async () => {
      const clubs = await getClubsByLeague(db, 1);
      for (const c of clubs) {
        expect(c.leagueId).toBe(1);
      }
    });
  });

  describe('getClubById', () => {
    it('returns the correct club', async () => {
      const club = await getClubById(db, 1);
      expect(club).not.toBeNull();
      expect(club!.id).toBe(1);
      expect(typeof club!.name).toBe('string');
      expect(club!.name.length).toBeGreaterThan(0);
    });

    it('returns null for non-existent club', async () => {
      const club = await getClubById(db, 999999);
      expect(club).toBeNull();
    });
  });

  describe('getAllClubs', () => {
    it('returns 330 clubs', async () => {
      const clubs = await getAllClubs(db);
      expect(clubs).toHaveLength(330);
    });

    it('returns Club objects with all expected fields', async () => {
      const clubs = await getAllClubs(db);
      const first = clubs[0];
      expect(typeof first.id).toBe('number');
      expect(typeof first.name).toBe('string');
      expect(typeof first.shortName).toBe('string');
      expect(typeof first.budget).toBe('number');
      expect(typeof first.reputation).toBe('number');
    });
  });

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

  describe('updateClubBudget', () => {
    it('changes the budget of a club', async () => {
      const before = await getClubById(db, 1);
      expect(before).not.toBeNull();

      const newBudget = 123456789;
      await updateClubBudget(db, 1, newBudget);

      const after = await getClubById(db, 1);
      expect(after!.budget).toBe(newBudget);
    });
  });
});
