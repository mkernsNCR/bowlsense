import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import worker from "../dist/server/index.js";

const ALLOWED_EMAIL = "owner@example.com";

const packagedMigration = await readFile(
  new URL("../dist/.openai/drizzle/0000_bowlsense.sql", import.meta.url),
  "utf8",
);
const packagedTournamentActiveMigration = await readFile(
  new URL("../dist/.openai/drizzle/0001_tournament_active.sql", import.meta.url),
  "utf8",
);
const packagedBallIndexesMigration = await readFile(
  new URL("../dist/.openai/drizzle/0002_ball_indexes.sql", import.meta.url),
  "utf8",
);
const packagedLeagueRetryMigration = await readFile(
  new URL("../dist/.openai/drizzle/0003_league_retry_idempotency.sql", import.meta.url),
  "utf8",
);
assert.match(packagedMigration, /CREATE TABLE IF NOT EXISTS games/);
assert.match(packagedMigration, /CREATE TABLE IF NOT EXISTS tournaments[\s\S]*active INTEGER DEFAULT 1/);
assert.match(packagedTournamentActiveMigration, /Compatibility marker/);
assert.doesNotMatch(packagedTournamentActiveMigration, /ALTER TABLE/);
assert.match(packagedBallIndexesMigration, /CREATE INDEX IF NOT EXISTS games_ball_idx/);
assert.match(packagedLeagueRetryMigration, /DELETE FROM league_games/);
assert.match(packagedLeagueRetryMigration, /CREATE UNIQUE INDEX IF NOT EXISTS league_weeks_league_number_unique/);
assert.match(packagedLeagueRetryMigration, /CREATE UNIQUE INDEX IF NOT EXISTS league_games_week_number_unique/);

class D1Statement {
  constructor(database, sql, values = [], onBind = undefined) {
    this.database = database;
    this.sql = sql;
    this.values = values;
    this.onBind = onBind;
  }

  bind(...values) {
    this.onBind?.(this.sql, values);
    return new D1Statement(this.database, this.sql, values, this.onBind);
  }

  async all() {
    const statement = this.database.prepare(this.sql);
    return { results: statement.all(...this.values) };
  }

  async first() {
    const statement = this.database.prepare(this.sql);
    return statement.get(...this.values) ?? null;
  }

  async run() {
    const statement = this.database.prepare(this.sql);
    const result = statement.run(...this.values);
    return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } };
  }
}

