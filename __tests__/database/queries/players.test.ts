import Database from 'better-sqlite3';
import { createTestDb, seedTestDb } from '../test-helpers';
import {
  getPlayersByClub,
  getPlayerById,
  searchPlayers,
  updatePlayerMorale,
  getFreeAgents,
} from '@/database/queries/players';

describe('players queries', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
    seedTestDb(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('getPlayersByClub', () => {
    it('returns 23-27 players for club 1', () => {
      const players = getPlayersByClub(db, 1);
      expect(players.length).toBeGreaterThanOrEqual(23);
      expect(players.length).toBeLessThanOrEqual(27);
    });

    it('returns players all belonging to the given club', () => {
      const players = getPlayersByClub(db, 1);
      for (const p of players) {
        expect(p.clubId).toBe(1);
      }
    });
  });

  describe('getPlayerById', () => {
    it('returns player with attributes for existing player', () => {
      const result = getPlayerById(db, 1);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(1);
      expect(result!.attributes).toBeDefined();
      expect(typeof result!.attributes.finishing).toBe('number');
      expect(typeof result!.attributes.pace).toBe('number');
    });

    it('returns null for non-existent player', () => {
      const result = getPlayerById(db, 999999);
      expect(result).toBeNull();
    });
  });

  describe('searchPlayers', () => {
    it('filters by position', () => {
      const players = searchPlayers(db, { position: 'GK' });
      expect(players.length).toBeGreaterThan(0);
      for (const p of players) {
        expect(p.position).toBe('GK');
      }
    });

    it('filters by age range', () => {
      const players = searchPlayers(db, { minAge: 20, maxAge: 25 });
      expect(players.length).toBeGreaterThan(0);
      for (const p of players) {
        expect(p.age).toBeGreaterThanOrEqual(20);
        expect(p.age).toBeLessThanOrEqual(25);
      }
    });

    it('returns empty array when no players match', () => {
      const players = searchPlayers(db, { minAge: 100 });
      expect(players).toEqual([]);
    });
  });

  describe('updatePlayerMorale', () => {
    it('changes morale of a player', () => {
      const before = getPlayerById(db, 1);
      expect(before).not.toBeNull();

      const newMorale = before!.morale === 50 ? 60 : 50;
      updatePlayerMorale(db, 1, newMorale);

      const after = getPlayerById(db, 1);
      expect(after!.morale).toBe(newMorale);
    });
  });

  describe('getFreeAgents', () => {
    it('returns only players with isFreeAgent = true', () => {
      // Insert a free agent for testing
      db.prepare(
        `INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage,
          contract_end, market_value, base_potential, effective_potential, morale, fitness,
          injury_weeks_left, is_free_agent)
         VALUES (99999, 'Free Agent Player', 'English', 28, 'ST', NULL, NULL, 5000, 2026, 500000, 70, 70, 80, 90, 0, 1)`,
      ).run();
      db.prepare(
        `INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading,
          long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
          pace, stamina, strength, agility, jumping)
         VALUES (99999, 70, 60, 55, 65, 60, 58, 45, 62, 70, 68, 72, 55, 50, 75, 70, 68, 72, 65)`,
      ).run();

      const freeAgents = getFreeAgents(db);
      expect(freeAgents.length).toBeGreaterThan(0);
      for (const p of freeAgents) {
        expect(p.isFreeAgent).toBe(true);
      }

      // Cleanup
      db.prepare('DELETE FROM player_attributes WHERE player_id = 99999').run();
      db.prepare('DELETE FROM players WHERE id = 99999').run();
    });
  });
});
