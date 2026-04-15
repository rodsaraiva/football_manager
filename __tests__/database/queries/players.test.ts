import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getPlayersByClub,
  getPlayerById,
  searchPlayers,
  updatePlayerMorale,
  getFreeAgents,
} from '@/database/queries/players';

describe('players queries', () => {
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

  describe('getPlayersByClub', () => {
    it('returns 23-27 players for club 1', async () => {
      const players = await getPlayersByClub(db, 1);
      expect(players.length).toBeGreaterThanOrEqual(23);
      expect(players.length).toBeLessThanOrEqual(27);
    });

    it('returns players all belonging to the given club', async () => {
      const players = await getPlayersByClub(db, 1);
      for (const p of players) {
        expect(p.clubId).toBe(1);
      }
    });
  });

  describe('getPlayerById', () => {
    it('returns player with attributes for existing player', async () => {
      const result = await getPlayerById(db, 1);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(1);
      expect(result!.attributes).toBeDefined();
      expect(typeof result!.attributes.finishing).toBe('number');
      expect(typeof result!.attributes.pace).toBe('number');
    });

    it('returns null for non-existent player', async () => {
      const result = await getPlayerById(db, 999999);
      expect(result).toBeNull();
    });
  });

  describe('searchPlayers', () => {
    it('filters by position', async () => {
      const players = await searchPlayers(db, { position: 'GK' });
      expect(players.length).toBeGreaterThan(0);
      for (const p of players) {
        expect(p.position).toBe('GK');
      }
    });

    it('filters by age range', async () => {
      const players = await searchPlayers(db, { minAge: 20, maxAge: 25 });
      expect(players.length).toBeGreaterThan(0);
      for (const p of players) {
        expect(p.age).toBeGreaterThanOrEqual(20);
        expect(p.age).toBeLessThanOrEqual(25);
      }
    });

    it('returns empty array when no players match', async () => {
      const players = await searchPlayers(db, { minAge: 100 });
      expect(players).toEqual([]);
    });
  });

  describe('updatePlayerMorale', () => {
    it('changes morale of a player', async () => {
      const before = await getPlayerById(db, 1);
      expect(before).not.toBeNull();

      const newMorale = before!.morale === 50 ? 60 : 50;
      await updatePlayerMorale(db, 1, newMorale);

      const after = await getPlayerById(db, 1);
      expect(after!.morale).toBe(newMorale);
    });
  });

  describe('getFreeAgents', () => {
    it('returns only players with isFreeAgent = true', async () => {
      // Insert a free agent for testing (using raw db for direct inserts)
      rawDb.prepare(
        `INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage,
          contract_end, market_value, base_potential, effective_potential, morale, fitness,
          injury_weeks_left, is_free_agent)
         VALUES (99999, 'Free Agent Player', 'English', 28, 'ST', NULL, NULL, 5000, 2026, 500000, 70, 70, 80, 90, 0, 1)`,
      ).run();
      rawDb.prepare(
        `INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading,
          long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
          pace, stamina, strength, agility, jumping)
         VALUES (99999, 70, 60, 55, 65, 60, 58, 45, 62, 70, 68, 72, 55, 50, 75, 70, 68, 72, 65)`,
      ).run();

      const freeAgents = await getFreeAgents(db);
      expect(freeAgents.length).toBeGreaterThan(0);
      for (const p of freeAgents) {
        expect(p.isFreeAgent).toBe(true);
      }

      // Cleanup
      rawDb.prepare('DELETE FROM player_attributes WHERE player_id = 99999').run();
      rawDb.prepare('DELETE FROM players WHERE id = 99999').run();
    });
  });
});