class D1Mock {
  constructor(database) {
    this.database = database;
    this.batchSizes = [];
    this.batchSql = [];
    this.boundStatements = [];
  }
  prepare(sql) {
    return new D1Statement(this.database, sql, [], (boundSql, values) => {
      this.boundStatements.push({ sql: boundSql, values });
    });
  }
  async batch(statements) {
    this.batchSizes.push(statements.length);
    this.batchSql.push(statements.map((statement) => statement.sql));
    assert.ok(statements.length <= 100, `D1 batch exceeded the 100-statement budget: ${statements.length}`);
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

const database = new DatabaseSync(":memory:");
database.exec(`${packagedMigration}\n${packagedTournamentActiveMigration}\n${packagedBallIndexesMigration}\n${packagedLeagueRetryMigration}`);
database.exec("PRAGMA foreign_keys = ON");
assert.ok(database.prepare("PRAGMA index_list(league_weeks)").all().some((index) => index.name === "league_weeks_league_number_unique" && index.unique === 1));
assert.ok(database.prepare("PRAGMA index_list(league_games)").all().some((index) => index.name === "league_games_week_number_unique" && index.unique === 1));
const indexHtml = `<!doctype html><html><head><title>BowlSense</title><meta name="description" content="generic"><meta property="og:title" content="generic"><meta property="og:description" content="generic"><meta property="og:image" content="generic"><meta name="twitter:title" content="generic"><meta name="twitter:description" content="generic"><meta name="twitter:image" content="generic"></head><body><div id="root"></div></body></html>`;
const assetRequests = [];
const env = {
  DB: new D1Mock(database),
  ASSETS: {
    fetch: async (request) => {
      assetRequests.push(request);
      return new URL(request.url).pathname === "/index.html"
        ? new Response(indexHtml, {
            headers: {
              "content-type": "text/html",
              "content-length": String(Buffer.byteLength(indexHtml)),
              etag: '"static-index"',
              "last-modified": "Mon, 27 Jul 2026 12:00:00 GMT",
            },
          })
        : new Response("not found", { status: 404 });
    },
  },
  BOWLSENSE_AUTH_MODE: "sites-private",
  BOWLSENSE_ALLOWED_EMAILS: ALLOWED_EMAIL,
  BOWLSENSE_PUBLIC_PROFILE_NAME: "Matt Kerns",
  BOWLSENSE_TIME_ZONE: "America/New_York",
};

const legacyMigrationDatabase = new DatabaseSync(":memory:");
legacyMigrationDatabase.exec(packagedMigration);
legacyMigrationDatabase.exec(`
  INSERT INTO leagues (id, name) VALUES (1, 'Migration Retry League');
  INSERT INTO league_weeks (id, league_id, week_number, date) VALUES
    (1, 1, 1, '2026-07-01'),
    (2, 1, 1, '2026-07-02');
  INSERT INTO league_games (id, week_id, game_number, score) VALUES
    (999, 1, 1, 170),
    (2, 2, 1, 180),
    (3, 1, 2, 190);
`);
legacyMigrationDatabase.exec(packagedLeagueRetryMigration);
assert.equal(legacyMigrationDatabase.prepare("SELECT COUNT(*) AS count FROM league_weeks WHERE league_id = 1 AND week_number = 1").get().count, 1);
assert.deepEqual(legacyMigrationDatabase.prepare("SELECT week_id, game_number, score FROM league_games ORDER BY game_number").all().map((row) => ({ ...row })), [
  { week_id: 2, game_number: 1, score: 180 },
  { week_id: 2, game_number: 2, score: 190 },
]);
assert.ok(legacyMigrationDatabase.prepare("PRAGMA index_list(league_weeks)").all().some((index) => index.name === "league_weeks_league_number_unique" && index.unique === 1));
assert.ok(legacyMigrationDatabase.prepare("PRAGMA index_list(league_games)").all().some((index) => index.name === "league_games_week_number_unique" && index.unique === 1));

const legacySchemaDatabase = new DatabaseSync(":memory:");
const legacySchemaMigration = packagedMigration.replace(
  /(CREATE TABLE IF NOT EXISTS tournaments \([\s\S]*?  notes TEXT,\n)  active INTEGER DEFAULT 1,\n/,
  "$1",
);
assert.doesNotMatch(legacySchemaMigration, /CREATE TABLE IF NOT EXISTS tournaments \([\s\S]*?active INTEGER/);
legacySchemaDatabase.exec(legacySchemaMigration);
legacySchemaDatabase.exec(`
  INSERT INTO leagues (id, name) VALUES (1, 'Legacy Retry League');
  INSERT INTO league_weeks (id, league_id, week_number, date) VALUES
    (1, 1, 1, '2026-07-01'),
    (2, 1, 1, '2026-07-02');
  INSERT INTO league_games (id, week_id, game_number, score) VALUES
    (1, 1, 1, 170),
    (2, 2, 1, 180),
    (3, 1, 2, 190);
`);
assert.equal(legacySchemaDatabase.prepare("PRAGMA table_info(tournaments)").all().some((column) => column.name === "active"), false);
const legacySchemaEnv = { ...env, DB: new D1Mock(legacySchemaDatabase) };
const legacySchemaResponse = await worker.fetch(new Request("https://bowlsense.test/api/tournaments", {
  headers: { "oai-authenticated-user-email": ALLOWED_EMAIL },
}), legacySchemaEnv);
assert.equal(legacySchemaResponse.status, 200);
assert.ok(legacySchemaDatabase.prepare("PRAGMA table_info(tournaments)").all().some((column) => column.name === "active"));
assert.equal(legacySchemaDatabase.prepare("SELECT COUNT(*) AS count FROM league_weeks WHERE league_id = 1 AND week_number = 1").get().count, 1);
assert.deepEqual(legacySchemaDatabase.prepare("SELECT week_id, game_number, score FROM league_games ORDER BY game_number").all().map((row) => ({ ...row })), [
  { week_id: 2, game_number: 1, score: 180 },
  { week_id: 2, game_number: 2, score: 190 },
]);
assert.ok(legacySchemaDatabase.prepare("PRAGMA index_list(league_weeks)").all().some((index) => index.name === "league_weeks_league_number_unique" && index.unique === 1));
assert.ok(legacySchemaDatabase.prepare("PRAGMA index_list(league_games)").all().some((index) => index.name === "league_games_week_number_unique" && index.unique === 1));

async function request(path, init) {
  const headers = new Headers(init?.headers);
  headers.set("oai-authenticated-user-email", ALLOWED_EMAIL);
  return worker.fetch(new Request(`https://bowlsense.test${path}`, { ...init, headers }), env);
}

async function publicRequest(path, init) {
  return worker.fetch(new Request(`https://bowlsense.test${path}`, init), env);
}

const exportPath = process.argv[2];
const backup = exportPath
  ? JSON.parse(await readFile(exportPath, "utf8"))
  : {
      sessions: [{ id: 1, date: "2026-07-20", location: "Test Center", notes: "private session note" }],
      games: [{ id: 1, sessionId: 1, gameNumber: 1, score: 200, strikes: 5, spares: 3, ballId: 1, frameData: JSON.stringify({ frames: [{ isSpare: true }] }), pinLeaves: JSON.stringify([[1,2,3,4,5,6,7,8,9], [10]]) }],
      balls: [{ id: 1, name: "Test Ball", brand: "BowlSense" }],
      leagues: [{ id: 1, name: "Test League", location: "Test Center", notes: "private league note" }],
      leagueWeeks: [{ id: 1, leagueId: 1, weekNumber: 1, date: "2026-07-20", opponent: "Lane Kings", gamesWon: 2, gamesLost: 1 }],
      leagueGames: [{ id: 1, weekId: 1, gameNumber: 1, score: 200, ballId: 1 }],
      tournaments: [{ id: 1, name: "Test Open", location: "Test Center", date: "2026-07-20", notes: "private tournament note" }],
      tournamentGames: [{ id: 1, tournamentId: 1, gameNumber: 1, score: 200, ballId: 1 }],
      arsenals: [{ id: 1, name: "Test Bag", maxSize: 3 }],
      arsenalBalls: [{ id: 1, arsenalId: 1, ballId: 1, role: "Benchmark", slotOrder: 1 }],
    };

let anonymous = await publicRequest("/api/leagues");
assert.equal(anonymous.status, 401);

const failClosedEnv = { ...env, BOWLSENSE_ALLOWED_EMAILS: undefined };
let failClosed = await worker.fetch(new Request("https://bowlsense.test/api/leagues", { headers: { "oai-authenticated-user-email": ALLOWED_EMAIL } }), failClosedEnv);
assert.equal(failClosed.status, 401);
const wrongAuthModeEnv = { ...env, BOWLSENSE_AUTH_MODE: "public" };
failClosed = await worker.fetch(new Request("https://bowlsense.test/api/leagues", { headers: { "oai-authenticated-user-email": ALLOWED_EMAIL } }), wrongAuthModeEnv);
assert.equal(failClosed.status, 401);

let response = await request("/api/restore", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(backup),
});
assert.equal(response.status, 200);
assert.ok(env.DB.batchSizes[0] <= 50, "restore must fit the D1 request budget");

response = await request("/api/data-health");
const health = await response.json();
const counts = Object.fromEntries(health.tableCounts.map((entry) => [entry.table, entry.count]));
assert.equal(counts.sessions, backup.sessions.length);
assert.equal(counts.games, backup.games.length);
assert.equal(counts.balls, backup.balls.length);
assert.equal(counts.leagues, backup.leagues.length);
assert.equal(counts.league_weeks, backup.leagueWeeks.length);
assert.equal(counts.league_games, backup.leagueGames.length);
assert.equal(counts.tournaments, backup.tournaments.length);
assert.equal(counts.tournament_games, backup.tournamentGames.length);
assert.equal(counts.arsenals, backup.arsenals.length);
assert.equal(counts.arsenal_balls, backup.arsenalBalls.length);
assert.equal(health.backupHealth.hasRecentBackup, false);

response = await request('/api/backups');
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { backupBackend: 'sites-managed', backups: [], latestMtime: null, backupCount: 0, cloudRemote: null });
response = await request('/api/backups', { method: 'POST' });
assert.equal(response.status, 405);

database.exec(`
  INSERT INTO balls (id, name) VALUES (900, 'Disposable Ball');
  INSERT INTO sessions (id, date) VALUES (900, '2026-08-01');
  INSERT INTO games (session_id, game_number, ball_id) VALUES (900, 1, 900);
  INSERT INTO leagues (id, name) VALUES (900, 'Disposable League');
  INSERT INTO league_weeks (id, league_id, week_number, date) VALUES (900, 900, 1, '2026-08-01');
  INSERT INTO league_games (week_id, game_number, ball_id) VALUES (900, 1, 900);
  INSERT INTO tournaments (id, name) VALUES (900, 'Disposable Tournament');
  INSERT INTO tournament_games (tournament_id, game_number, ball_id) VALUES (900, 1, 900);
  INSERT INTO arsenals (id, name) VALUES (900, 'Disposable Bag');
  INSERT INTO arsenal_balls (arsenal_id, ball_id) VALUES (900, 900);
`);
response = await request('/api/balls/900', { method: 'DELETE' });
assert.equal(response.status, 204);
assert.equal(database.prepare('SELECT ball_id FROM games WHERE session_id = 900').get().ball_id, null);
assert.equal(database.prepare('SELECT ball_id FROM league_games WHERE week_id = 900').get().ball_id, null);
assert.equal(database.prepare('SELECT ball_id FROM tournament_games WHERE tournament_id = 900').get().ball_id, null);
assert.equal(database.prepare('SELECT COUNT(*) AS count FROM arsenal_balls WHERE ball_id = 900').get().count, 0);
database.exec(`
  DELETE FROM games WHERE session_id = 900;
  DELETE FROM sessions WHERE id = 900;
  DELETE FROM league_games WHERE week_id = 900;
  DELETE FROM league_weeks WHERE id = 900;
  DELETE FROM leagues WHERE id = 900;
  DELETE FROM tournament_games WHERE tournament_id = 900;
  DELETE FROM tournaments WHERE id = 900;
  DELETE FROM arsenals WHERE id = 900;
`);

response = await request("/api/leagues/1/weeks", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ weekNumber: 99, date: "2026-08-01", opponent: "First attempt", gamesTied: 1 }),
});
assert.equal(response.status, 201);
const firstRetryWeek = await response.json();
response = await request("/api/leagues/1/weeks", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ weekNumber: 99, date: "2026-08-01", opponent: "Retry payload", gamesTied: 2 }),
});
assert.equal(response.status, 201);
const retriedWeek = await response.json();
assert.equal(retriedWeek.id, firstRetryWeek.id);
assert.deepEqual({ ...database.prepare("SELECT COUNT(*) AS count, MAX(opponent) AS opponent, MAX(games_tied) AS games_tied FROM league_weeks WHERE league_id = 1 AND week_number = 99").get() }, {
  count: 1,
  opponent: "Retry payload",
  games_tied: 2,
});

