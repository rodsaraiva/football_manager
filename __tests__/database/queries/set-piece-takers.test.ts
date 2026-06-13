import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getSetPieceTakers, setSetPieceTakers } from '@/database/queries/set-piece-takers';

const S = TEST_SAVE_ID;

describe('set-piece taker queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let p1: number;
  let p2: number;
  let p3: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    clubId = (rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number }).id;
    const players = rawDb.prepare('SELECT id FROM players LIMIT 3').all() as { id: number }[];
    [p1, p2, p3] = players.map(p => p.id);
  });
  afterEach(() => rawDb.close());

  it('returns null when no row exists for the club', async () => {
    expect(await getSetPieceTakers(db, S, clubId)).toBeNull();
  });

  it('upserts and reads back a full set of takers', async () => {
    await setSetPieceTakers(db, S, clubId, {
      penaltyTakerId: p1,
      freeKickTakerId: p2,
      cornerTakerId: p3,
    });
    expect(await getSetPieceTakers(db, S, clubId)).toEqual({
      penaltyTakerId: p1,
      freeKickTakerId: p2,
      cornerTakerId: p3,
    });
  });

  it('a second upsert replaces the previous row (no duplicate PK)', async () => {
    await setSetPieceTakers(db, S, clubId, { penaltyTakerId: p1, freeKickTakerId: p1, cornerTakerId: p1 });
    await setSetPieceTakers(db, S, clubId, { penaltyTakerId: p2, freeKickTakerId: p3, cornerTakerId: p1 });
    expect(await getSetPieceTakers(db, S, clubId)).toEqual({
      penaltyTakerId: p2,
      freeKickTakerId: p3,
      cornerTakerId: p1,
    });
    const count = (rawDb
      .prepare('SELECT COUNT(*) AS c FROM set_piece_takers WHERE save_id = ? AND club_id = ?')
      .get(S, clubId) as { c: number }).c;
    expect(count).toBe(1);
  });

  it('null clears a designated taker (auto-pick)', async () => {
    await setSetPieceTakers(db, S, clubId, { penaltyTakerId: p1, freeKickTakerId: p2, cornerTakerId: p3 });
    await setSetPieceTakers(db, S, clubId, { penaltyTakerId: null, freeKickTakerId: p2, cornerTakerId: null });
    expect(await getSetPieceTakers(db, S, clubId)).toEqual({
      penaltyTakerId: null,
      freeKickTakerId: p2,
      cornerTakerId: null,
    });
  });

  it('is save-isolated: a different saveId does not see this row', async () => {
    await setSetPieceTakers(db, S, clubId, { penaltyTakerId: p1, freeKickTakerId: p2, cornerTakerId: p3 });
    expect(await getSetPieceTakers(db, 999, clubId)).toBeNull();
  });
});
