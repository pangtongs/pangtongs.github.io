// Offline support. Network first, so an update is picked up as soon as the device is
// online; every successful response is cached, and the cache answers when offline.
// Scripts carry ?v= stamps, so a stale mix of old and new files cannot be served.
const CACHE = 'last-ember-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, {ignoreSearch: req.mode === 'navigate'})));
});
