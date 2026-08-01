import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

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
    <meta property="og:image" content="http://private.example/card.png" />
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
  assert.equal((result.match(/property="og:title"/g) || []).length, 1)
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

test('crawler HTML fallthrough covers API-colliding public result routes', () => {
  for (const route of [
    '/leagues/:id/leaderboard',
    '/leagues/:id/share',
    '/tournaments/:id/share',
    '/tournaments/:id/standings',
  ]) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(serverSource, new RegExp(`fastify\\.get\\('${escaped}'[\\s\\S]{0,180}text/html`))
  }
  assert.match(serverSource, /imageUrl: imagePath \? absolutePublicUrl\(origin, imagePath\) : undefined/)
  assert.match(serverSource, /resolvePublicPageMetadata\(url, request\.url, origin\)/)
})
