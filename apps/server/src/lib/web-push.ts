import webpush from 'web-push';

/**
 * Sends one Web Push message (RFC 8030/8291, VAPID) with our own `fetch` rather than the
 * library's transport: a timeout, no redirects, and the endpoint checked before (`isPushEndpoint`).
 */

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** `gone`: the subscription no longer exists (404/410) and must be deleted. */
export type PushResult = { ok: true } | { ok: false; gone: boolean; status?: number };

export type PushSender = (
  target: PushTarget,
  payload: string,
  options: { ttlSeconds: number; topic?: string },
) => Promise<PushResult>;

const TIMEOUT_MS = 10_000;

export function createPushSender(vapid: VapidKeys): PushSender {
  return async (target, payload, options) => {
    let details: ReturnType<typeof webpush.generateRequestDetails>;
    try {
      details = webpush.generateRequestDetails(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        {
          vapidDetails: vapid,
          TTL: options.ttlSeconds,
          urgency: 'high',
          topic: options.topic,
          contentEncoding: 'aes128gcm',
        },
      );
    } catch {
      // Keys that cannot encrypt (not a P-256 point): this subscription will never work.
      return { ok: false, gone: true };
    }
    try {
      const response = await fetch(details.endpoint, {
        method: details.method,
        // Strings only; the length is computed by fetch.
        headers: Object.fromEntries(
          Object.entries(details.headers)
            .filter(([name]) => name.toLowerCase() !== 'content-length')
            .map(([name, value]) => [name, String(value)]),
        ),
        body: details.body ? new Uint8Array(details.body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      await response.body?.cancel();
      if (response.ok) return { ok: true };
      return {
        ok: false,
        gone: response.status === 404 || response.status === 410,
        status: response.status,
      };
    } catch {
      return { ok: false, gone: false };
    }
  };
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

/**
 * Push services of the browsers (Chrome, Edge, Firefox, Safari): the only hosts the server sends
 * to, so a subscription cannot make it request any other address. `testOrigin` (end-to-end
 * tests only) adds one origin, plain http allowed.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: string, testOrigin?: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (testOrigin && url.origin === testOrigin) return true;
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    PUSH_HOSTS.some((host) => host.test(url.hostname))
  );
}
