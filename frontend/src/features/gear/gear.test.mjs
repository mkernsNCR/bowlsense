import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { missingBallSpecs } from './types.ts'

test('reports each missing lead specification independently', () => {
  assert.deepEqual(missingBallSpecs({ coverstockType: 'Solid', coreType: null, coreRg: '2.48' }), ['core type'])
  assert.deepEqual(missingBallSpecs({ coverstockType: null, coreType: 'Asymmetric', coreRg: null }), ['cover type', 'RG'])
  assert.deepEqual(missingBallSpecs({ coverstockType: 'Pearl', coreType: 'Symmetric', coreRg: '2.52' }), [])
})

test('uses the shared sheet and the required Gear navigation labels', async () => {
  const source = await readFile(new URL('./GearWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(source, /import \{ EmptyState, Icon, Sheet \} from '\.\.\/\.\.\/design'/)
  assert.match(source, /<EmptyState/)
  assert.match(source, /status=\{kind\}/)
  assert.match(source, /className=\{`gear-state gear-state--\$\{kind\}`\}/)
  assert.match(source, /<h1>Gear<\/h1>/)
  assert.match(source, />\s*Balls\s*<\/NavLink>/)
  assert.match(source, />\s*Arsenals\s*<\/NavLink>/)
})

test('delegates JSON requests to the shared API helper', async () => {
  const source = await readFile(new URL('./api.ts', import.meta.url), 'utf8')
  assert.match(source, /export \{ fetchJson as requestJson \} from '\.\.\/\.\.\/api\/bowling'/)
})

test('requests ball performance through the Sites-compatible API namespace', async () => {
  const source = await readFile(new URL('../../pages/Balls.tsx', import.meta.url), 'utf8')
  assert.match(source, /requestJson<BallPerformance\[]>\('\/api\/stats\/by-ball'\)/)
})

test('keeps the lane-board flourish scoped to the arsenal bag', async () => {
  const css = await readFile(new URL('./gear.css', import.meta.url), 'utf8')
  assert.match(css, /\.gear-bag\s*\{[^}]*repeating-linear-gradient/s)
  assert.match(css, /@media \(max-width: 480px\)/)
})
