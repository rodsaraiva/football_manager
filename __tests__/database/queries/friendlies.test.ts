import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  createFriendly,
  getFriendliesBySeason,
  updateFriendlyResult,
  countFriendliesBySeason,
} from '@/database/queries/friendlies';
import {
  setPreseasonPending,
  isPreseasonPending,
} from '@/database/queries/save';

describe('friendlies queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const SAVE_ID = TEST_SAVE_ID;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('creates and reads back a friendly scoped by save+season', async () => {
    const id = await createFriendly(db, SAVE_ID, { season: 1, homeClubId: 1, awayClubId: 2 });
    const list = await getFriendliesBySeason(db, SAVE_ID, 1);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].homeClubId).toBe(1);
    expect(list[0].awayClubId).toBe(2);
    expect(list[0].played).toBe(false);
    expect(list[0].homeGoals).toBeNull();
  });

  it('does not leak friendlies across seasons', async () => {
    await createFriendly(db, SAVE_ID, { season: 1, homeClubId: 1, awayClubId: 2 });
    await createFriendly(db, SAVE_ID, { season: 2, homeClubId: 1, awayClubId: 3 });
    expect(await getFriendliesBySeason(db, SAVE_ID, 1)).toHaveLength(1);
    expect(await getFriendliesBySeason(db, SAVE_ID, 2)).toHaveLength(1);
  });

  it('records a friendly result (goals/attendance/played)', async () => {
    const id = await createFriendly(db, SAVE_ID, { season: 1, homeClubId: 1, awayClubId: 2 });
    await updateFriendlyResult(db, SAVE_ID, id, 3, 1, 25000);
    const [f] = await getFriendliesBySeason(db, SAVE_ID, 1);
    expect(f.played).toBe(true);
    expect(f.homeGoals).toBe(3);
    expect(f.awayGoals).toBe(1);
    expect(f.attendance).toBe(25000);
  });

  it('counts friendlies for a season', async () => {
    expect(await countFriendliesBySeason(db, SAVE_ID, 1)).toBe(0);
    await createFriendly(db, SAVE_ID, { season: 1, homeClubId: 1, awayClubId: 2 });
    await createFriendly(db, SAVE_ID, { season: 1, homeClubId: 1, awayClubId: 3 });
    expect(await countFriendliesBySeason(db, SAVE_ID, 1)).toBe(2);
  });

  it('a friendly never lands in the fixtures table', async () => {
    await createFriendly(db, SAVE_ID, { season: 1, homeClubId: 1, awayClubId: 2 });
    const fixtureCount = rawDb
      .prepare('SELECT COUNT(*) AS c FROM fixtures WHERE save_id = ? AND home_club_id = 1 AND away_club_id = 2')
      .get(SAVE_ID) as { c: number };
    expect(fixtureCount.c).toBe(0);
  });
});

describe('preseason_pending flag', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const SAVE_ID = TEST_SAVE_ID;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('defaults to not pending', async () => {
    expect(await isPreseasonPending(db, SAVE_ID)).toBe(false);
  });

  it('sets and clears the flag', async () => {
    await setPreseasonPending(db, SAVE_ID, true);
    expect(await isPreseasonPending(db, SAVE_ID)).toBe(true);
    await setPreseasonPending(db, SAVE_ID, false);
    expect(await isPreseasonPending(db, SAVE_ID)).toBe(false);
  });

  it('returns false for an unknown save', async () => {
    expect(await isPreseasonPending(db, 999)).toBe(false);
  });
});
