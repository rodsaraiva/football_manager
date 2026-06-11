import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { buildDivisionPairs, computeDivisionSwaps } from '@/engine/competition/promotion';

const S = TEST_SAVE_ID;

// Mirrors the swap the screen performs in handleContinue.
async function applySwaps(db: DbHandle, standingsByLeague: Map<number, number[]>): Promise<void> {
  const leagues = await getAllLeagues(db);
  const pairs = buildDivisionPairs(leagues);
  const swaps = computeDivisionSwaps(pairs, standingsByLeague);
  for (const s of swaps) {
    await db.prepare('UPDATE clubs SET league_id = ? WHERE save_id = ? AND id = ?').run(s.toLeagueId, S, s.clubId);
  }
}

describe('division swap (screen pipeline) on real DB', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('moves bottom of div1 down and top of div2 up, keeping sizes constant', async () => {
    const before1 = await getClubsByLeague(db, S, 1);
    const before2 = await getClubsByLeague(db, S, 2);
    const size1 = before1.length;
    const size2 = before2.length;

    // Final orders (1st..last) by id for determinism.
    const order1 = before1.map((c) => c.id).sort((a, b) => a - b);
    const order2 = before2.map((c) => c.id).sort((a, b) => a - b);
    const standings = new Map<number, number[]>([[1, order1], [2, order2]]);

    const relegatedExpected = order1.slice(order1.length - 3); // bottom 3 of div1
    const promotedExpected = order2.slice(0, 3); // top 3 of div2

    await applySwaps(db, standings);

    const after1 = (await getClubsByLeague(db, S, 1)).map((c) => c.id);
    const after2 = (await getClubsByLeague(db, S, 2)).map((c) => c.id);

    expect(after1).toHaveLength(size1);
    expect(after2).toHaveLength(size2);
    for (const c of relegatedExpected) expect(after2).toContain(c);
    for (const c of promotedExpected) expect(after1).toContain(c);
    for (const c of relegatedExpected) expect(after1).not.toContain(c);
    for (const c of promotedExpected) expect(after2).not.toContain(c);
  });
});
