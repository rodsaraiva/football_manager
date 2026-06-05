import { createTestDb } from './test-helpers';

const WORLD_TABLES = [
  'clubs', 'players', 'player_attributes', 'club_finances', 'competitions',
  'competition_entries', 'fixtures', 'transfers', 'transfer_offers',
  'transfer_blocks', 'tactics', 'staff', 'board_objectives',
  'board_trust_history', 'club_reputation_history', 'season_competition_results',
  'season_relegated', 'season_awards', 'season_player_titles', 'player_stats',
];

const REFERENCE_TABLES = ['countries', 'leagues', 'app_settings'];

describe('schema save_id', () => {
  const db = createTestDb();
  // The UNIQUE-behavior assertions below insert board_objectives without parent
  // save_games/clubs rows; this test targets column presence + UNIQUE shape, not FK
  // integrity, so disable FK enforcement (createTestDb turns it ON by default).
  db.pragma('foreign_keys = OFF');

  it.each(WORLD_TABLES)('world table %s has a save_id column', (t) => {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('save_id');
  });

  it.each(REFERENCE_TABLES)('reference table %s has NO save_id column', (t) => {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).not.toContain('save_id');
  });

  it('board_objectives allows the same (club_id, season) for two saves', () => {
    db.prepare("INSERT INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (1, 7, 1, 'league_position', 5, 'a')").run();
    expect(() =>
      db.prepare("INSERT INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (2, 7, 1, 'league_position', 5, 'b')").run(),
    ).not.toThrow();
  });

  it('board_objectives still rejects a duplicate (save_id, club_id, season)', () => {
    expect(() =>
      db.prepare("INSERT INTO board_objectives (save_id, club_id, season, type, target, description) VALUES (1, 7, 1, 'league_position', 5, 'dup')").run(),
    ).toThrow(/UNIQUE/);
  });
});
