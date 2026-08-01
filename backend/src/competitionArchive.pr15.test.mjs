import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const server = await readFile(new URL('./server.ts', import.meta.url), 'utf8')
const schema = await readFile(new URL('./schema.ts', import.meta.url), 'utf8')

test('tournament archive state is created and migrated without dropping existing data', () => {
  assert.match(schema, /export const tournaments[\s\S]*active: integer\('active'\)\.default\(1\)/)
  assert.match(server, /CREATE TABLE IF NOT EXISTS tournaments \([\s\S]*active INTEGER DEFAULT 1/)
  assert.match(server, /PRAGMA table_info\(tournaments\)[\s\S]*ALTER TABLE tournaments ADD COLUMN active INTEGER DEFAULT 1/)
  assert.doesNotMatch(server, /DROP TABLE tournaments/)
})

test('league and tournament archive routes are reversible', () => {
  for (const resource of ['leagues', 'tournaments']) {
    assert.match(server, new RegExp(`fastify\\.post\\('/api/${resource}/:id/archive'`))
    assert.match(server, new RegExp(`fastify\\.post\\('/api/${resource}/:id/unarchive'`))
  }
  assert.match(server, /UPDATE leagues SET active = \? WHERE id = \?/)
  assert.match(server, /UPDATE tournaments SET active = \? WHERE id = \?/)
  assert.doesNotMatch(server, /DELETE FROM leagues WHERE id = \?/)
  assert.doesNotMatch(server, /DELETE FROM tournaments WHERE id = \?/)
})

test('backup restore and tournament CSV preserve archive state with legacy defaults', () => {
  assert.match(server, /insertLeague\.run\(\{ \.\.\.l, active: l\?\.active === 0 \? 0 : 1 \}\)/)
  assert.match(server, /INSERT INTO tournaments \(id,[^\n]+active, created_at\)/)
  assert.match(server, /insertTournament\.run\(\{ \.\.\.t, active: t\?\.active === 0 \? 0 : 1 \}\)/)
  assert.match(server, /t\.placement, t\.notes, t\.active, t\.created_at/)
  assert.match(server, /'placement', 'notes', 'active', 'game_count', 'created_at'/)
})
