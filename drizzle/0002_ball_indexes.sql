CREATE INDEX IF NOT EXISTS games_ball_idx ON games(ball_id);
CREATE INDEX IF NOT EXISTS league_games_ball_idx ON league_games(ball_id);
CREATE INDEX IF NOT EXISTS tournament_games_ball_idx ON tournament_games(ball_id);
