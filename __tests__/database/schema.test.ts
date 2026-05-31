import Database from 'better-sqlite3';
import { createAllTables, TABLE_NAMES } from '@/database/schema';

function openTestDb(): Database.Database {
  return new Database(':memory:');
}

describe('Database Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('creates all tables without errors', () => {
    expect(() => createAllTables(db)).not.toThrow();
  });

  it('creates the expected number of tables', () => {
    createAllTables(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([...TABLE_NAMES].sort());
  });

  it('can insert and retrieve a country', () => {
    createAllTables(db);
    db.prepare("INSERT INTO countries (id, name, code, continent) VALUES (1, 'England', 'EN', 'Europe')").run();
    const row = db.prepare('SELECT * FROM countries WHERE id = 1').get() as Record<string, unknown>;
    expect(row.name).toBe('England');
    expect(row.code).toBe('EN');
  });

  it('can insert and retrieve a player with attributes', () => {
    createAllTables(db);
    db.prepare("INSERT INTO countries (id, name, code, continent) VALUES (1, 'England', 'EN', 'Europe')").run();
    db.prepare("INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (1, 'Premier League', 1, 1, 20, 0, 3)").run();
    db.prepare("INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color) VALUES (1, 'London FC', 'LON', 1, 1, 85, 100000000, 2000000, 'London Stadium', 60000, 4, 3, 3, '#ff0000', '#ffffff')").run();
    db.prepare("INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent) VALUES (1, 'John Smith', 'English', 25, 'ST', NULL, 1, 100000, 3, 50000000, 85, 85, 75, 100, 0, 0)").run();
    db.prepare("INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (1, 85, 70, 60, 78, 75, 72, 55, 65, 80, 70, 82, 60, 55, 88, 75, 78, 80, 72)").run();

    const player = db.prepare('SELECT * FROM players WHERE id = 1').get() as Record<string, unknown>;
    expect(player.name).toBe('John Smith');
    expect(player.position).toBe('ST');

    const attrs = db.prepare('SELECT * FROM player_attributes WHERE player_id = 1').get() as Record<string, unknown>;
    expect(attrs.finishing).toBe(85);
    expect(attrs.pace).toBe(88);
  });

  it('enforces foreign key constraints', () => {
    createAllTables(db);
    db.pragma('foreign_keys = ON');
    expect(() => {
      db.prepare("INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color) VALUES (1, 'Test', 'TST', 999, 999, 50, 0, 0, 'Stadium', 5000, 1, 1, 1, '#000', '#fff')").run();
    }).toThrow();
  });

  it('is idempotent — running createAllTables twice does not error', () => {
    createAllTables(db);
    expect(() => createAllTables(db)).not.toThrow();
  });

  it('creates indexes on the hottest foreign keys', () => {
    createAllTables(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    for (const expected of [
      'idx_players_club',
      'idx_fixtures_season_week',
      'idx_fixtures_home',
      'idx_fixtures_away',
      'idx_finances_club_season',
      'idx_match_events_fixture',
      'idx_comp_entries_club',
      'idx_player_stats_season',
      'idx_transfer_offers_status',
      'idx_transfer_offers_club',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('uses idx_players_club for a club_id lookup (query plan)', () => {
    createAllTables(db);
    const plan = db
      .prepare('EXPLAIN QUERY PLAN SELECT * FROM players WHERE club_id = ?')
      .all(1) as { detail: string }[];
    const usesIndex = plan.some((row) => /USING\b.*\bINDEX idx_players_club/.test(row.detail));
    expect(usesIndex).toBe(true);
  });
});