response = await request(`/api/leagues/weeks/${firstRetryWeek.id}/games`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gameNumber: 1, score: 180, strikes: 4 }),
});
assert.equal(response.status, 201);
const firstRetryGame = await response.json();
response = await request(`/api/leagues/weeks/${firstRetryWeek.id}/games`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gameNumber: 1, score: 181, strikes: 5 }),
});
assert.equal(response.status, 201);
const retriedGame = await response.json();
assert.equal(retriedGame.id, firstRetryGame.id);
assert.deepEqual({ ...database.prepare("SELECT COUNT(*) AS count, MAX(score) AS score, MAX(strikes) AS strikes FROM league_games WHERE week_id = ? AND game_number = 1").get(firstRetryWeek.id) }, {
  count: 1,
  score: 181,
  strikes: 5,
});

response = await request("/api/restore", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
assert.equal(response.status, 422);
response = await request("/api/data-health");
assert.equal((await response.json()).tableCounts.find((entry) => entry.table === "sessions").count, backup.sessions.length);

response = await request("/api/sessions?sort=date&order=desc&page=1&limit=20");
assert.equal(response.status, 200);
const sessions = await response.json();
assert.equal(sessions.total, backup.sessions.length);
assert.equal(sessions.sessions.length, backup.sessions.length);

response = await request("/api/stats/full");
assert.equal(response.status, 200);
const stats = await response.json();
assert.equal(stats.overall.totalGames, backup.games.length);

response = await publicRequest("/api/stats");
assert.equal(response.status, 200);
const publicStats = await response.json();
assert.equal(publicStats.profileName, "Matt Kerns");
assert.ok(!Number.isNaN(Date.parse(publicStats.generatedAt)));

response = await publicRequest("/bowl");
assert.equal(response.status, 200);
assert.match(await response.text(), /Matt Kerns BowlSense/);

response = await request("/api/leagues");
assert.equal(response.status, 200);
assert.equal((await response.json()).length, backup.leagues.length);

if (backup.leagues.length > 0) {
  const leagueId = backup.leagues[0].id;
  response = await request(`/api/leagues/${leagueId}/archive`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).active, 0);
  response = await request(`/api/leagues/${leagueId}/unarchive`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).active, 1);
}
response = await request("/api/leagues/999999/archive", { method: "POST" });
assert.equal(response.status, 404);

