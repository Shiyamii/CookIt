import { describe, expect, test } from 'bun:test';
import type { AccountSecurityRepository, PasskeyRow } from './account-security.repository';
import { createAccountSecurityService } from './account-security.service';

const NOW = new Date('2026-03-10T12:00:00.000Z');

function passkey(overrides: Partial<PasskeyRow> & { id: string }): PasskeyRow {
  return {
    name: null,
    createdAt: new Date('2026-02-01T08:30:00.000Z'),
    backedUp: false,
    ...overrides,
  };
}

/** In-memory accounts: 2FA flag, passkeys and password hash (`hash:<password>`), per user id. */
function setup(
  accounts: Record<
    string,
    { twoFactorEnabled?: boolean; passkeys?: PasskeyRow[]; password?: string }
  >,
) {
  const calls: string[] = [];
  const purges: Date[] = [];
  const repository: AccountSecurityRepository = {
    async twoFactorEnabled(userId) {
      calls.push(`twoFactorEnabled:${userId}`);
      return accounts[userId]?.twoFactorEnabled ?? false;
    },
    async listPasskeys(userId) {
      calls.push(`listPasskeys:${userId}`);
      return accounts[userId]?.passkeys ?? [];
    },
    async passwordHash(userId) {
      calls.push(`passwordHash:${userId}`);
      const password = accounts[userId]?.password;
      return password === undefined ? undefined : `hash:${password}`;
    },
    async deleteExpiredVerifications(now) {
      purges.push(now);
    },
  };
  const verified: { hash: string; password: string }[] = [];
  const verifyPassword = async (input: { hash: string; password: string }) => {
    verified.push(input);
    return input.hash === `hash:${input.password}`;
  };
  const service = createAccountSecurityService({ repository, verifyPassword, now: () => NOW });
  return { service, calls, purges, verified };
}

describe('get', () => {
  test('reports 2FA off and no passkeys for a fresh account', async () => {
    const { service } = setup({ alice: { password: 'pw' } });
    expect(await service.get('alice')).toEqual({ twoFactorEnabled: false, passkeys: [] });
  });

  test('reports 2FA on', async () => {
    const { service } = setup({ alice: { twoFactorEnabled: true } });
    expect((await service.get('alice')).twoFactorEnabled).toBe(true);
  });

  test('maps passkeys to summaries with ISO dates, in repository order', async () => {
    const { service } = setup({
      alice: {
        passkeys: [
          passkey({ id: 'pk1', name: 'Laptop', backedUp: true }),
          passkey({ id: 'pk2', createdAt: new Date('2026-03-04T05:06:07.000Z') }),
        ],
      },
    });
    expect((await service.get('alice')).passkeys).toEqual([
      { id: 'pk1', name: 'Laptop', createdAt: '2026-02-01T08:30:00.000Z', backedUp: true },
      { id: 'pk2', name: null, createdAt: '2026-03-04T05:06:07.000Z', backedUp: false },
    ]);
  });

  test('maps a passkey without creation date to a null date', async () => {
    const { service } = setup({ alice: { passkeys: [passkey({ id: 'pk1', createdAt: null })] } });
    expect((await service.get('alice')).passkeys[0]?.createdAt).toBeNull();
  });

  test('never exposes fields other than the summary ones', async () => {
    const row = { ...passkey({ id: 'pk1' }), publicKey: 'secret', credentialID: 'cred' };
    const { service } = setup({ alice: { passkeys: [row] } });
    expect(Object.keys((await service.get('alice')).passkeys[0] ?? {}).sort()).toEqual([
      'backedUp',
      'createdAt',
      'id',
      'name',
    ]);
  });

  test("only reads the requested user's data", async () => {
    const { service, calls } = setup({
      alice: { passkeys: [passkey({ id: 'pk1' })] },
      bob: { twoFactorEnabled: true, passkeys: [passkey({ id: 'pk2' })] },
    });
    expect(await service.get('alice')).toEqual({
      twoFactorEnabled: false,
      passkeys: [expect.objectContaining({ id: 'pk1' })],
    });
    expect(calls.every((call) => call.endsWith(':alice'))).toBe(true);
  });
});

