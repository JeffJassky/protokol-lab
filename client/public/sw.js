// Protokol Lab service worker — handles Web Push + notification clicks.
// Bumped CACHE_VERSION to invalidate old SW when the handler shape changes.
const CACHE_VERSION = 'pl-sw-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'Protokol Lab', body: event.data.text() };
    }
  }

  const title = payload.title || 'Protokol Lab';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag,
    renotify: Boolean(payload.tag),
    data: {
      url: payload.url || '/',
      category: payload.category || null,
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin) {
            await client.focus();
            client.postMessage({ type: 'notification-click', url: targetUrl });
            return;
          }
        } catch {
          // ignore malformed client URLs
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (!sub) return;
        await fetch('/api/push/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            subscription: sub.toJSON(),
            oldEndpoint: event.oldSubscription?.endpoint,
          }),
        });
      } catch (err) {
        console.error('[sw] pushsubscriptionchange failed', err);
      }
    })(),
  );
});

// Keeps the registration eligible for activation even if we aren't actively
// caching yet.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Retain const reference to avoid lint unused warnings.
self.CACHE_VERSION = CACHE_VERSION;
