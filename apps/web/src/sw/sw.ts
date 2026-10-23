/// <reference lib="webworker" />
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import {
  CLEAR_OFFLINE_DATA,
  OFFLINE_API_CACHE,
  OFFLINE_IMAGES_CACHE,
  isImage,
  isOfflineApi,
} from './offline-api';

/**
 * Service worker (plan §5.4, §5.5), built by vite-plugin-pwa (`injectManifest`):
 * - the app itself (HTML, scripts, styles, fonts) is precached: it opens without network;
 * - the API reads needed to open a recipe and cook it (`isOfflineApi`) are kept from the
 *   last time they were read: network first, the copy when the network is down;
 * - pictures already seen are kept (a picture's URL never shows another picture);
 * - Web Push notifications of finished timers, and a tap opening the cooking mode.
 */

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string })[] };

self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Client-side routes: the app's page, never the API, health check, pictures or static files.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/healthz/, /^\/images\//],
  }),
);

/**
 * The account's kept answers are dropped as soon as the session is gone: signed out here (the
 * page sends CLEAR_OFFLINE_DATA), or ended elsewhere (expired, account disabled, password reset:
 * the server answers 401, or `/me` says nobody is signed in). An answer to a request sent before
 * the last clear (still in flight at sign-out) is never stored.
 */
let generation = 0;

const clearOfflineData = async () => {
  generation += 1;
  await Promise.all([caches.delete(OFFLINE_API_CACHE), caches.delete(OFFLINE_IMAGES_CACHE)]);
};

self.addEventListener('message', (event) => {
  if (event.origin === self.location.origin && event.data === CLEAR_OFFLINE_DATA) {
    event.waitUntil(clearOfflineData());
  }
});

registerRoute(
  ({ url, request, sameOrigin }) =>
    sameOrigin && request.method === 'GET' && isOfflineApi(url.pathname),
  new NetworkFirst({
    cacheName: OFFLINE_API_CACHE,
    networkTimeoutSeconds: 5,
    plugins: [
      {
        requestWillFetch: async ({ request, state }) => {
          if (state) state.generation = generation;
          return request;
        },
        cacheWillUpdate: async ({ request, response, state }) => {
          if (response.status === 401) {
            await clearOfflineData();
            return null;
          }
          // Only successful answers: an error (deleted recipe…) never replaces a copy.
          if (response.status !== 200 || state?.generation !== generation) return null;
          if (new URL(request.url).pathname === '/api/v1/me') {
            const { user } = (await response.clone().json()) as { user: unknown };
            if (user === null) {
              await clearOfflineData();
              return null;
            }
          }
          return response;
        },
      },
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 14 * 24 * 3600 }),
    ],
  }),
);

// Pictures: network first like the API (a revoked photo is a 404 as soon as there is network;
// public ones come from the browser's HTTP cache anyway), the kept copy offline.
registerRoute(
  ({ url, request, sameOrigin }) => sameOrigin && request.method === 'GET' && isImage(url.pathname),
  new NetworkFirst({
    cacheName: OFFLINE_IMAGES_CACHE,
    networkTimeoutSeconds: 5,
    plugins: [
      {
        requestWillFetch: async ({ request, state }) => {
          if (state) state.generation = generation;
          return request;
        },
        cacheWillUpdate: async ({ response, state }) =>
          response.status === 200 && state?.generation === generation ? response : null,
      },
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 30 * 24 * 3600,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

self.addEventListener('push', (event) => {
  let data: {
    title?: unknown;
    body?: unknown;
    tag?: unknown;
    url?: unknown;
    timerId?: unknown;
    stopLabel?: unknown;
  } = {};
  try {
    data = (event.data?.json() as typeof data | undefined) ?? {};
  } catch {
    // Not JSON: a notification without text is still shown.
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'CookIt';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: '/pwa-192x192.png',
      badge: '/badge-96x96.png',
      data: {
        url: typeof data.url === 'string' ? data.url : '/cook',
        timerId: typeof data.timerId === 'string' ? data.timerId : undefined,
      },
      // Not in the TypeScript DOM types yet. `renotify`: each reminder rings again; `actions`: a
      // "Stop" button where the system shows them (Android, desktop; not iOS).
      ...{
        renotify: typeof data.tag === 'string',
        actions:
          typeof data.timerId === 'string' && typeof data.stopLabel === 'string'
            ? [{ action: 'stop', title: data.stopLabel }]
            : [],
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: unknown; timerId?: unknown } | null;
  // "Stop": the timer leaves the cooking session (no more reminders), without opening the app.
  const timerId = typeof data?.timerId === 'string' ? data.timerId : '';
  if (event.action === 'stop' && /^[0-9a-f-]{36}$/.test(timerId)) {
    event.waitUntil(
      fetch(`/api/v1/cook/timers/${timerId}/stop`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => undefined),
    );
    return;
  }
  // Only a path of this site, whatever the message says.
  const target = new URL(typeof data?.url === 'string' ? data.url : '/cook', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : `${self.location.origin}/cook`;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        await client.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
