import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { upsertPlayerStats, getRecentForm } from '@/database/queries/player-stats';

const S = TEST_SAVE_ID;

describe('getRecentForm', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    rawDb.pragma('foreign_keys = OFF'); // isolated aggregation test: no seeded players/saves
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('returns zeros for a player with no stats this season', async () => {
    const form = await getRecentForm(db, S, 999, 2026);
    expect(form).toEqual({ minutesPlayed: 0, totalPossibleMinutes: 0, avgRating: 0 });
  });

  it('aggregates minutes and minutes-weighted rating for the season', async () => {
    // two appearances in the same competition: 90' @ 7.0 then 90' @ 8.0
    await upsertPlayerStats(db, S, {
      playerId: 1, season: 2026, competitionId: 10,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 7.0, minutesPlayed: 90,
    });
    await upsertPlayerStats(db, S, {
      playerId: 1, season: 2026, competitionId: 10,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 8.0, minutesPlayed: 90,
    });
    const form = await getRecentForm(db, S, 1, 2026);
    expect(form.minutesPlayed).toBe(180);
    expect(form.totalPossibleMinutes).toBe(180); // 2 appearances * 90
    expect(form.avgRating).toBeCloseTo(7.5, 5);
  });

  it('sums across competitions and ignores other seasons', async () => {
    await upsertPlayerStats(db, S, {
      playerId: 2, season: 2026, competitionId: 10,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 6.0, minutesPlayed: 90,
    });
    await upsertPlayerStats(db, S, {
      playerId: 2, season: 2026, competitionId: 20,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 7.0, minutesPlayed: 45,
    });
    await upsertPlayerStats(db, S, {
      playerId: 2, season: 2025, competitionId: 10,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 9.0, minutesPlayed: 90,
    });
    const form = await getRecentForm(db, S, 2, 2026);
    expect(form.minutesPlayed).toBe(135);
    expect(form.totalPossibleMinutes).toBe(180); // (1+1) appearances * 90
    expect(form.avgRating).toBeCloseTo((6.0 * 90 + 7.0 * 45) / 135, 5);
  });
});
