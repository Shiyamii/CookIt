import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { COOK_COLORS, MAX_COOK_ITEMS, type CookState } from '@cookit/shared';
import {
  clearLocalCopies,
  loadActiveRecipe,
  loadLocalCopy,
  saveActiveRecipe,
  saveLocalCopy,
} from './local';
import { canAddRecipe, EMPTY_STATE, removeRecipe, startRecipe, startTimer } from './session';
import { activeRecipe, clearCookingData } from './store';

const NOW = Date.parse('2026-10-21T18:00:00.000Z');
const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const start = (state: CookState, n: number) =>
  startRecipe(state, { recipeId: id(n), lang: 'fr', servings: 2 });
const colors = (state: CookState) => state.items.map((item) => item.color);

const timer = (timerId: string, recipeId: string | null) => ({
  id: timerId,
  recipeId,
  recipeTitle: 'T',
  label: 'l',
  durationSeconds: 60,
  step: null,
  slot: null,
});

describe('color allocation', () => {
  test('MAX_COOK_ITEMS is the number of colors', () => {
    expect(MAX_COOK_ITEMS).toBe(COOK_COLORS.length);
  });

  test('colors are given in palette order', () => {
    let s = EMPTY_STATE;
    for (let n = 0; n < COOK_COLORS.length; n++) s = start(s, n);
    expect(colors(s)).toEqual([...COOK_COLORS]);
  });

  test('a color freed in the middle is the next one reused', () => {
    let s = EMPTY_STATE;
    for (let n = 0; n < 4; n++) s = start(s, n);
    s = removeRecipe(s, id(1));
    s = start(s, 9);
    expect(s.items.map((item) => [item.recipeId, item.color])).toEqual([
      [id(0), 'chart-1'],
      [id(2), 'chart-3'],
      [id(3), 'chart-4'],
      [id(9), 'chart-2'],
    ]);
  });

  test('the lowest of several freed colors is used first', () => {
    let s = EMPTY_STATE;
    for (let n = 0; n < 5; n++) s = start(s, n);
    s = removeRecipe(removeRecipe(s, id(3)), id(1));
    expect(colors(start(s, 8)).at(-1)).toBe('chart-2');
  });

  test('removing from a full session lets another recipe in again', () => {
    let s = EMPTY_STATE;
    for (let n = 0; n < 5; n++) s = start(s, n);
    expect(canAddRecipe(s, id(7))).toBe(false);
    s = removeRecipe(s, id(4));
    expect(canAddRecipe(s, id(7))).toBe(true);
    expect(colors(start(s, 7)).at(-1)).toBe('chart-5');
  });

  test('a full session is returned as is (same object), never over the limit', () => {
    let s = EMPTY_STATE;
    for (let n = 0; n < 6; n++) s = start(s, n);
    expect(s.items).toHaveLength(MAX_COOK_ITEMS);
    expect(start(s, 6)).toBe(s);
  });

  test('restarting an existing recipe keeps its color and position', () => {
    let s = EMPTY_STATE;
    for (let n = 0; n < 3; n++) s = start(s, n);
    const again = startRecipe(s, { recipeId: id(1), lang: 'en', servings: 8 });
    expect(colors(again)).toEqual(colors(s));
    expect(again.items.map((item) => item.recipeId)).toEqual([id(0), id(1), id(2)]);
  });
});

describe('removeRecipe', () => {
  test('an unknown id changes nothing', () => {
    const s = startTimer(start(EMPTY_STATE, 0), timer('t1', id(0)), NOW);
    expect(removeRecipe(s, id(5))).toEqual(s);
  });

  test('only the timers of that recipe go; the others are untouched', () => {
    let s = start(start(EMPTY_STATE, 0), 1);
    s = startTimer(s, timer('a', id(0)), NOW);
    s = startTimer(s, timer('b', id(1)), NOW);
    s = startTimer(s, timer('c', id(1)), NOW);
    const left = removeRecipe(s, id(1));
    expect(left.timers).toEqual([s.timers[0]!]);
    expect(left.timers[0]).toBe(s.timers[0]!);
    expect(left.items[0]).toBe(s.items[0]!);
  });

  test('timers with no recipe survive', () => {
    let s = start(EMPTY_STATE, 0);
    s = startTimer(s, timer('free', null), NOW);
    s = startTimer(s, timer('own', id(0)), NOW);
    expect(removeRecipe(s, id(0)).timers.map((t) => t.id)).toEqual(['free']);
  });

  test('removing the last recipe leaves empty items, free timers kept', () => {
    const s = startTimer(start(EMPTY_STATE, 0), timer('free', null), NOW);
    const left = removeRecipe(s, id(0));
    expect(left.items).toEqual([]);
    expect(left.timers).toHaveLength(1);
  });
});

describe('active recipe (device choice)', () => {
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
    clearCookingData();
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });
  });
  afterEach(() => {
    clearCookingData();
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test('save and load round trip, per user', () => {
    saveActiveRecipe('u1', id(1));
    expect(loadActiveRecipe('u1')).toBe(id(1));
    expect(loadActiveRecipe('u2')).toBeUndefined();
    expect(data.get('cookit:cook:active:u1')).toBe(id(1));
  });

  test('the active key does not collide with a user copy', () => {
    saveLocalCopy('active:u1', { state: null, version: 0, dirty: false });
    saveActiveRecipe('u1', id(1));
    expect(loadLocalCopy('u1')).toBeUndefined();
    expect(loadActiveRecipe('u1')).toBe(id(1));
  });

  test('clearLocalCopies removes the active key too, and nothing else', () => {
    saveActiveRecipe('u1', id(1));
    saveLocalCopy('u1', { state: null, version: 0, dirty: false });
    data.set('other', 'x');
    clearLocalCopies();
    expect([...data.keys()]).toEqual(['other']);
  });

  test('blocked storage is tolerated', () => {
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
    expect(loadActiveRecipe('u1')).toBeUndefined();
    expect(() => saveActiveRecipe('u1', id(1))).not.toThrow();
  });

  test('store: get falls back to the stored value', () => {
    data.set('cookit:cook:active:u1', id(2));
    expect(activeRecipe.get('u1')).toBe(id(2));
    expect(activeRecipe.get('u2')).toBeUndefined();
  });

  test('store: set is stored, readable and notifies subscribers until unsubscribed', () => {
    let calls = 0;
    const off = activeRecipe.subscribe(() => calls++);
    activeRecipe.set('u1', id(3));
    expect(calls).toBe(1);
    expect(activeRecipe.get('u1')).toBe(id(3));
    expect(data.get('cookit:cook:active:u1')).toBe(id(3));
    off();
    activeRecipe.set('u1', id(4));
    expect(calls).toBe(1);
    expect(activeRecipe.get('u1')).toBe(id(4));
  });

  test('store: memory wins when storage is blocked', () => {
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
    activeRecipe.set('u1', id(5));
    expect(activeRecipe.get('u1')).toBe(id(5));
  });

  test('clearCookingData forgets the active recipe in memory and in storage', () => {
    activeRecipe.set('u1', id(6));
    clearCookingData();
    expect(activeRecipe.get('u1')).toBeUndefined();
    expect(data.size).toBe(0);
  });
});
