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
  assert.match(source, /import \{ Icon, Sheet \} from '\.\.\/\.\.\/design'/)
  assert.match(source, /<h1>Gear<\/h1>/)
  assert.match(source, />\s*Balls\s*<\/NavLink>/)
  assert.match(source, />\s*Arsenals\s*<\/NavLink>/)
})

test('keeps the lane-board flourish scoped to the arsenal bag', async () => {
  const css = await readFile(new URL('./gear.css', import.meta.url), 'utf8')
  assert.match(css, /\.gear-bag\s*\{[^}]*repeating-linear-gradient/s)
  assert.match(css, /@media \(max-width: 480px\)/)
})
