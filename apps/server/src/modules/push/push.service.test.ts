import { describe, expect, test } from 'bun:test';
import type { PushSubscriptionInput } from '@cookit/shared';
import { isPushEndpoint, type PushResult, type PushSender } from '../../lib/web-push';
import type { DueTimer, PushRepository, StoredSubscription } from './push.repository';
import { createPushService, MAX_SUBSCRIPTIONS_PER_USER, timerPayload } from './push.service';

const T0 = new Date('2026-10-21T18:00:00.000Z');
const KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const endpoint = (n: number | string) => `https://fcm.googleapis.com/fcm/send/${n}`;
const input = (n: number | string): PushSubscriptionInput => ({
  endpoint: endpoint(n),
  keys: KEYS,
});

function setup(
  options: {
    sender?: boolean;
    answer?: (endpoint: string) => PushResult;
    throwFor?: (endpoint: string) => boolean;
  } = {},
) {
  const rows: (StoredSubscription & { userId: string })[] = [];
  let due: DueTimer[] = [];
  const marked: string[] = [];
  const released: string[] = [];
  const listed: string[] = [];
  const deletedIds: string[] = [];
  let ids = 0;
  let clock = 0;
  const repository: PushRepository = {
    async upsert(userId, subscription) {
      const existing = rows.find((row) => row.endpoint === subscription.endpoint);
      const createdAt = new Date(T0.getTime() + clock++);
      // Another user's row: only the same browser (same keys) takes it over.
      const sameBrowser =
        existing?.p256dh === subscription.p256dh && existing.auth === subscription.auth;
      if (existing && (existing.userId === userId || sameBrowser)) {
        Object.assign(existing, subscription, { userId, createdAt });
      } else if (existing) return;
      else rows.push({ id: `s${++ids}`, userId, ...subscription, createdAt });
    },
    async prune(userId, keep) {
      const own = rows
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      for (const row of own.slice(keep)) rows.splice(rows.indexOf(row), 1);
    },
    async list(userId) {
      listed.push(userId);
      return rows.filter((row) => row.userId === userId);
    },
    async delete(userId, value) {
      const index = rows.findIndex((row) => row.userId === userId && row.endpoint === value);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
    async deleteById(id) {
      deletedIds.push(id);
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
    async claimDue(limit) {
      const batch = due.slice(0, limit);
      due = due.slice(limit);
      return batch;
    },
    async markNotified(timers) {
      marked.push(...timers.map((timer) => timer.id));
    },
    async release(timers) {
      released.push(...timers.map((timer) => timer.id));
      due = [...timers, ...due];
    },
  };
  const sent: { endpoint: string; payload: unknown }[] = [];
  const sender: PushSender = async (target, payload) => {
    if (options.throwFor?.(target.endpoint)) throw new Error('boom');
    sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
    return options.answer?.(target.endpoint) ?? { ok: true };
  };
  const logs: string[] = [];
  const service = createPushService({
    repository,
    sender: options.sender === false ? undefined : sender,
    publicKey: 'PUBLIC',
    isPushEndpoint: (value) => isPushEndpoint(value),
    now: () => T0,
    log: (message) => logs.push(message),
  });
  return {
    service,
    rows,
    sent,
    marked,
    released,
    logs,
    listed,
    deletedIds,
    setDue: (timers: DueTimer[]) => (due = timers),
  };
}

const timer = (id: string, overrides: Partial<DueTimer> = {}): DueTimer => ({
  cookSessionId: 'session',
  id,
  userId: 'u1',
  recipeId: '11111111-1111-4111-8111-111111111111',
  recipeTitle: 'Crêpes',
  label: 'repos de la pâte',
  endsAt: new Date('2026-10-21T17:59:58.000Z'),
  createdAt: new Date('2026-10-21T17:00:00.000Z'),
  locale: 'fr',
  userDisabled: false,
  ...overrides,
});

describe('push endpoints', () => {
  test('only the push services of the browsers, over https on the default port', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QG')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/abc')).toBe(false);
    expect(isPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isPushEndpoint('https://evilpush.apple.com.example/x')).toBe(false);
    expect(isPushEndpoint('https://localhost/x')).toBe(false);
    expect(isPushEndpoint('https://127.0.0.1/x')).toBe(false);
    expect(isPushEndpoint('not a url')).toBe(false);
  });

  test('the test origin (end-to-end tests only) is accepted, plain http included', () => {
    const origin = 'http://host.docker.internal:4567';
    expect(isPushEndpoint(`${origin}/push/abc`, origin)).toBe(true);
    expect(isPushEndpoint('http://host.docker.internal:4568/push/abc', origin)).toBe(false);
    expect(isPushEndpoint(`${origin}/push/abc`)).toBe(false);
  });
});

