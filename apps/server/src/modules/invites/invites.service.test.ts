import { describe, expect, test } from 'bun:test';
import type { RegisterInput } from '@cookit/shared';
import { hashToken } from '../../lib/tokens';
import type {
  AcceptResult,
  InviteRow,
  InvitesRepository,
  InviteWithUser,
  NewAccount,
} from './invites.repository';
import { createInvitesService } from './invites.service';

const ORIGIN = 'https://cook.example';
const NOW = new Date('2026-03-10T12:00:00.000Z');
const DAY_MS = 24 * 3600 * 1000;
const TOKEN = 'T'.repeat(43);

/** In-memory invites repository; `accept` returns `acceptResult` and records its arguments. */
function fakeRepository() {
  const rows: InviteWithUser[] = [];
  const calls: string[] = [];
  const accepted: { tokenHash: string; account: NewAccount; now: Date }[] = [];
  const state = {
    adminExists: false,
    takenEmails: [] as string[],
    acceptResult: { ok: true, userId: 'new-user', role: 'user' } as AcceptResult,
  };

  const repository: InvitesRepository = {
    async create(invite) {
      calls.push('create');
      rows.push({
        id: invite.id,
        tokenHash: invite.tokenHash,
        role: invite.role ?? 'user',
        createdBy: invite.createdBy ?? null,
        label: invite.label ?? null,
        email: invite.email ?? null,
        locale: invite.locale ?? null,
        expiresAt: invite.expiresAt,
        usedBy: invite.usedBy ?? null,
        usedAt: invite.usedAt ?? null,
        revokedAt: invite.revokedAt ?? null,
        createdAt: invite.createdAt ?? NOW,
        usedByUsername: null,
      });
    },
    async list() {
      return rows;
    },
    async findByTokenHash(tokenHash) {
      return rows.find((row) => row.tokenHash === tokenHash);
    },
    async revoke(id, now) {
      const row = rows.find((r) => r.id === id && !r.usedAt && !r.revokedAt);
      if (!row) return false;
      row.revokedAt = now;
      return true;
    },
    async revokePendingSetupLinks(now) {
      calls.push('revokePendingSetupLinks');
      for (const row of rows) {
        if (row.role === 'admin' && row.createdBy === null && !row.usedAt && !row.revokedAt) {
          row.revokedAt = now;
        }
      }
    },
    async adminExists() {
      return state.adminExists;
    },
    async emailTaken(email) {
      return state.takenEmails.includes(email);
    },
    async accept(tokenHash, account, now) {
      accepted.push({ tokenHash, account, now });
      return state.acceptResult;
    },
  };
  return { repository, rows, calls, accepted, state };
}

type SentInvite = { to: string; locale: string; inviter: string; url: string; expiresAt: Date };

function setup(options: { adminEmail?: string; now?: Date; mail?: 'on' | 'off' | 'failing' } = {}) {
  const fake = fakeRepository();
  let ids = 0;
  const hashed: string[] = [];
  const sent: SentInvite[] = [];
  const logs: string[] = [];
  const mail = options.mail ?? 'off';
  const service = createInvitesService({
    repository: fake.repository,
    origin: ORIGIN,
    adminEmail: options.adminEmail,
    hashPassword: async (password) => {
      hashed.push(password);
      return `hashed(${password})`;
    },
    mail: {
      enabled: mail !== 'off',
      async invite(input) {
        if (mail === 'failing') throw Object.assign(new Error('x'), { responseCode: 550 });
        sent.push(input);
      },
    },
    log: (message) => logs.push(message),
    now: () => options.now ?? NOW,
    newId: () => `id-${++ids}`,
  });
  return { service, hashed, sent, logs, ...fake };
}

const ADMIN = { id: 'admin-1', name: 'Ada', locale: 'fr' as const };

/** An invite created without error. */
async function created(
  service: ReturnType<typeof setup>['service'],
  input: Parameters<ReturnType<typeof setup>['service']['create']>[1],
) {
  const result = await service.create(ADMIN, input);
  if ('error' in result) throw new Error(result.error);
  return result;
}

function tokenOf(url: string): string {
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get('token');
  if (!token) throw new Error(`no token in ${url}`);
  return token;
}

function row(overrides: Partial<InviteWithUser> = {}): InviteWithUser {
  return {
    id: 'invite-1',
    tokenHash: hashToken(TOKEN),
    role: 'user',
    createdBy: 'admin-1',
    label: null,
    email: null,
    locale: null,
    expiresAt: new Date(NOW.getTime() + DAY_MS),
    usedBy: null,
    usedAt: null,
    revokedAt: null,
    createdAt: new Date(NOW.getTime() - DAY_MS),
    usedByUsername: null,
    ...overrides,
  };
}

