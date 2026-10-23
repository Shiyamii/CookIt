import { describe, expect, test } from 'bun:test';
import { hashToken } from '../../lib/tokens';
import type {
  PasswordResetRepository,
  PasswordResetRow,
  ResetAccount,
} from './password-reset.repository';
import { createPasswordResetService } from './password-reset.service';

const ORIGIN = 'https://cook.example';
const NOW = new Date('2026-03-10T12:00:00.000Z');
const DAY_MS = 24 * 3600 * 1000;
const TOKEN = 'R'.repeat(43);

type SentReset = { to: string; locale: string; username: string; url: string };

function setup(options: { now?: Date; mail?: 'on' | 'off' | 'failing' } = {}) {
  const rows: PasswordResetRow[] = [];
  const accounts: ResetAccount[] = [];
  const sent: SentReset[] = [];
  const logs: string[] = [];
  const mail = options.mail ?? 'off';
  const events: string[] = [];
  const consumed: { tokenHash: string; passwordHash: string; now: Date }[] = [];
  const state = { consumeResult: true };

  const repository: PasswordResetRepository = {
    async create(reset) {
      rows.push({
        id: reset.id,
        tokenHash: reset.tokenHash,
        userId: reset.userId,
        createdBy: reset.createdBy ?? null,
        kind: reset.kind ?? 'admin',
        expiresAt: reset.expiresAt,
        usedAt: reset.usedAt ?? null,
        createdAt: reset.createdAt ?? NOW,
      });
    },
    async findByTokenHash(tokenHash) {
      return rows.find((row) => row.tokenHash === tokenHash);
    },
    async findAccount(identifier) {
      const value = identifier.trim().toLowerCase();
      return accounts.find(
        (account) => account.email.toLowerCase() === value || account.username === value,
      );
    },
    async consume(tokenHash, passwordHash, now) {
      events.push('consume');
      consumed.push({ tokenHash, passwordHash, now });
      return state.consumeResult;
    },
  };

  const service = createPasswordResetService({
    repository,
    origin: ORIGIN,
    hashPassword: async (password) => {
      events.push('hash');
      return `hashed(${password})`;
    },
    mail: {
      enabled: mail !== 'off',
      async passwordReset(input) {
        if (mail === 'failing') throw new Error('connection refused');
        sent.push(input);
      },
    },
    log: (message) => logs.push(message),
    now: () => options.now ?? NOW,
  });
  return { service, rows, events, consumed, state, accounts, sent, logs };
}

