import { describe, expect, test } from 'bun:test';
import {
  backupCodeInputSchema,
  createInviteInputSchema,
  emailSchema,
  INVITE_DEFAULT_DAYS,
  INVITE_MAX_DAYS,
  passkeyAuthenticationInputSchema,
  passkeyDeleteInputSchema,
  passkeyNameSchema,
  passkeyRegistrationInputSchema,
  passkeyRenameInputSchema,
  passwordConfirmInputSchema,
  passwordResetInputSchema,
  passwordSchema,
  registerInputSchema,
  tokenSchema,
  totpCodeInputSchema,
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

describe('passwordConfirmInputSchema', () => {
  test('accepts any non-empty password up to 128 characters, untrimmed', () => {
    expect(passwordConfirmInputSchema.parse({ password: ' x ' })).toEqual({ password: ' x ' });
    expect(passwordConfirmInputSchema.safeParse({ password: 'a'.repeat(128) }).success).toBe(true);
  });

  test('rejects an empty, missing or over 128 characters password', () => {
    expect(passwordConfirmInputSchema.safeParse({ password: '' }).success).toBe(false);
    expect(passwordConfirmInputSchema.safeParse({}).success).toBe(false);
    expect(passwordConfirmInputSchema.safeParse({ password: 'a'.repeat(129) }).success).toBe(false);
  });

  test('rejects unknown fields such as issuer', () => {
    const input = { password: 'secret', issuer: 'Evil' };
    expect(passwordConfirmInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('totpCodeInputSchema', () => {
  test('accepts exactly 6 digits, leading zeros included', () => {
    expect(totpCodeInputSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(totpCodeInputSchema.parse({ code: '000042' }).code).toBe('000042');
  });

  test('rejects 5 or 7 digits', () => {
    expect(totpCodeInputSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(totpCodeInputSchema.safeParse({ code: '1234567' }).success).toBe(false);
  });

  test('rejects letters, spaces, a trailing newline and non-ASCII digits', () => {
    for (const code of ['abcdef', '123 456', ' 123456', '123456\n', '١٢٣٤٥٦', '12345a']) {
      expect(totpCodeInputSchema.safeParse({ code }).success).toBe(false);
    }
  });

  test('rejects a number instead of a string', () => {
    expect(totpCodeInputSchema.safeParse({ code: 123456 }).success).toBe(false);
  });

  test('rejects unknown fields such as trustDevice', () => {
    const input = { code: '123456', trustDevice: true };
    expect(totpCodeInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('backupCodeInputSchema', () => {
  test('accepts a generated backup code and trims it', () => {
    expect(backupCodeInputSchema.parse({ code: '  AbCdE-12345 ' }).code).toBe('AbCdE-12345');
  });

  test('rejects an empty, blank or over 32 characters code', () => {
    for (const code of ['', '   ', 'a'.repeat(33)]) {
      expect(backupCodeInputSchema.safeParse({ code }).success).toBe(false);
    }
    expect(backupCodeInputSchema.safeParse({ code: 'a'.repeat(32) }).success).toBe(true);
  });

  test('rejects unknown fields such as trustDevice or disableSession', () => {
    for (const extra of [{ trustDevice: true }, { disableSession: true }]) {
      const input = { code: 'abcde-12345', ...extra };
      expect(backupCodeInputSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('passkeyNameSchema', () => {
  test('trims and accepts 1 to 64 characters', () => {
    expect(passkeyNameSchema.parse('  My laptop  ')).toBe('My laptop');
    expect(passkeyNameSchema.safeParse('a'.repeat(64)).success).toBe(true);
  });

  test('rejects an empty, blank or over 64 characters name', () => {
    for (const name of ['', '   ', 'a'.repeat(65)]) {
      expect(passkeyNameSchema.safeParse(name).success).toBe(false);
    }
  });

  test('rejects control and bidi override characters', () => {
    for (const name of ['My\nlaptop', 'tab\there', 'nul\u0000', 'Lap‮top', 'a⁦b']) {
      expect(passkeyNameSchema.safeParse(name).success).toBe(false);
    }
  });

  test('accepts accents and emoji', () => {
    expect(passkeyNameSchema.safeParse('Téléphone 📱').success).toBe(true);
  });
});

/** `PublicKeyCredential.toJSON()` of a registration, as the browser sends it. */
const registration = {
  id: 'AbC-_12',
  rawId: 'AbC-_12',
  type: 'public-key',
  authenticatorAttachment: 'platform',
  clientExtensionResults: { credProps: { rk: true } },
  response: {
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0',
    attestationObject: 'o2NmbXRkbm9uZQ',
    authenticatorData: 'SZYN5YgO',
    publicKey: 'MFkwEwYH',
    publicKeyAlgorithm: -7,
    transports: ['internal', 'hybrid'],
  },
};

/** `PublicKeyCredential.toJSON()` of an authentication. */
const authentication = {
  id: 'AbC-_12',
  rawId: 'AbC-_12',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
    authenticatorData: 'SZYN5YgO',
    signature: 'MEUCIQ',
    userHandle: 'dXNlcg',
  },
};

describe('passkeyRegistrationInputSchema', () => {
  test('accepts a WebAuthn registration with or without a name', () => {
    const response = registration;
    expect(passkeyRegistrationInputSchema.safeParse({ response }).success).toBe(true);
    expect(passkeyRegistrationInputSchema.parse({ response, name: ' Phone ' }).name).toBe('Phone');
  });

  test('rejects a missing or non-object response', () => {
    for (const value of [undefined, null, 'x', 42, ['a'], {}]) {
      expect(passkeyRegistrationInputSchema.safeParse({ response: value }).success).toBe(false);
    }
  });

  test('rejects an empty or non-base64url credential id', () => {
    for (const id of ['', 'a+b/c=', 'a b', "x'; drop table passkey;--", 42]) {
      const response = { ...registration, id, rawId: id };
      expect(passkeyRegistrationInputSchema.safeParse({ response }).success).toBe(false);
    }
  });

  test('rejects a credential id over 1024 characters', () => {
    const id = 'a'.repeat(1025);
    const response = { ...registration, id, rawId: id };
    expect(passkeyRegistrationInputSchema.safeParse({ response }).success).toBe(false);
  });

  test('rejects a type other than public-key', () => {
    const response = { ...registration, type: 'password' };
    expect(passkeyRegistrationInputSchema.safeParse({ response }).success).toBe(false);
  });

  test('rejects an inner response without clientDataJSON', () => {
    const inner: Partial<typeof registration.response> = { ...registration.response };
    delete inner.clientDataJSON;
    const response = { ...registration, response: inner };
    expect(passkeyRegistrationInputSchema.safeParse({ response }).success).toBe(false);
  });

  test('rejects too many or too long transports', () => {
    for (const transports of [Array(11).fill('usb'), ['x'.repeat(33)], 'internal']) {
      const response = { ...registration, response: { ...registration.response, transports } };
      expect(passkeyRegistrationInputSchema.safeParse({ response }).success).toBe(false);
    }
  });

  test('rejects an attestation object over 64 KiB or not in base64url', () => {
    for (const attestationObject of ['a'.repeat(65537), 'o2Nm=']) {
      const inner = { ...registration.response, attestationObject };
      const response = { ...registration, response: inner };
      expect(passkeyRegistrationInputSchema.safeParse({ response }).success).toBe(false);
    }
  });

  test('rejects an over 64 characters name or a name with a line break', () => {
    for (const name of ['a'.repeat(65), 'a\nb']) {
      const input = { response: registration, name };
      expect(passkeyRegistrationInputSchema.safeParse(input).success).toBe(false);
    }
  });

  test('rejects unknown fields such as createSession', () => {
    for (const extra of [{ userId: 'someone-else' }, { createSession: true }]) {
      const input = { response: registration, ...extra };
      expect(passkeyRegistrationInputSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('passkeyAuthenticationInputSchema', () => {
  test('accepts a WebAuthn authentication', () => {
    const input = { response: authentication };
    expect(passkeyAuthenticationInputSchema.safeParse(input).success).toBe(true);
  });

  test('rejects a missing response, a bare id and unknown fields', () => {
    expect(passkeyAuthenticationInputSchema.safeParse({}).success).toBe(false);
    const bare = { response: { id: 'x' } };
    expect(passkeyAuthenticationInputSchema.safeParse(bare).success).toBe(false);
    const extra = { response: authentication, rememberMe: true };
    expect(passkeyAuthenticationInputSchema.safeParse(extra).success).toBe(false);
  });

  test('rejects a signature that is not base64url', () => {
    const inner = { ...authentication.response, signature: 'not base64!' };
    const input = { response: { ...authentication, response: inner } };
    expect(passkeyAuthenticationInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('passkeyRenameInputSchema', () => {
  test('accepts an id and a trimmed name', () => {
    expect(passkeyRenameInputSchema.parse({ id: 'pk1', name: ' Work ' })).toEqual({
      id: 'pk1',
      name: 'Work',
    });
  });

  test('requires a non-blank name', () => {
    expect(passkeyRenameInputSchema.safeParse({ id: 'pk1' }).success).toBe(false);
    expect(passkeyRenameInputSchema.safeParse({ id: 'pk1', name: '  ' }).success).toBe(false);
  });

  test('rejects an empty or over 64 characters id', () => {
    for (const id of ['', 'a'.repeat(65)]) {
      expect(passkeyRenameInputSchema.safeParse({ id, name: 'x' }).success).toBe(false);
    }
  });

  test('rejects a name with a bidi override character', () => {
    const input = { id: 'pk1', name: 'a‮b' };
    expect(passkeyRenameInputSchema.safeParse(input).success).toBe(false);
  });

  test('rejects unknown fields', () => {
    const input = { id: 'pk1', name: 'x', userId: 'other' };
    expect(passkeyRenameInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('passkeyDeleteInputSchema', () => {
  const password = 'secret';

  test('accepts 1 to 64 characters ids with the password', () => {
    expect(passkeyDeleteInputSchema.safeParse({ id: 'a', password }).success).toBe(true);
    const long = { id: 'a'.repeat(64), password };
    expect(passkeyDeleteInputSchema.safeParse(long).success).toBe(true);
  });

  test('rejects an empty, missing, non-string or over 64 characters id', () => {
    for (const id of ['', undefined, 42, 'a'.repeat(65)]) {
      expect(passkeyDeleteInputSchema.safeParse({ id, password }).success).toBe(false);
    }
  });

  test('requires a password of 1 to 128 characters', () => {
    for (const value of [undefined, '', 'a'.repeat(129)]) {
      expect(passkeyDeleteInputSchema.safeParse({ id: 'pk1', password: value }).success).toBe(
        false,
      );
    }
    const longest = { id: 'pk1', password: 'a'.repeat(128) };
    expect(passkeyDeleteInputSchema.safeParse(longest).success).toBe(true);
  });

  test('rejects unknown fields', () => {
    const input = { id: 'pk1', password, userId: 'x' };
    expect(passkeyDeleteInputSchema.safeParse(input).success).toBe(false);
  });
});