if (backup.tournaments.length > 0) {
  const tournamentId = backup.tournaments[0].id;
  response = await request(`/api/tournaments/${tournamentId}/archive`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).active, 0);
  response = await request(`/api/tournaments/${tournamentId}/unarchive`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).active, 1);
}
response = await request("/api/tournaments/999999/unarchive", { method: "POST" });
assert.equal(response.status, 404);

if (backup.sessions.length > 0) {
  response = await publicRequest(`/api/sessions/${backup.sessions[0].id}/public`);
  assert.equal(response.status, 200);
  const publicSession = await response.json();
  assert.deepEqual(Object.keys(publicSession).sort(), ["games", "session", "summary"]);
  assert.equal("notes" in publicSession.session, false);

  response = await publicRequest(`/api/sessions/${backup.sessions[0].id}/og-image`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0, 8)], [137,80,78,71,13,10,26,10]);

  response = await publicRequest(`/sessions/${backup.sessions[0].id}/share`);
  assert.equal(response.status, 200);
  const shareHtml = await response.text();
  const escapedLocation = backup.sessions[0].location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(shareHtml, new RegExp(`${escapedLocation}.*averaging`, "i"));
  assert.match(shareHtml, new RegExp(`/api/sessions/${backup.sessions[0].id}/og-image`));

  database.prepare("UPDATE sessions SET location = ? WHERE id = ?").run("Dollar $& Lanes", backup.sessions[0].id);
  response = await publicRequest(`/sessions/${backup.sessions[0].id}/share`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Dollar \$&amp; Lanes/);
  database.prepare("UPDATE sessions SET location = ? WHERE id = ?").run(backup.sessions[0].location, backup.sessions[0].id);

  response = await publicRequest(`/sessions/${backup.sessions[0].id}/share/`, {
    headers: {
      "if-none-match": '"static-index"',
      "if-modified-since": "Mon, 27 Jul 2026 12:00:00 GMT",
    },
  });
  assert.equal(response.status, 200);
  assert.equal(assetRequests.at(-1).headers.get("if-none-match"), null);
  assert.equal(assetRequests.at(-1).headers.get("if-modified-since"), null);
  assert.equal(response.headers.get("etag"), null);
  assert.equal(response.headers.get("last-modified"), null);
  assert.equal(response.headers.get("content-length"), null);
}

