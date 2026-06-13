import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getLastInteraction,
  recordInteraction,
  hasInteractedThisWeek,
} from '@/database/queries/interactions';

const S = TEST_SAVE_ID;

describe('player interaction cooldown queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let playerId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    playerId = (rawDb.prepare('SELECT id FROM players LIMIT 1').get() as { id: number }).id;
  });
  afterEach(() => rawDb.close());

  it('a fresh player has no recorded interaction', async () => {
    expect(await getLastInteraction(db, S, playerId)).toBeNull();
    expect(await hasInteractedThisWeek(db, S, playerId, 1, 5)).toBe(false);
  });

  it('records the season/week of an interaction', async () => {
    await recordInteraction(db, S, playerId, 2, 7);
    expect(await getLastInteraction(db, S, playerId)).toEqual({ season: 2, week: 7 });
  });

  it('flags cooldown only for the same season+week', async () => {
    await recordInteraction(db, S, playerId, 2, 7);
    expect(await hasInteractedThisWeek(db, S, playerId, 2, 7)).toBe(true);
    // next week clears it
    expect(await hasInteractedThisWeek(db, S, playerId, 2, 8)).toBe(false);
    // same week number, different season does not collide
    expect(await hasInteractedThisWeek(db, S, playerId, 3, 7)).toBe(false);
  });

  it('a later interaction overwrites the previous one', async () => {
    await recordInteraction(db, S, playerId, 2, 7);
    await recordInteraction(db, S, playerId, 2, 9);
    expect(await getLastInteraction(db, S, playerId)).toEqual({ season: 2, week: 9 });
    expect(await hasInteractedThisWeek(db, S, playerId, 2, 7)).toBe(false);
    expect(await hasInteractedThisWeek(db, S, playerId, 2, 9)).toBe(true);
  });
});
