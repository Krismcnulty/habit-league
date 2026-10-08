// Habit League service worker: network-first for the page so updates land, cache fallback offline.
const CACHE = 'habit-league-v166';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'fonts/bebas-neue-latin-400-normal.woff2', 'fonts/creepster-latin-400-normal.woff2', 'fonts/permanent-marker-latin-400-normal.woff2', 'fonts/press-start-2p-latin-400-normal.woff2', 'fonts/vt323-latin-400-normal.woff2', 'fonts/mountains-of-christmas-latin-700-normal.woff2', 'fonts/monoton-latin-400-normal.woff2', 'fonts/pacifico-latin-400-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache: always revalidate with GitHub Pages so a new version shows on the next open, not 10 minutes later
    fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
