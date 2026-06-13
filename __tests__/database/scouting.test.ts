import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getPlayerKnowledge,
  getScoutingRows,
  assignScout,
  unassignScout,
  setKnowledge,
  getActiveAssignments,
} from '@/database/queries/scouting';

describe('scouting query layer', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => rawDb.close());

  it('returns 0 knowledge for a player with no row', async () => {
    expect(await getPlayerKnowledge(db, TEST_SAVE_ID, 5)).toBe(0);
  });

  it('assignScout creates a row at knowledge 0 with the scout set', async () => {
    await assignScout(db, TEST_SAVE_ID, 5, 100);
    expect(await getPlayerKnowledge(db, TEST_SAVE_ID, 5)).toBe(0);
    const rows = await getScoutingRows(db, TEST_SAVE_ID);
    expect(rows).toEqual([{ playerId: 5, knowledge: 0, scoutId: 100 }]);
  });

  it('assigning a scout already on another target frees the previous target', async () => {
    await assignScout(db, TEST_SAVE_ID, 5, 100);
    await assignScout(db, TEST_SAVE_ID, 6, 100); // same scout, new target
    const rows = await getScoutingRows(db, TEST_SAVE_ID);
    const r5 = rows.find((r) => r.playerId === 5);
    const r6 = rows.find((r) => r.playerId === 6);
    expect(r5?.scoutId).toBeNull();
    expect(r6?.scoutId).toBe(100);
  });

  it('unassignScout clears the scout but keeps the knowledge row', async () => {
    await assignScout(db, TEST_SAVE_ID, 5, 100);
    await setKnowledge(db, TEST_SAVE_ID, 5, 40);
    await unassignScout(db, TEST_SAVE_ID, 5);
    const rows = await getScoutingRows(db, TEST_SAVE_ID);
    expect(rows).toEqual([{ playerId: 5, knowledge: 40, scoutId: null }]);
  });

  it('setKnowledge upserts when no row exists', async () => {
    await setKnowledge(db, TEST_SAVE_ID, 7, 30);
    expect(await getPlayerKnowledge(db, TEST_SAVE_ID, 7)).toBe(30);
  });

  it('setKnowledge to 100 frees the scout', async () => {
    await assignScout(db, TEST_SAVE_ID, 5, 100);
    await setKnowledge(db, TEST_SAVE_ID, 5, 100);
    const rows = await getScoutingRows(db, TEST_SAVE_ID);
    expect(rows[0].knowledge).toBe(100);
    expect(rows[0].scoutId).toBeNull();
  });

  it('getActiveAssignments returns only scouted rows below 100', async () => {
    await assignScout(db, TEST_SAVE_ID, 5, 100);
    await setKnowledge(db, TEST_SAVE_ID, 5, 50);
    await assignScout(db, TEST_SAVE_ID, 6, 101);
    await setKnowledge(db, TEST_SAVE_ID, 6, 100); // hits 100 → scout freed
    await assignScout(db, TEST_SAVE_ID, 7, 102);
    await unassignScout(db, TEST_SAVE_ID, 7); // idle

    const active = await getActiveAssignments(db, TEST_SAVE_ID);
    expect(active).toEqual([{ playerId: 5, scoutId: 100 }]);
  });

  it('isolates by save_id', async () => {
    await assignScout(db, TEST_SAVE_ID, 5, 100);
    // Foreign save: raw insert with a different save_id must not leak. FK off because
    // save_id 999 has no save_games row (same dodge seedTestDb uses for circular FKs).
    rawDb.pragma('foreign_keys = OFF');
    rawDb.prepare('INSERT INTO scouting (save_id, player_id, knowledge, scout_id) VALUES (?, ?, ?, ?)')
      .run(999, 5, 80, 500);
    rawDb.pragma('foreign_keys = ON');
    expect(await getPlayerKnowledge(db, TEST_SAVE_ID, 5)).toBe(0);
    expect(await getPlayerKnowledge(db, 999, 5)).toBe(80);
    const rows = await getScoutingRows(db, TEST_SAVE_ID);
    expect(rows).toEqual([{ playerId: 5, knowledge: 0, scoutId: 100 }]);
  });
});
