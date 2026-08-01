-- Collapse legacy retry duplicates before enforcing the natural identities used
-- by Log Week. The newest record wins, matching the latest retry payload.
-- RELEASE GATE: before applying this destructive reconciliation, download an
-- authenticated /api/export backup and review the duplicate preview queries in
-- docs/DEPLOYMENT.md. Abort when the counts are not understood.
DELETE FROM league_games
WHERE week_id IN (
  SELECT older.id
  FROM league_weeks AS older
  JOIN league_weeks AS newer
    ON newer.league_id = older.league_id
   AND newer.week_number = older.week_number
   AND newer.id > older.id
)
AND EXISTS (
  SELECT 1
  FROM league_games AS kept_game
  JOIN league_weeks AS kept_week ON kept_week.id = kept_game.week_id
  JOIN league_weeks AS older_week ON older_week.id = league_games.week_id
  WHERE kept_week.league_id = older_week.league_id
    AND kept_week.week_number = older_week.week_number
    AND kept_game.game_number = league_games.game_number
    AND kept_week.id > older_week.id
);

UPDATE league_games
SET week_id = (
  SELECT MAX(canonical.id)
  FROM league_weeks AS canonical
  JOIN league_weeks AS current ON current.id = league_games.week_id
  WHERE canonical.league_id = current.league_id
    AND canonical.week_number = current.week_number
)
WHERE week_id IN (
  SELECT older.id
  FROM league_weeks AS older
  JOIN league_weeks AS newer
    ON newer.league_id = older.league_id
   AND newer.week_number = older.week_number
   AND newer.id > older.id
);

DELETE FROM league_games
WHERE id NOT IN (
  SELECT MAX(id) FROM league_games GROUP BY week_id, game_number
);

DELETE FROM league_weeks
WHERE id NOT IN (
  SELECT MAX(id) FROM league_weeks GROUP BY league_id, week_number
);

CREATE UNIQUE INDEX IF NOT EXISTS league_weeks_league_number_unique
  ON league_weeks(league_id, week_number);
CREATE UNIQUE INDEX IF NOT EXISTS league_games_week_number_unique
  ON league_games(week_id, game_number);
