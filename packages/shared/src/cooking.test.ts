import { describe, expect, test } from 'bun:test';
import {
  cookItemSchema,
  cookSessionInputSchema,
  cookStateSchema,
  cookTimerSchema,
  MAX_COOK_ITEMS,
  MAX_COOK_TIMERS,
} from './cooking';
import { MAX_TIMER_SECONDS } from './recipe/inline';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const item = (n = 1) => ({
  recipeId: uuid(n),
  lang: 'fr',
  servings: 4,
  currentStep: 0,
  checkedIngredients: [] as number[],
  color: 'chart-1',
});

const timer = (n = 1) => ({
  id: uuid(n),
  recipeId: uuid(1),
  recipeTitle: 'Crêpes',
  label: 'repos',
  durationSeconds: 60,
  endsAt: '2026-10-21T18:00:00.000Z',
  step: 0,
  slot: 0,
});

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('cook item', () => {
  test('a valid item passes', () => {
    expect(ok(cookItemSchema, item())).toBe(true);
  });

  test('servings are bounded to 1..1000 integers', () => {
    expect(ok(cookItemSchema, { ...item(), servings: 0 })).toBe(false);
    expect(ok(cookItemSchema, { ...item(), servings: 1001 })).toBe(false);
    expect(ok(cookItemSchema, { ...item(), servings: 1000 })).toBe(true);
    expect(ok(cookItemSchema, { ...item(), servings: 2.5 })).toBe(false);
  });

  test('step is a non-negative bounded integer', () => {
    expect(ok(cookItemSchema, { ...item(), currentStep: -1 })).toBe(false);
    expect(ok(cookItemSchema, { ...item(), currentStep: 1.5 })).toBe(false);
    expect(ok(cookItemSchema, { ...item(), currentStep: 10_001 })).toBe(false);
  });

  test('checked ingredients are bounded in count and value', () => {
    expect(ok(cookItemSchema, { ...item(), checkedIngredients: [-1] })).toBe(false);
    expect(
      ok(cookItemSchema, {
        ...item(),
        checkedIngredients: Array.from({ length: 1001 }, (_, i) => i),
      }),
    ).toBe(false);
  });

  test('unknown color, unknown language, bad uuid and extra keys are refused', () => {
    expect(ok(cookItemSchema, { ...item(), color: '#ff0000' })).toBe(false);
    expect(ok(cookItemSchema, { ...item(), lang: 'de' })).toBe(false);
    expect(ok(cookItemSchema, { ...item(), recipeId: 'nope' })).toBe(false);
    expect(ok(cookItemSchema, { ...item(), extra: 1 })).toBe(false);
  });
});

describe('cook timer', () => {
  test('a valid timer passes, with or without a step and recipe', () => {
    expect(ok(cookTimerSchema, timer())).toBe(true);
    expect(ok(cookTimerSchema, { ...timer(), recipeId: null, step: null, slot: null })).toBe(true);
  });

  test('duration is 1..MAX_TIMER_SECONDS integer seconds', () => {
    expect(ok(cookTimerSchema, { ...timer(), durationSeconds: 0 })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), durationSeconds: MAX_TIMER_SECONDS })).toBe(true);
    expect(ok(cookTimerSchema, { ...timer(), durationSeconds: MAX_TIMER_SECONDS + 1 })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), durationSeconds: 1.5 })).toBe(false);
  });

  test('endsAt must be an ISO datetime', () => {
    expect(ok(cookTimerSchema, { ...timer(), endsAt: 'tomorrow' })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), endsAt: '2026-10-21' })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), endsAt: '2026-10-21T20:00:00+02:00' })).toBe(true);
  });

  test('label may be empty but not too long or with control characters', () => {
    expect(ok(cookTimerSchema, { ...timer(), label: '' })).toBe(true);
    expect(ok(cookTimerSchema, { ...timer(), label: 'x'.repeat(201) })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), label: 'a\nb' })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), recipeTitle: 'a\u0000b' })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), label: 'a‮b' })).toBe(false);
  });

  test('step and slot are bounded; extra keys are refused', () => {
    expect(ok(cookTimerSchema, { ...timer(), step: -1 })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), slot: 1001 })).toBe(false);
    expect(ok(cookTimerSchema, { ...timer(), extra: 1 })).toBe(false);
  });
});

describe('cook state', () => {
  test('empty state is valid', () => {
    expect(ok(cookStateSchema, { items: [], timers: [] })).toBe(true);
  });

  test('a recipe is only once in a session', () => {
    expect(ok(cookStateSchema, { items: [item(1), item(1)], timers: [] })).toBe(false);
    expect(ok(cookStateSchema, { items: [item(1), item(2)], timers: [] })).toBe(true);
  });

  test('timer ids are unique', () => {
    expect(ok(cookStateSchema, { items: [], timers: [timer(1), timer(1)] })).toBe(false);
    expect(ok(cookStateSchema, { items: [], timers: [timer(1), timer(2)] })).toBe(true);
  });

  test('item and timer counts are capped', () => {
    const items = Array.from({ length: MAX_COOK_ITEMS + 1 }, (_, i) => item(i + 1));
    expect(ok(cookStateSchema, { items, timers: [] })).toBe(false);
    expect(ok(cookStateSchema, { items: items.slice(0, MAX_COOK_ITEMS), timers: [] })).toBe(true);
    const timers = Array.from({ length: MAX_COOK_TIMERS + 1 }, (_, i) => timer(i + 1));
    expect(ok(cookStateSchema, { items: [], timers })).toBe(false);
    expect(ok(cookStateSchema, { items: [], timers: timers.slice(0, MAX_COOK_TIMERS) })).toBe(true);
  });

  test('extra keys at the state or the body level are refused', () => {
    expect(ok(cookStateSchema, { items: [], timers: [], extra: 1 })).toBe(false);
    expect(ok(cookSessionInputSchema, { state: { items: [], timers: [] }, version: 3 })).toBe(
      false,
    );
    expect(ok(cookSessionInputSchema, { state: { items: [], timers: [] } })).toBe(true);
    expect(ok(cookSessionInputSchema, {})).toBe(false);
  });
});
