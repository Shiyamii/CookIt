import { describe, expect, test } from 'bun:test';
import { ApiError } from './api';
import { clearLocalCopies, createStateSync, loadLocalCopy, saveLocalCopy } from './state-sync';
import type { LocalCopy, StateSyncDeps } from './state-sync';

type S = { items: string[] };
const EMPTY: S = { items: [] };

function setup(
  overrides: Partial<StateSyncDeps<S>> = {},
  initial?: LocalCopy<S>,
  server: { state: S | null; version: number } = { state: null, version: 0 },
) {
  const saved: S[] = [];
  const persisted: LocalCopy<S>[] = [];
  let clears = 0;
  const deps: StateSyncDeps<S> = {
    load: () => initial,
    persist: (copy) => persisted.push(copy),
    // No `offset`: the shopping list has no clock.
    fetch: async () => ({ ...server }),
    save: async (state) => {
      saved.push(state);
      server = { state, version: server.version + 1 };
      return { version: server.version };
    },
    clear: async () => {
      clears += 1;
      server = { state: null, version: server.version };
      return {};
    },
    empty: EMPTY,
    ...overrides,
  };
  return { sync: createStateSync(deps), saved, persisted, clears: () => clears };
}

const add = (item: string) => (state: S) => ({ items: [...state.items, item] });

describe('createStateSync without offset', () => {
  test('starts from the local copy, not ready, offset 0', () => {
    const { sync } = setup({}, { state: { items: ['a'] }, version: 3, dirty: false });
    expect(sync.getSnapshot()).toEqual({
      state: { items: ['a'] },
      version: 3,
      dirty: false,
      offset: 0,
      ready: false,
      offline: false,
    });
  });

  test('without a local copy the state is null', () => {
    expect(setup().sync.getSnapshot().state).toBeNull();
  });

  test('an update starts from the empty state, applies at once and is sent', async () => {
    const { sync, saved, persisted } = setup();
    sync.update(add('a'));
    expect(sync.getSnapshot().state).toEqual({ items: ['a'] });
    expect(sync.getSnapshot().dirty).toBe(true);
    expect(persisted.at(-1)?.dirty).toBe(true);
    await sync.flush();
    expect(saved).toEqual([{ items: ['a'] }]);
    expect(sync.getSnapshot()).toMatchObject({ dirty: false, version: 1, offset: 0, ready: true });
  });

  test('a change made while sending is sent next', async () => {
    const { sync, saved } = setup();
    sync.update(add('a'));
    sync.update(add('b'));
    await sync.flush();
    expect(saved.at(-1)).toEqual({ items: ['a', 'b'] });
    expect(sync.getSnapshot().dirty).toBe(false);
  });

  test('end sends a clear and the state becomes null', async () => {
    const { sync, clears } = setup({}, { state: { items: ['a'] }, version: 1, dirty: false });
    sync.end();
    await sync.flush();
    expect(clears()).toBe(1);
    expect(sync.getSnapshot()).toMatchObject({ state: null, dirty: false });
  });

  test('a network failure keeps the change dirty and offline, then flush resends it', async () => {
    let fail = true;
    const { sync, saved } = setup({
      save: async (state) => {
        if (fail) throw new TypeError('network');
        saved.push(state);
        return { version: 7 };
      },
    });
    sync.update(add('a'));
    await sync.flush();
    expect(sync.getSnapshot()).toMatchObject({ dirty: true, offline: true, ready: true });
    fail = false;
    await sync.flush();
    expect(saved).toEqual([{ items: ['a'] }]);
    expect(sync.getSnapshot()).toMatchObject({ dirty: false, offline: false, version: 7 });
  });

  test.each([400, 413, 422])('a %d drops the change and takes the server state', async (status) => {
    const { sync } = setup(
      {
        save: async () => {
          throw new ApiError(status, 'refused');
        },
      },
      undefined,
      { state: { items: ['server'] }, version: 5 },
    );
    sync.update(add('a'));
    await sync.flush();
    expect(sync.getSnapshot()).toMatchObject({
      state: { items: ['server'] },
      version: 5,
      dirty: false,
      offline: false,
    });
  });

  test.each([401, 500])('a %d keeps the change for later', async (status) => {
    const { sync } = setup({
      save: async () => {
        throw new ApiError(status, 'nope');
      },
    });
    sync.update(add('a'));
    await sync.flush();
    expect(sync.getSnapshot()).toMatchObject({ dirty: true, offline: true });
    expect(sync.getSnapshot().state).toEqual({ items: ['a'] });
  });

  test('refresh takes the server state when nothing is pending', async () => {
    const { sync } = setup({}, undefined, { state: { items: ['x'] }, version: 4 });
    await sync.refresh();
    expect(sync.getSnapshot()).toMatchObject({ state: { items: ['x'] }, version: 4, ready: true });
  });

  test('refresh sends a pending change instead of reading the server', async () => {
    const { sync, saved } = setup(
      {},
      { state: { items: ['mine'] }, version: 1, dirty: true },
      { state: { items: ['theirs'] }, version: 9 },
    );
    await sync.refresh();
    expect(saved).toEqual([{ items: ['mine'] }]);
    expect(sync.getSnapshot().state).toEqual({ items: ['mine'] });
  });

  test('a read that fails marks offline and ready, keeping the local copy', async () => {
    const { sync } = setup(
      {
        fetch: async () => {
          throw new TypeError('network');
        },
      },
      { state: { items: ['a'] }, version: 1, dirty: false },
    );
    await sync.refresh();
    expect(sync.getSnapshot()).toMatchObject({
      state: { items: ['a'] },
      offline: true,
      ready: true,
    });
  });

  test('a read answered after a local change does not overwrite it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { sync } = setup({
      fetch: async () => {
        await gate;
        return { state: { items: ['old'] }, version: 1 };
      },
    });
    const reading = sync.refresh();
    sync.update(add('new'));
    release();
    await reading;
    await sync.flush();
    expect(sync.getSnapshot().state).toEqual({ items: ['new'] });
  });

  test('once disposed, nothing is persisted, notified or sent', async () => {
    const { sync, saved, persisted } = setup();
    let calls = 0;
    sync.subscribe(() => (calls += 1));
    sync.dispose();
    const persistedBefore = persisted.length;
    sync.update(add('a'));
    await sync.flush();
    await sync.refresh();
    expect(saved).toEqual([]);
    expect(persisted.length).toBe(persistedBefore);
    expect(calls).toBe(0);
  });

  test('a save in flight when disposed does not write its result back', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { sync, persisted } = setup({
      save: async () => {
        await gate;
        return { version: 4 };
      },
    });
    sync.update(add('a'));
    const sending = sync.flush();
    sync.dispose();
    const persistedBefore = persisted.length;
    release();
    await sending;
    expect(persisted.length).toBe(persistedBefore);
    expect(sync.getSnapshot().version).not.toBe(4);
  });

  test('listeners are told of changes until they unsubscribe', () => {
    const { sync } = setup();
    let calls = 0;
    const off = sync.subscribe(() => (calls += 1));
    sync.update(add('a'));
    expect(calls).toBeGreaterThan(0);
    off();
    const before = calls;
    sync.update(add('b'));
    expect(calls).toBe(before);
  });
});

