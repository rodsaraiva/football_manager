import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { setTacticLineup, getTacticLineup } from '@/database/queries/tactics';

describe('setTacticLineup', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let tacticId: number;
  let realPlayerIds: number[];

  beforeEach(() => {
    rawDb = createTestDb(); // FK is ON (Task 5)
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const tactic = rawDb.prepare('SELECT id FROM tactics LIMIT 1').get() as { id: number };
    tacticId = tactic.id;
    realPlayerIds = (rawDb.prepare('SELECT id FROM players LIMIT 18').all() as { id: number }[]).map((r) => r.id);
  });
  afterEach(() => rawDb.close());

  it('persists starters then bench in slot order', async () => {
    const starters = realPlayerIds.slice(0, 11);
    const bench = realPlayerIds.slice(11, 18);
    await setTacticLineup(db, 1, tacticId, starters, bench);

    const lineup = await getTacticLineup(db, 1, tacticId);
    expect(lineup).not.toBeNull();
    expect(lineup!.starterIds).toEqual(starters);
    expect(lineup!.benchIds).toEqual(bench);
  });

  it('replaces an existing lineup wholesale', async () => {
    await setTacticLineup(db, 1, tacticId, realPlayerIds.slice(0, 11), realPlayerIds.slice(11, 18));
    const newStarters = realPlayerIds.slice(7, 18);
    await setTacticLineup(db, 1, tacticId, newStarters, []);

    const lineup = await getTacticLineup(db, 1, tacticId);
    expect(lineup!.starterIds).toEqual(newStarters);
    expect(lineup!.benchIds).toEqual([]);
  });

  it('is atomic: an invalid player mid-batch leaves the previous lineup intact', async () => {
    const original = realPlayerIds.slice(0, 11);
    await setTacticLineup(db, 1, tacticId, original, []);

    // Build a batch whose 3rd element is a non-existent player_id (FK violation).
    const broken = [realPlayerIds[0], realPlayerIds[1], 999999, ...realPlayerIds.slice(2, 10)];
    await expect(setTacticLineup(db, 1, tacticId, broken, [])).rejects.toThrow();

    // The opening DELETE must have been rolled back too — original lineup survives.
    const lineup = await getTacticLineup(db, 1, tacticId);
    expect(lineup).not.toBeNull();
    expect(lineup!.starterIds).toEqual(original);
  });
});
