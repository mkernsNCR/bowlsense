import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { buildTestApp } from './test-app.mjs'

const serverSource = await readFile(new URL('./server.ts', import.meta.url), 'utf8')

function loadHtmlInjector() {
  const start = serverSource.indexOf('const MANAGED_PUBLIC_META')
  const end = serverSource.indexOf('function resolvePublicPageMetadata')
  assert.ok(start >= 0 && end > start, 'metadata helpers should remain discoverable')
  const source = `${serverSource.slice(start, end).replace('export function injectPublicMetadataHtml', 'function injectPublicMetadataHtml')}\n` +
    'globalThis.injectPublicMetadataHtml = injectPublicMetadataHtml'
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const context = { URL, process: { env: {} } }
  vm.runInNewContext(output, context)
  return context.injectPublicMetadataHtml
}

test('initial HTML metadata replaces generic tags and escapes database-backed values', () => {
  const inject = loadHtmlInjector()
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
})

test('initial HTML metadata explicitly omits image tags when no image exists', () => {
  const inject = loadHtmlInjector()
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

  const cases = [
    ['/leagues/1/leaderboard', 'Friday League leaderboard — BowlSense'],
    ['/leagues/1/share', 'Friday League — BowlSense'],
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
    assert.match(response.body, new RegExp(`<title>${title}</title>`))
    assert.match(response.body, new RegExp(`property="og:url" content="https://bowlsense\\.example${url}"`))
    assert.doesNotMatch(response.body, /attacker\.example/)
  }
})
