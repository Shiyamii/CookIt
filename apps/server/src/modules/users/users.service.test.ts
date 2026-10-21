import { describe, expect, test } from 'bun:test';
import type { PasswordResetService } from '../password-reset/password-reset.service';
import type { UserRow, UsersRepository } from './users.repository';
import { createUsersService } from './users.service';

const NOW = new Date('2026-03-10T12:00:00.000Z');

function user(overrides: Partial<UserRow> & { id: string }): UserRow {
  return {
    name: overrides.id,
    email: `${overrides.id}@example.com`,
    emailVerified: false,
    image: null,
    username: overrides.id.toLowerCase(),
    displayUsername: overrides.id,
    role: 'user',
    locale: 'fr',
    disabledAt: null,
    twoFactorEnabled: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setup(initial: UserRow[]) {
  const users = new Map(initial.map((u) => [u.id, { ...u }]));
  const resetLinks: { userId: string; createdBy: string | null }[] = [];
  const isLastEnabledAdmin = (id: string) => {
    const target = users.get(id);
    if (!target || target.role !== 'admin' || target.disabledAt) return false;
    return ![...users.values()].some((u) => u.role === 'admin' && !u.disabledAt && u.id !== id);
  };

  const repository: UsersRepository = {
    async list() {
      return [...users.values()];
    },
    async findById(id) {
      return users.get(id);
    },
    async findByUsername(username) {
      return [...users.values()].find((u) => u.username === username.toLowerCase());
    },
    // Same rule as the real repository (which checks it inside the transaction).
    async disable(id, now) {
      if (isLastEnabledAdmin(id)) return 'last_admin';
      const target = users.get(id);
      if (target) target.disabledAt ??= now;
      return 'done';
    },
    async enable(id) {
      const target = users.get(id);
      if (target) target.disabledAt = null;
    },
    async delete(id) {
      if (isLastEnabledAdmin(id)) return 'last_admin';
      users.delete(id);
      return 'done';
    },
  };

  const passwordReset: PasswordResetService = {
    async createLink(userId, createdBy) {
      resetLinks.push({ userId, createdBy });
      return { url: `https://cook.example/reset-password#token=for-${userId}` };
    },
    isValid: async () => false,
    reset: async () => false,
  };

  const service = createUsersService({ repository, passwordReset, now: () => NOW });
  return { service, users, resetLinks };
}

const admin = user({ id: 'Admin', role: 'admin' });
const alice = user({ id: 'Alice' });

describe('users service: list', () => {
  test('returns summaries with the display username and ISO dates', async () => {
    const { service } = setup([user({ id: 'Bob', username: 'bob', disabledAt: NOW })]);
    expect(await service.list()).toEqual([
      {
        id: 'Bob',
        username: 'Bob',
        name: 'Bob',
        email: 'Bob@example.com',
        role: 'user',
        locale: 'fr',
        createdAt: '2026-01-01T00:00:00.000Z',
        disabledAt: NOW.toISOString(),
      },
    ]);
  });

  test('falls back to the username, then to an empty string', async () => {
    const { service } = setup([
      user({ id: 'a', username: 'carol', displayUsername: null }),
      user({ id: 'b', username: null, displayUsername: null }),
    ]);
    expect((await service.list()).map((u) => u.username)).toEqual(['carol', '']);
  });
});

describe('users service: disable', () => {
  test('disables another user at the injected time', async () => {
    const { service, users } = setup([admin, alice]);
    expect(await service.disable('Admin', 'Alice')).toEqual({ ok: true });
    expect(users.get('Alice')?.disabledAt).toEqual(NOW);
  });

  test('refuses to disable oneself', async () => {
    const { service, users } = setup([admin, user({ id: 'Admin2', role: 'admin' })]);
    expect(await service.disable('Admin', 'Admin')).toEqual({
      ok: false,
      error: 'cannot_change_self',
    });
    expect(users.get('Admin')?.disabledAt).toBeNull();
  });

  test('returns not_found for an unknown user', async () => {
    const { service } = setup([admin]);
    expect(await service.disable('Admin', 'ghost')).toEqual({ ok: false, error: 'not_found' });
  });

  test('refuses to disable the last enabled admin', async () => {
    // The actor is not an enabled admin here (e.g. disabled meanwhile): only the target is left.
    const { service, users } = setup([
      user({ id: 'Root', role: 'admin' }),
      user({ id: 'Old', role: 'admin', disabledAt: NOW }),
    ]);
    expect(await service.disable('Old', 'Root')).toEqual({ ok: false, error: 'last_admin' });
    expect(users.get('Root')?.disabledAt).toBeNull();
  });

  test('disables an admin when another enabled admin remains', async () => {
    const { service, users } = setup([admin, user({ id: 'Admin2', role: 'admin' })]);
    expect(await service.disable('Admin', 'Admin2')).toEqual({ ok: true });
    expect(users.get('Admin2')?.disabledAt).toEqual(NOW);
  });
});

describe('users service: delete', () => {
  test('deletes another user', async () => {
    const { service, users } = setup([admin, alice]);
    expect(await service.delete('Admin', 'Alice')).toEqual({ ok: true });
    expect(users.has('Alice')).toBe(false);
  });

  test('refuses to delete oneself', async () => {
    const { service, users } = setup([admin, user({ id: 'Admin2', role: 'admin' })]);
    expect(await service.delete('Admin', 'Admin')).toEqual({
      ok: false,
      error: 'cannot_change_self',
    });
    expect(users.has('Admin')).toBe(true);
  });

  test('returns not_found for an unknown user', async () => {
    const { service } = setup([admin]);
    expect(await service.delete('Admin', 'ghost')).toEqual({ ok: false, error: 'not_found' });
  });

  test('refuses to delete the last enabled admin', async () => {
    const { service, users } = setup([
      user({ id: 'Root', role: 'admin' }),
      user({ id: 'Old', role: 'admin', disabledAt: NOW }),
    ]);
    expect(await service.delete('Old', 'Root')).toEqual({ ok: false, error: 'last_admin' });
    expect(users.has('Root')).toBe(true);
  });

  test('deletes an admin when another enabled admin remains', async () => {
    const { service, users } = setup([admin, user({ id: 'Admin2', role: 'admin' })]);
    expect(await service.delete('Admin', 'Admin2')).toEqual({ ok: true });
    expect(users.has('Admin2')).toBe(false);
  });
});

describe('users service: enable', () => {
  test('re-enables a disabled user', async () => {
    const { service, users } = setup([admin, user({ id: 'Alice', disabledAt: NOW })]);
    expect(await service.enable('Alice')).toEqual({ ok: true });
    expect(users.get('Alice')?.disabledAt).toBeNull();
  });

  test('returns not_found for an unknown user', async () => {
    const { service } = setup([admin]);
    expect(await service.enable('ghost')).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('users service: createResetLink', () => {
  test('creates a link for the target, recording the admin as creator', async () => {
    const { service, resetLinks } = setup([admin, alice]);
    expect(await service.createResetLink('Admin', 'Alice')).toEqual({
      ok: true,
      url: 'https://cook.example/reset-password#token=for-Alice',
    });
    expect(resetLinks).toEqual([{ userId: 'Alice', createdBy: 'Admin' }]);
  });

  test('returns not_found and creates no link for an unknown user', async () => {
    const { service, resetLinks } = setup([admin]);
    expect(await service.createResetLink('Admin', 'ghost')).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(resetLinks).toEqual([]);
  });
});

describe('users service: createResetLinkForUsername (rescue CLI)', () => {
  test('creates a link without creator for the user with that username', async () => {
    const { service, resetLinks } = setup([admin, alice]);
    expect(await service.createResetLinkForUsername('alice')).toBe(
      'https://cook.example/reset-password#token=for-Alice',
    );
    expect(resetLinks).toEqual([{ userId: 'Alice', createdBy: null }]);
  });

  test('returns undefined and creates no link for an unknown username', async () => {
    const { service, resetLinks } = setup([admin]);
    expect(await service.createResetLinkForUsername('nobody')).toBeUndefined();
    expect(resetLinks).toEqual([]);
  });
});
