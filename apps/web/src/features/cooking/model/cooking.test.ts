import { describe, expect, test } from 'bun:test';
import {
  COOK_COLORS,
  DEFAULT_UNITS,
  EXAMPLE_RECIPES,
  parseRecipe,
  type CookSessionResponse,
  type CookState,
} from '@cookit/shared';
import { ApiError } from '@/lib/api';
import { displayRecipe } from '@/features/recipes/model/display';
import { clockOffset, formatCountdown, remainingSeconds } from './clock';
import type { LocalCopy } from './local';
import {
  canAddRecipe,
  EMPTY_STATE,
  extendTimer,
  goToStep,
  removeRecipe,
  removeTimer,
  setServings,
  sortedTimers,
  startRecipe,
  startTimer,
  timerOf,
  toggleIngredient,
} from './session';
import { cookIngredients, cookSteps } from './steps';
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

describe('clock', () => {
  test('offset: server time read halfway through the request', () => {
    expect(clockOffset(1000, 1200, new Date(5100).toISOString())).toBe(4000);
    expect(clockOffset(1000, 1200, 'garbage')).toBe(0);
  });

  test('remaining seconds and countdown text', () => {
    expect(remainingSeconds('2026-10-21T18:10:00.000Z', NOW)).toBe(600);
    expect(remainingSeconds('2026-10-21T18:00:00.500Z', NOW)).toBe(1);
    expect(remainingSeconds('2026-10-21T17:59:00.000Z', NOW)).toBe(-60);
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(247)).toBe('4:07');
    expect(formatCountdown(3909)).toBe('1:05:09');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

describe('session state', () => {
  const started = startRecipe(EMPTY_STATE, { recipeId: A, lang: 'fr', servings: 4 });

  test('starting a recipe; the same one keeps its progress, another is added', () => {
    expect(started.items).toEqual([
      {
        recipeId: A,
        lang: 'fr',
        servings: 4,
        currentStep: 0,
        checkedIngredients: [],
        color: 'chart-1',
      },
    ]);
    const progressed = startTimer(goToStep(started, A, 3, 5), timer('t1'), NOW);
    const again = startRecipe(progressed, { recipeId: A, lang: 'en', servings: 6 });
    expect(again.items[0]).toMatchObject({ currentStep: 3, lang: 'en', servings: 6 });
    expect(again.timers).toHaveLength(1);
    const other = startRecipe(progressed, { recipeId: B, lang: 'fr', servings: 2 });
    expect(other.items.map((item) => [item.recipeId, item.color])).toEqual([
      [A, 'chart-1'],
      [B, 'chart-2'],
    ]);
    expect(other.items[0]).toBe(progressed.items[0]);
    expect(other.timers).toBe(progressed.timers);
  });

  test('two recipes: each keeps its own step, ingredients and timers', () => {
    const both = startRecipe(started, { recipeId: B, lang: 'en', servings: 2 });
    const cooked = startTimer(
      startTimer(goToStep(toggleIngredient(both, B, 2), B, 1, 4), timer('t1'), NOW),
      { ...timer('t2'), recipeId: B, recipeTitle: 'Soup' },
      NOW + 60_000,
    );
    expect(cooked.items).toEqual([
      { ...started.items[0]!, currentStep: 0, checkedIngredients: [] },
      { ...both.items[1]!, currentStep: 1, checkedIngredients: [2] },
    ]);
    // The same step and slot in another recipe is another timer.
    expect(cooked.timers.map((t) => [t.id, t.recipeId])).toEqual([
      ['t1', A],
      ['t2', B],
    ]);
  });

  test('removing a recipe takes its timers; its color is free again', () => {
    const both = startTimer(
      startTimer(startRecipe(started, { recipeId: B, lang: 'fr', servings: 2 }), timer('t1'), NOW),
      { ...timer('t2'), recipeId: B },
      NOW,
    );
    const left = removeRecipe(both, A);
    expect(left.items.map((item) => item.recipeId)).toEqual([B]);
    expect(left.timers.map((t) => t.id)).toEqual(['t2']);
    const again = startRecipe(left, { recipeId: A, lang: 'fr', servings: 4 });
    expect(again.items.map((item) => item.color)).toEqual(['chart-2', 'chart-1']);
  });

  test('a full session takes no other recipe, but the same ones still start', () => {
    let full = EMPTY_STATE;
    const ids = COOK_COLORS.map((_, i) => `0000000${i}-0000-4000-8000-000000000000`);
    for (const recipeId of ids) full = startRecipe(full, { recipeId, lang: 'fr', servings: 2 });
    expect(new Set(full.items.map((item) => item.color)).size).toBe(COOK_COLORS.length);
    expect(canAddRecipe(full, A)).toBe(false);
    expect(startRecipe(full, { recipeId: A, lang: 'fr', servings: 2 })).toBe(full);
    expect(canAddRecipe(full, ids[0]!)).toBe(true);
    expect(
      startRecipe(full, { recipeId: ids[0]!, lang: 'en', servings: 3 }).items[0],
    ).toMatchObject({ lang: 'en', servings: 3 });
  });

  test('steps stay within the recipe', () => {
    expect(goToStep(started, A, 7, 5).items[0]?.currentStep).toBe(4);
    expect(goToStep(started, A, -1, 5).items[0]?.currentStep).toBe(0);
  });

  test('ingredients are checked and unchecked; servings are bounded', () => {
    const checked = toggleIngredient(toggleIngredient(started, A, 3), A, 1);
    expect(checked.items[0]?.checkedIngredients).toEqual([1, 3]);
    expect(toggleIngredient(checked, A, 3).items[0]?.checkedIngredients).toEqual([1]);
    expect(setServings(started, A, 0).items[0]?.servings).toBe(1);
    expect(setServings(started, A, 2.6).items[0]?.servings).toBe(3);
  });

  test('a timer ends at an absolute time; a step timer is not started twice', () => {
    const one = startTimer(started, timer('t1'), NOW);
    expect(one.timers[0]?.endsAt).toBe('2026-10-21T18:10:00.000Z');
    expect(startTimer(one, timer('t2'), NOW + 5000)).toBe(one);
    expect(timerOf(one, A, 0, 0)?.id).toBe('t1');
    // Another slot of the same step is another timer.
    expect(startTimer(one, timer('t3', 0, 1), NOW).timers).toHaveLength(2);
    // Started again once removed.
    expect(startTimer(removeTimer(one, 't1'), timer('t4'), NOW).timers[0]?.id).toBe('t4');
  });

  test('+1 min from the end time, or from now once finished', () => {
    const one = startTimer(started, timer('t1'), NOW);
    expect(extendTimer(one, 't1', 60, NOW).timers[0]?.endsAt).toBe('2026-10-21T18:11:00.000Z');
    const later = NOW + 20 * 60 * 1000;
    expect(extendTimer(one, 't1', 60, later).timers[0]?.endsAt).toBe('2026-10-21T18:21:00.000Z');
  });

  test('timers sorted by end time', () => {
    const two = startTimer(
      startTimer(started, { ...timer('long'), durationSeconds: 900 }, NOW),
      { ...timer('short', 1, 0), durationSeconds: 60 },
      NOW,
    );
    expect(sortedTimers(two).map((t) => t.id)).toEqual(['short', 'long']);
  });
});

describe('steps and ingredients', () => {
  const parsed = parseRecipe(EXAMPLE_RECIPES.fr, { units: DEFAULT_UNITS });
  if (!parsed.ok) throw new Error('example does not parse');
  const display = displayRecipe(parsed.document, 8, 'fr', DEFAULT_UNITS);

  test('steps numbered globally across groups, with their group name', () => {
    const steps = cookSteps(display);
    expect(steps.map((step) => [step.index, step.groupName, step.number])).toEqual([
      [0, 'Pâte', 1],
      [1, 'Pâte', 2],
      [2, 'Cuisson', 3],
      [3, 'Cuisson', 4],
      [4, 'Cuisson', 5],
    ]);
    expect(steps[1]?.segments.some((segment) => segment.kind === 'timer')).toBe(true);
  });

  test('ingredients numbered globally, scaled to the servings', () => {
    const groups = cookIngredients(display);
    const items = groups.flatMap((group) => group.items);
    expect(items.map((item) => ('index' in item ? item.index : -1))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(items[0]?.text).toBe('500 g de farine');
  });
});

describe('sync', () => {
  const state = (step: number): CookState => ({
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

  function setup(options: { local?: LocalCopy; server?: CookSessionResponse['session'] } = {}) {
    let stored = options.local;
    let server = options.server ?? null;
    let online = true;
    let reject: unknown;
    const saved: (CookState | null)[] = [];
    const sync = createCookSync({
      load: () => stored,
      persist: (copy) => {
        stored = copy;
      },
      fetchSession: async () => {
        if (!online) throw new TypeError('Failed to fetch');
        return { session: server, serverNow: new Date(NOW).toISOString(), offset: 42 };
      },
      saveSession: async (next) => {
        if (!online) throw new TypeError('Failed to fetch');
        if (reject) throw reject;
        saved.push(next);
        server = { version: (server?.version ?? 0) + 1, updatedAt: '', state: next };
        return { version: server.version, serverNow: '', offset: 42 };
      },
      endSession: async () => {
        if (!online) throw new TypeError('Failed to fetch');
        saved.push(null);
        server = null;
        return { ok: true, serverNow: '', offset: 42 };
      },
    });
    return {
      sync,
      saved,
      stored: () => stored,
      setOnline: (value: boolean) => {
        online = value;
      },
      setReject: (error: unknown) => {
        reject = error;
      },
    };
  }

  test('loads the server session, with the clock offset', async () => {
    const s = setup({ server: { version: 3, updatedAt: '', state: state(2) } });
    await s.sync.refresh();
    expect(s.sync.getSnapshot()).toMatchObject({
      state: state(2),
      version: 3,
      dirty: false,
      offset: 42,
      ready: true,
    });
    expect(s.stored()).toEqual({ state: state(2), version: 3, dirty: false });
  });

  test('each change is local at once, then saved', async () => {
    const s = setup();
    await s.sync.refresh();
    s.sync.update(() => state(1));
    expect(s.sync.getSnapshot()).toMatchObject({ state: state(1), dirty: true });
    await s.sync.flush();
    expect(s.saved).toEqual([state(1)]);
    expect(s.sync.getSnapshot()).toMatchObject({ dirty: false, version: 1 });
  });

  test('offline: changes are kept and sent when the network is back', async () => {
    const s = setup({ server: { version: 1, updatedAt: '', state: state(0) } });
    await s.sync.refresh();
    s.setOnline(false);
    s.sync.update(() => state(1));
    s.sync.update(() => state(2));
    await s.sync.flush();
    expect(s.sync.getSnapshot()).toMatchObject({ dirty: true, offline: true, state: state(2) });
    expect(s.stored()?.dirty).toBe(true);
    s.setOnline(true);
    await s.sync.flush();
    // Only the latest state is sent.
    expect(s.saved).toEqual([state(2)]);
    expect(s.sync.getSnapshot()).toMatchObject({ dirty: false, offline: false });
  });

  test('a pending local change (reload while offline) wins over the server', async () => {
    const s = setup({
      local: { state: state(4), version: 1, dirty: true },
      server: { version: 1, updatedAt: '', state: state(0) },
    });
    expect(s.sync.getSnapshot().state).toEqual(state(4));
    await s.sync.refresh();
    expect(s.saved).toEqual([state(4)]);
  });

  test('without pending change, the server wins (another device moved on)', async () => {
    const s = setup({
      local: { state: state(1), version: 1, dirty: false },
      server: { version: 2, updatedAt: '', state: state(3) },
    });
    await s.sync.refresh();
    expect(s.sync.getSnapshot()).toMatchObject({ state: state(3), version: 2 });
  });

  test('a change refused as invalid is dropped for the server state', async () => {
    const s = setup({ server: { version: 1, updatedAt: '', state: state(0) } });
    await s.sync.refresh();
    s.setReject(new ApiError(400, 'invalid_timer'));
    s.sync.update(() => state(9));
    await s.sync.flush();
    expect(s.sync.getSnapshot()).toMatchObject({ state: state(0), dirty: false });
  });

  test('signed out (401): the change is kept for later', async () => {
    const s = setup();
    await s.sync.refresh();
    s.setReject(new ApiError(401, 'unauthorized'));
    s.sync.update(() => state(2));
    await s.sync.flush();
    expect(s.sync.getSnapshot()).toMatchObject({ state: state(2), dirty: true });
  });

  test('ending the session', async () => {
    const s = setup({ server: { version: 1, updatedAt: '', state: state(0) } });
    await s.sync.refresh();
    s.sync.end();
    await s.sync.flush();
    expect(s.saved).toEqual([null]);
    expect(s.sync.getSnapshot()).toMatchObject({ state: null, dirty: false });
  });
});

describe('cookText', () => {
  test('timer names from recipe texts are cleaned and cut by code points', async () => {
    const { cookText } = await import('@cookit/shared');
    expect(cookText('repos\tde la\npâte‮ !')).toBe('repos de la pâte !');
    const long = cookText('🍳'.repeat(250));
    expect(Array.from(long)).toHaveLength(200);
    expect(/\p{Cs}/u.test(long)).toBe(false);
  });

  test('a started timer only holds clean names', () => {
    const state = startTimer(
      EMPTY_STATE,
      { ...timer('t1'), label: 'a\nb', recipeTitle: `${'é'.repeat(199)}🍳🍳` },
      NOW,
    );
    expect(state.timers[0]?.label).toBe('a b');
    expect(Array.from(state.timers[0]?.recipeTitle ?? '')).toHaveLength(200);
  });
});
