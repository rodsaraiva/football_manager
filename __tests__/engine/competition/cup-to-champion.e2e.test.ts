import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';
import { advanceGameWeek } from '@/engine/game-loop';
import { SEASON_END_WEEK, KNOCKOUT_START_WEEK } from '@/engine/balance';

const S = TEST_SAVE_ID;

describe('cup progresses to a real champion through the game loop', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await ensureSeasonFixtures(db, S, 1);
  });
  afterEach(() => rawDb.close());

  it('reaches a cup final and archives a champion', async () => {
    // Advance from the knockout band start to season end; AI sim resolves fixtures,
    // and maybeGenerateNextKnockoutRound creates each successive round.
    for (let week = KNOCKOUT_START_WEEK; week <= SEASON_END_WEEK; week++) {
      await advanceGameWeek({
        dbHandle: db, season: 1, week,
        playerClubId: 1, saveId: S, rng: new SeededRng(week + 1),
      });
    }

    // A cup competition advanced beyond round 1.
    const cup = rawDb.prepare(
      "SELECT id FROM competitions WHERE save_id = ? AND season = 1 AND type = 'cup' AND league_id IS NOT NULL LIMIT 1",
    ).get(S) as { id: number };
    expect(cup).toBeDefined();
    const maxRound = rawDb.prepare(
      "SELECT MAX(CAST(round AS INTEGER)) AS m FROM fixtures WHERE competition_id = ? AND round IS NOT NULL",
    ).get(cup.id) as { m: number };
    expect(maxRound.m).toBeGreaterThanOrEqual(3);

    // The archiver crowned a champion for that cup (run at SEASON_END_WEEK).
    const res = rawDb.prepare(
      'SELECT champion_club_id FROM season_competition_results WHERE season = 1 AND competition_id = ?',
    ).get(cup.id) as { champion_club_id: number } | undefined;
    expect(res?.champion_club_id).toBeDefined();
  });
});
