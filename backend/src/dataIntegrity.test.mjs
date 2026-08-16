import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTestApp } from './test-app.mjs'

test('session routes validate creates, preserve partial updates, and report missing rows', async (t) => {
  const { fastify, sqlite } = await buildTestApp(t)
  for (const url of ['/sessions', '/api/sessions']) {
    assert.equal((await fastify.inject({ method: 'POST', url, payload: { location: 'Home' } })).statusCode, 400)
    assert.equal((await fastify.inject({ method: 'POST', url, payload: { date: '2026-08-01', surprise: true } })).statusCode, 400)
  }
  const created = await fastify.inject({ method: 'POST', url: '/api/sessions', payload: { date: '2026-08-01', location: 'Home', lanes: '1-2', notes: 'Keep me' } })
  assert.equal(created.statusCode, 200, created.body)
  const id = created.json().id
  assert.equal((await fastify.inject({ method: 'PUT', url: `/api/sessions/${id}`, payload: { location: 'Away' } })).statusCode, 200)
  assert.deepEqual(sqlite.prepare('SELECT date, location, lanes, notes FROM sessions WHERE id = ?').get(id), { date: '2026-08-01', location: 'Away', lanes: '1-2', notes: 'Keep me' })
  assert.equal((await fastify.inject({ method: 'PUT', url: `/sessions/${id}`, payload: { notes: null } })).statusCode, 200)
  assert.equal(sqlite.prepare('SELECT notes FROM sessions WHERE id = ?').get(id).notes, null)
  for (const url of ['/sessions/99999', '/api/sessions/99999']) assert.equal((await fastify.inject({ method: 'GET', url })).statusCode, 404)
})

test('session deletion is atomic and missing deletes return 404', async (t) => {
  const { fastify, sqlite } = await buildTestApp(t)
  sqlite.prepare("INSERT INTO sessions (id, date) VALUES (1, '2026-08-01')").run()
  sqlite.prepare('INSERT INTO games (session_id, game_number, score) VALUES (1, 1, 200)').run()
  assert.equal((await fastify.inject({ method: 'DELETE', url: '/api/sessions/1' })).statusCode, 204)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM games').get().count, 0)
  assert.equal((await fastify.inject({ method: 'DELETE', url: '/sessions/1' })).statusCode, 404)
})

test('deleting a ball clears score references and removes arsenal membership', async (t) => {
  const { fastify, sqlite } = await buildTestApp(t)
  sqlite.exec(`
    INSERT INTO balls (id, name) VALUES (1, 'Test Ball');
    INSERT INTO sessions (id, date) VALUES (1, '2026-08-01');
    INSERT INTO games (session_id, game_number, ball_id) VALUES (1, 1, 1);
    INSERT INTO leagues (id, name) VALUES (1, 'Test League');
    INSERT INTO league_weeks (id, league_id, week_number, date) VALUES (1, 1, 1, '2026-08-01');
    INSERT INTO league_games (week_id, game_number, ball_id) VALUES (1, 1, 1);
    INSERT INTO tournaments (id, name) VALUES (1, 'Test Tournament');
    INSERT INTO tournament_games (tournament_id, game_number, ball_id) VALUES (1, 1, 1);
    INSERT INTO arsenals (id, name) VALUES (1, 'Test Bag');
    INSERT INTO arsenal_balls (arsenal_id, ball_id) VALUES (1, 1);
  `)
  assert.equal((await fastify.inject({ method: 'DELETE', url: '/api/balls/1' })).statusCode, 204)
  for (const table of ['games', 'league_games', 'tournament_games']) assert.equal(sqlite.prepare(`SELECT ball_id AS ballId FROM ${table}`).get().ballId, null)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM arsenal_balls').get().count, 0)
})

test('arsenal list includes its ball ids for score filtering', async (t) => {
  const { fastify, sqlite } = await buildTestApp(t)
  sqlite.exec(`
    INSERT INTO balls (id, name) VALUES (11, 'Benchmark'), (12, 'Spare');
    INSERT INTO arsenals (id, name) VALUES (7, 'League night');
    INSERT INTO arsenal_balls (arsenal_id, ball_id, slot_order) VALUES (7, 12, 2), (7, 11, 1);
  `)

  for (const url of ['/arsenals', '/api/arsenals']) {
    const response = await fastify.inject({ method: 'GET', url })
    assert.equal(response.statusCode, 200, response.body)
    assert.deepEqual(response.json()[0].ballIds, [11, 12])
  }
})

test('JSON aliases relay the exact internal payload and attachment header', async (t) => {
  const { fastify } = await buildTestApp(t)
  const direct = await fastify.inject({ method: 'GET', url: '/backup' })
  const alias = await fastify.inject({ method: 'GET', url: '/api/export' })
  assert.equal(alias.statusCode, direct.statusCode)
  const directBody = direct.json()
  const aliasBody = alias.json()
  delete directBody.exportedAt
  delete aliasBody.exportedAt
  assert.deepEqual(aliasBody, directBody)
  assert.match(String(alias.headers['content-disposition']), /attachment/)
})
