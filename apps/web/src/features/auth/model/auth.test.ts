import { describe, expect, test } from 'bun:test';
import { linkToken, normalizeTotp, webAuthnErrorCode } from './auth';

describe('linkToken', () => {
  test('reads the token of a link fragment', () => {
    expect(linkToken('#token=abc_DEF-123')).toBe('abc_DEF-123');
  });

  test('is empty without a token', () => {
    expect(linkToken('')).toBe('');
    expect(linkToken('#other=1')).toBe('');
  });
});

describe('normalizeTotp', () => {
  test('removes the spaces authenticator apps display', () => {
    expect(normalizeTotp(' 123 456 ')).toBe('123456');
    expect(normalizeTotp('123 456')).toBe('123456');
  });
});

describe('webAuthnErrorCode', () => {
  const named = (name: string) => Object.assign(new Error('x'), { name });

  test('a dismissed or aborted browser dialog is a cancellation', () => {
    expect(webAuthnErrorCode(named('NotAllowedError'))).toBe('passkey_cancelled');
    expect(webAuthnErrorCode(named('AbortError'))).toBe('passkey_cancelled');
  });

  test('an authenticator that already holds a passkey for us', () => {
    expect(webAuthnErrorCode(named('InvalidStateError'))).toBe('passkey_exists');
  });

  test('anything else is a generic failure', () => {
    expect(webAuthnErrorCode(named('SecurityError'))).toBe('passkey_failed');
    expect(webAuthnErrorCode('not an error')).toBe('passkey_failed');
  });
});
