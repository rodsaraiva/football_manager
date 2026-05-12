import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from './test-helpers';
import {
  insertReputationHistory,
  getReputationHistory,
  upsertBoardObjective,
  getBoardObjective,
  insertTrustHistory,
  getTrustHistory,
  getSaveBoardTrust,
  updateSaveBoardTrust,
} from '@/database/queries/board';
import { DbHandle } from '@/database/queries/players';

let rawDb: Database.Database;
let db: DbHandle;
const CLUB_ID = 1;
const SEASON = 1;
const SAVE_ID = 1;

beforeEach(() => {
  rawDb = createTestDb();
  seedTestDb(rawDb);
  db = createTestDbHandle(rawDb);

  // Insert a save_games row so we can test board_trust
  rawDb.prepare(
    `INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, created_at, updated_at)
     VALUES (?, 'Test', 1, 1, ?, 'normal', '2026-01-01', '2026-01-01')`
  ).run(SAVE_ID, CLUB_ID);
});

describe('board queries', () => {
  describe('insertReputationHistory / getReputationHistory', () => {
    it('inserts and retrieves reputation history', async () => {
      await insertReputationHistory(db, { clubId: CLUB_ID, season: SEASON, reputation: 65, delta: 5 });
      const history = await getReputationHistory(db, CLUB_ID);
      expect(history).toHaveLength(1);
      expect(history[0].reputation).toBe(65);
      expect(history[0].delta).toBe(5);
      expect(history[0].clubId).toBe(CLUB_ID);
    });

    it('ignores duplicate insert (UNIQUE clubId+season)', async () => {
      await insertReputationHistory(db, { clubId: CLUB_ID, season: SEASON, reputation: 65, delta: 5 });
      await expect(
        insertReputationHistory(db, { clubId: CLUB_ID, season: SEASON, reputation: 70, delta: 10 })
      ).rejects.toThrow();
    });

    it('returns history ordered by season descending', async () => {
      await insertReputationHistory(db, { clubId: CLUB_ID, season: 1, reputation: 60, delta: 2 });
      await insertReputationHistory(db, { clubId: CLUB_ID, season: 2, reputation: 65, delta: 5 });
      const history = await getReputationHistory(db, CLUB_ID);
      expect(history[0].season).toBe(2);
      expect(history[1].season).toBe(1);
    });
  });

  describe('upsertBoardObjective / getBoardObjective', () => {
    it('inserts and retrieves a board objective', async () => {
      await upsertBoardObjective(db, {
        clubId: CLUB_ID, season: SEASON, type: 'top_half', target: 10,
        description: 'Finish in the top half',
      });
      const obj = await getBoardObjective(db, CLUB_ID, SEASON);
      expect(obj).not.toBeNull();
      expect(obj!.type).toBe('top_half');
      expect(obj!.target).toBe(10);
      expect(obj!.description).toBe('Finish in the top half');
    });

    it('upserts (replaces) an existing objective for same club+season', async () => {
      await upsertBoardObjective(db, {
        clubId: CLUB_ID, season: SEASON, type: 'top_half', target: 10, description: 'Old',
      });
      await upsertBoardObjective(db, {
        clubId: CLUB_ID, season: SEASON, type: 'cup_win', target: null, description: 'New',
      });
      const obj = await getBoardObjective(db, CLUB_ID, SEASON);
      expect(obj!.type).toBe('cup_win');
      expect(obj!.description).toBe('New');
    });

    it('returns null for non-existent objective', async () => {
      const obj = await getBoardObjective(db, CLUB_ID, 99);
      expect(obj).toBeNull();
    });
  });

  describe('insertTrustHistory / getTrustHistory', () => {
    it('inserts and retrieves trust history', async () => {
      await insertTrustHistory(db, { clubId: CLUB_ID, season: SEASON, trust: 65, outcome: 'objective_met' });
      const history = await getTrustHistory(db, CLUB_ID);
      expect(history).toHaveLength(1);
      expect(history[0].trust).toBe(65);
      expect(history[0].outcome).toBe('objective_met');
    });

    it('rejects invalid trust value outside 0-100 range', async () => {
      await expect(
        insertTrustHistory(db, { clubId: CLUB_ID, season: SEASON, trust: 150, outcome: 'objective_met' })
      ).rejects.toThrow();
    });
  });

  describe('getSaveBoardTrust / updateSaveBoardTrust', () => {
    it('returns default trust of 50 for new save', async () => {
      const trust = await getSaveBoardTrust(db, SAVE_ID);
      expect(trust).toBe(50);
    });

    it('updates and retrieves board trust', async () => {
      await updateSaveBoardTrust(db, SAVE_ID, 72);
      const trust = await getSaveBoardTrust(db, SAVE_ID);
      expect(trust).toBe(72);
    });
  });
});