response = await publicRequest("/sessions/999999/share");
assert.equal(response.status, 404);
assert.match(await response.text(), /<meta name="robots" content="noindex, nofollow"\s*\/?>/i);

response = await request("/api/analytics/pin-leaves");
assert.equal(response.status, 200);
const leaves = await response.json();
if (!exportPath) {
  assert.equal(leaves.totalFirstThrows, 1);
  assert.equal(leaves.leaves[0].pins, "10");
  assert.equal(leaves.leaves[0].conversions, 1);
  assert.equal(leaves.leaves[0].conversionRate, 100);
  assert.equal(leaves.byMonth[0].month, "2026-07");
}

response = await request("/api/sessions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ date: "2026-07-21", location: "Legacy Leave Test" }),
});
assert.equal(response.status, 201);
const legacyLeaveSession = await response.json();
response = await request("/api/games", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sessionId: legacyLeaveSession.id,
    gameNumber: 1,
    score: 180,
    pinLeaves: JSON.stringify([{ pins: [7], converted: true }, { pins: [10], converted: false }]),
  }),
});
assert.equal(response.status, 201);
response = await request("/api/analytics/pin-leaves");
assert.equal(response.status, 200);
const normalizedLegacyLeaves = await response.json();
assert.ok(normalizedLegacyLeaves.leaves.some((leave) => leave.pins === "7" && leave.conversions >= 1));

