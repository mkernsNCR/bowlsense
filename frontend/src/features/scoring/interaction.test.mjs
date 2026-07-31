import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { requiresDiscardConfirmation } from './interaction.ts'

test('requires confirmation when an in-progress game has recorded rolls', () => {
  assert.equal(requiresDiscardConfirmation({ recordedRolls: 1 }), true)
})

test('requires confirmation when a frame edit has rewound every visible roll', () => {
  assert.equal(requiresDiscardConfirmation({ recordedRolls: 0, savedAsideRolls: 12 }), true)
})

test('allows a pristine scorer to close directly', () => {
  assert.equal(requiresDiscardConfirmation({ recordedRolls: 0 }), false)
})

test('keeps lane-side context sticky and touch targets at least 44px', async () => {
  const css = await readFile(new URL('./scoring.css', import.meta.url), 'utf8')
  assert.match(css, /\.live-score-sticky\s*\{[^}]*position:\s*sticky/s)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /min-width:\s*44px/)
})
