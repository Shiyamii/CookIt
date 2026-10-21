import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { CookSessionResponse, CookState } from '@cookit/shared';
import { ApiError } from '@/lib/api';
import { clockOffset, formatCountdown, remainingSeconds } from './clock';
import { clearLocalCopies, loadLocalCopy, saveLocalCopy, type LocalCopy } from './local';
import {
  EMPTY_STATE,
  extendTimer,
  goToStep,
  removeTimer,
  setServings,
  startRecipe,
  startTimer,
  toggleIngredient,
} from './session';
import { createCookSync } from './sync';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-21T18:00:00.000Z');

const timer = (id: string, step: number | null = 0, slot: number | null = 0) => ({
  id,
  recipeId: A,
  recipeTitle: 'Crêpes',
  label: 'repos',
  durationSeconds: 600,
  step,
  slot,
});

describe('sync concurrency and failures', () => {
  const st = (step: number): CookState => ({
    items: [
      {
        recipeId: A,
        lang: 'fr',
        servings: 4,
        currentStep: step,
        checkedIngredients: [],
        color: 'chart-1',
      },
    ],
    timers: [],
  });

  type Gate = { resolve: () => void; reject: (e: unknown) => void };

  /** A server whose answers are held until the test releases them. */
  function manual(options: { local?: LocalCopy; server?: CookSessionResponse['session'] } = {}) {
    let stored = options.local;
    let server = options.server ?? null;
    const persisted: LocalCopy[] = [];
    const saves: { state: CookState | null; gate: Gate }[] = [];
    const fetches: { gate: Gate }[] = [];
    const sync = createCookSync({
      load: () => stored,
      persist: (copy) => {
        stored = copy;
        persisted.push(copy);
      },
      fetchSession: () => {
        // The answer is what the server held when the read was made.
        const answer = server;
        return new Promise((resolve, reject) => {
          fetches.push({
            gate: { resolve: () => resolve({ session: answer, serverNow: '', offset: 7 }), reject },
          });
        });
      },
      saveSession: (next) =>
        new Promise((resolve, reject) => {
          saves.push({
            state: next,
            gate: {
              resolve: () => {
                server = { version: (server?.version ?? 0) + 1, updatedAt: '', state: next };
                resolve({ version: server.version, offset: 7 });
              },
              reject,
            },
          });
        }),
      endSession: () =>
        new Promise((resolve, reject) => {
          saves.push({
            state: null,
            gate: {
              resolve: () => {
                server = null;
                resolve({ offset: 7 });
              },
              reject,
            },
          });
        }),
    });
    return { sync, saves, fetches, persisted, stored: () => stored };
  }

  const tick = () => new Promise((r) => setTimeout(r, 0));

  test('a change made while a save is in flight is still sent afterwards', async () => {
    const m = manual();
    m.sync.update(() => st(1));
    expect(m.saves).toHaveLength(1);
    m.sync.update(() => st(2));
    // Not sent in parallel with the one in flight.
    expect(m.saves).toHaveLength(1);
    m.saves[0]?.gate.resolve();
    await tick();
    expect(m.saves.map((s) => s.state)).toEqual([st(1), st(2)]);
    // Still dirty until the second one is acknowledged.
    expect(m.sync.getSnapshot()).toMatchObject({ dirty: true, state: st(2) });
    m.saves[1]?.gate.resolve();
    await tick();
    expect(m.sync.getSnapshot()).toMatchObject({ dirty: false, version: 2, state: st(2) });
    expect(m.stored()).toEqual({ state: st(2), version: 2, dirty: false });
  });

  test('many changes during one save: only the latest state is sent next', async () => {
    const m = manual();
    m.sync.update(() => st(1));
    m.sync.update(() => st(2));
    m.sync.update(() => st(3));
    m.sync.update(() => st(4));
    m.saves[0]?.gate.resolve();
    await tick();
    expect(m.saves.map((s) => s.state)).toEqual([st(1), st(4)]);
  });

  test('update functions chain on the latest local state, not on the saved one', () => {
    const m = manual();
    m.sync.update(() => st(1));
    m.sync.update((s) => ({ ...s, items: s.items.map((i) => ({ ...i, servings: 9 })) }));
    expect(m.sync.getSnapshot().state?.items[0]).toMatchObject({ currentStep: 1, servings: 9 });
  });

  test('concurrent flush calls share the save in flight', async () => {
    const m = manual();
    m.sync.update(() => st(1));
    const first = m.sync.flush();
    const second = m.sync.flush();
    expect(m.saves).toHaveLength(1);
    m.saves[0]?.gate.resolve();
    await Promise.all([first, second]);
    expect(m.saves).toHaveLength(1);
  });

  test('a change after an acknowledged save starts a new save', async () => {
    const m = manual();
    m.sync.update(() => st(1));
    m.saves[0]?.gate.resolve();
    await tick();
    m.sync.update(() => st(2));
    expect(m.saves).toHaveLength(2);
    expect(m.saves[1]?.state).toEqual(st(2));
  });

  test('a failed save then a new change sends the new state', async () => {
    const m = manual();
    m.sync.update(() => st(1));
    m.saves[0]?.gate.reject(new TypeError('Failed to fetch'));
    await tick();
    expect(m.sync.getSnapshot()).toMatchObject({ offline: true, dirty: true });
    m.sync.update(() => st(2));
    expect(m.saves).toHaveLength(2);
    m.saves[1]?.gate.resolve();
    await tick();
    expect(m.sync.getSnapshot()).toMatchObject({ offline: false, dirty: false, state: st(2) });
  });

  test('a server error (500) keeps the change and does not read the server state', async () => {
    const m = manual({ server: { version: 1, updatedAt: '', state: st(0) } });
    m.sync.update(() => st(5));
    m.saves[0]?.gate.reject(new ApiError(500, 'internal'));
    await tick();
    expect(m.fetches).toHaveLength(0);
    expect(m.sync.getSnapshot()).toMatchObject({ dirty: true, state: st(5) });
  });

  test('refused 400 and 422 both drop the change and read the server state', async () => {
    for (const status of [400, 422]) {
      const m = manual({ server: { version: 4, updatedAt: '', state: st(0) } });
      m.sync.update(() => st(9));
      m.saves[0]?.gate.reject(new ApiError(status, 'invalid'));
      await tick();
      expect(m.fetches).toHaveLength(1);
      m.fetches[0]?.gate.resolve();
      await tick();
      expect(m.sync.getSnapshot()).toMatchObject({ dirty: false, state: st(0), version: 4 });
      expect(m.stored()).toEqual({ state: st(0), version: 4, dirty: false });
    }
  });

  test('refused change with a newer one waiting: nothing stays dirty, nothing is sent twice', async () => {
    const m = manual({ server: { version: 4, updatedAt: '', state: st(0) } });
    m.sync.update(() => st(9));
    m.sync.update(() => st(10));
    m.saves[0]?.gate.reject(new ApiError(400, 'invalid_timer'));
    await tick();
    expect(m.saves).toHaveLength(1);
    expect(m.sync.getSnapshot().dirty).toBe(false);
  });

  test('refresh while dirty sends the local state and does not read the server', async () => {
    const m = manual({
      local: { state: st(4), version: 1, dirty: true },
      server: { version: 1, updatedAt: '', state: st(0) },
    });
    const done = m.sync.refresh();
    expect(m.saves.map((s) => s.state)).toEqual([st(4)]);
    expect(m.fetches).toHaveLength(0);
    m.saves[0]?.gate.resolve();
    await done;
    expect(m.sync.getSnapshot()).toMatchObject({
      state: st(4),
      dirty: false,
      version: 2,
      ready: true,
    });
  });

  test('refresh while dirty and still offline stays dirty and ready (local copy shown)', async () => {
    const m = manual({ local: { state: st(4), version: 1, dirty: true } });
    const done = m.sync.refresh();
    m.saves[0]?.gate.reject(new TypeError('Failed to fetch'));
    await done;
    expect(m.sync.getSnapshot()).toMatchObject({
      state: st(4),
      dirty: true,
      offline: true,
      ready: true,
    });
    expect(m.stored()).toEqual({ state: st(4), version: 1, dirty: true });
  });

  test('offline refresh without pending change keeps the local copy', async () => {
    const m = manual({ local: { state: st(2), version: 3, dirty: false } });
    const done = m.sync.refresh();
    m.fetches[0]?.gate.reject(new TypeError('Failed to fetch'));
    await done;
    expect(m.sync.getSnapshot()).toMatchObject({
      state: st(2),
      version: 3,
      offline: true,
      ready: true,
    });
  });

  test('the server session ended elsewhere: a clean local copy is emptied', async () => {
    const m = manual({ local: { state: st(2), version: 3, dirty: false }, server: null });
    const done = m.sync.refresh();
    m.fetches[0]?.gate.resolve();
    await done;
    expect(m.sync.getSnapshot()).toMatchObject({ state: null, version: 0, dirty: false });
  });

  test('a change made while the server state is being read wins over it', async () => {
    const m = manual({ server: { version: 1, updatedAt: '', state: st(0) } });
    const done = m.sync.refresh();
    m.sync.update(() => st(3));
    m.fetches[0]?.gate.resolve();
    await done;
    expect(m.sync.getSnapshot().state).toEqual(st(3));
    expect(m.sync.getSnapshot().dirty).toBe(true);
  });

  test('a late answer to an old read does not overwrite a change already saved', async () => {
    const m = manual({ server: { version: 1, updatedAt: '', state: st(0) } });
    const done = m.sync.refresh();
    m.sync.update(() => st(3));
    m.saves[0]?.gate.resolve();
    await tick();
    expect(m.sync.getSnapshot()).toMatchObject({ dirty: false, state: st(3), version: 2 });
    // The read made before the save answers now, with the state of before.
    m.fetches[0]?.gate.resolve();
    await done;
    expect(m.sync.getSnapshot().state).toEqual(st(3));
  });

  test('ending while offline is kept and sent at the next flush', async () => {
    const m = manual({ server: { version: 1, updatedAt: '', state: st(1) } });
    m.sync.end();
    m.saves[0]?.gate.reject(new TypeError('Failed to fetch'));
    await tick();
    expect(m.sync.getSnapshot()).toMatchObject({ state: null, dirty: true, offline: true });
    expect(m.stored()).toEqual({ state: null, version: 0, dirty: true });
    void m.sync.flush();
    expect(m.saves).toHaveLength(2);
    expect(m.saves[1]?.state).toBeNull();
    m.saves[1]?.gate.resolve();
    await tick();
    expect(m.sync.getSnapshot()).toMatchObject({ state: null, dirty: false });
  });

  test('reload after ending offline: the pending end is sent, not the old server session', async () => {
    const m = manual({
      local: { state: null, version: 1, dirty: true },
      server: { version: 1, updatedAt: '', state: st(1) },
    });
    expect(m.sync.getSnapshot()).toMatchObject({ state: null, dirty: true });
    const done = m.sync.refresh();
    expect(m.saves.map((s) => s.state)).toEqual([null]);
    m.saves[0]?.gate.resolve();
    await done;
    expect(m.sync.getSnapshot()).toMatchObject({ state: null, dirty: false });
  });

  test('ending, then starting again while the end is in flight, sends the new session', async () => {
    const m = manual();
    m.sync.end();
    m.sync.update(() => st(0));
    m.saves[0]?.gate.resolve();
    await tick();
    expect(m.saves.map((s) => s.state)).toEqual([null, st(0)]);
    m.saves[1]?.gate.resolve();
    await tick();
    expect(m.sync.getSnapshot()).toMatchObject({ state: st(0), dirty: false });
  });

  test('every change is persisted at once; listeners are told, and can unsubscribe', async () => {
    const m = manual();
    let calls = 0;
    const off = m.sync.subscribe(() => {
      calls += 1;
    });
    m.sync.update(() => st(1));
    expect(m.persisted.at(0)).toEqual({ state: st(1), version: 0, dirty: true });
    expect(calls).toBe(1);
    off();
    m.saves[0]?.gate.resolve();
    await tick();
    expect(calls).toBe(1);
  });

  test('the clock offset is taken from every answer', async () => {
    const m = manual();
    m.sync.update(() => st(1));
    m.saves[0]?.gate.resolve();
    await tick();
    expect(m.sync.getSnapshot().offset).toBe(7);
  });
});

