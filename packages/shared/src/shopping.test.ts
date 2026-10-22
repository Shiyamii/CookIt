import { describe, expect, test } from 'bun:test';
import {
  MAX_SHOPPING_ENTRIES,
  MAX_SHOPPING_RECIPES,
  shoppingListInputSchema,
  shoppingStateSchema,
} from './shopping';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const recipe = (n: number) => ({ recipeId: uuid(n), title: `R${n}`, servings: 4, lang: 'fr' });
const entry = (n: number, recipeId: string | null = null, extra: object = {}) => ({
  id: uuid(1000 + n),
  recipeId,
  text: 'lait',
  name: 'lait',
  quantity: null,
  checked: false,
  ...extra,
});
const quantity = (extra: object = {}) => ({
  value: 2,
  unit: 'g',
  rounding: 'decimal',
  before: '',
  after: ' g de farine',
  ...extra,
});
const ok = (state: unknown) => shoppingStateSchema.safeParse(state).success;

describe('shopping state schema', () => {
  test('accepts an empty list, free items and recipe items', () => {
    expect(ok({ recipes: [], entries: [] })).toBe(true);
    expect(ok({ recipes: [], entries: [entry(1)] })).toBe(true);
    expect(ok({ recipes: [recipe(1)], entries: [entry(1, uuid(1))] })).toBe(true);
  });

  test('accepts a quantity with a range, a null unit and a fractional unit', () => {
    const q = quantity({ max: 3, unit: null, rounding: 'fraction' });
    expect(ok({ recipes: [], entries: [entry(1, null, { quantity: q })] })).toBe(true);
  });

  test('refuses an item that refers to a recipe not in the list', () => {
    expect(ok({ recipes: [], entries: [entry(1, uuid(1))] })).toBe(false);
    expect(ok({ recipes: [recipe(2)], entries: [entry(1, uuid(1))] })).toBe(false);
  });

  test('refuses duplicate recipes and duplicate item ids', () => {
    expect(ok({ recipes: [recipe(1), recipe(1)], entries: [] })).toBe(false);
    expect(ok({ recipes: [], entries: [entry(1), entry(1)] })).toBe(false);
  });

  test('bounds the number of recipes and items', () => {
    const recipes = (n: number) => Array.from({ length: n }, (_, i) => recipe(i + 1));
    const entries = (n: number) => Array.from({ length: n }, (_, i) => entry(i + 1));
    expect(ok({ recipes: recipes(MAX_SHOPPING_RECIPES), entries: [] })).toBe(true);
    expect(ok({ recipes: recipes(MAX_SHOPPING_RECIPES + 1), entries: [] })).toBe(false);
    expect(ok({ recipes: [], entries: entries(MAX_SHOPPING_ENTRIES) })).toBe(true);
    expect(ok({ recipes: [], entries: entries(MAX_SHOPPING_ENTRIES + 1) })).toBe(false);
  });

  test('text: not empty, at most 200 characters, no control characters', () => {
    const withText = (text: string) => ok({ recipes: [], entries: [entry(1, null, { text })] });
    expect(withText('a'.repeat(200))).toBe(true);
    expect(withText('a'.repeat(201))).toBe(false);
    expect(withText('')).toBe(false);
    expect(withText('   ')).toBe(false);
    expect(withText('a\nb')).toBe(false);
    expect(withText('a\u0000b')).toBe(false);
    expect(withText('a‮b')).toBe(false);
    expect(withText('a b')).toBe(false);
  });

  test('the name and the recipe title refuse control characters too', () => {
    expect(ok({ recipes: [], entries: [entry(1, null, { name: 'a\tb' })] })).toBe(false);
    expect(ok({ recipes: [{ ...recipe(1), title: 'a\nb' }], entries: [] })).toBe(false);
  });

  test('amounts: 0 to 1 000 000, finite, never negative', () => {
    const withQuantity = (extra: object) =>
      ok({ recipes: [], entries: [entry(1, null, { quantity: quantity(extra) })] });
    expect(withQuantity({ value: 0 })).toBe(true);
    expect(withQuantity({ value: 1_000_000 })).toBe(true);
    expect(withQuantity({ value: 1_000_001 })).toBe(false);
    expect(withQuantity({ value: -1 })).toBe(false);
    expect(withQuantity({ value: Infinity })).toBe(false);
    expect(withQuantity({ value: Number.NaN })).toBe(false);
    expect(withQuantity({ max: 1e7 })).toBe(false);
  });

  test('quantity unit must be a slug, rounding a known one', () => {
    const withQuantity = (extra: object) =>
      ok({ recipes: [], entries: [entry(1, null, { quantity: quantity(extra) })] });
    expect(withQuantity({ unit: 'c-a-s' })).toBe(true);
    expect(withQuantity({ unit: 'Gramme' })).toBe(false);
    expect(withQuantity({ unit: '' })).toBe(false);
    expect(withQuantity({ rounding: 'round' })).toBe(false);
  });

  test('servings are integers from 1, the language a supported one', () => {
    const withRecipe = (extra: object) =>
      ok({ recipes: [{ ...recipe(1), ...extra }], entries: [] });
    expect(withRecipe({ servings: 0 })).toBe(false);
    expect(withRecipe({ servings: 2.5 })).toBe(false);
    expect(withRecipe({ lang: 'hu' })).toBe(true);
    expect(withRecipe({ lang: 'de' })).toBe(false);
  });

  test('ids must be uuids and unknown keys are refused', () => {
    expect(ok({ recipes: [], entries: [entry(1, null, { id: 'abc' })] })).toBe(false);
    expect(ok({ recipes: [], entries: [entry(1, null, { extra: 1 })] })).toBe(false);
    expect(ok({ recipes: [], entries: [], extra: 1 })).toBe(false);
  });
});

describe('shopping list input schema', () => {
  test('wraps the state and refuses extra keys', () => {
    const state = { recipes: [], entries: [] };
    expect(shoppingListInputSchema.safeParse({ state }).success).toBe(true);
    expect(shoppingListInputSchema.safeParse({ state, version: 1 }).success).toBe(false);
    expect(shoppingListInputSchema.safeParse({}).success).toBe(false);
  });
});