if (backup.leagues.length > 0) {
  response = await publicRequest(`/api/leagues/${backup.leagues[0].id}/share`);
  assert.equal(response.status, 200);
  const publicLeague = await response.json();
  assert.equal("notes" in publicLeague.league, false);
  assert.ok(Array.isArray(publicLeague.weeks));

  response = await publicRequest(`/api/leagues/${backup.leagues[0].id}/leaderboard`);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray((await response.json()).rankedOpponents));

  response = await publicRequest(`/api/leagues/${backup.leagues[0].id}/standings`);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray((await response.json()).weeks));

  if (backup.leagueWeeks.length > 0) {
    response = await publicRequest(`/api/leagues/${backup.leagues[0].id}/weeks/${backup.leagueWeeks[0].id}`);
    assert.equal(response.status, 200);
    const publicWeek = await response.json();
    assert.ok(Array.isArray(publicWeek.games));
    assert.ok(publicWeek.stats && typeof publicWeek.stats.series === "number");
  }
}

if (backup.tournaments.length > 0) {
  response = await publicRequest(`/api/tournaments/${backup.tournaments[0].id}/share`);
  assert.equal(response.status, 200);
  const publicTournament = await response.json();
  assert.equal("notes" in publicTournament.tournament, false);
  assert.ok(Array.isArray(publicTournament.games));

  response = await publicRequest(`/api/tournaments/${backup.tournaments[0].id}/standings`);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray((await response.json()).standings));
}

response = await request("/api/export");
assert.equal(response.status, 200);
assert.ok(Array.isArray((await response.json()).sessions));

response = await publicRequest("/api/sessions/999999/og-image");
assert.equal(response.status, 404);

response = await request("/api/games/999999");
assert.equal(response.status, 404);
response = await request("/api/balls/999999");
assert.equal(response.status, 404);
response = await request("/api/sessions/999999", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ location: "Nowhere" }) });
assert.equal(response.status, 404);
response = await request("/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: 1, gameNumber: 1, score: 301 }) });
assert.equal(response.status, 422);

response = await request("/api/leagues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Empty League" }) });
assert.equal(response.status, 201);
const emptyLeague = await response.json();
response = await publicRequest(`/api/leagues/${emptyLeague.id}/recap`);
assert.equal(response.status, 404);
response = await publicRequest(`/leagues/${emptyLeague.id}/recap/share`);
assert.equal(response.status, 404);
assert.match(await response.text(), /<meta name="robots" content="noindex, nofollow"\s*\/?>/i);
response = await request(`/api/leagues/${emptyLeague.id}`, { method: "DELETE" });
assert.equal(response.status, 204);
response = await request(`/api/leagues/${emptyLeague.id}`);
assert.equal(response.status, 200);
assert.equal((await response.json()).active, 0);

