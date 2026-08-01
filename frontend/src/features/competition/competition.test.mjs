import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('competition overlays delegate to the shared Sheet primitive', async () => {
  const competition = await readFile(new URL('./CompetitionUI.tsx', import.meta.url), 'utf8')
  const shareCard = await readFile(new URL('../../components/ShareCard.tsx', import.meta.url), 'utf8')
  assert.match(competition, /import \{ Sheet \}/)
  assert.match(competition, /<Sheet[\s\S]*className="competition-sheet-panel"/)
  assert.match(shareCard, /<Sheet[\s\S]*className="share-card-sheet"/)
})

test('public standings uses the minimal shell without private competition actions', async () => {
  const standings = await readFile(new URL('../../pages/TournamentStandings.tsx', import.meta.url), 'utf8')
  assert.match(standings, /<PublicShell/)
  assert.doesNotMatch(standings, /CompetitionHeader|View tournament/)
  assert.match(standings, /fontSize: '0\.75rem'/)
})

test('perfect-game motion is a pin-deck spotlight with reduced-motion handling', async () => {
  const scorer = await readFile(new URL('../../components/BowlingScorer.tsx', import.meta.url), 'utf8')
  const scoringCss = await readFile(new URL('../scoring/scoring.css', import.meta.url), 'utf8')
  assert.match(scorer, /state\.totalScore === 300[\s\S]*className="perfect-lane-spotlight"/)
  assert.match(scorer, /shareButtonText="Share 300"/)
  assert.match(scoringCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.perfect-lane-spotlight::before \{ animation: none;/)
})

test('major public result pages share one printable result composition', async () => {
  const files = [
    'PublicProfile.tsx',
    'SessionShare.tsx',
    'ShareScore.tsx',
    'LeagueShare.tsx',
    'LeagueRecapShare.tsx',
    'LeagueWeekShare.tsx',
    'PerfectGameShare.tsx',
    'TournamentShare.tsx',
    'TournamentStandingsShare.tsx',
    'PublicLeague.tsx',
    'PublicLeagueLeaderboard.tsx',
  ]
  for (const file of files) {
    const source = await readFile(new URL(`../../pages/${file}`, import.meta.url), 'utf8')
    assert.match(source, /<PublicResult/)
    assert.match(source, /<PublicShell/)
  }
})

test('public profile identity and timestamp are supplied by the server', async () => {
  const server = await readFile(new URL('../../../../backend/src/server.ts', import.meta.url), 'utf8')
  assert.match(server, /BOWLSENSE_PUBLIC_PROFILE_NAME/)
  assert.match(server, /profileName(?:,|:)/)
  assert.match(server, /generatedAt: new Date\(\)\.toISOString\(\)/)
})

test('league score pills remain legible on the light public surface', async () => {
  const leagueShare = await readFile(new URL('../../pages/LeagueShare.tsx', import.meta.url), 'utf8')
  assert.match(leagueShare, /var\(--public-ink\)/)
  assert.doesNotMatch(leagueShare, /score < 170 \? '#fc8181' : '#fff'/)
})

test('public shell states, fact cards, and controls retain readable accessible styling', async () => {
  const profile = await readFile(new URL('../../pages/PublicProfile.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('./competition.css', import.meta.url), 'utf8')
  assert.match(profile, /if \(loading\) return <PublicShell/)
  assert.match(profile, /if \(error \|\| !stats\) return <PublicShell/)
  assert.match(css, /\.public-scorecard button, \.public-scorecard \.btn \{ min-height: 44px;/)
  assert.match(css, /\.public-legacy-content \.share-result__fact \{[^}]*color: var\(--public-ink\)/)
})
