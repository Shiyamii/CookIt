import { describe, expect, test } from 'bun:test';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  // One hash shared by the tests: argon2id is deliberately slow.
  const password = 'correct horse battery staple';
  const hashed = hashPassword(password);

  test('produces an argon2id hash that does not contain the password', async () => {
    const hash = await hashed;
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain(password);
  });

  test('verifies the right password', async () => {
    expect(await verifyPassword({ hash: await hashed, password })).toBe(true);
  });

  test('rejects a wrong password', async () => {
    expect(await verifyPassword({ hash: await hashed, password: `${password}!` })).toBe(false);
  });

  test('salts each hash (same password, different hashes)', async () => {
    expect(await hashPassword(password)).not.toBe(await hashed);
  });

  test('returns false instead of throwing for a malformed stored hash', async () => {
    expect(await verifyPassword({ hash: 'not-a-hash', password })).toBe(false);
    expect(await verifyPassword({ hash: '', password })).toBe(false);
    expect(await verifyPassword({ hash: '$argon2id$v=19$garbage', password })).toBe(false);
  });
});
