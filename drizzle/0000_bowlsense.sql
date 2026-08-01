CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  location TEXT,
  lanes TEXT,
  notes TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  score INTEGER,
  strikes INTEGER,
  spares INTEGER,
  splits INTEGER,
  ball_id INTEGER,
  frame_data TEXT,
  pin_leaves TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS balls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT,
  color TEXT,
  notes TEXT,
  bowwwl_id TEXT,
  core_type TEXT,
  core_rg TEXT,
  core_diff TEXT,
  coverstock_name TEXT,
  coverstock_type TEXT,
  factory_finish TEXT,
  thumbnail_image TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  season TEXT,
  day_of_week TEXT,
  games_per_week INTEGER DEFAULT 3,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS league_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  date TEXT NOT NULL,
  opponent TEXT,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  games_tied INTEGER DEFAULT 0,
  notes TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS league_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL REFERENCES league_weeks(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  score INTEGER,
  strikes INTEGER,
  spares INTEGER,
  splits INTEGER,
  ball_id INTEGER,
  frame_data TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  date TEXT,
  end_date TEXT,
  format TEXT,
  entry_fee REAL,
  prize_fund REAL,
  placement INTEGER,
  notes TEXT,
  active INTEGER DEFAULT 1,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS tournament_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  score INTEGER,
  strikes INTEGER,
  spares INTEGER,
  splits INTEGER,
  ball_id INTEGER,
  squad TEXT,
  frame_data TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS arsenals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  use_case TEXT,
  max_size INTEGER DEFAULT 6,
  notes TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS arsenal_balls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arsenal_id INTEGER NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  ball_id INTEGER NOT NULL REFERENCES balls(id) ON DELETE CASCADE,
  role TEXT,
  slot_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS games_session_idx ON games(session_id);
CREATE INDEX IF NOT EXISTS league_weeks_league_idx ON league_weeks(league_id);
CREATE INDEX IF NOT EXISTS league_games_week_idx ON league_games(week_id);
CREATE INDEX IF NOT EXISTS tournament_games_tournament_idx ON tournament_games(tournament_id);
CREATE INDEX IF NOT EXISTS arsenal_balls_arsenal_idx ON arsenal_balls(arsenal_id);