describe('subscriptions', () => {
  test('saved per user; the same browser signing in with another account changes hands', async () => {
    const { service, rows } = setup();
    expect(await service.subscribe('u1', input(1), 'Firefox')).toEqual({ ok: true });
    expect(await service.subscribe('u1', input(1), 'Firefox')).toEqual({ ok: true });
    expect(rows).toHaveLength(1);
    await service.subscribe('u2', input(1), 'Firefox');
    expect(rows.map((row) => row.userId)).toEqual(['u2']);
    expect(await service.devices('u1')).toEqual([]);
    expect((await service.devices('u2'))[0]).toMatchObject({ endpoint: endpoint(1) });
  });

  test('other hosts are refused; without VAPID keys push is off', async () => {
    const { service, rows } = setup();
    expect(
      await service.subscribe('u1', { endpoint: 'https://example.com/push', keys: KEYS }, ''),
    ).toEqual({ error: 'unsupported_push_service' });
    expect(rows).toHaveLength(0);
    const off = setup({ sender: false });
    expect(off.service.publicKey()).toBeNull();
    expect(await off.service.subscribe('u1', input(1), '')).toEqual({
      error: 'push_not_configured',
    });
    expect(service.publicKey()).toBe('PUBLIC');
  });

  test('only the most recent browsers are kept; the user agent is cut', async () => {
    const { service, rows } = setup();
    for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_USER + 2; i++) {
      await service.subscribe('u1', input(i), 'x'.repeat(500));
    }
    expect(rows).toHaveLength(MAX_SUBSCRIPTIONS_PER_USER);
    expect(rows.some((row) => row.endpoint === endpoint(0))).toBe(false);
    expect(rows[0]?.userAgent).toHaveLength(300);
  });

  test('unsubscribing removes only the own subscription', async () => {
    const { service, rows } = setup();
    await service.subscribe('u1', input(1), '');
    await service.unsubscribe('u2', endpoint(1));
    expect(rows).toHaveLength(1);
    await service.unsubscribe('u1', endpoint(1));
    expect(rows).toHaveLength(0);
  });
});

describe('scheduler run', () => {
  test('a finished timer goes to every device of its user: dish, then timer name', async () => {
    const { service, sent, marked, setDue } = setup();
    await service.subscribe('u1', input(1), '');
    await service.subscribe('u1', input(2), '');
    await service.subscribe('u2', input(3), '');
    setDue([timer('t1')]);
    expect(await service.notifyDue()).toBe(1);
    expect(sent.map((s) => s.endpoint)).toEqual([endpoint(1), endpoint(2)]);
    expect(sent[0]?.payload).toEqual({
      title: 'Crêpes',
      body: 'repos de la pâte',
      url: '/cook?show=11111111-1111-4111-8111-111111111111',
      tag: 'timer-t1',
    });
    expect(marked).toEqual(['t1']);
  });

  test('a timer without names says it is finished, in the user language', () => {
    expect(timerPayload(timer('t', { label: '', recipeTitle: '', recipeId: null }))).toEqual({
      title: 'CookIt',
      body: 'Minuteur terminé',
      url: '/cook',
      tag: 'timer-t',
    });
    expect(timerPayload(timer('t', { label: '', locale: 'en' })).body).toBe('Timer finished');
  });

  test('disabled users and timers ended before the server knew them: marked, not sent', async () => {
    const { service, sent, marked, setDue } = setup();
    await service.subscribe('u1', input(1), '');
    setDue([
      timer('disabled', { userDisabled: true }),
      timer('offline', { createdAt: new Date('2026-10-21T18:00:00.000Z') }),
    ]);
    await service.notifyDue();
    expect(sent).toHaveLength(0);
    expect(marked).toEqual(['disabled', 'offline']);
  });

  test('a gone subscription (404/410) is deleted; other failures are logged by host only', async () => {
    const { service, rows, logs, marked, setDue } = setup({
      answer: (value) =>
        value.endsWith('/gone')
          ? { ok: false, gone: true, status: 410 }
          : value.endsWith('/down')
            ? { ok: false, gone: false, status: 503 }
            : { ok: true },
    });
    await service.subscribe('u1', input('gone'), '');
    await service.subscribe('u1', input('down'), '');
    await service.subscribe('u1', input('ok'), '');
    setDue([timer('t1')]);
    await service.notifyDue();
    expect(rows.map((row) => row.endpoint)).toEqual([endpoint('down'), endpoint('ok')]);
    expect(logs).toEqual(['Push to fcm.googleapis.com failed (503)']);
    expect(marked).toEqual(['t1']);
  });

  test('without VAPID keys, timers are still marked done', async () => {
    const { service, marked, setDue } = setup({ sender: false });
    setDue([timer('t1')]);
    expect(await service.notifyDue()).toBe(1);
    expect(marked).toEqual(['t1']);
  });

  test('a test notification goes to every device of the user', async () => {
    const { service, sent } = setup();
    await service.subscribe('u1', input(1), '');
    await service.subscribe('u1', input(2), '');
    expect(await service.sendTest('u1', 'en')).toEqual({ sent: 2 });
    expect(sent[0]?.payload).toMatchObject({ title: 'CookIt', url: '/account/notifications' });
  });
});

