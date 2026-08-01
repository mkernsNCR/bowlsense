import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTestApp } from './test-app.mjs'

test('initial HTML metadata replaces generic tags and escapes database-backed values', async (t) => {
  const { injectPublicMetadataHtml: inject } = await buildTestApp(t)
  const html = `<!doctype html><html><head>
    <title>Generic</title>
    <meta property="og:title" content="Generic" />
    <meta property="og:description" content="Generic" />
    <meta property="og:url" content="http://private.example/page" />
    <meta property="og:type" content="article" />
    <meta property="og:image" content="http://private.example/card.png" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Generic" />
    <meta name="twitter:description" content="Generic" />
    <meta name="twitter:image" content="http://private.example/card.png" />
  </head><body><div id="root"></div></body></html>`
  const result = inject(html, {
    title: 'Matt <script>alert(1)</script>',
    description: 'Pins & "spares"',
    imageUrl: 'https://bowlsense.example/api/games/42/og-image',
    pageUrl: 'https://bowlsense.example/score/42',
  })

  assert.match(result, /<title>Matt &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/)
  assert.match(result, /content="Pins &amp; &quot;spares&quot;"/)
  assert.match(result, /content="https:\/\/bowlsense\.example\/api\/games\/42\/og-image"/)
  assert.match(result, /property="og:url" content="https:\/\/bowlsense\.example\/score\/42"/)
  for (const managedTag of [
    'property="og:title"',
    'property="og:description"',
    'property="og:type"',
    'property="og:url"',
    'property="og:image"',
    'name="twitter:card"',
    'name="twitter:title"',
    'name="twitter:description"',
    'name="twitter:image"',
  ]) {
    assert.equal((result.match(new RegExp(managedTag, 'g')) || []).length, 1, managedTag)
  }
  assert.doesNotMatch(result, /private\.example/)

  const missingHeadClose = inject('<html><head><title>Generic</title><body></body></html>', {
    title: 'Fallback title',
    description: 'Fallback description',
    pageUrl: 'https://bowlsense.example/fallback',
  })
  assert.ok(missingHeadClose.includes('<title>Fallback title</title>'))
  assert.ok(missingHeadClose.includes('property="og:url" content="https://bowlsense.example/fallback"'))
})

test('initial HTML metadata explicitly omits image tags when no image exists', async (t) => {
  const { injectPublicMetadataHtml: inject } = await buildTestApp(t)
  const result = inject(
    '<html><head><meta property="og:image" content="stale"><meta name="twitter:image" content="stale"></head><body></body></html>',
    { title: 'Unavailable', description: 'Not found', pageUrl: 'https://bowlsense.example/score/999' },
  )

  assert.doesNotMatch(result, /og:image/)
  assert.doesNotMatch(result, /twitter:image/)
  assert.match(result, /twitter:card" content="summary"/)
})

test('crawler HTML responses inject canonical metadata for public result routes', async (t) => {
  const { fastify, sqlite } = await buildTestApp(t)
  sqlite.prepare(`
    INSERT INTO leagues (id, name, location, season, day_of_week, games_per_week, active, created_at)
    VALUES (1, 'Friday League', 'Center Lanes', 'Fall', 'Friday', 3, 1, 1)
  `).run()
  sqlite.prepare(`
    INSERT INTO tournaments (id, name, location, date, format, active, created_at)
    VALUES (1, 'City Open', 'Center Lanes', '2026-02-01', 'Singles', 1, 1)
  `).run()
  sqlite.prepare(`
    INSERT INTO leagues (id, name, location, season, day_of_week, games_per_week, active, created_at)
    VALUES (2, 'Tuesday League', 'North Lanes', 'Spring', 'Tuesday', 3, 1, 2)
  `).run()
  sqlite.prepare(`
    INSERT INTO league_weeks (id, league_id, week_number, date, opponent, games_won, games_lost, games_tied, created_at)
    VALUES (7, 2, 4, '2026-02-03', 'Pin Pals', 2, 1, 0, 1)
  `).run()
  sqlite.prepare(`
    INSERT INTO sessions (id, date, location, lanes, created_at)
    VALUES (1, '2026-02-05', 'Center Lanes', '1-2', 1)
  `).run()
  sqlite.prepare(`
    INSERT INTO games (id, session_id, game_number, score, strikes, spares, splits, created_at)
    VALUES (10, 1, 1, 300, 12, 0, 0, 1)
  `).run()

  const cases = [
    ['/bowl', 'BowlSense profile'],
    ['/score/10', '300 — BowlSense score'],
    ['/sessions/1/share', '300 series — BowlSense'],
    ['/perfect-games/10', 'Perfect 300 — BowlSense'],
    ['/leagues/1/leaderboard', 'Friday League leaderboard — BowlSense'],
    ['/leagues/1/share', 'Friday League — BowlSense'],
    ['/leagues/1/recap/share', 'Friday League recap — BowlSense'],
    ['/leagues/2/week/7/share', 'Tuesday League Week 4 recap — BowlSense'],
    ['/tournaments/1/share', 'City Open — BowlSense'],
    ['/tournaments/1/standings', 'City Open standings — BowlSense'],
  ]
  for (const [url, title] of cases) {
    const response = await fastify.inject({
      method: 'GET',
      url,
      headers: { accept: 'text/html', host: 'attacker.example', 'x-forwarded-host': 'attacker.example' },
    })
    assert.equal(response.statusCode, 200, `${url}: ${response.body}`)
    assert.match(response.headers['content-type'], /text\/html/)
    assert.ok(response.body.includes(`<title>${title}</title>`), url)
    assert.ok(response.body.includes(`property="og:url" content="https://bowlsense.example${url}"`), url)
    assert.ok(!response.body.includes('attacker.example'), url)
  }
})
