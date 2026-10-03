// Forkcast service worker. Bump VERSION when shipping new frontend files.
const VERSION = 'fc-v1';
const SHELL = ['/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/icons/icon-192.png',
  '/js/app.js', '/js/api.js', '/js/router.js', '/js/state.js', '/js/ui.js',
  '/js/views/who.js', '/js/views/recipes.js', '/js/views/recipe.js', '/js/views/add.js', '/js/views/plan.js', '/js/views/shopping.js', '/js/views/ideas.js', '/js/views/settings.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {            // network-first, cached fallback when offline
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then((r) => r || new Response(JSON.stringify({ detail: "You're offline.", code: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('/index.html'))); return; }
  // /media: cache-first. Shell: cache-first too, but refreshed in the background (stale-while-revalidate) so edits show up on the next launch.
  const media = url.pathname.startsWith('/media/');
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; });
    return hit ? (media ? hit : (net.catch(() => {}), hit)) : net;
  }));
});