describe('local copy', () => {
  const data = new Map<string, string>();
  const fake = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === 'getItem') return (k: string) => data.get(k) ?? null;
        if (key === 'setItem') return (k: string, v: string) => void data.set(k, v);
        if (key === 'removeItem') return (k: string) => void data.delete(k);
        return undefined;
      },
      ownKeys: () => [...data.keys()],
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, value: '' }),
    },
  );
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  beforeEach(() => {
    data.clear();
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const valid: CookState = {
    items: [
      {
        recipeId: A,
        lang: 'en',
        servings: 2,
        currentStep: 1,
        checkedIngredients: [0],
        color: 'chart-2',
      },
    ],
    timers: [],
  };

  test('round trip, per user', () => {
    saveLocalCopy('u1', { state: valid, version: 3, dirty: true });
    expect(loadLocalCopy('u1')).toEqual({ state: valid, version: 3, dirty: true });
    expect(loadLocalCopy('u2')).toBeUndefined();
  });

  test('an ended session (null state) round-trips', () => {
    saveLocalCopy('u1', { state: null, version: 0, dirty: true });
    expect(loadLocalCopy('u1')).toEqual({ state: null, version: 0, dirty: true });
  });

  test('corrupted or invalid content is ignored, never thrown', () => {
    const put = (value: unknown) => data.set('cookit:cook:u1', value as string);
    put('{not json');
    expect(loadLocalCopy('u1')).toBeUndefined();
    put(JSON.stringify({ state: { items: [{ bad: 1 }], timers: [] }, version: 1, dirty: false }));
    expect(loadLocalCopy('u1')).toBeUndefined();
    put(JSON.stringify({ state: valid, version: '1', dirty: false }));
    expect(loadLocalCopy('u1')).toBeUndefined();
    put(JSON.stringify({ state: valid, version: 1 }));
    expect(loadLocalCopy('u1')).toBeUndefined();
    put(JSON.stringify({ version: 1, dirty: false }));
    expect(loadLocalCopy('u1')).toBeUndefined();
  });

  test('clearing at sign-out removes every user copy and nothing else', () => {
    saveLocalCopy('u1', { state: valid, version: 1, dirty: false });
    saveLocalCopy('u2', { state: valid, version: 1, dirty: false });
    data.set('other', 'x');
    clearLocalCopies();
    expect([...data.keys()]).toEqual(['other']);
  });

  test('storage that throws is tolerated', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('full');
        },
      },
      configurable: true,
    });
    expect(loadLocalCopy('u1')).toBeUndefined();
    expect(() => saveLocalCopy('u1', { state: null, version: 0, dirty: false })).not.toThrow();
    expect(() => clearLocalCopies()).not.toThrow();
  });
});

