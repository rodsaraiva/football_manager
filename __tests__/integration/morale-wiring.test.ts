import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';

const S = TEST_SAVE_ID;

describe('morale wiring (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    clubId = (rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number }).id;
  });
  afterEach(() => rawDb.close());

  it('one idle week drifts squad morale away from the seeded value', async () => {
    const before = await getPlayersByClub(db, S, clubId);
    const beforeAvg = before.reduce((s, p) => s + p.morale, 0) / before.length;
    // No fixture this week → idle-week drift pulls morale toward the neutral target.
    await advanceGameWeek({ dbHandle: db, season: 2026, week: 1, playerClubId: clubId, saveId: S, rng: new SeededRng(5) });
    const after = await getPlayersByClub(db, S, clubId);
    const afterAvg = after.reduce((s, p) => s + p.morale, 0) / after.length;
    expect(afterAvg).not.toBe(beforeAvg);
  });

  it('sustained low morale in the announce window flags an eligible veteran to retire', async () => {
    const squad = await getPlayersByClub(db, S, clubId);
    const vet = squad[0];
    rawDb.prepare(
      'UPDATE players SET age = 35, morale = 10, consecutive_low_morale_weeks = 2, will_retire_at_season_end = 0 WHERE id = ?',
    ).run(vet.id);
    // Announce window is weeks [38..48] (SEASON_END 58, offsets 20/10). Advance week 40.
    await advanceGameWeek({ dbHandle: db, season: 2026, week: 40, playerClubId: clubId, saveId: S, rng: new SeededRng(6) });
    const row = rawDb.prepare('SELECT will_retire_at_season_end, consecutive_low_morale_weeks, morale FROM players WHERE id = ?').get(vet.id) as { will_retire_at_season_end: number; consecutive_low_morale_weeks: number; morale: number };
    expect(row.consecutive_low_morale_weeks).toBeGreaterThanOrEqual(3);
    expect(row.will_retire_at_season_end).toBe(1);
  });
});
