import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { seedReferenceTables, seedWorldForSave } from '@/database/seed';
import { saveOffset } from '@/database/constants';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  // The world has a circular FK (clubs.save_id <-> save_games.player_club_id), so bootstrap
  // seeding inserts save_games before its player_club_id's club exists. Seeding therefore runs
  // with FK enforcement OFF (production disables FK around the seed for the same reason).
  // better-sqlite3 defaults foreign_keys ON, so disable it explicitly.
  db.pragma('foreign_keys = OFF');
  createAllTables(db);
  return db;
}

describe('seedWorldForSave', () => {
  it('two saves get disjoint, equal-count player sets', () => {
    const db = freshDb();
    const data = generateSeedData(42);
    seedReferenceTables(db, data); // countries + leagues only (global)
    // create save rows so the FK target exists
    db.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    db.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + data.clubs[0].id);

    seedWorldForSave(db, data, 1);
    seedWorldForSave(db, data, 2);

    const cntA = (db.prepare('SELECT COUNT(*) c FROM players WHERE save_id=1').get() as { c: number }).c;
    const cntB = (db.prepare('SELECT COUNT(*) c FROM players WHERE save_id=2').get() as { c: number }).c;
    expect(cntA).toBe(data.players.length);
    expect(cntB).toBe(data.players.length);

    // no cross-save id overlap: every save-1 player id < save-2's min id
    const maxA = (db.prepare('SELECT MAX(id) m FROM players WHERE save_id=1').get() as { m: number }).m;
    const minB = (db.prepare('SELECT MIN(id) m FROM players WHERE save_id=2').get() as { m: number }).m;
    expect(maxA).toBeLessThan(minB);
  });

  it('rewrites player.club_id with the same save offset (FK stays inside the save)', () => {
    const db = freshDb();
    const data = generateSeedData(42);
    seedReferenceTables(db, data);
    db.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    seedWorldForSave(db, data, 1);

    const orphan = db.prepare(
      'SELECT COUNT(*) c FROM players p WHERE p.save_id=1 AND p.club_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id=p.club_id AND c.save_id=1)',
    ).get() as { c: number };
    expect(orphan.c).toBe(0);
  });

  it('rolls back on failure (duplicate save world)', () => {
    const db = freshDb();
    const data = generateSeedData(42);
    seedReferenceTables(db, data);
    db.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + data.clubs[0].id);
    seedWorldForSave(db, data, 1);
    expect(() => seedWorldForSave(db, data, 1)).toThrow(); // PK collision on clubs
    // first seed intact, no partial second seed
    const cnt = (db.prepare('SELECT COUNT(*) c FROM clubs WHERE save_id=1').get() as { c: number }).c;
    expect(cnt).toBe(data.clubs.length);
  });
});
