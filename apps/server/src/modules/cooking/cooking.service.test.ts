import { describe, expect, test } from 'bun:test';
import type { CookState } from '@cookit/shared';
import type { CookingRepository, CookSessionRow } from './cooking.repository';
import { createCookingService } from './cooking.service';

const T0 = new Date('2026-10-21T18:00:00.000Z');
const RECIPE = '11111111-1111-4111-8111-111111111111';
const TIMER = '22222222-2222-4222-8222-222222222222';

function setup() {
  const sessions = new Map<string, CookSessionRow>();
  const repository: CookingRepository = {
    async findActive(userId) {
      return sessions.get(userId);
    },
    async save(userId, state, { now }) {
      const version = (sessions.get(userId)?.version ?? 0) + 1;
      sessions.set(userId, { version, updatedAt: now, state });
      return version;
    },
    async end(userId) {
      return sessions.delete(userId);
    },
  };
  const service = createCookingService({ repository, now: () => T0, newId: () => 'session' });
  return { service, sessions };
}

const state = (endsAt: string): CookState => ({
  items: [
    {
      recipeId: RECIPE,
      lang: 'fr',
      servings: 4,
      currentStep: 2,
      checkedIngredients: [0, 3],
      color: 'chart-1',
    },
  ],
  timers: [
    {
      id: TIMER,
      recipeId: RECIPE,
      recipeTitle: 'Crêpes',
      label: 'repos',
      durationSeconds: 3600,
      endsAt,
      step: 1,
      slot: 0,
    },
  ],
});

describe('cooking sessions', () => {
  test('no session yet: null, with the server time', async () => {
    const { service } = setup();
    expect(await service.get('u1')).toEqual({ session: null, serverNow: T0.toISOString() });
  });

  test('each save is the next version; reading it back gives the same state', async () => {
    const { service } = setup();
    const first = await service.save('u1', state('2026-10-21T19:00:00.000Z'));
    const second = await service.save('u1', state('2026-10-21T19:00:00.000Z'));
    expect(first).toEqual({ version: 1, serverNow: T0.toISOString() });
    expect(second).toMatchObject({ version: 2 });
    expect(await service.get('u1')).toEqual({
      session: {
        version: 2,
        updatedAt: T0.toISOString(),
        state: state('2026-10-21T19:00:00.000Z'),
      },
      serverNow: T0.toISOString(),
    });
    // Sessions are per user.
    expect((await service.get('u2')).session).toBeNull();
  });

  test('end times are stored in UTC, whatever offset the client wrote', async () => {
    const { service, sessions } = setup();
    await service.save('u1', state('2026-10-21T21:00:00+02:00'));
    expect(sessions.get('u1')?.state.timers[0]?.endsAt).toBe('2026-10-21T19:00:00.000Z');
  });

  test('a finished timer is kept (until dismissed), a day-old one is refused', async () => {
    const { service } = setup();
    expect(await service.save('u1', state('2026-10-21T17:00:00.000Z'))).toMatchObject({
      version: 1,
    });
    expect(await service.save('u1', state('2026-10-20T17:00:00.000Z'))).toEqual({
      error: 'invalid_timer',
    });
  });

  test('an end time beyond the longest timer is refused', async () => {
    const { service, sessions } = setup();
    expect(await service.save('u1', state('2026-12-01T00:00:00.000Z'))).toEqual({
      error: 'invalid_timer',
    });
    expect(sessions.size).toBe(0);
  });

  test('bounds: exactly one day ago is kept, just before is refused', async () => {
    const { service } = setup();
    expect(await service.save('u1', state('2026-10-20T18:00:00.000Z'))).toMatchObject({
      version: 1,
    });
    expect(await service.save('u1', state('2026-10-20T17:59:59.999Z'))).toEqual({
      error: 'invalid_timer',
    });
  });

  test('bounds: the longest timer plus the clock margin is kept, one ms more is refused', async () => {
    const { service } = setup();
    const limit = T0.getTime() + 7 * 24 * 3600 * 1000 + 3600 * 1000;
    expect(await service.save('u1', state(new Date(limit).toISOString()))).toMatchObject({
      version: 1,
    });
    expect(await service.save('u1', state(new Date(limit + 1).toISOString()))).toEqual({
      error: 'invalid_timer',
    });
  });

  test('one bad timer among good ones refuses the whole save and keeps the previous state', async () => {
    const { service, sessions } = setup();
    await service.save('u1', state('2026-10-21T19:00:00.000Z'));
    const good = state('2026-10-21T19:30:00.000Z');
    const bad = state('2026-10-01T00:00:00.000Z').timers[0]!;
    const result = await service.save('u1', {
      ...good,
      timers: [...good.timers, { ...bad, id: '33333333-3333-4333-8333-333333333333' }],
    });
    expect(result).toEqual({ error: 'invalid_timer' });
    expect(sessions.get('u1')?.version).toBe(1);
    expect(sessions.get('u1')?.state.timers[0]?.endsAt).toBe('2026-10-21T19:00:00.000Z');
  });

  test('a state without timers is saved as is (items only)', async () => {
    const { service, sessions } = setup();
    const empty: CookState = { items: state('2026-10-21T19:00:00.000Z').items, timers: [] };
    expect(await service.save('u1', empty)).toMatchObject({ version: 1 });
    expect(sessions.get('u1')?.state).toEqual(empty);
  });

  test('the received state object is not mutated by the canonical form', async () => {
    const { service } = setup();
    const input = state('2026-10-21T21:00:00+02:00');
    await service.save('u1', input);
    expect(input.timers[0]?.endsAt).toBe('2026-10-21T21:00:00+02:00');
  });

  test('ending without a session is harmless; ending twice too', async () => {
    const { service } = setup();
    expect(await service.end('u1')).toEqual({ ok: true, serverNow: T0.toISOString() });
    expect(await service.end('u1')).toMatchObject({ ok: true });
  });

  test('ending only ends the own session', async () => {
    const { service } = setup();
    await service.save('u1', state('2026-10-21T19:00:00.000Z'));
    await service.save('u2', state('2026-10-21T19:00:00.000Z'));
    await service.end('u1');
    expect((await service.get('u2')).session).not.toBeNull();
  });

  test('ending the session', async () => {
    const { service } = setup();
    await service.save('u1', state('2026-10-21T19:00:00.000Z'));
    expect(await service.end('u1')).toEqual({ ok: true, serverNow: T0.toISOString() });
    expect((await service.get('u1')).session).toBeNull();
  });
});
