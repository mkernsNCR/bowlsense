import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import worker from "../dist/server/index.js";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
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
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
  async batch(statements) {
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
const indexHtml = `<!doctype html><html><head><title>BowlSense</title><meta name="description" content="generic"><meta property="og:title" content="generic"><meta property="og:description" content="generic"><meta property="og:image" content="generic"><meta name="twitter:title" content="generic"><meta name="twitter:description" content="generic"><meta name="twitter:image" content="generic"></head><body><div id="root"></div></body></html>`;
const env = {
  DB: new D1Mock(database),
  ASSETS: { fetch: async (request) => new URL(request.url).pathname === "/index.html" ? new Response(indexHtml, { headers: { "content-type": "text/html" } }) : new Response("not found", { status: 404 }) },
  BOWLSENSE_ALLOWED_EMAILS: "mkerns5@student.umgc.edu",
  BOWLSENSE_TIME_ZONE: "America/New_York",
};

async function request(path, init) {
  const headers = new Headers(init?.headers);
  headers.set("oai-authenticated-user-email", "mkerns5@student.umgc.edu");
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
      games: [{ id: 1, sessionId: 1, gameNumber: 1, score: 200, strikes: 5, spares: 3, frameData: JSON.stringify({ frames: [{ isSpare: true }] }), pinLeaves: JSON.stringify([[1,2,3,4,5,6,7,8,9], [10]]) }],
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
let failClosed = await worker.fetch(new Request("https://bowlsense.test/api/leagues", { headers: { "oai-authenticated-user-email": "mkerns5@student.umgc.edu" } }), failClosedEnv);
assert.equal(failClosed.status, 401);

let response = await request("/api/restore", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(backup),
});
assert.equal(response.status, 200);

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

response = await request("/api/leagues");
assert.equal(response.status, 200);
assert.equal((await response.json()).length, backup.leagues.length);

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
  assert.match(shareHtml, new RegExp(`${backup.sessions[0].location}.*averaging`, "i"));
  assert.match(shareHtml, new RegExp(`/api/sessions/${backup.sessions[0].id}/og-image`));
}

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

response = await request("/api/arsenals");
assert.equal(response.status, 200);
assert.equal((await response.json()).length, backup.arsenals.length);

if (backup.arsenals.length > 0) {
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

response = await request(`/api/sessions/${createdSession.id}`);
assert.equal(response.status, 200);
assert.equal((await response.json()).games.length, 1);

response = await request(`/api/sessions/${createdSession.id}`, { method: "DELETE" });
assert.equal(response.status, 204);

let csvForm = new FormData();
csvForm.set("file", new File([`date,location,game_number,score,strikes,spares,splits\n2026-07-21,"Center, East",1,210,6,2,0\n`], "scores.csv", { type: "text/csv" }));
response = await request("/api/import/csv", { method: "POST", body: csvForm });
assert.equal(response.status, 200);
assert.deepEqual((await response.json()).imported, { sessions: 1, games: 1, balls: 0 });

response = await request("/api/data-health");
const sessionsBeforeInvalidCsv = (await response.json()).tableCounts.find((entry) => entry.table === "sessions").count;
csvForm = new FormData();
csvForm.set("file", new File([`date,location,score\n2026-07-22,Valid row,200\n2026-07-23,Invalid row,301\n`], "invalid.csv", { type: "text/csv" }));
response = await request("/api/import/csv", { method: "POST", body: csvForm });
assert.equal(response.status, 422);
response = await request("/api/data-health");
assert.equal((await response.json()).tableCounts.find((entry) => entry.table === "sessions").count, sessionsBeforeInvalidCsv);

console.log(JSON.stringify({ ok: true, imported: counts, statsGames: stats.overall.totalGames }));