describe('local copies without a browser storage', () => {
  test('under bun there is no localStorage: helpers do not throw', () => {
    if (typeof localStorage !== 'undefined') return;
    expect(loadLocalCopy('k', () => ({ success: false }))).toBeUndefined();
    expect(() => saveLocalCopy('k', { state: null, version: 1, dirty: false })).not.toThrow();
    expect(() => clearLocalCopies('k')).not.toThrow();
  });

  test('with a storage: round trip, invalid data ignored, prefix cleared', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    // `Object.keys(localStorage)` lists the stored keys: mimic it with own properties.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const storage = new Proxy(fake, {
      ownKeys: () => [...store.keys()],
      getOwnPropertyDescriptor: (_, key) =>
        typeof key === 'string' && store.has(key)
          ? { enumerable: true, configurable: true, value: store.get(key) }
          : undefined,
    });
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    try {
      const parse = (state: unknown) =>
        Array.isArray((state as S | null)?.items)
          ? { success: true as const, data: state as S }
          : { success: false as const };
      saveLocalCopy('p:a', { state: { items: ['a'] }, version: 2, dirty: true });
      expect(loadLocalCopy('p:a', parse)).toEqual({
        state: { items: ['a'] },
        version: 2,
        dirty: true,
      });
      saveLocalCopy('p:null', { state: null, version: 1, dirty: false });
      expect(loadLocalCopy('p:null', parse)).toEqual({ state: null, version: 1, dirty: false });
      expect(loadLocalCopy('missing', parse)).toBeUndefined();
      store.set('bad-json', '{');
      expect(loadLocalCopy('bad-json', parse)).toBeUndefined();
      store.set('bad-state', JSON.stringify({ state: { nope: 1 }, version: 1, dirty: false }));
      expect(loadLocalCopy('bad-state', parse)).toBeUndefined();
      store.set('bad-version', JSON.stringify({ state: null, version: '1', dirty: false }));
      expect(loadLocalCopy('bad-version', parse)).toBeUndefined();
      clearLocalCopies('p:');
      expect([...store.keys()].sort()).toEqual(['bad-json', 'bad-state', 'bad-version']);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
