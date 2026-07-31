import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const source = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8')

test('partial frames stay in progress and tenth-frame fills are not misclassified', async () => {
  const frameMarks = await source('./frameMarks.ts')
  const design = await source('../../design/FrameRibbon.tsx')
  assert.match(frameMarks, /ball2 === null \|\| frame\.ball2 === undefined\) return 'partial'/)
  assert.doesNotMatch(frameMarks, /frame\.ball3 === 10\) return 'strike'/)
  assert.match(design, /'pending' \| 'partial' \| 'current'/)
})

test('Today uses collision-free recent-session queries and resilient save state', async () => {
  const dashboard = await source('../../pages/Dashboard.tsx')
  const quickAdd = await source('../../components/QuickAddGame.tsx')
  assert.match(dashboard, /queryKey: \['sessions', 'recent'\]/)
  assert.match(quickAdd, /queryKey: \['sessions', 'recent'\]/)
  assert.match(dashboard, /queryFn: fetchRecentSessions/)
  assert.match(quickAdd, /queryFn: fetchRecentSessions/)
  assert.match(dashboard, /weeklyQuery\.isError \|\| tonightQuery\.isError \|\| ballsQuery\.isError/)
  assert.match(dashboard, /onLogAnother=\{\(\) => \{\s*createSessionMutation\.reset\(\)\s*createGameMutation\.reset\(\)/)
})

test('Today navigation, announcements, and frame summaries are semantic', async () => {
  const dashboard = await source('../../pages/Dashboard.tsx')
  const ribbon = await source('./TodayFrameRibbon.tsx')
  assert.match(dashboard, /<Link\s+to=\{`\/leagues\/\$\{contextLeague\.id\}`\}/)
  assert.match(dashboard, /className="bs-visually-hidden" role="status">\{announcement\}/)
  assert.match(ribbon, /hasFrameDetails \? frameSummary : noFrameDetails/)
  assert.doesNotMatch(ribbon, /today-sr-only/)
})

test('created-session fields lock and saved games preserve pin leaves', async () => {
  const quickLog = await source('./QuickLogSheet.tsx')
  const data = await source('../../api/bowling.ts')
  assert.equal((quickLog.match(/disabled=\{draft\.sessionId !== null\}/g) || []).length, 3)
  assert.match(quickLog, /Additional games stay in this created session/)
  assert.match(data, /pinLeaves\?: string/)
})
