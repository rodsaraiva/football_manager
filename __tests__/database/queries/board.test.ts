import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../test-helpers';
import {
  upsertBoardObjective,
  getBoardObjective,
  getSaveBoardTrust,
  updateSaveBoardTrust,
} from '@/database/queries/board';
import { generateObjective } from '@/engine/board/objective-generator';
import { SeededRng } from '@/engine/rng';
import { DbHandle } from '@/database/queries/players';

describe('board queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let saveId: number;

  beforeAll(() => {
    rawDb = createTestDb();
    db = createTestDbHandle(rawDb);

    // Disable FK to break the clubs <-> save_games circular dependency during seeding
    rawDb.pragma('foreign_keys = OFF');

    rawDb.prepare(`INSERT INTO countries (id, name, code, continent) VALUES (1, 'England', 'EN', 'Europe')`).run();
    rawDb.prepare(`INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (1, 'Premier League', 1, 1, 20, 0, 3)`).run();
    rawDb.prepare(
      `INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1, 'Test Save', 1, 1, 1, 'normal', 50, '2026-01-01', '2026-01-01')`
    ).run();
    rawDb.prepare(
      `INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color)
       VALUES (1, 1, 'Test FC', 'TFC', 1, 1, 25, 1000000, 50000, 'Test Stadium', 20000, 3, 3, 3, '#fff', '#000')`
    ).run();

    rawDb.pragma('foreign_keys = ON');

    clubId = 1;
    saveId = 1;
  });

  afterAll(() => {
    rawDb.close();
  });

  describe('upsertBoardObjective + getBoardObjective', () => {
    it('persists and retrieves an objective for a season', async () => {
      await upsertBoardObjective(db, saveId, {
        clubId,
        season: 1,
        type: 'no_relegation',
        target: null,
        description: 'Avoid relegation this season',
      });

      const obj = await getBoardObjective(db, saveId, clubId, 1);

      expect(obj).not.toBeNull();
      expect(obj!.type).toBe('no_relegation');
      expect(obj!.description).toBe('Avoid relegation this season');
      expect(obj!.target).toBeNull();
      expect(obj!.clubId).toBe(clubId);
      expect(obj!.season).toBe(1);
    });

    it('returns null when no objective exists for a season', async () => {
      const obj = await getBoardObjective(db, saveId, clubId, 99);
      expect(obj).toBeNull();
    });

    it('upsert overwrites existing objective for same club+season', async () => {
      await upsertBoardObjective(db, saveId, {
        clubId,
        season: 2,
        type: 'top_half',
        target: 10,
        description: 'Finish top half',
      });
      await upsertBoardObjective(db, saveId, {
        clubId,
        season: 2,
        type: 'cup_win',
        target: null,
        description: 'Win the cup',
      });

      const obj = await getBoardObjective(db, saveId, clubId, 2);
      expect(obj!.type).toBe('cup_win');
      expect(obj!.description).toBe('Win the cup');
    });
  });

  describe('getSaveBoardTrust + updateSaveBoardTrust', () => {
    it('returns default trust of 50 for a new save', async () => {
      const trust = await getSaveBoardTrust(db, saveId);
      expect(trust).toBe(50);
    });

    it('returns updated trust after updateSaveBoardTrust', async () => {
      await updateSaveBoardTrust(db, saveId, 75);
      const trust = await getSaveBoardTrust(db, saveId);
      expect(trust).toBe(75);
      // restore
      await updateSaveBoardTrust(db, saveId, 50);
    });
  });

  describe('new game objective sequence', () => {
    it('generateObjective + upsertBoardObjective + getBoardObjective round-trip', async () => {
      const rng = new SeededRng(saveId * 999);
      const objective = generateObjective({
        clubReputation: 25,   // low-rep club → expect survival objective
        currentLeaguePosition: null,
        totalTeams: 16,
        divisionLevel: 1,
        wasRelegated: false,
        wasPromoted: false,
        rng,
      });

      await upsertBoardObjective(db, 1, {
        clubId,
        season: 3,
        type: objective.type,
        target: objective.target,
        description: '',
      });

      const persisted = await getBoardObjective(db, 1, clubId, 3);

      expect(persisted).not.toBeNull();
      expect(['no_relegation', 'top_half']).toContain(persisted!.type);
      expect(persisted!.type).toBe(objective.type);
      expect(persisted!.target).toBe(objective.target ?? null);
    });
  });
});