function row(overrides: Partial<PasswordResetRow> = {}): PasswordResetRow {
  return {
    id: 'reset-1',
    tokenHash: hashToken(TOKEN),
    userId: 'user-1',
    createdBy: 'admin-1',
    kind: 'admin',
    expiresAt: new Date(NOW.getTime() + DAY_MS),
    usedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function tokenOf(url: string): string {
  return new URLSearchParams(new URL(url).hash.slice(1)).get('token') ?? '';
}

describe('password reset service: createLink', () => {
  test('returns a /reset-password link whose token is stored only as its hash', async () => {
    const { service, rows } = setup();
    const { url } = await service.createLink('user-1', 'admin-1');
    expect(url.startsWith(`${ORIGIN}/reset-password#token=`)).toBe(true);
    const token = tokenOf(url);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  test('is valid for 3 days and records the target user and creator', async () => {
    const { service, rows } = setup();
    await service.createLink('user-1', 'admin-1');
    expect(rows[0]).toMatchObject({
      userId: 'user-1',
      createdBy: 'admin-1',
      expiresAt: new Date(NOW.getTime() + 3 * DAY_MS),
    });
  });

  test('records a null creator for the rescue CLI', async () => {
    const { service, rows } = setup();
    await service.createLink('user-1', null);
    expect(rows[0]?.createdBy).toBeNull();
  });
});

describe('password reset service: isValid', () => {
  test('is true for an unused link before expiry', async () => {
    const { service, rows } = setup();
    rows.push(row());
    expect(await service.isValid(TOKEN)).toBe(true);
  });

  test('is false for an unknown token', async () => {
    const { service, rows } = setup();
    rows.push(row());
    expect(await service.isValid('X'.repeat(43))).toBe(false);
  });

  test('is false for a used link', async () => {
    const { service, rows } = setup();
    rows.push(row({ usedAt: NOW }));
    expect(await service.isValid(TOKEN)).toBe(false);
  });

  test('is false at the exact expiry instant', async () => {
    const { service, rows } = setup();
    rows.push(row({ expiresAt: NOW }));
    expect(await service.isValid(TOKEN)).toBe(false);
  });

  test('a fresh link expires after 3 days with the injected clock', async () => {
    const created = setup();
    const { url } = await created.service.createLink('user-1', 'admin-1');
    const justBefore = setup({ now: new Date(NOW.getTime() + 3 * DAY_MS - 1) });
    const after = setup({ now: new Date(NOW.getTime() + 3 * DAY_MS) });
    justBefore.rows.push(...created.rows);
    after.rows.push(...created.rows);
    expect(await justBefore.service.isValid(tokenOf(url))).toBe(true);
    expect(await after.service.isValid(tokenOf(url))).toBe(false);
  });
});

describe('password reset service: reset', () => {
  const input = { token: TOKEN, password: 'new long password' };

  test('hashes the password before consuming the link', async () => {
    const { service, events } = setup();
    await service.reset(input);
    expect(events).toEqual(['hash', 'consume']);
  });

  test('passes the token hash, the password hash and the injected time', async () => {
    const { service, consumed } = setup();
    await service.reset(input);
    expect(consumed).toEqual([
      { tokenHash: hashToken(TOKEN), passwordHash: 'hashed(new long password)', now: NOW },
    ]);
  });

  test('returns the repository outcome', async () => {
    const ok = setup();
    expect(await ok.service.reset(input)).toBe(true);
    const ko = setup();
    ko.state.consumeResult = false;
    expect(await ko.service.reset(input)).toBe(false);
  });
});

describe('password reset service: by email', () => {
  const bob: ResetAccount = {
    id: 'user-2',
    email: 'Bob@Example.com',
    username: 'bob',
    locale: 'hu',
    disabled: false,
    emailVerified: true,
  };

  test('emails a one-hour link to the account, by email or username, in its language', async () => {
    const { service, rows, sent, accounts } = setup({ mail: 'on' });
    accounts.push(bob);
    await service.requestByEmail({ identifier: ' bob@example.COM ' });
    await service.requestByEmail({ identifier: 'Bob' });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ to: 'Bob@Example.com', locale: 'hu', username: 'bob' });
    expect(sent[0]?.url.startsWith(`${ORIGIN}/reset-password#token=`)).toBe(true);
    expect(rows[0]).toMatchObject({
      userId: 'user-2',
      createdBy: null,
      kind: 'email',
      expiresAt: new Date(NOW.getTime() + 3600 * 1000),
    });
    expect(rows[0]?.tokenHash).toBe(hashToken(tokenOf(sent[0]?.url ?? '')));
  });

  test('admin links stay of the admin kind (they also turn 2FA off)', async () => {
    const { service, rows } = setup({ mail: 'on' });
    await service.createLink('user-1', 'admin-1');
    expect(rows[0]?.kind).toBe('admin');
  });

  test('nothing for an unknown, disabled or email-less account, or without email settings', async () => {
    const on = setup({ mail: 'on' });
    on.accounts.push({ ...bob, disabled: true }, { ...bob, id: 'u3', username: 'eve', email: '' });
    await on.service.requestByEmail({ identifier: 'nobody' });
    await on.service.requestByEmail({ identifier: 'bob' });
    await on.service.requestByEmail({ identifier: 'eve' });
    expect(on.sent).toHaveLength(0);
    expect(on.rows).toHaveLength(0);

    const off = setup();
    off.accounts.push(bob);
    await off.service.requestByEmail({ identifier: 'bob' });
    expect(off.rows).toHaveLength(0);
  });

  test('an account without a known language gets the one asked from', async () => {
    const { service, sent, accounts } = setup({ mail: 'on' });
    accounts.push({ ...bob, locale: 'xx' });
    await service.requestByEmail({ identifier: 'bob', locale: 'fr' });
    expect(sent[0]?.locale).toBe('fr');
  });

  test('a failed send is logged without the address, and does not throw', async () => {
    const { service, logs, accounts } = setup({ mail: 'failing' });
    accounts.push(bob);
    await service.requestByEmail({ identifier: 'bob' });
    expect(logs.join(' ')).toContain('connection refused');
    expect(logs.join(' ')).not.toContain('Bob@Example.com');
  });

  test('never to an address that was not verified (typed at sign-up, never proven)', async () => {
    const { service, sent, rows, accounts } = setup({ mail: 'on' });
    accounts.push({ ...bob, emailVerified: false });
    await service.requestByEmail({ identifier: 'bob' });
    expect(sent).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  test('the per-account limit is asked with the account id, whatever was typed', async () => {
    const { service, sent, accounts } = setup({ mail: 'on' });
    accounts.push(bob);
    const asked: string[] = [];
    const allow = async (id: string) => {
      asked.push(id);
      return asked.length < 2;
    };
    await service.requestByEmail({ identifier: 'bob' }, allow);
    await service.requestByEmail({ identifier: 'Bob@Example.com' }, allow);
    expect(asked).toEqual(['user-2', 'user-2']);
    expect(sent).toHaveLength(1);
  });
});
