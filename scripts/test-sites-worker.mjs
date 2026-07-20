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
database.exec(await readFile(new URL("../.openai/drizzle/0000_bowlsense.sql", import.meta.url), "utf8"));
const env = {
  DB: new D1Mock(database),
  ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
};

async function request(path, init) {
  return worker.fetch(new Request(`https://bowlsense.test${path}`, init), env);
}

const exportPath = process.argv[2];
if (!exportPath) throw new Error("Pass the BowlSense JSON export path");
const backup = JSON.parse(await readFile(exportPath, "utf8"));

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
assert.equal(counts.arsenals, backup.arsenals.length);

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

console.log(JSON.stringify({ ok: true, imported: counts, statsGames: stats.overall.totalGames }));
