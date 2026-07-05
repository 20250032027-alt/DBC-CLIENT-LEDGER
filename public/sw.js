const CACHE = 'dbc-client-ledger-shell-v1'

self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network-first for same-origin GET requests: always prefer fresh content
// when online, cache every successful response, and fall back to whatever
// was last cached when the network is unavailable. There is no build-time
// precache list here (that requires a bundler plugin) — the shell becomes
// available offline only after at least one successful online visit.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE).then(c => c.put(request, copy))
      return response
    }).catch(() =>
      caches.match(request).then((cached) => {
        if (cached) return cached
        if (request.mode === 'navigate') return caches.match('/index.html')
        return Response.error()
      })
    )
  )
})
