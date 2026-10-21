import { describe, expect, test } from 'bun:test';
import { pushSubscriptionInputSchema, pushUnsubscribeInputSchema } from './push';

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  expirationTime: null,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
};
const parse = (value: unknown) => pushSubscriptionInputSchema.safeParse(value).success;
const withKeys = (keys: object) => ({ ...valid, keys: { ...valid.keys, ...keys } });

describe('pushSubscriptionInputSchema', () => {
  test('accepts what PushSubscription.toJSON gives', () => {
    expect(parse(valid)).toBe(true);
    expect(parse({ endpoint: valid.endpoint, keys: valid.keys })).toBe(true);
    expect(parse({ ...valid, expirationTime: 1_700_000_000_000 })).toBe(true);
  });

  test('refuses unknown fields at both levels', () => {
    expect(parse({ ...valid, extra: 1 })).toBe(false);
    expect(parse(withKeys({ extra: 'x' }))).toBe(false);
  });

  test('refuses missing or non-string keys', () => {
    expect(parse({ endpoint: valid.endpoint })).toBe(false);
    expect(parse({ ...valid, keys: { p256dh: valid.keys.p256dh } })).toBe(false);
    expect(parse(withKeys({ auth: 123 }))).toBe(false);
    expect(parse({ ...valid, expirationTime: '1' })).toBe(false);
  });

  test('p256dh and auth lengths are bounded', () => {
    expect(parse(withKeys({ p256dh: 'B'.repeat(79) }))).toBe(false);
    expect(parse(withKeys({ p256dh: 'B'.repeat(80) }))).toBe(true);
    expect(parse(withKeys({ p256dh: 'B'.repeat(100) }))).toBe(true);
    expect(parse(withKeys({ p256dh: 'B'.repeat(101) }))).toBe(false);
    expect(parse(withKeys({ auth: 'a'.repeat(15) }))).toBe(false);
    expect(parse(withKeys({ auth: 'a'.repeat(16) }))).toBe(true);
    expect(parse(withKeys({ auth: 'a'.repeat(32) }))).toBe(true);
    expect(parse(withKeys({ auth: 'a'.repeat(33) }))).toBe(false);
  });

  test('keys are base64url only', () => {
    expect(parse(withKeys({ auth: 'a-b_c'.repeat(5) }))).toBe(true);
    expect(parse(withKeys({ auth: 'a+b/c'.repeat(5) }))).toBe(false);
    expect(parse(withKeys({ auth: 'a b c'.repeat(5) }))).toBe(false);
    expect(parse(withKeys({ auth: 'a'.repeat(21) + '\n' }))).toBe(false);
    expect(parse(withKeys({ auth: 'a'.repeat(20) + '==' }))).toBe(true);
    expect(parse(withKeys({ auth: 'a'.repeat(19) + '===' }))).toBe(false);
  });

  test('the endpoint must be an http(s) URL of at most 2048 characters', () => {
    for (const endpoint of [
      'javascript:alert(1)',
      'data:text/plain,hi',
      'file:///etc/passwd',
      'ftp://fcm.googleapis.com/x',
      'not a url',
      '',
    ]) {
      expect([endpoint, parse({ ...valid, endpoint })]).toEqual([endpoint, false]);
    }
    expect(parse({ ...valid, endpoint: 'http://localhost:4567/push' })).toBe(true);
    const prefix = 'https://fcm.googleapis.com/';
    expect(parse({ ...valid, endpoint: prefix + 'a'.repeat(2048 - prefix.length) })).toBe(true);
    expect(parse({ ...valid, endpoint: prefix + 'a'.repeat(2049 - prefix.length) })).toBe(false);
  });

  test('refuses non-objects', () => {
    for (const value of [null, undefined, 'x', 1, [], [valid]]) expect(parse(value)).toBe(false);
  });
});

describe('pushUnsubscribeInputSchema', () => {
  const ok = (value: unknown) => pushUnsubscribeInputSchema.safeParse(value).success;

  test('needs exactly an http(s) endpoint', () => {
    expect(ok({ endpoint: valid.endpoint })).toBe(true);
    expect(ok({})).toBe(false);
    expect(ok({ endpoint: valid.endpoint, keys: valid.keys })).toBe(false);
    expect(ok({ endpoint: 'javascript:alert(1)' })).toBe(false);
    expect(ok({ endpoint: 'data:text/plain,hi' })).toBe(false);
    expect(ok({ endpoint: 'https://x.example/' + 'a'.repeat(2048) })).toBe(false);
  });
});
