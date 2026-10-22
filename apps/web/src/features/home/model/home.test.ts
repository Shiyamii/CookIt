import { describe, expect, test } from 'bun:test';
import type { CookState, CookTimer } from '@cookit/shared';
import { cookingSummary, localDay } from './home';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-22T12:00:00.000Z');

const timer = (id: number, secondsFromNow: number, label = ''): CookTimer => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  recipeId: A,
  recipeTitle: 'Crêpes',
  label,
  durationSeconds: 600,
  endsAt: new Date(NOW + secondsFromNow * 1000).toISOString(),
  step: null,
  slot: null,
});

const state = (timers: CookTimer[]): CookState => ({
  items: [
    {
      recipeId: A,
      lang: 'fr',
      servings: 4,
      currentStep: 0,
      checkedIngredients: [],
      color: 'chart-1',
    },
    {
      recipeId: B,
      lang: 'en',
      servings: 2,
      currentStep: 4,
      checkedIngredients: [1],
      color: 'chart-2',
    },
  ],
  timers,
});

describe('localDay', () => {
  test('the local date, padded', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDay(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
  test('year boundary: the last and the first second of a year', () => {
    expect(localDay(new Date(2026, 11, 31, 23, 59, 59, 999))).toBe('2026-12-31');
    expect(localDay(new Date(2027, 0, 1, 0, 0, 0, 0))).toBe('2027-01-01');
  });
  test('leap day and the day after', () => {
    expect(localDay(new Date(2028, 1, 29, 12))).toBe('2028-02-29');
    expect(localDay(new Date(2028, 2, 1, 0, 0))).toBe('2028-03-01');
    expect(localDay(new Date(2027, 2, 1, 0, 0))).toBe('2027-03-01');
  });
  test('days around daylight saving changes keep one date per calendar day', () => {
    // Built from local components: 23h or 25h days still give consecutive dates.
    expect(localDay(new Date(2026, 2, 29, 0, 30))).toBe('2026-03-29');
    expect(localDay(new Date(2026, 2, 29, 23, 30))).toBe('2026-03-29');
    expect(localDay(new Date(2026, 2, 30, 0, 30))).toBe('2026-03-30');
    expect(localDay(new Date(2026, 9, 25, 0, 30))).toBe('2026-10-25');
    expect(localDay(new Date(2026, 9, 25, 23, 30))).toBe('2026-10-25');
    expect(localDay(new Date(2026, 9, 26, 0, 30))).toBe('2026-10-26');
  });
});

describe('cookingSummary', () => {
  test('nothing cooked: nothing to resume', () => {
    expect(cookingSummary(null, NOW)).toBeUndefined();
    expect(cookingSummary({ items: [], timers: [] }, NOW)).toBeUndefined();
  });

  test('the recipes with their step, 1-based', () => {
    expect(cookingSummary(state([]), NOW)).toEqual({
      items: [
        { recipeId: A, lang: 'fr', color: 'chart-1', step: 1 },
        { recipeId: B, lang: 'en', color: 'chart-2', step: 5 },
      ],
      next: undefined,
      finished: 0,
    });
  });

  test('the next timer is the running one that ends first', () => {
    const summary = cookingSummary(
      state([timer(1, 600, 'four'), timer(2, 60, 'pâte'), timer(3, -5)]),
      NOW,
    );
    expect(summary?.next).toEqual({ label: 'pâte', recipeTitle: 'Crêpes', endsAt: NOW + 60_000 });
    expect(summary?.finished).toBe(1);
  });

  test('a timer without a name is called by its dish', () => {
    expect(cookingSummary(state([timer(1, 30)]), NOW)?.next?.label).toBe('Crêpes');
  });

  test('a timer ending right now has finished', () => {
    const summary = cookingSummary(state([timer(1, 0)]), NOW);
    expect(summary?.next).toBeUndefined();
    expect(summary?.finished).toBe(1);
  });

  test('timers of several recipes: the earliest running one wins, whatever its recipe', () => {
    const other = { ...timer(2, 30, 'sauce'), recipeId: B, recipeTitle: 'Curry' };
    const summary = cookingSummary(state([timer(1, 120, 'four'), other]), NOW);
    expect(summary?.next).toEqual({ label: 'sauce', recipeTitle: 'Curry', endsAt: NOW + 30_000 });
    expect(summary?.finished).toBe(0);
  });

  test('only finished timers: no next one, all counted', () => {
    const summary = cookingSummary(state([timer(1, -10), timer(2, -300)]), NOW);
    expect(summary?.next).toBeUndefined();
    expect(summary?.finished).toBe(2);
  });

  test('a timer whose end cannot be parsed is not a next timer', () => {
    const broken = { ...timer(1, 10), endsAt: 'not a date' };
    const summary = cookingSummary(state([broken, timer(2, 90, 'riz')]), NOW);
    expect(summary?.next?.label).toBe('riz');
    expect(summary?.next?.endsAt).toBe(NOW + 90_000);
    expect(Number.isNaN(summary?.next?.endsAt)).toBe(false);
  });

  test('a single timer with an unparsable end gives no next timer', () => {
    const summary = cookingSummary(state([{ ...timer(1, 10), endsAt: 'nope' }]), NOW);
    expect(summary?.next).toBeUndefined();
  });

  test('does not mutate the state', () => {
    const input = state([timer(1, 600), timer(2, 60)]);
    const before = JSON.stringify(input);
    cookingSummary(input, NOW);
    expect(JSON.stringify(input)).toBe(before);
  });
});
