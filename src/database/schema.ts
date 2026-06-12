export const TABLE_NAMES: string[] = [
  'countries',
  'leagues',
  'clubs',
  'players',
  'player_attributes',
  'player_stats',
  'staff',
  'club_finances',
  'competitions',
  'competition_entries',
  'fixtures',
  'match_events',
  'transfers',
  'transfer_offers',
  'transfer_blocks',
  'tactics',
  'tactic_positions',
  'tactic_lineup',
  'save_games',
  'season_competition_results',
  'season_relegated',
  'season_promoted',
  'season_awards',
  'season_player_titles',
  'club_reputation_history',
  'board_objectives',
  'board_trust_history',
  'assistants',
  'app_settings',
];

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS countries (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  code      TEXT    NOT NULL,
  continent TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS leagues (
  id               INTEGER PRIMARY KEY,
  name             TEXT    NOT NULL,
  country_id       INTEGER NOT NULL REFERENCES countries(id),
  division_level   INTEGER NOT NULL,
  num_teams        INTEGER NOT NULL,
  promotion_spots  INTEGER NOT NULL,
  relegation_spots INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clubs (
  id                  INTEGER PRIMARY KEY,
  save_id             INTEGER NOT NULL REFERENCES save_games(id),
  name                TEXT    NOT NULL,
  short_name          TEXT    NOT NULL,
  country_id          INTEGER NOT NULL REFERENCES countries(id),
  league_id           INTEGER NOT NULL REFERENCES leagues(id),
  reputation          INTEGER NOT NULL CHECK (reputation BETWEEN 1 AND 100),
  budget              INTEGER NOT NULL,
  wage_budget         INTEGER NOT NULL,
  stadium_name        TEXT    NOT NULL,
  stadium_capacity    INTEGER NOT NULL,
  training_facilities INTEGER NOT NULL CHECK (training_facilities BETWEEN 1 AND 5),
  youth_academy       INTEGER NOT NULL CHECK (youth_academy BETWEEN 1 AND 5),
  medical_department  INTEGER NOT NULL CHECK (medical_department BETWEEN 1 AND 5),
  primary_color       TEXT    NOT NULL,
  secondary_color     TEXT    NOT NULL,
  training_focus      TEXT    NOT NULL DEFAULT 'balanced',
  debt_weeks          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS players (
  id                 INTEGER PRIMARY KEY,
  save_id            INTEGER NOT NULL REFERENCES save_games(id),
  name               TEXT    NOT NULL,
  nationality        TEXT    NOT NULL,
  age                INTEGER NOT NULL,
  position           TEXT    NOT NULL,
  secondary_position TEXT,
  club_id            INTEGER REFERENCES clubs(id),
  wage               INTEGER NOT NULL,
  contract_end       INTEGER NOT NULL,
  market_value       INTEGER NOT NULL,
  base_potential     INTEGER NOT NULL CHECK (base_potential BETWEEN 1 AND 100),
  effective_potential INTEGER NOT NULL CHECK (effective_potential BETWEEN 1 AND 100),
  morale             INTEGER NOT NULL CHECK (morale BETWEEN 1 AND 100),
  fitness            INTEGER NOT NULL CHECK (fitness BETWEEN 1 AND 100),
  injury_weeks_left  INTEGER NOT NULL DEFAULT 0,
  is_free_agent      INTEGER NOT NULL DEFAULT 0,
  preferred_foot     TEXT    NOT NULL DEFAULT 'right',
  weak_foot_ability  INTEGER NOT NULL DEFAULT 3 CHECK (weak_foot_ability BETWEEN 1 AND 5),
  is_transfer_listed INTEGER NOT NULL DEFAULT 0,
  is_loan_listed     INTEGER NOT NULL DEFAULT 0,
  asking_price       INTEGER,
  loan_wage_share    REAL,
  loan_wage          INTEGER,
  consecutive_low_morale_weeks INTEGER NOT NULL DEFAULT 0,
  will_retire_at_season_end    INTEGER NOT NULL DEFAULT 0,
  suspension_weeks_left        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_attributes (
  player_id   INTEGER PRIMARY KEY REFERENCES players(id),
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  finishing   INTEGER NOT NULL,
  passing     INTEGER NOT NULL,
  crossing    INTEGER NOT NULL,
  dribbling   INTEGER NOT NULL,
  heading     INTEGER NOT NULL,
  long_shots  INTEGER NOT NULL,
  free_kicks  INTEGER NOT NULL,
  vision      INTEGER NOT NULL,
  composure   INTEGER NOT NULL,
  decisions   INTEGER NOT NULL,
  positioning INTEGER NOT NULL,
  aggression  INTEGER NOT NULL,
  leadership  INTEGER NOT NULL,
  pace        INTEGER NOT NULL,
  stamina     INTEGER NOT NULL,
  strength    INTEGER NOT NULL,
  agility     INTEGER NOT NULL,
  jumping     INTEGER NOT NULL,
  finishing_progress   REAL NOT NULL DEFAULT 0,
  passing_progress     REAL NOT NULL DEFAULT 0,
  crossing_progress    REAL NOT NULL DEFAULT 0,
  dribbling_progress   REAL NOT NULL DEFAULT 0,
  heading_progress     REAL NOT NULL DEFAULT 0,
  long_shots_progress  REAL NOT NULL DEFAULT 0,
  free_kicks_progress  REAL NOT NULL DEFAULT 0,
  vision_progress      REAL NOT NULL DEFAULT 0,
  composure_progress   REAL NOT NULL DEFAULT 0,
  decisions_progress   REAL NOT NULL DEFAULT 0,
  positioning_progress REAL NOT NULL DEFAULT 0,
  aggression_progress  REAL NOT NULL DEFAULT 0,
  leadership_progress  REAL NOT NULL DEFAULT 0,
  pace_progress        REAL NOT NULL DEFAULT 0,
  stamina_progress     REAL NOT NULL DEFAULT 0,
  strength_progress    REAL NOT NULL DEFAULT 0,
  agility_progress     REAL NOT NULL DEFAULT 0,
  jumping_progress     REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_stats (
  player_id      INTEGER NOT NULL REFERENCES players(id),
  save_id        INTEGER NOT NULL REFERENCES save_games(id),
  season         INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  appearances    INTEGER NOT NULL DEFAULT 0,
  goals          INTEGER NOT NULL DEFAULT 0,
  assists        INTEGER NOT NULL DEFAULT 0,
  yellow_cards   INTEGER NOT NULL DEFAULT 0,
  red_cards      INTEGER NOT NULL DEFAULT 0,
  avg_rating     REAL    NOT NULL DEFAULT 0,
  minutes_played INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, season, competition_id)
);

CREATE TABLE IF NOT EXISTS staff (
  id           INTEGER PRIMARY KEY,
  save_id      INTEGER NOT NULL REFERENCES save_games(id),
  name         TEXT    NOT NULL,
  role         TEXT    NOT NULL,
  club_id      INTEGER REFERENCES clubs(id),
  ability      INTEGER NOT NULL CHECK (ability BETWEEN 1 AND 20),
  wage         INTEGER NOT NULL,
  contract_end INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS club_finances (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  club_id     INTEGER NOT NULL REFERENCES clubs(id),
  season      INTEGER NOT NULL,
  week        INTEGER NOT NULL,
  type        TEXT    NOT NULL,
  amount      INTEGER NOT NULL,
  description TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS competitions (
  id        INTEGER PRIMARY KEY,
  save_id   INTEGER NOT NULL REFERENCES save_games(id),
  name      TEXT    NOT NULL,
  type      TEXT    NOT NULL,
  format    TEXT    NOT NULL,
  season    INTEGER NOT NULL,
  league_id INTEGER REFERENCES leagues(id)
);

CREATE TABLE IF NOT EXISTS competition_entries (
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  save_id        INTEGER NOT NULL REFERENCES save_games(id),
  club_id        INTEGER NOT NULL REFERENCES clubs(id),
  group_name     TEXT,
  seed           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (competition_id, club_id)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id            INTEGER PRIMARY KEY,
  save_id       INTEGER NOT NULL REFERENCES save_games(id),
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  season        INTEGER NOT NULL,
  week          INTEGER NOT NULL,
  round         TEXT,
  home_club_id  INTEGER NOT NULL REFERENCES clubs(id),
  away_club_id  INTEGER NOT NULL REFERENCES clubs(id),
  home_goals    INTEGER,
  away_goals    INTEGER,
  played        INTEGER NOT NULL DEFAULT 0,
  attendance    INTEGER
);

CREATE TABLE IF NOT EXISTS match_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id          INTEGER NOT NULL REFERENCES fixtures(id),
  minute              INTEGER NOT NULL,
  type                TEXT    NOT NULL,
  player_id           INTEGER NOT NULL REFERENCES players(id),
  secondary_player_id INTEGER REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS transfers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id      INTEGER NOT NULL REFERENCES save_games(id),
  player_id    INTEGER NOT NULL REFERENCES players(id),
  season       INTEGER NOT NULL,
  from_club_id INTEGER REFERENCES clubs(id),
  to_club_id   INTEGER REFERENCES clubs(id),
  fee          INTEGER NOT NULL,
  wage_offered INTEGER NOT NULL,
  type         TEXT    NOT NULL,
  loan_end     INTEGER
);

CREATE TABLE IF NOT EXISTS transfer_offers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         INTEGER NOT NULL REFERENCES save_games(id),
  player_id       INTEGER NOT NULL REFERENCES players(id),
  offering_club_id INTEGER NOT NULL REFERENCES clubs(id),
  selling_club_id INTEGER NOT NULL REFERENCES clubs(id),
  fee_offered     INTEGER NOT NULL,
  wage_offered    INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending',
  response_week   INTEGER,
  offer_type      TEXT    NOT NULL DEFAULT 'transfer',
  loan_end        INTEGER,
  created_week    INTEGER,
  created_season  INTEGER,
  round_count     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transfer_blocks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id           INTEGER NOT NULL REFERENCES save_games(id),
  player_id         INTEGER NOT NULL REFERENCES players(id),
  offering_club_id  INTEGER NOT NULL REFERENCES clubs(id),
  blocked_until_season INTEGER NOT NULL,
  blocked_until_week   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tactics (
  id            INTEGER PRIMARY KEY,
  save_id       INTEGER NOT NULL REFERENCES save_games(id),
  club_id       INTEGER NOT NULL REFERENCES clubs(id),
  name          TEXT    NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 0,
  formation     TEXT    NOT NULL DEFAULT '4-4-2',
  mentality     TEXT    NOT NULL DEFAULT 'balanced',
  pressing      TEXT    NOT NULL DEFAULT 'medium',
  passing_style TEXT    NOT NULL DEFAULT 'mixed',
  tempo         TEXT    NOT NULL DEFAULT 'normal',
  width         TEXT    NOT NULL DEFAULT 'normal',
  attack_focus  TEXT    NOT NULL DEFAULT 'balanced',
  sub_strategy  TEXT    NOT NULL DEFAULT 'balanced'
);

CREATE TABLE IF NOT EXISTS tactic_positions (
  tactic_id     INTEGER NOT NULL REFERENCES tactics(id),
  slot          INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 11),
  player_id     INTEGER REFERENCES players(id),
  position_role TEXT    NOT NULL,
  instructions  TEXT    NOT NULL DEFAULT '{}',
  PRIMARY KEY (tactic_id, slot)
);

CREATE TABLE IF NOT EXISTS tactic_lineup (
  tactic_id  INTEGER NOT NULL REFERENCES tactics(id),
  slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 0 AND 18),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  PRIMARY KEY (tactic_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_tactic_lineup_tactic ON tactic_lineup(tactic_id);

CREATE TABLE IF NOT EXISTS save_games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  current_season  INTEGER NOT NULL DEFAULT 1,
  current_week    INTEGER NOT NULL DEFAULT 1,
  player_club_id  INTEGER NOT NULL REFERENCES clubs(id),
  difficulty      TEXT    NOT NULL DEFAULT 'normal',
  board_trust     INTEGER NOT NULL DEFAULT 50,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS season_competition_results (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id           INTEGER NOT NULL REFERENCES save_games(id),
  season            INTEGER NOT NULL,
  competition_id    INTEGER NOT NULL REFERENCES competitions(id),
  champion_club_id  INTEGER NOT NULL REFERENCES clubs(id),
  runner_up_club_id INTEGER REFERENCES clubs(id),
  UNIQUE(save_id, season, competition_id)
);

CREATE TABLE IF NOT EXISTS season_relegated (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id        INTEGER NOT NULL REFERENCES save_games(id),
  season         INTEGER NOT NULL,
  league_id      INTEGER NOT NULL REFERENCES leagues(id),
  club_id        INTEGER NOT NULL REFERENCES clubs(id),
  final_position INTEGER NOT NULL,
  UNIQUE(save_id, season, league_id, club_id)
);

CREATE TABLE IF NOT EXISTS season_promoted (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id        INTEGER NOT NULL REFERENCES save_games(id),
  season         INTEGER NOT NULL,
  league_id      INTEGER NOT NULL REFERENCES leagues(id),
  club_id        INTEGER NOT NULL REFERENCES clubs(id),
  final_position INTEGER NOT NULL,
  UNIQUE(save_id, season, league_id, club_id)
);

CREATE TABLE IF NOT EXISTS season_awards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id        INTEGER NOT NULL REFERENCES save_games(id),
  season         INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  award_type     TEXT    NOT NULL CHECK(award_type IN ('top_scorer','top_assister','mvp','breakthrough')),
  rank           INTEGER NOT NULL DEFAULT 1,
  player_id      INTEGER NOT NULL REFERENCES players(id),
  club_id        INTEGER NOT NULL REFERENCES clubs(id),
  value          REAL    NOT NULL,
  UNIQUE(save_id, season, competition_id, award_type, rank)
);

CREATE TABLE IF NOT EXISTS season_player_titles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id        INTEGER NOT NULL REFERENCES save_games(id),
  season         INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  club_id        INTEGER NOT NULL REFERENCES clubs(id),
  player_id      INTEGER NOT NULL REFERENCES players(id),
  UNIQUE(save_id, season, competition_id, player_id)
);

CREATE TABLE IF NOT EXISTS club_reputation_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id    INTEGER NOT NULL REFERENCES save_games(id),
  club_id    INTEGER NOT NULL REFERENCES clubs(id),
  season     INTEGER NOT NULL,
  reputation INTEGER NOT NULL CHECK (reputation BETWEEN 1 AND 100),
  delta      INTEGER NOT NULL,
  UNIQUE(save_id, club_id, season)
);

CREATE TABLE IF NOT EXISTS board_objectives (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  club_id     INTEGER NOT NULL REFERENCES clubs(id),
  season      INTEGER NOT NULL,
  type        TEXT    NOT NULL,
  target      INTEGER,
  description TEXT    NOT NULL,
  UNIQUE(save_id, club_id, season)
);

CREATE TABLE IF NOT EXISTS board_trust_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id    INTEGER NOT NULL REFERENCES save_games(id),
  club_id    INTEGER NOT NULL REFERENCES clubs(id),
  season     INTEGER NOT NULL,
  trust      INTEGER NOT NULL CHECK (trust BETWEEN 0 AND 100),
  outcome    TEXT    NOT NULL,
  UNIQUE(save_id, club_id, season)
);

CREATE TABLE IF NOT EXISTS assistants (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id                 INTEGER NOT NULL REFERENCES clubs(id),
  save_id                 INTEGER NOT NULL REFERENCES save_games(id),
  role                    TEXT    NOT NULL CHECK(role IN ('squad','financial','youth')),
  name                    TEXT    NOT NULL,
  age                     INTEGER NOT NULL,
  archetype               TEXT    NOT NULL,
  seasons_at_club         INTEGER NOT NULL DEFAULT 0,
  retirement_age          INTEGER NOT NULL,
  wage_per_month          INTEGER NOT NULL,
  will_retire_next_season INTEGER NOT NULL DEFAULT 0,
  UNIQUE(save_id, role)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_awards_player        ON season_awards(player_id);
CREATE INDEX IF NOT EXISTS idx_awards_season_comp   ON season_awards(season, competition_id);
CREATE INDEX IF NOT EXISTS idx_results_season       ON season_competition_results(season);
CREATE INDEX IF NOT EXISTS idx_relegated_season     ON season_relegated(season);
CREATE INDEX IF NOT EXISTS idx_promoted_season      ON season_promoted(save_id, season);
CREATE INDEX IF NOT EXISTS idx_player_titles_player ON season_player_titles(player_id);
CREATE INDEX IF NOT EXISTS idx_assistants_save      ON assistants(save_id);
CREATE INDEX IF NOT EXISTS idx_assistants_club      ON assistants(club_id);

CREATE INDEX IF NOT EXISTS idx_players_club           ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_season_week   ON fixtures(season, week);
CREATE INDEX IF NOT EXISTS idx_fixtures_home          ON fixtures(home_club_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_away          ON fixtures(away_club_id);
CREATE INDEX IF NOT EXISTS idx_finances_club_season   ON club_finances(club_id, season);
CREATE INDEX IF NOT EXISTS idx_match_events_fixture   ON match_events(fixture_id);
CREATE INDEX IF NOT EXISTS idx_comp_entries_club      ON competition_entries(club_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_season    ON player_stats(season, competition_id);
CREATE INDEX IF NOT EXISTS idx_transfer_offers_status ON transfer_offers(status);
CREATE INDEX IF NOT EXISTS idx_transfer_offers_club   ON transfer_offers(offering_club_id);
`;

// Composite save_id indexes are created AFTER the save_id migration (database-store),
// because on a legacy DB the columns don't exist yet when SCHEMA_SQL runs.
export const SAVE_ID_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_players_save_club         ON players(save_id, club_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_save_season_week ON fixtures(save_id, season, week);
CREATE INDEX IF NOT EXISTS idx_fixtures_save_comp        ON fixtures(save_id, competition_id);
CREATE INDEX IF NOT EXISTS idx_finances_save_club        ON club_finances(save_id, club_id);
CREATE INDEX IF NOT EXISTS idx_clubs_save_league         ON clubs(save_id, league_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_save_comp    ON player_stats(save_id, season, competition_id);
CREATE INDEX IF NOT EXISTS idx_tactics_save_club         ON tactics(save_id, club_id);
`;

export interface DbExec {
  exec(sql: string): void;
}

export function createAllTables(db: DbExec): void {
  db.exec(SCHEMA_SQL);
}