describe('isPushEndpoint edge cases', () => {
  test('hosts are matched case-insensitively; an explicit default port is the same address', () => {
    expect(isPushEndpoint('https://FCM.GoogleAPIs.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://fcm.googleapis.com:443/fcm/send/abc')).toBe(true);
  });

  test('look-alike hosts, trailing dots, IPv6, other schemes and credentials are refused', () => {
    const refused = [
      'https://fcm.googleapis.com./x',
      'https://xfcm.googleapis.com/x',
      'https://sub.fcm.googleapis.com/x',
      'https://fcm-googleapis.com/x',
      'https://fcm.googleapis.com@evil.example/x',
      'https://evil.example/fcm.googleapis.com',
      'https://evil.example/?h=fcm.googleapis.com',
      'https://push.apple.com.evil.example/x',
      'https://evilpush.apple.com/x',
      'https://pushxservices.mozilla.com/x',
      'https://[::1]/x',
      'https://[::ffff:7f00:1]/x',
      'https://[2001:db8::1]/x',
      'https://0x7f000001/x',
      'https://2130706433/x',
      'http://fcm.googleapis.com/x',
      'ftp://fcm.googleapis.com/x',
      'javascript:alert(1)',
      'data:text/plain,hi',
      'file:///etc/passwd',
      '//fcm.googleapis.com/x',
      '',
    ];
    for (const value of refused) expect([value, isPushEndpoint(value)]).toEqual([value, false]);
  });

  test('subdomains are accepted only for the multi-host push services', () => {
    expect(isPushEndpoint('https://push.services.mozilla.com/x')).toBe(true);
    expect(isPushEndpoint('https://a.b.push.apple.com/x')).toBe(true);
    expect(isPushEndpoint('https://android.googleapis.com/gcm/send/x')).toBe(true);
  });

  test('the test origin does not open other schemes or credentials', () => {
    const origin = 'http://127.0.0.1:4567';
    expect(isPushEndpoint('http://user:pw@127.0.0.1:4567/x', origin)).toBe(false);
    expect(isPushEndpoint('https://127.0.0.1:4567/x', origin)).toBe(false);
    expect(isPushEndpoint('not a url', origin)).toBe(false);
  });
});