function setupLink(overrides: Partial<InviteRow> = {}): InviteWithUser {
  return row({ role: 'admin', createdBy: null, label: 'setup', ...overrides });
}

describe('invites service: create', () => {
  test('returns an /invite link whose token is stored only as its hash', async () => {
    const { service, rows } = setup();
    const { url } = await created(service, { expiresInDays: 7 });

    expect(url.startsWith(`${ORIGIN}/invite#token=`)).toBe(true);
    const token = tokenOf(url);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  test('creates a user-role invite with the creator and the injected id', async () => {
    const { service, rows } = setup();
    await created(service, {});
    expect(rows[0]).toMatchObject({ id: 'id-1', role: 'user', createdBy: 'admin-1' });
  });

  test('expires after 7 days by default', async () => {
    const { service, rows } = setup();
    await created(service, {});
    expect(rows[0]?.expiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY_MS));
  });

  test('uses a custom expiry in days', async () => {
    const { service, rows } = setup();
    await created(service, { expiresInDays: 30 });
    expect(rows[0]?.expiresAt).toEqual(new Date(NOW.getTime() + 30 * DAY_MS));
  });

  test('stores the label, or null without one', async () => {
    const { service, rows } = setup();
    await created(service, { label: 'For Mum' });
    await created(service, {});
    expect(rows[0]?.label).toBe('For Mum');
    expect(rows[1]?.label).toBeNull();
  });

  test('generates a different token for each invite', async () => {
    const { service } = setup();
    const a = await created(service, {});
    const b = await created(service, {});
    expect(tokenOf(a.url)).not.toBe(tokenOf(b.url));
  });
});

describe('invites service: by email', () => {
  test('sends the link to the address, in the language chosen, from the admin', async () => {
    const { service, rows, sent } = setup({ mail: 'on' });
    const result = await service.create(ADMIN, { email: ' Bob@Example.com ', locale: 'hu' });
    expect(result).toMatchObject({ emailed: true });
    expect(sent).toEqual([
      {
        to: 'bob@example.com',
        locale: 'hu',
        inviter: 'Ada',
        url: (result as { url: string }).url,
        expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
      },
    ]);
    expect(rows[0]).toMatchObject({ email: 'bob@example.com', locale: 'hu' });
  });

  test("uses the admin's language by default", async () => {
    const { service, sent } = setup({ mail: 'on' });
    await service.create(ADMIN, { email: 'bob@example.com' });
    expect(sent[0]?.locale).toBe('fr');
  });

  test('pre-fills the address and the language at sign-up', async () => {
    const { service } = setup({ mail: 'on' });
    const { url } = await created(service, { email: 'bob@example.com', locale: 'en' });
    expect(await service.check(tokenOf(url))).toEqual({
      role: 'user',
      email: 'bob@example.com',
      locale: 'en',
    });
  });

  test('refused without email settings, or for an address an account already has', async () => {
    const off = setup();
    expect(await off.service.create(ADMIN, { email: 'bob@example.com' })).toEqual({
      error: 'email_not_configured',
    });
    expect(off.rows).toHaveLength(0);
    const on = setup({ mail: 'on' });
    on.state.takenEmails.push('bob@example.com');
    expect(await on.service.create(ADMIN, { email: 'BOB@example.com' })).toEqual({
      error: 'email_taken',
    });
    expect(on.rows).toHaveLength(0);
  });

  test('an email that cannot be sent still leaves the link to copy', async () => {
    const { service, rows, logs } = setup({ mail: 'failing' });
    const result = await service.create(ADMIN, { email: 'bob@example.com' });
    expect(result).toMatchObject({ emailed: false });
    expect((result as { url: string }).url.startsWith(`${ORIGIN}/invite#token=`)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(logs.join(' ')).toContain('550');
    expect(logs.join(' ')).not.toContain('bob@example.com');
  });

  test('without an address nothing is sent, even with email settings', async () => {
    const { service, sent, rows } = setup({ mail: 'on' });
    expect(await service.create(ADMIN, {})).toMatchObject({ emailed: false });
    expect(sent).toHaveLength(0);
    expect(rows[0]).toMatchObject({ email: null, locale: null });
  });
});

describe('invites service: list', () => {
  test('is pending before expiry and expired at the exact expiry instant', async () => {
    const { service, rows } = setup();
    rows.push(row({ id: 'pending', expiresAt: new Date(NOW.getTime() + 1) }));
    rows.push(row({ id: 'expired', expiresAt: NOW }));
    const list = await service.list();
    expect(list.map((i) => [i.id, i.status])).toEqual([
      ['pending', 'pending'],
      ['expired', 'expired'],
    ]);
  });

  test('is used when consumed, even if later expired or revoked', async () => {
    const { service, rows } = setup();
    rows.push(
      row({
        usedAt: NOW,
        revokedAt: NOW,
        expiresAt: new Date(NOW.getTime() - DAY_MS),
      }),
    );
    expect((await service.list())[0]?.status).toBe('used');
  });

  test('is revoked when revoked, even if also expired', async () => {
    const { service, rows } = setup();
    rows.push(row({ revokedAt: NOW, expiresAt: new Date(NOW.getTime() - DAY_MS) }));
    expect((await service.list())[0]?.status).toBe('revoked');
  });

  test('computes the status with the injected clock', async () => {
    const later = new Date(NOW.getTime() + 2 * DAY_MS);
    const { service, rows } = setup({ now: later });
    rows.push(row());
    expect((await service.list())[0]?.status).toBe('expired');
  });

  test('serializes dates as ISO strings and never exposes the token hash', async () => {
    const { service, rows } = setup();
    rows.push(row({ usedAt: NOW, usedBy: 'u-2', usedByUsername: 'Bob', label: 'Bob' }));
    const [summary] = await service.list();
    expect(summary).toEqual({
      id: 'invite-1',
      label: 'Bob',
      role: 'user',
      status: 'used',
      createdAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
      expiresAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
      usedAt: NOW.toISOString(),
      usedByUsername: 'Bob',
      email: null,
    });
    expect(JSON.stringify(summary)).not.toContain(hashToken(TOKEN));
  });

  test('returns null usedAt for an unused invite', async () => {
    const { service, rows } = setup();
    rows.push(row());
    expect((await service.list())[0]?.usedAt).toBeNull();
  });
});

describe('invites service: revoke', () => {
  test('revokes a pending invite at the injected time', async () => {
    const { service, rows } = setup();
    rows.push(row());
    expect(await service.revoke('invite-1')).toBe(true);
    expect(rows[0]?.revokedAt).toEqual(NOW);
  });

  test('returns false for an unknown or already used invite', async () => {
    const { service, rows } = setup();
    rows.push(row({ usedAt: NOW }));
    expect(await service.revoke('invite-1')).toBe(false);
    expect(await service.revoke('missing')).toBe(false);
  });
});

describe('invites service: check', () => {
  test('returns the role of a pending user invite, without an email', async () => {
    const { service, rows } = setup({ adminEmail: 'admin@example.com' });
    rows.push(row());
    expect(await service.check(TOKEN)).toEqual({ role: 'user' });
  });

  test('is undefined for an unknown token', async () => {
    const { service, rows } = setup();
    rows.push(row());
    expect(await service.check('U'.repeat(43))).toBeUndefined();
  });

  test('is undefined for a used, revoked or expired invite', async () => {
    for (const overrides of [{ usedAt: NOW }, { revokedAt: NOW }, { expiresAt: NOW }]) {
      const { service, rows } = setup();
      rows.push(row(overrides));
      expect(await service.check(TOKEN)).toBeUndefined();
    }
  });

  test('returns the admin role and ADMIN_EMAIL for a setup link while no admin exists', async () => {
    const { service, rows } = setup({ adminEmail: 'admin@example.com' });
    rows.push(setupLink());
    expect(await service.check(TOKEN)).toEqual({ role: 'admin', email: 'admin@example.com' });
  });

  test('omits the email for a setup link when ADMIN_EMAIL is not set', async () => {
    const { service, rows } = setup();
    rows.push(setupLink());
    expect(await service.check(TOKEN)).toEqual({ role: 'admin' });
  });

  test('is undefined for a setup link once an admin exists', async () => {
    const { service, rows, state } = setup({ adminEmail: 'admin@example.com' });
    rows.push(setupLink());
    state.adminExists = true;
    expect(await service.check(TOKEN)).toBeUndefined();
  });

  test('a user invite stays valid when an admin exists', async () => {
    const { service, rows, state } = setup();
    rows.push(row());
    state.adminExists = true;
    expect(await service.check(TOKEN)).toEqual({ role: 'user' });
  });

  test('works with the token returned by create', async () => {
    const { service } = setup();
    const { url } = await created(service, {});
    expect(await service.check(tokenOf(url))).toEqual({ role: 'user' });
  });
});

describe('invites service: accept', () => {
  const input: RegisterInput = {
    token: TOKEN,
    username: 'Alice.Dupont',
    email: 'Alice@Example.COM',
    password: 'long enough password',
    locale: 'en',
  };
  /** A pending invite for TOKEN. */
  const pending = () => {
    const ready = setup();
    ready.rows.push(row());
    return ready;
  };

  test('passes the token hash, the injected id and time to the repository', async () => {
    const { service, accepted } = pending();
    await service.accept(input);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.tokenHash).toBe(hashToken(TOKEN));
    expect(accepted[0]?.now).toEqual(NOW);
    expect(accepted[0]?.account.id).toBe('id-1');
    expect(JSON.stringify(accepted[0])).not.toContain(TOKEN);
  });

  test('lowercases username and email, keeps the typed username for display', async () => {
    const { service, accepted } = pending();
    await service.accept(input);
    expect(accepted[0]?.account).toMatchObject({
      username: 'alice.dupont',
      displayUsername: 'Alice.Dupont',
      email: 'alice@example.com',
      locale: 'en',
    });
  });

  test('trims the username and email', async () => {
    const { service, accepted } = pending();
    await service.accept({ ...input, username: '  Alice  ', email: ' alice@example.com ' });
    expect(accepted[0]?.account).toMatchObject({
      username: 'alice',
      displayUsername: 'Alice',
      email: 'alice@example.com',
    });
  });

  test('uses the typed username as display name when no name is given', async () => {
    const { service, accepted } = pending();
    await service.accept(input);
    expect(accepted[0]?.account.name).toBe('Alice.Dupont');
  });

  test('uses the username as display name when the name is blank', async () => {
    const { service, accepted } = pending();
    await service.accept({ ...input, name: '   ' });
    expect(accepted[0]?.account.name).toBe('Alice.Dupont');
  });

  test('keeps a given display name, trimmed', async () => {
    const { service, accepted } = pending();
    await service.accept({ ...input, name: '  Alice D.  ' });
    expect(accepted[0]?.account.name).toBe('Alice D.');
  });

  test('stores the hash from the injected hasher, never the password', async () => {
    const { service, accepted, hashed } = pending();
    await service.accept(input);
    expect(hashed).toEqual(['long enough password']);
    expect(accepted[0]?.account.passwordHash).toBe('hashed(long enough password)');
    expect(JSON.stringify(accepted[0]?.account)).not.toContain('"long enough password"');
  });

  test('returns the created user with the lowercased username on success', async () => {
    const { service, state } = pending();
    state.acceptResult = { ok: true, userId: 'id-1', role: 'admin' };
    expect(await service.accept(input)).toEqual({
      ok: true,
      userId: 'id-1',
      role: 'admin',
      username: 'alice.dupont',
    });
  });

  test('returns repository errors unchanged, without a username', async () => {
    for (const error of ['invalid_token', 'username_taken', 'email_taken'] as const) {
      const { service, state } = pending();
      state.acceptResult = { ok: false, error };
      expect(await service.accept(input)).toEqual({ ok: false, error });
    }
  });

  test('a link that cannot work is refused before the password is hashed', async () => {
    const unknown = setup();
    expect(await unknown.service.accept(input)).toEqual({ ok: false, error: 'invalid_token' });
    expect(unknown.hashed).toEqual([]);
    expect(unknown.accepted).toEqual([]);
    for (const overrides of [{ usedAt: NOW }, { revokedAt: NOW }, { expiresAt: NOW }]) {
      const { service, rows, hashed, accepted } = setup();
      rows.push(row(overrides));
      expect(await service.accept(input)).toEqual({ ok: false, error: 'invalid_token' });
      expect(hashed).toEqual([]);
      expect(accepted).toEqual([]);
    }
  });
});

describe('invites service: createSetupLinkIfNoAdmin', () => {
  test('returns undefined and creates nothing once an admin exists', async () => {
    const { service, rows, calls, state } = setup();
    state.adminExists = true;
    expect(await service.createSetupLinkIfNoAdmin()).toBeUndefined();
    expect(rows).toHaveLength(0);
    expect(calls).toEqual([]);
  });

  test('returns a /setup link for a 24 h admin invite without creator', async () => {
    const { service, rows } = setup();
    const url = await service.createSetupLinkIfNoAdmin();
    expect(url?.startsWith(`${ORIGIN}/setup#token=`)).toBe(true);
    const token = tokenOf(url ?? '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'id-1',
      role: 'admin',
      createdBy: null,
      label: 'setup',
      tokenHash: hashToken(token),
      expiresAt: new Date(NOW.getTime() + DAY_MS),
    });
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  test('revokes previous setup links before creating the new one', async () => {
    const { service, rows, calls } = setup();
    rows.push(setupLink({ id: 'old-setup' }));
    await service.createSetupLinkIfNoAdmin();
    expect(calls).toEqual(['revokePendingSetupLinks', 'create']);
    expect(rows.find((r) => r.id === 'old-setup')?.revokedAt).toEqual(NOW);
  });

  test('only the newest setup link passes check after two restarts', async () => {
    const { service } = setup();
    const first = await service.createSetupLinkIfNoAdmin();
    const second = await service.createSetupLinkIfNoAdmin();
    expect(await service.check(tokenOf(first ?? ''))).toBeUndefined();
    expect(await service.check(tokenOf(second ?? ''))).toEqual({ role: 'admin' });
  });
});
