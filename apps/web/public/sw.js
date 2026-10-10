/* Remy AI service worker — offline-first shell, zero dependencies.
 * Strategy:
 *  - Precache: offline page, manifest, icons.
 *  - Navigations: network-first, fall back to cache, then /offline.
 *  - Same-origin static assets (/_next/static, /icons): cache-first.
 *  - API calls and non-GET requests: never cached, always network.
 */
const VERSION = 'remy-v1';
const PRECACHE = [VERSION];
const CORE = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !PRECACHE.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  // Page navigations: try network, fall back to cache, then the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit ?? caches.match('/offline')),
        ),
    );
    return;
  }

  // Static assets: cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
