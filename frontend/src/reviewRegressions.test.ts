import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('production crash fallback does not expose exception details', async () => {
  const source = await readFile(new URL('./components/ErrorBoundary.tsx', import.meta.url), 'utf8')
  assert.match(source, /import\.meta\.env\.DEV && \(/)
  assert.match(source, /this\.state\.error\.message/)
  assert.match(source, /contact the BowlSense owner/)
})

test('league result tabs expose the complete keyboard-accessible ARIA contract', async () => {
  const source = await readFile(new URL('./pages/PublicLeague.tsx', import.meta.url), 'utf8')
  for (const contract of ['role="tablist"', 'role="tab"', 'aria-selected=', 'aria-controls=', 'role="tabpanel"', 'aria-labelledby=', "event.key === 'ArrowRight'", "event.key === 'ArrowLeft'"]) {
    assert.ok(source.includes(contract), contract)
  }
})

test('tournament game deletion failures remain visible and retryable', async () => {
  const source = await readFile(new URL('./pages/Tournaments.tsx', import.meta.url), 'utf8')
  assert.match(source, /deleteGame\.isError && deleteGame\.variables === g\.id/)
  assert.match(source, /role="alert"[\s\S]{0,300}deleteGame\.mutate\(g\.id\)[\s\S]{0,100}Try again/)
})

test('open sheets keep current focus while metadata refs update independently', async () => {
  const source = await readFile(new URL('./design/Sheet.tsx', import.meta.url), 'utf8')
  assert.match(source, /dismissibleRef\.current = dismissible/)
  assert.match(source, /initialFocusRefRef\.current = initialFocusRef/)
  assert.match(source, /panel\.contains\(document\.activeElement\)/)
})
