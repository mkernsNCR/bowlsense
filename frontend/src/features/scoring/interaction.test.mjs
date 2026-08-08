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
  const controlRule = css.match(/\.pin-control\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(controlRule, /min-height:\s*44px/)
  assert.match(controlRule, /min-width:\s*44px/)
  assert.match(css, /\.live-ball select:focus-visible\s*\{[^}]*outline:/s)
  const deckRule = css.match(/\.pin-deck\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(deckRule, /touch-action:\s*none/)
})
