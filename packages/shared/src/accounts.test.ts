import { describe, expect, test } from 'bun:test';
import {
  createInviteInputSchema,
  emailSchema,
  INVITE_DEFAULT_DAYS,
  INVITE_MAX_DAYS,
  passwordResetInputSchema,
  passwordSchema,
  registerInputSchema,
  tokenSchema,
  usernameSchema,
} from './accounts';

const TOKEN = 'a'.repeat(40) + '-_9';

describe('tokenSchema', () => {
  test('accepts 43 base64url characters', () => {
    expect(tokenSchema.safeParse(TOKEN).success).toBe(true);
  });

  test('rejects a token of the wrong length', () => {
    expect(tokenSchema.safeParse('a'.repeat(42)).success).toBe(false);
    expect(tokenSchema.safeParse('a'.repeat(44)).success).toBe(false);
    expect(tokenSchema.safeParse('').success).toBe(false);
  });

  test('rejects base64 padding and non-url-safe characters', () => {
    for (const last of ['=', '+', '/', ' ']) {
      expect(tokenSchema.safeParse('a'.repeat(42) + last).success).toBe(false);
    }
  });

  test('rejects a valid token followed by a newline', () => {
    expect(tokenSchema.safeParse(`${TOKEN}\n`).success).toBe(false);
  });
});

describe('usernameSchema', () => {
  test('accepts letters, digits, underscore and dot', () => {
    expect(usernameSchema.safeParse('Jean.Dupont_42').success).toBe(true);
  });

  test('accepts 3 and 30 characters, rejects 2 and 31', () => {
    expect(usernameSchema.safeParse('abc').success).toBe(true);
    expect(usernameSchema.safeParse('a'.repeat(30)).success).toBe(true);
    expect(usernameSchema.safeParse('ab').success).toBe(false);
    expect(usernameSchema.safeParse('a'.repeat(31)).success).toBe(false);
  });

  test('trims surrounding whitespace before checking the length', () => {
    expect(usernameSchema.parse('  alice  ')).toBe('alice');
    expect(usernameSchema.safeParse('  ab  ').success).toBe(false);
  });

  test('rejects spaces, dashes, @, accented letters and invisible characters', () => {
    for (const value of ['jean dupont', 'jean-dupont', 'jean@x', 'élodie', 'ali​ce']) {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    }
  });

  test('keeps the case as typed', () => {
    expect(usernameSchema.parse('Alice')).toBe('Alice');
  });
});

describe('emailSchema', () => {
  test('accepts a regular address', () => {
    expect(emailSchema.safeParse('alice@example.com').success).toBe(true);
  });

  test('rejects malformed addresses', () => {
    for (const value of ['', 'alice', 'alice@', '@example.com', 'alice@example']) {
      expect(emailSchema.safeParse(value).success).toBe(false);
    }
  });

  test('rejects addresses longer than 254 characters', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`;
    const ok = `${local}@${domain}`;
    expect(ok.length).toBeLessThanOrEqual(254);
    expect(emailSchema.safeParse(ok).success).toBe(true);
    const tooLong = `${local}@${'e'.repeat(10)}.${domain}`;
    expect(tooLong.length).toBeGreaterThan(254);
    expect(emailSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  test('accepts 10 to 128 characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(10)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(128)).success).toBe(true);
  });

  test('rejects 9 and 129 characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(9)).success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  test('does not trim the password', () => {
    expect(passwordSchema.parse('  secret12  ')).toBe('  secret12  ');
  });
});

describe('registerInputSchema', () => {
  const valid = {
    token: TOKEN,
    username: 'Alice',
    email: 'alice@example.com',
    password: 'long enough password',
    locale: 'fr',
  };

  test('accepts a complete input without a display name', () => {
    expect(registerInputSchema.safeParse(valid).success).toBe(true);
  });

  test('trims the display name', () => {
    expect(registerInputSchema.parse({ ...valid, name: '  Alice D.  ' }).name).toBe('Alice D.');
  });

  test('rejects a display name with control characters or over 100 characters', () => {
    expect(registerInputSchema.safeParse({ ...valid, name: 'Al‮ice' }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...valid, name: 'a'.repeat(101) }).success).toBe(false);
  });

  test('rejects an unsupported locale', () => {
    expect(registerInputSchema.safeParse({ ...valid, locale: 'de' }).success).toBe(false);
  });

  test('requires every field except the display name', () => {
    for (const key of ['token', 'username', 'email', 'password', 'locale'] as const) {
      const input: Record<string, unknown> = { ...valid };
      delete input[key];
      expect(registerInputSchema.safeParse(input).success).toBe(false);
    }
  });

  test('rejects an invalid token, username, email or password', () => {
    expect(registerInputSchema.safeParse({ ...valid, token: 'short' }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...valid, username: 'a b' }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...valid, email: 'alice' }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });
});

describe('passwordResetInputSchema', () => {
  test('accepts a token and a valid password', () => {
    const input = { token: TOKEN, password: 'long enough password' };
    expect(passwordResetInputSchema.safeParse(input).success).toBe(true);
  });

  test('rejects a too short password or a bad token', () => {
    const short = { token: TOKEN, password: 'short' };
    const badToken = { token: 'x', password: 'long enough password' };
    expect(passwordResetInputSchema.safeParse(short).success).toBe(false);
    expect(passwordResetInputSchema.safeParse(badToken).success).toBe(false);
  });
});

describe('createInviteInputSchema', () => {
  test('defaults the expiry to 7 days', () => {
    expect(INVITE_DEFAULT_DAYS).toBe(7);
    expect(createInviteInputSchema.parse({})).toEqual({ expiresInDays: 7 });
  });

  test('accepts 1 to 90 days', () => {
    expect(INVITE_MAX_DAYS).toBe(90);
    expect(createInviteInputSchema.parse({ expiresInDays: 1 }).expiresInDays).toBe(1);
    expect(createInviteInputSchema.parse({ expiresInDays: 90 }).expiresInDays).toBe(90);
  });

  test('rejects 0, 91, negative, fractional and string expiries', () => {
    for (const expiresInDays of [0, 91, -1, 1.5, '7']) {
      expect(createInviteInputSchema.safeParse({ expiresInDays }).success).toBe(false);
    }
  });

  test('trims the label; a blank label means no label', () => {
    expect(createInviteInputSchema.parse({ label: '  Mum  ' }).label).toBe('Mum');
    expect(createInviteInputSchema.parse({ label: '   ' }).label).toBeUndefined();
    expect(createInviteInputSchema.parse({ label: '' }).label).toBeUndefined();
  });
});