describe('canRemovePasskey', () => {
  test('is not_found for an unknown passkey id', async () => {
    const { service } = setup({ alice: { passkeys: [passkey({ id: 'pk1' })], password: 'pw' } });
    expect(await service.canRemovePasskey('alice', 'nope')).toBe('not_found');
  });

  test("is not_found for another user's passkey", async () => {
    const { service } = setup({
      alice: { passkeys: [passkey({ id: 'pk1' })], password: 'pw' },
      bob: { passkeys: [passkey({ id: 'pk2' })], password: 'pw' },
    });
    expect(await service.canRemovePasskey('alice', 'pk2')).toBe('not_found');
  });

  test('is not_found for a user without any passkey', async () => {
    const { service } = setup({ alice: { password: 'pw' } });
    expect(await service.canRemovePasskey('alice', 'pk1')).toBe('not_found');
  });

  test('is ok for the only passkey when the account has a password', async () => {
    const { service } = setup({ alice: { passkeys: [passkey({ id: 'pk1' })], password: 'pw' } });
    expect(await service.canRemovePasskey('alice', 'pk1')).toBe('ok');
  });

  test('is ok without a password when another passkey remains', async () => {
    const { service } = setup({
      alice: { passkeys: [passkey({ id: 'pk1' }), passkey({ id: 'pk2' })] },
    });
    expect(await service.canRemovePasskey('alice', 'pk2')).toBe('ok');
  });

  test('is last_sign_in_method for the only passkey of an account without password', async () => {
    const { service } = setup({ alice: { passkeys: [passkey({ id: 'pk1' })] } });
    expect(await service.canRemovePasskey('alice', 'pk1')).toBe('last_sign_in_method');
  });

  test('does not read the password when another passkey remains', async () => {
    const { service, calls } = setup({
      alice: { passkeys: [passkey({ id: 'pk1' }), passkey({ id: 'pk2' })] },
    });
    await service.canRemovePasskey('alice', 'pk1');
    expect(calls).not.toContain('passwordHash:alice');
  });

  test('does not read the password for an unknown passkey', async () => {
    const { service, calls } = setup({ alice: { password: 'pw' } });
    await service.canRemovePasskey('alice', 'pk1');
    expect(calls).toEqual(['listPasskeys:alice']);
  });
});

describe('confirmPassword', () => {
  test("is true for the user's password", async () => {
    const { service, verified } = setup({ alice: { password: 'right one' } });
    expect(await service.confirmPassword('alice', 'right one')).toBe(true);
    expect(verified).toEqual([{ hash: 'hash:right one', password: 'right one' }]);
  });

  test('is false for a wrong password', async () => {
    const { service } = setup({ alice: { password: 'right one' } });
    expect(await service.confirmPassword('alice', 'wrong one')).toBe(false);
  });

  test("is false for another user's password", async () => {
    const { service } = setup({ alice: { password: 'alice pw' }, bob: { password: 'bob pw' } });
    expect(await service.confirmPassword('alice', 'bob pw')).toBe(false);
  });

  test('is false without verifying anything for an account without password', async () => {
    const { service, verified } = setup({ alice: {} });
    expect(await service.confirmPassword('alice', 'anything')).toBe(false);
    expect(verified).toEqual([]);
  });

  test('is false for an unknown user', async () => {
    const { service } = setup({});
    expect(await service.confirmPassword('ghost', 'anything')).toBe(false);
  });
});

describe('purgeExpired', () => {
  test('deletes the challenges expired at the injected time', async () => {
    const { service, purges } = setup({});
    await service.purgeExpired();
    expect(purges).toEqual([NOW]);
  });
});