describe('scheduler run, more cases', () => {
  test('several timers of several users: one subscription read per user', async () => {
    const { service, listed, sent, marked, setDue } = setup();
    await service.subscribe('u1', input(1), '');
    await service.subscribe('u2', input(2), '');
    listed.length = 0;
    setDue([
      timer('a', { userId: 'u1' }),
      timer('b', { userId: 'u2' }),
      timer('c', { userId: 'u1' }),
      timer('d', { userId: 'u2' }),
    ]);
    expect(await service.notifyDue()).toBe(4);
    expect([...listed].sort()).toEqual(['u1', 'u2']);
    expect(sent.map((s) => (s.payload as { tag: string }).tag)).toEqual([
      'timer-a',
      'timer-b',
      'timer-c',
      'timer-d',
    ]);
    expect(marked).toEqual(['a', 'b', 'c', 'd']);
  });

  test('a user with only skipped timers costs no subscription read', async () => {
    const { service, listed, setDue } = setup();
    listed.length = 0;
    setDue([timer('a', { userDisabled: true })]);
    await service.notifyDue();
    expect(listed).toEqual([]);
  });

  test('a dead subscription is removed even when several timers hit it', async () => {
    const { service, rows, deletedIds, setDue } = setup({
      answer: (value) =>
        value.endsWith('/gone') ? { ok: false, gone: true, status: 410 } : { ok: true },
    });
    await service.subscribe('u1', input('gone'), '');
    await service.subscribe('u1', input('ok'), '');
    setDue([timer('a'), timer('b')]);
    await service.notifyDue();
    expect(rows.map((row) => row.endpoint)).toEqual([endpoint('ok')]);
    expect(new Set(deletedIds).size).toBe(1);
  });

  test('a sender that throws does not abort the batch and is not deleted', async () => {
    const { service, rows, sent, marked, logs, setDue } = setup({
      throwFor: (value) => value.endsWith('/bad'),
    });
    await service.subscribe('u1', input('bad'), '');
    await service.subscribe('u1', input('ok'), '');
    setDue([timer('a'), timer('b', { userId: 'u2' }), timer('c')]);
    expect(await service.notifyDue()).toBe(3);
    expect(rows).toHaveLength(2);
    expect(sent.map((s) => s.endpoint)).toEqual([endpoint('ok'), endpoint('ok')]);
    expect(marked).toEqual(['a', 'b', 'c']);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join()).not.toContain('/fcm/send');
  });

  test('one user gets at most 10 timers per run; the others are released for the next one', async () => {
    const { service, sent, marked, released, setDue } = setup();
    await service.subscribe('u1', input(1), '');
    await service.subscribe('u2', input(2), '');
    setDue([
      ...Array.from({ length: 12 }, (_, i) => timer(`a${i}`)),
      timer('b0', { userId: 'u2' }),
    ]);
    expect(await service.notifyDue()).toBe(13);
    expect(sent).toHaveLength(11);
    expect(marked).toHaveLength(11);
    expect(marked).toContain('b0');
    expect(released).toEqual(['a10', 'a11']);
    expect(await service.notifyDue()).toBe(2);
    expect(marked).toHaveLength(13);
  });

  test('a batch is capped at 50 timers; the next run takes the rest', async () => {
    const { service, marked, setDue } = setup();
    setDue(Array.from({ length: 120 }, (_, i) => timer(`t${i}`, { userId: `u${i}` })));
    expect(await service.notifyDue()).toBe(50);
    expect(await service.notifyDue()).toBe(50);
    expect(await service.notifyDue()).toBe(20);
    expect(marked).toHaveLength(120);
  });

  test('timerPayload encodes the recipe id in the URL and keeps the tag per timer', () => {
    const payload = timerPayload(timer('t 1', { recipeId: 'a/b?c=d&e#f' }));
    expect(payload.url).toBe('/cook?show=a%2Fb%3Fc%3Dd%26e%23f');
    expect(payload.url.startsWith('//')).toBe(false);
    expect(payload.tag).toBe('timer-t 1');
  });

  test('an unknown locale falls back to English', () => {
    expect(timerPayload(timer('t', { label: '', locale: 'de' })).body).toBe('Timer finished');
  });

  test('a test notification counts only the devices that got it, in the user language', async () => {
    const { service, sent } = setup({
      answer: (value) =>
        value.endsWith('/1') ? { ok: false, gone: false, status: 500 } : { ok: true },
    });
    await service.subscribe('u1', input(1), '');
    await service.subscribe('u1', input(2), '');
    expect(await service.sendTest('u1', 'fr')).toEqual({ sent: 1 });
    expect(sent[0]?.payload).toMatchObject({
      body: 'Les notifications fonctionnent sur cet appareil.',
    });
    expect(await service.sendTest('nobody', 'en')).toEqual({ sent: 0 });
  });

  test('the user agent is cut by characters, not in the middle of an emoji', async () => {
    const { service, rows } = setup();
    await service.subscribe('u1', input(1), '🍳'.repeat(400));
    expect(Array.from(rows[0]!.userAgent)).toHaveLength(300);
    expect(rows[0]!.userAgent).not.toContain('�');
  });
});
