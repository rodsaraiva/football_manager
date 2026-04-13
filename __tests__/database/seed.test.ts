import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { seedDatabase } from '@/database/seed';
import { generateSeedData } from '../../scripts/generate-seed-data';

describe('seedDatabase', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    createAllTables(db);
  });

  afterEach(() => db.close());

  it('populates all tables from generated data', () => {
    const data = generateSeedData(42);
    seedDatabase(db, data);

    const countryCount = (db.prepare('SELECT COUNT(*) as c FROM countries').get() as { c: number }).c;
    expect(countryCount).toBe(5);

    const clubCount = (db.prepare('SELECT COUNT(*) as c FROM clubs').get() as { c: number }).c;
    expect(clubCount).toBe(96);

    const playerCount = (db.prepare('SELECT COUNT(*) as c FROM players').get() as { c: number }).c;
    expect(playerCount).toBeGreaterThan(2000);

    const attrCount = (db.prepare('SELECT COUNT(*) as c FROM player_attributes').get() as { c: number }).c;
    expect(attrCount).toBe(playerCount);

    const staffCount = (db.prepare('SELECT COUNT(*) as c FROM staff').get() as { c: number }).c;
    expect(staffCount).toBeGreaterThan(200);

    const tacticCount = (db.prepare('SELECT COUNT(*) as c FROM tactics').get() as { c: number }).c;
    expect(tacticCount).toBe(96);
  });

  it('runs within a transaction (all or nothing)', () => {
    const data = generateSeedData(42);
    // Corrupt one entry to cause failure
    data.clubs[50].countryId = 999;
    expect(() => seedDatabase(db, data)).toThrow();
    // Should have rolled back — no data inserted
    const count = (db.prepare('SELECT COUNT(*) as c FROM countries').get() as { c: number }).c;
    expect(count).toBe(0);
  });
});
