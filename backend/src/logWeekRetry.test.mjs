import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTestApp } from './test-app.mjs'

test('startup reconciles legacy retry duplicates before adding identities', async (t) => {
  const { sqlite } = await buildTestApp(t, { legacyLeagueRetries: true })
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM league_weeks WHERE league_id = 1 AND week_number = 1').get().count, 1)
  assert.deepEqual(sqlite.prepare('SELECT week_id AS weekId, game_number AS gameNumber, score FROM league_games ORDER BY game_number').all(), [
    { weekId: 2, gameNumber: 1, score: 180 },
    { weekId: 2, gameNumber: 2, score: 190 },
  ])
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pragma_index_list('league_weeks') WHERE name = 'league_weeks_league_number_unique' AND [unique] = 1").get().count, 1)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pragma_index_list('league_games') WHERE name = 'league_games_week_number_unique' AND [unique] = 1").get().count, 1)
})

test('log-week retries upsert one week and one game after ambiguous responses', async (t) => {
  const { fastify, sqlite } = await buildTestApp(t)
  const leagueResponse = await fastify.inject({
    method: 'POST',
    url: '/api/leagues',
    payload: { name: 'Retry League', gamesPerWeek: 3 },
  })
  assert.equal(leagueResponse.statusCode, 200, leagueResponse.body)
  const leagueId = leagueResponse.json().id

  const firstWeek = await fastify.inject({
    method: 'POST',
    url: `/api/leagues/${leagueId}/weeks`,
    payload: { weekNumber: 4, date: '2026-08-01', opponent: 'First attempt', gamesTied: 1 },
  })
  assert.equal(firstWeek.statusCode, 200, firstWeek.body)
  const retriedWeek = await fastify.inject({
    method: 'POST',
    url: `/api/leagues/${leagueId}/weeks`,
    payload: { weekNumber: 4, date: '2026-08-01', opponent: 'Retry payload', gamesTied: 2 },
  })
  assert.equal(retriedWeek.statusCode, 200, retriedWeek.body)
  assert.equal(retriedWeek.json().id, firstWeek.json().id)
  assert.deepEqual(sqlite.prepare('SELECT COUNT(*) AS count, MAX(opponent) AS opponent, MAX(games_tied) AS gamesTied FROM league_weeks WHERE league_id = ? AND week_number = ?').get(leagueId, 4), {
    count: 1,
    opponent: 'Retry payload',
    gamesTied: 2,
  })

  const weekId = firstWeek.json().id
  const firstGame = await fastify.inject({
    method: 'POST',
    url: `/api/leagues/weeks/${weekId}/games`,
    payload: { gameNumber: 1, score: 180, strikes: 4 },
  })
  assert.equal(firstGame.statusCode, 200, firstGame.body)
  const retriedGame = await fastify.inject({
    method: 'POST',
    url: `/api/leagues/weeks/${weekId}/games`,
    payload: { gameNumber: 1, score: 181, strikes: 5 },
  })
  assert.equal(retriedGame.statusCode, 200, retriedGame.body)
  assert.equal(retriedGame.json().id, firstGame.json().id)
  assert.deepEqual(sqlite.prepare('SELECT COUNT(*) AS count, MAX(score) AS score, MAX(strikes) AS strikes FROM league_games WHERE week_id = ? AND game_number = ?').get(weekId, 1), {
    count: 1,
    score: 181,
    strikes: 5,
  })
})
