const CACHE_NAME = 'citations-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './citations.json',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

// Install: cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first strategy
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Update cache in background
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response);
            });
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request);
    })
  );
});

// Receive message from app to show notification
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: 'icons/icon-192.svg',
      badge: 'icons/icon-192.svg',
      tag: 'citation-du-jour',
      renotify: true,
      actions: [
        { action: 'open', title: 'Ouvrir' }
      ]
    });
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow('./');
      }
    })
  );
});

// Periodic background sync (for daily citation)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-citation') {
    event.waitUntil(showDailyCitation());
  }
});

async function showDailyCitation() {
  try {
    const response = await fetch('citations.json');
    const citations = await response.json();

    if (citations.length === 0) return;

    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    let hash = seed;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = (hash >> 16) ^ hash;
    const citation = citations[Math.abs(hash) % citations.length];

    let body = citation.texte;
    if (body.length > 180) {
      body = body.substring(0, 177) + '...';
    }

    await self.registration.showNotification(citation.auteur + ' — ' + citation.roman, {
      body: body,
      icon: 'icons/icon-192.svg',
      badge: 'icons/icon-192.svg',
      tag: 'citation-du-jour',
      renotify: true
    });
  } catch (e) {
    console.error('Erreur notification quotidienne:', e);
  }
}
