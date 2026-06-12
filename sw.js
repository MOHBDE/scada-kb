/* SCADA-KB service worker – offline-stöd
   - App-HTML: network-first (nya uppladdningar slår igenom direkt, funkar offline från cache)
   - Statiska resurser (React, Babel, highlight.js, typsnitt): cache-first
   - Supabase (data + bilder): alltid nätverk, aldrig cache
*/
const CACHE = 'scada-kb-v20';
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
  })());
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting' || (e.data && e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
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

  // Supabase: cacha publika lagringsobjekt (bilder/filer) för offline; lämna API/auth åt nätverket
  if (url.hostname.endsWith('supabase.co')) {
    if (url.pathname.indexOf('/storage/v1/object/public/') !== -1) {
      e.respondWith((async function () {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) {
            const c = await caches.open(MEDIA);
            c.put(req, res.clone());
          }
          return res;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })());
    }
    return;
  }

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

/* Push-aviseringar */
self.addEventListener('push', function (e) {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (err) { try { data = { body: e.data.text() }; } catch (e2) { data = {}; } }
  const title = data.title || 'SCADA-KB';
  const body = data.body || 'Nytt meddelande';
  const url = data.url || './';
  e.waitUntil(self.registration.showNotification(title, {
    body: body,
    tag: data.tag || 'scada-chat',
    data: { url: url }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async function () {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.indexOf(self.location.origin) === 0 && 'focus' in c) {
        try { await c.focus(); return; } catch (err) {}
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
