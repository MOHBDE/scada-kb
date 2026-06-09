/* SCADA-KB service worker – offline-stöd
   - App-HTML: network-first (nya uppladdningar slår igenom direkt, funkar offline från cache)
   - Statiska resurser (React, Babel, highlight.js, typsnitt): cache-first
   - Supabase (data + bilder): alltid nätverk, aldrig cache
*/
const CACHE = 'scada-kb-v3';
const MEDIA = 'scada-media';
const ASSETS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(function (u) {
      return c.add(new Request(u, { mode: 'no-cors' })).catch(function () {});
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE && k !== MEDIA; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Lämna Supabase (data + bildlagring) helt åt nätverket
  if (url.hostname.endsWith('supabase.co')) return;

  const isDoc = req.mode === 'navigate' ||
    (url.origin === location.origin &&
      (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')));

  if (isDoc) {
    // Network-first: hämta färskt när online, annars cache
    e.respondWith((async function () {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', res.clone());
        return res;
      } catch (err) {
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  // Statiska resurser: cache-first
  e.respondWith((async function () {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  })());
});
