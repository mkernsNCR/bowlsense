// BowlSense PWA Service Worker
// Cache-first for app shell, network-first for API

const CACHE_VERSION = 'v5-sites';
const SHELL_CACHE = `bowlsense-shell-${CACHE_VERSION}`;

// App shell assets to cache on install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

const NAVIGATION_TIMEOUT_MS = 8000;

function isPublicShareNavigation(pathname) {
  return /^\/bowl\/?$/.test(pathname) ||
    /^\/sessions\/\d+\/share\/?$/.test(pathname) ||
    /^\/leagues\/\d+\/(?:public|leaderboard|share|recap\/share|week\/\d+\/share)\/?$/.test(pathname) ||
    /^\/tournaments\/\d+\/(?:share|standings|standings\/share)\/?$/.test(pathname);
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Failed to cache some shell assets:', err);
        // Don't fail install — continue even if some assets are missing
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: delete old caches, take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key.startsWith('bowlsense-'))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: route-based strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls → network-first, no cache fallback (don't serve stale data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        // Return a JSON error if offline — app handles empty states
        return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Navigation requests (HTML pages) → network-first with cached app-shell fallback.
  // This keeps a newly deployed app from being pinned behind stale cached HTML.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS)
        .then((networkResponse) => {
          if (networkResponse.ok && !isPublicShareNavigation(url.pathname)) {
            const clone = networkResponse.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', clone)));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedShell = await caches.match('/index.html');
          return cachedShell || new Response('BowlSense is offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts) → cache-first, update in background
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cached || new Response('', { status: 200 }));
      })
    );
    return;
  }

  // Everything else → network with no caching
  event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
});
