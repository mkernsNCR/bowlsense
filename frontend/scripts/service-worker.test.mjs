import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

async function loadServiceWorker(fetchImpl, cacheMatch = async () => null) {
  const listeners = new Map()
  const cacheWrites = []
  const cache = {
    addAll: async () => {},
    put: async (key) => { cacheWrites.push(key) },
  }
  const context = vm.createContext({
    AbortController,
    URL,
    Response,
    console,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
    caches: {
      open: async () => cache,
      match: cacheMatch,
      keys: async () => [],
      delete: async () => true,
    },
    self: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
  })
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  vm.runInContext(source, context)
  return { context, listeners, cacheWrites }
}

test('public share navigations never replace the generic cached app shell', async () => {
  const { context, listeners, cacheWrites } = await loadServiceWorker(async () => new Response('<html>route metadata</html>', { status: 200 }))
  const publicPaths = [
    '/bowl',
    '/score/42',
    '/perfect-games/42',
    '/sessions/42/share',
    '/leagues/42/public',
    '/leagues/42/leaderboard',
    '/leagues/42/share',
    '/leagues/42/recap/share',
    '/leagues/42/week/7/share',
    '/tournaments/42/share',
    '/tournaments/42/standings',
    '/tournaments/42/standings/share',
  ]

  for (const pathname of publicPaths) {
    assert.equal(vm.runInContext(`isPublicShareNavigation(${JSON.stringify(pathname)})`, context), true, pathname)
    const waits = []
    let responsePromise
    assert.equal(listeners.has('fetch'), true)
    listeners.get('fetch')({
      request: { mode: 'navigate', url: `https://bowlsense.test${pathname}` },
      respondWith: (promise) => { responsePromise = promise },
      waitUntil: (promise) => waits.push(promise),
    })
    assert.equal((await responsePromise).status, 200)
    await Promise.all(waits)
  }

  assert.deepEqual(cacheWrites, [])
})

test('private navigation refreshes the generic cached app shell', async () => {
  const { listeners, cacheWrites } = await loadServiceWorker(async () => new Response('<html>private shell</html>', { status: 200 }))
  const waits = []
  let responsePromise
  assert.equal(listeners.has('fetch'), true)
  listeners.get('fetch')({
    request: { mode: 'navigate', url: 'https://bowlsense.test/settings' },
    respondWith: (promise) => { responsePromise = promise },
    waitUntil: (promise) => waits.push(promise),
  })
  assert.equal((await responsePromise).status, 200)
  await Promise.all(waits)
  assert.deepEqual(cacheWrites, ['/index.html'])
})

test('failed navigation serves the cached app shell', async () => {
  const cached = new Response('<html>offline shell</html>', { status: 200 })
  const { listeners } = await loadServiceWorker(
    async () => { throw new Error('offline') },
    async (key) => key === '/index.html' ? cached : null,
  )
  let responsePromise
  assert.equal(listeners.has('fetch'), true)
  listeners.get('fetch')({
    request: { mode: 'navigate', url: 'https://bowlsense.test/settings' },
    respondWith: (promise) => { responsePromise = promise },
    waitUntil: () => {},
  })
  const response = await responsePromise
  assert.equal(response, cached)
  assert.match(await response.text(), /offline shell/)
})
