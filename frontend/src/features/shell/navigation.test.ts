import assert from 'node:assert/strict'
import test from 'node:test'
import { isInsightsTabActive, isMoreTabActive } from './navigation.ts'

test('all Insights workspace routes activate Insights instead of More', () => {
  for (const pathname of ['/stats', '/stats/', '/pin-leaves', '/score-calculator']) {
    assert.equal(isInsightsTabActive(pathname), true, `${pathname} should activate Insights`)
    assert.equal(isMoreTabActive(pathname), false, `${pathname} should not activate More`)
  }
})

test('non-Insights utility routes still activate More', () => {
  assert.equal(isInsightsTabActive('/settings'), false)
  assert.equal(isMoreTabActive('/settings'), true)
})
