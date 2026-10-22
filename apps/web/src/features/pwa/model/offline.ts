import { CLEAR_OFFLINE_DATA, OFFLINE_API_CACHE, OFFLINE_IMAGES_CACHE } from '@/sw/offline-api';

/**
 * The installable app (plan §5.5): the service worker (src/sw/sw.ts) keeps the app and the
 * recipes already opened for offline use, and shows the timer notifications.
 */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // No service worker (private window, blocked): no offline use nor notifications.
  });
}

/**
 * The account's data kept for offline use: removed when someone signs out or in, so that the
 * next person on this browser never reads it (even without network).
 */
export async function clearOfflineData(): Promise<void> {
  try {
    // The service worker also ignores the answers of requests still in flight.
    navigator.serviceWorker?.controller?.postMessage(CLEAR_OFFLINE_DATA);
    await Promise.all([caches.delete(OFFLINE_API_CACHE), caches.delete(OFFLINE_IMAGES_CACHE)]);
  } catch {
    // No Cache Storage (insecure context, blocked): nothing was kept.
  }
}

/** Network state as the browser sees it, for `useSyncExternalStore`. */
export const connection = {
  subscribe(listener: () => void) {
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);
    return () => {
      window.removeEventListener('online', listener);
      window.removeEventListener('offline', listener);
    };
  },
  online: () => navigator.onLine,
};
