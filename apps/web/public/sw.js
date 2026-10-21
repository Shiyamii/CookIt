// Service worker (plan §5.4, phase 8): shows the Web Push notifications sent by the server when a
// timer ends, even when every page is closed, and opens the cooking mode on a tap. No caching yet
// (phase 9, PWA).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: a notification without text is still shown.
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'CookIt';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      renotify: true,
      data: { url: typeof data.url === 'string' ? data.url : '/cook' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only a path of this site, whatever the message says.
  const target = new URL(event.notification.data?.url ?? '/cook', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/cook';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) {
          await client.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
