import assert from 'node:assert/strict'
import test from 'node:test'
import { isInsightsTabActive, isMoreTabActive, isPublicRoute } from './navigation.ts'

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

test('public route matching accepts only the numeric IDs issued by the backend', () => {
  for (const pathname of ['/score/42', '/sessions/42/share', '/perfect-games/42', '/leagues/42/week/7/share', '/tournaments/42/standings/share']) {
    assert.equal(isPublicRoute(pathname), true, pathname)
  }
  for (const pathname of ['/score/not-an-id', '/sessions/abc/share', '/leagues/42/week/latest/share']) {
    assert.equal(isPublicRoute(pathname), false, pathname)
  }
})