describe('session edge cases', () => {
  const started = startRecipe(EMPTY_STATE, { recipeId: A, lang: 'fr', servings: 4 });

  test('the timer count is capped at 50', () => {
    let s = started;
    for (let i = 0; i < 60; i++) s = startTimer(s, timer(`t${i}`, null, null), NOW);
    expect(s.timers).toHaveLength(50);
  });

  test('durations are clamped to 1s..7 days', () => {
    const low = startTimer(started, { ...timer('a', null, null), durationSeconds: 0 }, NOW);
    expect(low.timers[0]?.durationSeconds).toBe(1);
    const high = startTimer(started, { ...timer('b', null, null), durationSeconds: 1e9 }, NOW);
    expect(high.timers[0]?.durationSeconds).toBe(7 * 24 * 3600);
  });

  test('+1 min never goes past the longest timer from now', () => {
    const s = startTimer(started, { ...timer('a'), durationSeconds: 7 * 24 * 3600 }, NOW);
    expect(extendTimer(s, 'a', 60, NOW).timers[0]?.endsAt).toBe(
      new Date(NOW + 7 * 24 * 3600 * 1000).toISOString(),
    );
  });

  test('extending or removing an unknown timer changes nothing', () => {
    const s = startTimer(started, timer('a'), NOW);
    expect(extendTimer(s, 'zzz', 60, NOW).timers).toEqual(s.timers);
    expect(removeTimer(s, 'zzz').timers).toEqual(s.timers);
  });

  test('actions on a recipe that is not in the session change nothing', () => {
    expect(goToStep(started, B, 2, 5)).toEqual(started);
    expect(toggleIngredient(started, B, 1)).toEqual(started);
    expect(setServings(started, B, 9)).toEqual(started);
  });

  test('a free timer (no step) can be started several times', () => {
    const once = startTimer(started, timer('a', null, null), NOW);
    expect(startTimer(once, timer('b', null, null), NOW).timers).toHaveLength(2);
  });

  test('going to a step of a recipe with no step stays at 0', () => {
    expect(goToStep(started, A, 3, 0).items[0]?.currentStep).toBe(0);
  });

  test('every state it produces passes the shared schema', async () => {
    const { cookStateSchema } = await import('@cookit/shared');
    let s = startTimer(
      goToStep(started, A, 3, 5),
      timer('00000000-0000-4000-8000-000000000001'),
      NOW,
    );
    s = toggleIngredient(s, A, 2);
    s = extendTimer(s, '00000000-0000-4000-8000-000000000001', 60, NOW);
    expect(cookStateSchema.safeParse(s).success).toBe(true);
  });
});

describe('clock edge cases', () => {
  test('a negative round trip gives no offset', () => {
    expect(clockOffset(2000, 1000, new Date(5000).toISOString())).toBe(0);
  });

  test('a timer ending in the past shows 0:00', () => {
    expect(formatCountdown(remainingSeconds('2026-10-21T17:00:00.000Z', NOW))).toBe('0:00');
    expect(formatCountdown(3600)).toBe('1:00:00');
    expect(formatCountdown(0)).toBe('0:00');
  });

  test('the corrected clock decides the remaining time', () => {
    const offset = clockOffset(0, 0, new Date(60_000).toISOString());
    expect(offset).toBe(60_000);
    expect(remainingSeconds('2026-10-21T18:10:00.000Z', NOW + offset)).toBe(540);
  });
});
