import { describe, expect, test } from 'bun:test';
import type { RateLimitRepository } from './rate-limit.repository';
import type { RateLimitRule } from './rate-limit.service';
import { createRateLimitService } from './rate-limit.service';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const RULE: RateLimitRule = { name: 'sign-in:ip', limit: 3, windowSeconds: 60 };

/** Fixed-window counters keyed like the real table; the window starts at the first hit. */
function setup(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => NOW);
  const counters = new Map<string, { count: number; windowStart: Date }>();
  const keys: string[] = [];
  const deletedBefore: Date[] = [];

  const repository: RateLimitRepository = {
    async hit(key, windowSeconds) {
      keys.push(key);
      const current = counters.get(key);
      const expired =
        !current || current.windowStart.getTime() + windowSeconds * 1000 <= now().getTime();
      const next = expired
        ? { count: 1, windowStart: now() }
        : { count: current.count + 1, windowStart: current.windowStart };
      counters.set(key, next);
      return {
        count: next.count,
        resetAt: new Date(next.windowStart.getTime() + windowSeconds * 1000),
      };
    },
    async refund(key) {
      const current = counters.get(key);
      if (current) current.count = Math.max(0, current.count - 1);
    },
    async deleteOlderThan(date) {
      deletedBefore.push(date);
    },
    async deleteAll() {
      counters.clear();
    },
  };
  const service = createRateLimitService({ repository, now: options.now ?? (() => NOW) });
  return { service, keys, deletedBefore };
}

describe('rate limit service: check', () => {
  test('allows hits up to the limit, then refuses', async () => {
    const { service } = setup();
    const decisions = [];
    for (let i = 0; i < 5; i++) decisions.push((await service.check(RULE, '1.2.3.4')).allowed);
    expect(decisions).toEqual([true, true, true, false, false]);
  });

  test('stores counters under `<rule name>:<subject>`', async () => {
    const { service, keys } = setup();
    await service.check(RULE, '1.2.3.4');
    expect(keys).toEqual(['sign-in:ip:1.2.3.4']);
  });

  test('counts each subject separately', async () => {
    const { service } = setup();
    for (let i = 0; i < 3; i++) await service.check(RULE, 'a');
    expect((await service.check(RULE, 'a')).allowed).toBe(false);
    expect((await service.check(RULE, 'b')).allowed).toBe(true);
  });

  test('counts each rule separately for the same subject', async () => {
    const { service } = setup();
    for (let i = 0; i < 3; i++) await service.check(RULE, 'a');
    const other: RateLimitRule = { ...RULE, name: 'register:ip' };
    expect((await service.check(other, 'a')).allowed).toBe(true);
  });

  test('retryAfter is the time left in the window, rounded up to whole seconds', async () => {
    let now = NOW;
    const { service } = setup({ now: () => now });
    await service.check(RULE, 'a');
    now = new Date(NOW.getTime() + 20_500);
    expect((await service.check(RULE, 'a')).retryAfterSeconds).toBe(40);
  });

  test('retryAfter is at least 1 second, even when the window already ended', async () => {
    const repository: RateLimitRepository = {
      hit: async () => ({ count: 10, resetAt: new Date(NOW.getTime() - 5000) }),
      refund: async () => {},
      deleteOlderThan: async () => {},
      deleteAll: async () => {},
    };
    const service = createRateLimitService({ repository, now: () => NOW });
    expect(await service.check(RULE, 'a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  test('a refunded hit does not count (rate limits on failures only)', async () => {
    const { service, keys } = setup();
    // Ten successes, each refunded: still allowed.
    for (let i = 0; i < 10; i++) {
      expect((await service.check(RULE, 'a')).allowed).toBe(true);
      await service.refund(RULE, 'a');
    }
    // Failures are kept: refused past the limit.
    for (let i = 0; i < 3; i++) await service.check(RULE, 'a');
    expect((await service.check(RULE, 'a')).allowed).toBe(false);
    expect(new Set(keys)).toEqual(new Set(['sign-in:ip:a']));
  });

  test('allows again once the window has passed', async () => {
    let now = NOW;
    const { service } = setup({ now: () => now });
    for (let i = 0; i < 4; i++) await service.check(RULE, 'a');
    now = new Date(NOW.getTime() + 60_000);
    expect((await service.check(RULE, 'a')).allowed).toBe(true);
  });
});

describe('rate limit service: purgeExpired', () => {
  test('deletes counters older than 24 hours', async () => {
    const { service, deletedBefore } = setup();
    await service.purgeExpired();
    expect(deletedBefore).toEqual([new Date(NOW.getTime() - 24 * 3600 * 1000)]);
  });
});
