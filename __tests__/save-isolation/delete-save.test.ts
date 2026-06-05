import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { deleteSave } from '@/database/queries/saves';

const WORLD = ['clubs', 'players', 'player_attributes', 'staff', 'tactics', 'board_objectives', 'board_trust_history', 'club_reputation_history'];

describe('deleteSave', () => {
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
    // an assistant for each save
    raw.prepare("INSERT INTO assistants (club_id, save_id, role, name, age, archetype, retirement_age, wage_per_month) VALUES (?,1,'squad','Joe',40,'tactician',65,1000)").run(saveOffset(1) + data.clubs[0].id);
    raw.prepare("INSERT INTO assistants (club_id, save_id, role, name, age, archetype, retirement_age, wage_per_month) VALUES (?,2,'squad','Bob',40,'tactician',65,1000)").run(saveOffset(2) + data.clubs[0].id);
  });
  afterEach(() => raw.close());

  it('removes every world row of the deleted save and the assistants', async () => {
    await deleteSave(db, 2);
    for (const t of WORLD) {
      const c = (raw.prepare(`SELECT COUNT(*) c FROM ${t} WHERE save_id = 2`).get() as { c: number }).c;
      expect(c).toBe(0);
    }
    expect((raw.prepare('SELECT COUNT(*) c FROM assistants WHERE save_id = 2').get() as { c: number }).c).toBe(0);
    expect((raw.prepare('SELECT COUNT(*) c FROM save_games WHERE id = 2').get() as { c: number }).c).toBe(0);
  });

  it('does not touch save 1', async () => {
    const before = (raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id = 1').get() as { c: number }).c;
    await deleteSave(db, 2);
    expect((raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id = 1').get() as { c: number }).c).toBe(before);
    expect((raw.prepare('SELECT COUNT(*) c FROM save_games WHERE id = 1').get() as { c: number }).c).toBe(1);
  });
});
