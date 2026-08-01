import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTestApp } from './test-app.mjs'

test('archive migration preserves existing league and tournament rows', async (t) => {
  const { sqlite } = await buildTestApp(t, { legacyCompetitions: true })

  assert.deepEqual(sqlite.prepare('SELECT id, name, active FROM leagues').get(), {
    id: 1,
    name: 'Legacy League',
    active: 1,
  })
  assert.deepEqual(sqlite.prepare('SELECT id, name, active FROM tournaments').get(), {
    id: 1,
    name: 'Legacy Tournament',
    active: 1,
  })
})

test('league and tournament archive routes are reversible and validate ids', async (t) => {
  const { fastify } = await buildTestApp(t, { legacyCompetitions: true })

  for (const resource of ['leagues', 'tournaments']) {
    const initial = await fastify.inject({ method: 'GET', url: `/api/${resource}` })
    assert.equal(initial.statusCode, 200)
    assert.equal(initial.json().length, 1)

    const archived = await fastify.inject({ method: 'POST', url: `/api/${resource}/1/archive` })
    assert.equal(archived.statusCode, 200)
    assert.equal(archived.json().active, 0)
    assert.equal((await fastify.inject({ method: 'GET', url: `/api/${resource}` })).json().length, 0)
    assert.equal((await fastify.inject({ method: 'GET', url: `/api/${resource}?includeArchived=true` })).json()[0].active, 0)

    const restored = await fastify.inject({ method: 'POST', url: `/api/${resource}/1/unarchive` })
    assert.equal(restored.statusCode, 200)
    assert.equal(restored.json().active, 1)
    assert.equal((await fastify.inject({ method: 'GET', url: `/api/${resource}` })).json().length, 1)

    assert.equal((await fastify.inject({ method: 'POST', url: `/api/${resource}/999/archive` })).statusCode, 404)
    assert.equal((await fastify.inject({ method: 'POST', url: `/api/${resource}/invalid/archive` })).statusCode, 400)
    assert.equal((await fastify.inject({ method: 'DELETE', url: `/${resource}/invalid` })).statusCode, 400)
  }
})

test('backup restore and tournament CSV preserve active state and legacy defaults', async (t) => {
  const { fastify } = await buildTestApp(t)
  const payload = {
    leagues: [
      { id: 1, name: 'Archived League', location: null, season: null, day_of_week: null, games_per_week: 3, start_date: null, end_date: null, notes: null, active: 0, created_at: 1 },
      { id: 2, name: 'Legacy League', location: null, season: null, day_of_week: null, games_per_week: 3, start_date: null, end_date: null, notes: null, created_at: 2 },
    ],
    tournaments: [
      { id: 1, name: 'Archived Tournament', location: null, date: '2026-01-01', end_date: null, format: null, entry_fee: null, prize_fund: null, placement: null, notes: null, active: 0, created_at: 1 },
      { id: 2, name: 'Legacy Tournament', location: null, date: '2026-02-01', end_date: null, format: null, entry_fee: null, prize_fund: null, placement: null, notes: null, created_at: 2 },
    ],
  }

  const restored = await fastify.inject({ method: 'POST', url: '/restore', payload })
  assert.equal(restored.statusCode, 200, restored.body)

  const leagues = (await fastify.inject({ method: 'GET', url: '/api/leagues?includeArchived=1' })).json()
  const tournaments = (await fastify.inject({ method: 'GET', url: '/api/tournaments?includeArchived=1' })).json()
  assert.equal(leagues.find((row) => row.id === 1).active, 0)
  assert.equal(leagues.find((row) => row.id === 2).active, 1)
  assert.equal(tournaments.find((row) => row.id === 1).active, 0)
  assert.equal(tournaments.find((row) => row.id === 2).active, 1)

  const csv = await fastify.inject({ method: 'GET', url: '/api/tournaments/export.csv' })
  assert.equal(csv.statusCode, 200)
  assert.match(csv.headers['content-type'], /text\/csv/)
  assert.match(csv.body.split('\n')[0], /active/)
  assert.match(csv.body, /Archived Tournament[\s\S]*,0,/)
  assert.match(csv.body, /Legacy Tournament[\s\S]*,1,/)
})
