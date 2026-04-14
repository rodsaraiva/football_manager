import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import { upsertPlayerStats, getPlayerStatsByCompetition } from '../../../src/database/queries/player-stats';

describe('player-stats queries', () => {
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

  it('inserts a new row when none exists', async () => {
    await upsertPlayerStats(db, {
      playerId: 1, season: 1, competitionId: 1,
      appearances: 1, goals: 2, assists: 1,
      yellowCards: 0, redCards: 0, rating: 8.0, minutesPlayed: 90,
    });

    const rows = await getPlayerStatsByCompetition(db, 1, 1);
    const row = rows.find((r) => r.playerId === 1);
    expect(row).toBeDefined();
    expect(row!.appearances).toBe(1);
    expect(row!.goals).toBe(2);
    expect(row!.assists).toBe(1);
    expect(row!.avgRating).toBeCloseTo(8.0);
    expect(row!.minutesPlayed).toBe(90);
  });

  it('accumulates a second match and recalculates avg_rating weighted by minutes', async () => {
    await upsertPlayerStats(db, {
      playerId: 1, season: 1, competitionId: 1,
      appearances: 1, goals: 1, assists: 0,
      yellowCards: 1, redCards: 0, rating: 6.0, minutesPlayed: 90,
    });

    const rows = await getPlayerStatsByCompetition(db, 1, 1);
    const row = rows.find((r) => r.playerId === 1)!;
    expect(row.appearances).toBe(2);
    expect(row.goals).toBe(3);
    expect(row.assists).toBe(1);
    expect(row.yellowCards).toBe(1);
    expect(row.minutesPlayed).toBe(180);
    // weighted avg: (8.0*90 + 6.0*90) / 180 = 7.0
    expect(row.avgRating).toBeCloseTo(7.0);
  });

  it('isolates stats by (player, season, competition)', async () => {
    await upsertPlayerStats(db, {
      playerId: 1, season: 2, competitionId: 1,
      appearances: 1, goals: 5, assists: 0,
      yellowCards: 0, redCards: 0, rating: 9.0, minutesPlayed: 90,
    });

    const s1 = (await getPlayerStatsByCompetition(db, 1, 1)).find((r) => r.playerId === 1)!;
    const s2 = (await getPlayerStatsByCompetition(db, 2, 1)).find((r) => r.playerId === 1)!;
    expect(s1.goals).toBe(3);
    expect(s2.goals).toBe(5);
  });
});
