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
  'tactics',
  'tactic_positions',
  'save_games',
];

const SCHEMA_SQL = `
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
  secondary_color     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id                 INTEGER PRIMARY KEY,
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
  is_free_agent      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_attributes (
  player_id   INTEGER PRIMARY KEY REFERENCES players(id),
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
  jumping     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_stats (
  player_id      INTEGER NOT NULL REFERENCES players(id),
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
  name         TEXT    NOT NULL,
  role         TEXT    NOT NULL,
  club_id      INTEGER REFERENCES clubs(id),
  ability      INTEGER NOT NULL CHECK (ability BETWEEN 1 AND 20),
  wage         INTEGER NOT NULL,
  contract_end INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS club_finances (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id     INTEGER NOT NULL REFERENCES clubs(id),
  season      INTEGER NOT NULL,
  week        INTEGER NOT NULL,
  type        TEXT    NOT NULL,
  amount      INTEGER NOT NULL,
  description TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS competitions (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  type      TEXT    NOT NULL,
  format    TEXT    NOT NULL,
  season    INTEGER NOT NULL,
  league_id INTEGER REFERENCES leagues(id)
);

CREATE TABLE IF NOT EXISTS competition_entries (
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  club_id        INTEGER NOT NULL REFERENCES clubs(id),
  group_name     TEXT,
  seed           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (competition_id, club_id)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id            INTEGER PRIMARY KEY,
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
  player_id       INTEGER NOT NULL REFERENCES players(id),
  offering_club_id INTEGER NOT NULL REFERENCES clubs(id),
  selling_club_id INTEGER NOT NULL REFERENCES clubs(id),
  fee_offered     INTEGER NOT NULL,
  wage_offered    INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending',
  response_week   INTEGER
);

CREATE TABLE IF NOT EXISTS tactics (
  id            INTEGER PRIMARY KEY,
  club_id       INTEGER NOT NULL REFERENCES clubs(id),
  name          TEXT    NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 0,
  formation     TEXT    NOT NULL DEFAULT '4-4-2',
  mentality     TEXT    NOT NULL DEFAULT 'balanced',
  pressing      TEXT    NOT NULL DEFAULT 'medium',
  passing_style TEXT    NOT NULL DEFAULT 'mixed',
  tempo         TEXT    NOT NULL DEFAULT 'normal',
  width         TEXT    NOT NULL DEFAULT 'normal'
);

CREATE TABLE IF NOT EXISTS tactic_positions (
  tactic_id     INTEGER NOT NULL REFERENCES tactics(id),
  slot          INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 11),
  player_id     INTEGER REFERENCES players(id),
  position_role TEXT    NOT NULL,
  instructions  TEXT    NOT NULL DEFAULT '{}',
  PRIMARY KEY (tactic_id, slot)
);

CREATE TABLE IF NOT EXISTS save_games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  current_season  INTEGER NOT NULL DEFAULT 1,
  current_week    INTEGER NOT NULL DEFAULT 1,
  player_club_id  INTEGER NOT NULL REFERENCES clubs(id),
  difficulty      TEXT    NOT NULL DEFAULT 'normal',
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);
`;

export interface DbExec {
  exec(sql: string): void;
}

export function createAllTables(db: DbExec): void {
  db.exec(SCHEMA_SQL);
}
