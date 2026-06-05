import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';
import { getFixturesByWeek } from '@/database/queries/fixtures';

describe('ensureSeasonFixtures isolation (season 1)', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  const data = generateSeedData(42);

  beforeEach(() => {
    raw = new Database(':memory:');
    raw.pragma('foreign_keys = OFF'); // circular world FK; seeding runs FK-off
    createAllTables(raw);
    db = createTestDbHandle(raw);
    seedReferenceTables(raw, data);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + data.clubs[0].id);
    seedWorldForSave(raw, data, 1);
    seedWorldForSave(raw, data, 2);
  });
  afterEach(() => raw.close());

  it('generates season-1 fixtures per save without colliding ids', async () => {
    await ensureSeasonFixtures(db, 1, 1);
    const aCount = (raw.prepare('SELECT COUNT(*) c FROM fixtures WHERE save_id = 1').get() as { c: number }).c;
    await ensureSeasonFixtures(db, 2, 1); // must NOT wipe save 1
    const aAfter = (raw.prepare('SELECT COUNT(*) c FROM fixtures WHERE save_id = 1').get() as { c: number }).c;
    expect(aCount).toBeGreaterThan(0);
    expect(aAfter).toBe(aCount);
    // disjoint id spaces
    const maxA = (raw.prepare('SELECT MAX(id) m FROM fixtures WHERE save_id = 1').get() as { m: number }).m;
    const minB = (raw.prepare('SELECT MIN(id) m FROM fixtures WHERE save_id = 2').get() as { m: number }).m;
    expect(maxA).toBeLessThan(minB);
  });

  it('getFixturesByWeek of save 1 never returns save 2 fixtures', async () => {
    await ensureSeasonFixtures(db, 1, 1);
    await ensureSeasonFixtures(db, 2, 1);
    const wk1A = await getFixturesByWeek(db, 1, 1, 7); // league fixtures start week 7
    expect(wk1A.every((f) => f.id >= saveOffset(1) && f.id < saveOffset(2))).toBe(true);
  });
});
