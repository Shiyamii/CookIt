import { describe, expect, test } from 'bun:test';
import {
  MAX_LINE_KEYS,
  MAX_SHOPPING_ENTRIES,
  MAX_SHOPPING_KEYS,
  MAX_SHOPPING_RECIPES,
  shoppingListInputSchema,
  shoppingStateSchema,
} from './shopping';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const recipe = (n: number) => ({ recipeId: uuid(n), title: `R${n}`, servings: 4, lang: 'fr' });
const entry = (n: number, recipeId: string | null = null, extra: object = {}) => ({
  id: uuid(10_000 + n),
  recipeId,
  name: 'lait',
  quantity: null,
  ...extra,
});
const line = (n: number, entries: object[], extra: object = {}) => ({
  id: uuid(20_000 + n),
  name: 'Lait',
  keys: ['lait'],
  checked: false,
  entries,
  ...extra,
});
const quantity = (extra: object = {}) => ({
  value: 250,
  unit: 'g',
  unitText: 'g',
  rounding: 'decimal',
  ...extra,
});
const ok = (state: unknown) => shoppingStateSchema.safeParse(state).success;

describe('shopping state schema', () => {
  test('accepts an empty list, free items and grouped recipe ingredients', () => {
    expect(ok({ recipes: [], lines: [] })).toBe(true);
    expect(ok({ recipes: [], lines: [line(1, [entry(1)], { keys: [] })] })).toBe(true);
    const grouped = line(1, [
      entry(1, uuid(1), { quantity: quantity() }),
      entry(2, uuid(2), { quantity: quantity({ value: 1, unit: 'tasse', unitText: 'tasse' }) }),
      entry(3),
    ]);
    expect(ok({ recipes: [recipe(1), recipe(2)], lines: [grouped] })).toBe(true);
  });

  test('accepts a range, no unit and fraction rounding', () => {
    const q = quantity({ max: 3, unit: null, unitText: '', rounding: 'fraction' });
    expect(ok({ recipes: [], lines: [line(1, [entry(1, null, { quantity: q })])] })).toBe(true);
  });

  test('refuses an ingredient of a recipe that is not in the list', () => {
    expect(ok({ recipes: [], lines: [line(1, [entry(1, uuid(1))])] })).toBe(false);
  });

  test('refuses duplicates: recipes, lines, ingredients (even across lines)', () => {
    expect(ok({ recipes: [recipe(1), recipe(1)], lines: [] })).toBe(false);
    expect(ok({ recipes: [], lines: [line(1, [entry(1)]), line(1, [entry(2)])] })).toBe(false);
    expect(ok({ recipes: [], lines: [line(1, [entry(1)]), line(2, [entry(1)])] })).toBe(false);
  });

  test('refuses an empty line, an empty name, control characters', () => {
    expect(ok({ recipes: [], lines: [line(1, [])] })).toBe(false);
    expect(ok({ recipes: [], lines: [line(1, [entry(1)], { name: '  ' })] })).toBe(false);
    expect(ok({ recipes: [], lines: [line(1, [entry(1, null, { name: 'a\u0000b' })])] })).toBe(
      false,
    );
    expect(ok({ recipes: [], lines: [line(1, [entry(1)], { keys: ['a‮b'] })] })).toBe(false);
    expect(
      ok({
        recipes: [],
        lines: [line(1, [entry(1, null, { quantity: quantity({ unitText: 'g\n' }) })])],
      }),
    ).toBe(false);
  });

  test('bounds recipes, ingredients over all lines, and names', () => {
    const recipes = (n: number) => Array.from({ length: n }, (_, i) => recipe(i + 1));
    expect(ok({ recipes: recipes(MAX_SHOPPING_RECIPES), lines: [] })).toBe(true);
    expect(ok({ recipes: recipes(MAX_SHOPPING_RECIPES + 1), lines: [] })).toBe(false);

    const entries = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => entry(from + i));
    const half = MAX_SHOPPING_ENTRIES / 2;
    expect(
      ok({ recipes: [], lines: [line(1, entries(0, half)), line(2, entries(half, half))] }),
    ).toBe(true);
    expect(
      ok({ recipes: [], lines: [line(1, entries(0, half)), line(2, entries(half, half + 1))] }),
    ).toBe(false);

    const keys = (count: number) => Array.from({ length: count }, (_, i) => `k${i}`);
    expect(ok({ recipes: [], lines: [line(1, [entry(1)], { keys: keys(MAX_LINE_KEYS) })] })).toBe(
      true,
    );
    expect(
      ok({ recipes: [], lines: [line(1, [entry(1)], { keys: keys(MAX_LINE_KEYS + 1) })] }),
    ).toBe(false);
    const many = Array.from({ length: MAX_SHOPPING_KEYS / MAX_LINE_KEYS + 1 }, (_, i) =>
      line(i, [entry(i)], { keys: keys(MAX_LINE_KEYS) }),
    );
    expect(ok({ recipes: [], lines: many })).toBe(false);
  });

  test('refuses amounts out of bounds and unknown fields', () => {
    const q = (extra: object) => [line(1, [entry(1, null, { quantity: quantity(extra) })])];
    expect(ok({ recipes: [], lines: q({ value: -1 }) })).toBe(false);
    expect(ok({ recipes: [], lines: q({ value: 2_000_000 }) })).toBe(false);
    expect(ok({ recipes: [], lines: q({ value: Number.NaN }) })).toBe(false);
    expect(ok({ recipes: [], lines: q({ unit: 'Grams!' }) })).toBe(false);
    expect(ok({ recipes: [], lines: q({ extra: 1 }) })).toBe(false);
    expect(ok({ recipes: [], lines: [], entries: [] })).toBe(false);
  });

  test('the API input wraps the state', () => {
    expect(shoppingListInputSchema.safeParse({ state: { recipes: [], lines: [] } }).success).toBe(
      true,
    );
    expect(
      shoppingListInputSchema.safeParse({ state: { recipes: [], lines: [] }, x: 1 }).success,
    ).toBe(false);
  });
});