response = await request("/api/tournaments", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Missing Date Open" }),
});
assert.equal(response.status, 422);
response = await request("/api/tournaments", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Dated Open", date: "2026-08-01" }),
});
assert.equal(response.status, 201);
const datedTournament = await response.json();
response = await request(`/api/tournaments/${datedTournament.id}`, { method: "DELETE" });
assert.equal(response.status, 204);
response = await request(`/api/tournaments/${datedTournament.id}`);
assert.equal(response.status, 200);
assert.equal((await response.json()).active, 0);

response = await request("/api/arsenals");
assert.equal(response.status, 200);
const arsenalList = await response.json();
assert.equal(arsenalList.length, backup.arsenals.length);

if (backup.arsenals.length > 0) {
  const listedArsenal = arsenalList.find((arsenal) => arsenal.id === backup.arsenals[0].id);
  const expectedBallIds = backup.arsenalBalls
    .filter((entry) => entry.arsenalId === backup.arsenals[0].id)
    .sort((a, b) => a.slotOrder - b.slotOrder || a.id - b.id)
    .map((entry) => entry.ballId);
  assert.equal(listedArsenal.ballCount, expectedBallIds.length);
  assert.deepEqual(listedArsenal.ballIds, expectedBallIds);

  response = await request(`/api/arsenals/${backup.arsenals[0].id}`);
  assert.equal(response.status, 200);
  const arsenal = await response.json();
  assert.ok(Array.isArray(arsenal.balls));
  assert.ok(arsenal.stats && typeof arsenal.stats.gamesPlayed === "number");
  if (arsenal.balls.length > 0) assert.equal(typeof arsenal.balls[0].ball.name, "string");
}

response = await request("/api/sessions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ date: "2026-07-20", location: "Migration Test" }),
});
assert.equal(response.status, 201);
const createdSession = await response.json();

response = await request("/api/games", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ sessionId: createdSession.id, gameNumber: 1, score: 200, strikes: 5, spares: 3 }),
});
assert.equal(response.status, 201);

