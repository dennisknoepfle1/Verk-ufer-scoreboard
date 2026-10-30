// Service Worker: hält die App auf dem Handy bereit, damit sie auch ohne Netz startet (Offline eintragen).
// Seiten: erst Netz, ohne Netz die gespeicherte Version. Dateien mit Hash im Namen: aus dem Speicher, alles andere erst aus dem Netz.
// Push: zeigt Benachrichtigungen zu neuen Verkäufen und öffnet beim Antippen die App.
const CACHE = 'scoreboard-v4';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Datenbank-Anfragen nie aus dem Speicher

  if (req.mode === 'navigate') {
    // Erst Netz; hängt das Netz (z. B. nach dem Ruhezustand) länger als 5 s, die gespeicherte Seite nehmen.
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
      }
      return res;
    });
    const fallback = new Promise((resolve) => setTimeout(resolve, 5000)).then(() => caches.match('/'));
    e.respondWith(
      Promise.race([network.catch(() => caches.match('/')), fallback.then((hit) => hit || network)]).then(
        (res) => res || network,
      ),
    );
    return;
  }

  // Dateien ohne Hash im Namen (design.css, Icons, manifest): erst Netz, damit Änderungen sofort ankommen.
  const hashed = url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');
  if (!hashed) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Verkäufer-Scoreboard', {
      body: d.body || '',
      tag: d.tag,
      requireInteraction: !!d.requireInteraction,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
