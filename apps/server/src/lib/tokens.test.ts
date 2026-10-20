import { describe, expect, test } from 'bun:test';
import { tokenSchema } from '@cookit/shared';
import { generateToken, hashToken } from './tokens';

describe('generateToken', () => {
  test('returns 43 base64url characters (32 random bytes, no padding)', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  test('is accepted by the shared tokenSchema', () => {
    for (let i = 0; i < 50; i++) {
      expect(tokenSchema.safeParse(generateToken()).success).toBe(true);
    }
  });

  test('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()));
    expect(tokens.size).toBe(1000);
  });
});

describe('hashToken', () => {
  test('is the SHA-256 hex digest of the token', () => {
    // Known vector: SHA-256("abc").
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('is stable for the same token', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  test('differs for different tokens and never contains the token', () => {
    const a = generateToken();
    const b = generateToken();
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});