const perfectFrameData = JSON.stringify({
  rolls: Array(12).fill(10),
  frames: Array.from({ length: 10 }, (_, index) => ({
    ball1: 10,
    ball2: index === 9 ? 10 : null,
    ball3: index === 9 ? 10 : null,
    isStrike: true,
    isSpare: false,
    score: 30 * (index + 1),
    cumulativeScore: 30 * (index + 1),
    reviewLabel: `Perfect game frame ${index + 1} ${"x".repeat(48)}`,
  })),
  pinSelections: Array(12).fill([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
});
assert.ok(perfectFrameData.length > 500);
const perfectPinLeaves = JSON.stringify(Array(12).fill([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
response = await request("/api/games", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sessionId: createdSession.id,
    gameNumber: 2,
    score: 300,
    strikes: 12,
    spares: 0,
    frameData: perfectFrameData,
    pinLeaves: perfectPinLeaves,
  }),
});
assert.equal(response.status, 201);
const perfectGame = await response.json();

response = await request("/api/export");
assert.equal(response.status, 200);
const fullGameBackup = await response.json();
response = await request("/api/restore", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(fullGameBackup),
});
assert.equal(response.status, 200);
response = await request(`/api/games/${perfectGame.id}`);
assert.equal(response.status, 200);
const restoredPerfectGame = await response.json();
assert.equal(restoredPerfectGame.frameData, perfectFrameData);
assert.equal(restoredPerfectGame.pinLeaves, perfectPinLeaves);

response = await request(`/api/sessions/${createdSession.id}`);
assert.equal(response.status, 200);
assert.equal((await response.json()).games.length, 2);

response = await request(`/api/sessions/${createdSession.id}`, { method: "DELETE" });
assert.equal(response.status, 204);
response = await request(`/api/sessions/${createdSession.id}`, { method: "DELETE" });
assert.equal(response.status, 404);

let csvForm = new FormData();
csvForm.set("file", new File([`date,location,game_number,score,strikes,spares,splits\n2026-07-21,"Center, East",1,210,6,2,0\n2026-07-21,"Center, East",2,220,7,2,0\n`], "scores.csv", { type: "text/csv" }));
response = await request("/api/import/csv", { method: "POST", body: csvForm });
assert.equal(response.status, 200);
assert.deepEqual((await response.json()).imported, { sessions: 1, games: 2, balls: 0 });
assert.ok(env.DB.batchSql.at(-1).every((sql) => /json_each\(\?\)/.test(sql)), "CSV rows must use multi-row inserts");

response = await request("/api/data-health");
const sessionsBeforeInvalidCsv = (await response.json()).tableCounts.find((entry) => entry.table === "sessions").count;
csvForm = new FormData();
csvForm.set("file", new File([`date,location,score\n2026-07-22,Valid row,200\n2026-07-23,Invalid row,301\n`], "invalid.csv", { type: "text/csv" }));
response = await request("/api/import/csv", { method: "POST", body: csvForm });
assert.equal(response.status, 422);
response = await request("/api/data-health");
assert.equal((await response.json()).tableCounts.find((entry) => entry.table === "sessions").count, sessionsBeforeInvalidCsv);

const invalidTimeZoneEnv = { ...env, BOWLSENSE_TIME_ZONE: "Not/A_Real_Time_Zone" };
response = await worker.fetch(new Request("https://bowlsense.test/api/stats/weekly", {
  headers: { "oai-authenticated-user-email": ALLOWED_EMAIL },
}), invalidTimeZoneEnv);
assert.equal(response.status, 200);
const weeklyQuery = env.DB.boundStatements.findLast((statement) => statement.sql.includes("FROM games g JOIN sessions"));
assert.match(weeklyQuery.sql, /WHERE s\.date >= \?/);
assert.equal(weeklyQuery.values.length, 1);
assert.match(String(weeklyQuery.values[0]), /^\d{4}-\d{2}-\d{2}$/);

response = await request("/api/export");
const beforeLegacyRestore = await response.json();
const legacyTournamentId = Math.max(0, ...beforeLegacyRestore.tournaments.map((tournament) => Number(tournament.id))) + 1;
beforeLegacyRestore.tournaments.push({ id: legacyTournamentId, name: "Legacy Undated Open", date: null });
response = await request("/api/restore", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(beforeLegacyRestore),
});
assert.equal(response.status, 200);
response = await request(`/api/tournaments/${legacyTournamentId}`);
assert.equal(response.status, 200);
assert.equal((await response.json()).date, null);

response = await request("/api/export");
const beforeLargeRestore = await response.json();
const fiftyThousandRowBackup = Object.fromEntries(
  Object.keys(beforeLargeRestore)
    .filter((key) => key !== "exportedAt")
    .map((key) => [key, []]),
);
fiftyThousandRowBackup.sessions = Array.from({ length: 50_000 }, (_, index) => ({
  id: index + 1,
  date: "2026-07-28",
  location: `Budget ${index}`,
}));
assert.ok(Buffer.byteLength(JSON.stringify(fiftyThousandRowBackup)) < 5 * 1024 * 1024);
response = await request("/api/restore", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(fiftyThousandRowBackup),
});
assert.equal(response.status, 200);
assert.ok(env.DB.batchSizes.at(-1) <= 100, "50,000-row, 5 MiB-bounded restore must fit the D1 request budget");
response = await request("/api/data-health");
assert.equal((await response.json()).tableCounts.find((entry) => entry.table === "sessions").count, 50_000);
response = await request("/api/restore", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(beforeLargeRestore),
});
assert.equal(response.status, 200);

console.log(JSON.stringify({ ok: true, imported: counts, statsGames: stats.overall.totalGames }));
