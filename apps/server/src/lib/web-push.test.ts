import { afterEach, describe, expect, test } from 'bun:test';
import { createECDH, randomBytes } from 'node:crypto';
import { createPushSender, generateVapidKeys } from './web-push';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function target() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

function capture(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status });
  }) as typeof fetch;
  return calls;
}

describe('push sender', () => {
  const send = createPushSender({ ...generateVapidKeys(), subject: 'mailto:admin@example.com' });

  test('an encrypted, signed message with a TTL, without following redirects', async () => {
    const calls = capture(201);
    expect(await send(target(), '{"title":"Crêpes"}', { ttlSeconds: 600 })).toEqual({ ok: true });
    const { url, init } = calls[0]!;
    expect(url).toBe('https://fcm.googleapis.com/fcm/send/abc');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    const headers = init.headers as Record<string, string>;
    expect(headers.TTL).toBe('600');
    expect(headers.Urgency).toBe('high');
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.Authorization).toStartWith('vapid t=');
    // Encrypted: the text is not in the body.
    expect(Buffer.from(init.body as Uint8Array).toString()).not.toContain('Crêpes');
  });

  test('404 and 410 mean the subscription is gone; other errors do not', async () => {
    capture(410);
    expect(await send(target(), '{}', { ttlSeconds: 60 })).toEqual({
      ok: false,
      gone: true,
      status: 410,
    });
    capture(404);
    expect((await send(target(), '{}', { ttlSeconds: 60 })) as object).toMatchObject({
      gone: true,
    });
    capture(429);
    expect(await send(target(), '{}', { ttlSeconds: 60 })).toEqual({
      ok: false,
      gone: false,
      status: 429,
    });
    // Keys that are not a P-256 point: the subscription can never work.
    expect(await send({ ...target(), p256dh: 'B'.repeat(87) }, '{}', { ttlSeconds: 60 })).toEqual({
      ok: false,
      gone: true,
    });
    globalThis.fetch = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await send(target(), '{}', { ttlSeconds: 60 })).toEqual({ ok: false, gone: false });
  });
});
