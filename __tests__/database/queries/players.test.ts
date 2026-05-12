import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getPlayersByClub,
  getPlayerById,
  searchPlayers,
  updatePlayerMorale,
  getFreeAgents,
  getPlayersAboutToRetire,
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

  describe('retirement fields in rowToPlayer', () => {
    it('maps consecutiveLowMoraleWeeks from DB row', async () => {
      rawDb.prepare(
        `INSERT INTO players (id, name, nationality, age, position, club_id, wage,
          contract_end, market_value, base_potential, effective_potential, morale, fitness,
          injury_weeks_left, is_free_agent, consecutive_low_morale_weeks, will_retire_at_season_end)
         VALUES (88881, 'Veteran A', 'English', 35, 'CM', 1, 5000, 2026, 500000, 65, 65, 40, 90, 0, 0, 3, 0)`,
      ).run();
      rawDb.prepare(
        `INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading,
          long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
          pace, stamina, strength, agility, jumping)
         VALUES (88881, 60,60,55,60,60,55,45,60,65,65,65,55,50,70,65,65,70,60)`,
      ).run();

      const p = await getPlayerById(db, 88881);
      expect(p).not.toBeNull();
      expect(p!.consecutiveLowMoraleWeeks).toBe(3);
      expect(p!.willRetireAtSeasonEnd).toBe(false);

      rawDb.prepare('DELETE FROM player_attributes WHERE player_id = 88881').run();
      rawDb.prepare('DELETE FROM players WHERE id = 88881').run();
    });

    it('maps willRetireAtSeasonEnd = true when flag is 1', async () => {
      rawDb.prepare(
        `INSERT INTO players (id, name, nationality, age, position, club_id, wage,
          contract_end, market_value, base_potential, effective_potential, morale, fitness,
          injury_weeks_left, is_free_agent, consecutive_low_morale_weeks, will_retire_at_season_end)
         VALUES (88882, 'Veteran B', 'English', 37, 'ST', 1, 5000, 2026, 500000, 65, 65, 30, 90, 0, 0, 5, 1)`,
      ).run();
      rawDb.prepare(
        `INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading,
          long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
          pace, stamina, strength, agility, jumping)
         VALUES (88882, 60,60,55,60,60,55,45,60,65,65,65,55,50,70,65,65,70,60)`,
      ).run();

      const p = await getPlayerById(db, 88882);
      expect(p).not.toBeNull();
      expect(p!.willRetireAtSeasonEnd).toBe(true);
      expect(p!.consecutiveLowMoraleWeeks).toBe(5);

      rawDb.prepare('DELETE FROM player_attributes WHERE player_id = 88882').run();
      rawDb.prepare('DELETE FROM players WHERE id = 88882').run();
    });
  });

  describe('getPlayersAboutToRetire', () => {
    it('returns only players in given club with willRetireAtSeasonEnd = true', async () => {
      rawDb.prepare(
        `INSERT INTO players (id, name, nationality, age, position, club_id, wage,
          contract_end, market_value, base_potential, effective_potential, morale, fitness,
          injury_weeks_left, is_free_agent, consecutive_low_morale_weeks, will_retire_at_season_end)
         VALUES (88883, 'Retiring Player', 'English', 36, 'LB', 1, 5000, 2026, 500000, 60, 60, 30, 90, 0, 0, 4, 1)`,
      ).run();
      rawDb.prepare(
        `INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading,
          long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
          pace, stamina, strength, agility, jumping)
         VALUES (88883, 55,60,65,55,60,50,45,58,60,62,60,55,50,65,65,65,65,60)`,
      ).run();

      const retiring = await getPlayersAboutToRetire(db, 1);
      expect(retiring.length).toBeGreaterThan(0);
      for (const p of retiring) {
        expect(p.willRetireAtSeasonEnd).toBe(true);
        expect(p.clubId).toBe(1);
      }
      expect(retiring.some((p) => p.id === 88883)).toBe(true);

      rawDb.prepare('DELETE FROM player_attributes WHERE player_id = 88883').run();
      rawDb.prepare('DELETE FROM players WHERE id = 88883').run();
    });

    it('returns empty array when no player in club is retiring', async () => {
      const retiring = await getPlayersAboutToRetire(db, 99999);
      expect(retiring).toEqual([]);
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
