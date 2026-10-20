import { describe, expect, test } from 'bun:test';
import { hashToken } from '../../lib/tokens';
import type { PasswordResetRepository, PasswordResetRow } from './password-reset.repository';
import { createPasswordResetService } from './password-reset.service';

const ORIGIN = 'https://cook.example';
const NOW = new Date('2026-03-10T12:00:00.000Z');
const DAY_MS = 24 * 3600 * 1000;
const TOKEN = 'R'.repeat(43);

function setup(options: { now?: Date } = {}) {
  const rows: PasswordResetRow[] = [];
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
        expiresAt: reset.expiresAt,
        usedAt: reset.usedAt ?? null,
        createdAt: reset.createdAt ?? NOW,
      });
    },
    async findByTokenHash(tokenHash) {
      return rows.find((row) => row.tokenHash === tokenHash);
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
    now: () => options.now ?? NOW,
  });
  return { service, rows, events, consumed, state };
}

function row(overrides: Partial<PasswordResetRow> = {}): PasswordResetRow {
  return {
    id: 'reset-1',
    tokenHash: hashToken(TOKEN),
    userId: 'user-1',
    createdBy: 'admin-1',
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
