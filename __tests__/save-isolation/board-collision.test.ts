import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { createTestDbHandle } from '../database/test-helpers';
import { upsertBoardObjective, getBoardObjective } from '@/database/queries/board';

describe('board objectives isolation', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  beforeEach(() => {
    raw = new Database(':memory:');
    raw.pragma('foreign_keys = OFF');
    createAllTables(raw);
    db = createTestDbHandle(raw);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',1,'','')").run();
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',1,'','')").run();
  });
  afterEach(() => raw.close());

  it('same (club_id, season) in two saves coexist and do not overwrite', async () => {
    await upsertBoardObjective(db, 1, { clubId: 7, season: 1, type: 'league_position', target: 4, description: 'A wants top 4' });
    await upsertBoardObjective(db, 2, { clubId: 7, season: 1, type: 'no_relegation', target: null, description: 'B must survive' });

    const a = await getBoardObjective(db, 1, 7, 1);
    const b = await getBoardObjective(db, 2, 7, 1);
    expect(a?.description).toBe('A wants top 4');
    expect(b?.description).toBe('B must survive');
  });

  it('upsert in save 1 re-runs without touching save 2', async () => {
    await upsertBoardObjective(db, 1, { clubId: 7, season: 1, type: 'league_position', target: 4, description: 'A v1' });
    await upsertBoardObjective(db, 2, { clubId: 7, season: 1, type: 'no_relegation', target: null, description: 'B' });
    await upsertBoardObjective(db, 1, { clubId: 7, season: 1, type: 'league_position', target: 2, description: 'A v2' });
    expect((await getBoardObjective(db, 1, 7, 1))?.description).toBe('A v2');
    expect((await getBoardObjective(db, 2, 7, 1))?.description).toBe('B');
  });
});
