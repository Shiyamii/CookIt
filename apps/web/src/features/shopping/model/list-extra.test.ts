import { describe, expect, test } from 'bun:test';
import { parseRecipe, shoppingStateSchema, type Locale, type RecipeDocument } from '@cookit/shared';
import {
  addItem,
  addRecipe,
  canAdd,
  clearChecked,
  EMPTY_LIST,
  recipeCandidates,
  remainingCount,
  removeRecipe,
  setChecked,
  shoppingLines,
} from './list';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function doc(servings: number, ingredients: string): RecipeDocument {
  const result = parseRecipe(
    `# Test\n\nportions: ${servings}\n\n---\n\n${ingredients}\n\n---\n\n1. Mélanger.\n`,
  );
  if (!result.ok) throw new Error('unparsable');
  return result.document;
}

let next = 0;
const newId = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;

/** Recipes A then B, both for their own servings. */
function listOf(first: RecipeDocument, second: RecipeDocument, lang: Locale = 'fr') {
  let state = addRecipe(
    EMPTY_LIST,
    { recipeId: A, title: 'A', servings: first.servings, lang },
    recipeCandidates(first, first.servings, lang),
    newId,
  );
  state = addRecipe(
    state,
    { recipeId: B, title: 'B', servings: second.servings, lang },
    recipeCandidates(second, second.servings, lang),
    newId,
  );
  return state;
}

const texts = (state: Parameters<typeof shoppingLines>[0]) =>
  shoppingLines(state).map((line) => line.text);

describe('merging edge cases', () => {
  test('a range and a single value are added up as a range', () => {
    const state = listOf(doc(2, '- 2-3 c. à soupe de sucre'), doc(2, '- 1 c. à soupe de sucre'));
    expect(texts(state)).toEqual(['3-4 c. à soupe de sucre']);
  });

  test('two ranges are added bound by bound', () => {
    const state = listOf(doc(2, '- 1-2 carottes'), doc(2, '- 2-3 carottes'));
    expect(texts(state)).toEqual(['3-5 carottes']);
  });

  test('different units of the same ingredient stay on separate lines', () => {
    const state = listOf(doc(2, '- 200 g de farine'), doc(2, '- 2 c. à soupe de farine'));
    expect(shoppingLines(state)).toHaveLength(2);
  });

  test('the decimal separator follows the language of the recipe (fr comma)', () => {
    const state = listOf(doc(2, '- 0,75 l de lait'), doc(2, '- 0,75 l de lait'));
    expect(texts(state)).toEqual(['1,5 l de lait']);
  });

  test('the decimal separator follows the language of the recipe (en point)', () => {
    const state = listOf(doc(2, '- 0.75 l milk'), doc(2, '- 0.75 l milk'), 'en');
    expect(texts(state)).toEqual(['1.5 l milk']);
  });

  test('a Hungarian recipe is merged and written with a decimal comma', () => {
    const state = listOf(doc(2, '- 0,75 l tej'), doc(2, '- 0,75 l tej'), 'hu');
    expect(texts(state)).toEqual(['1,5 l tej']);
  });

  test('fraction units are added up as fractions', () => {
    const state = listOf(doc(2, '- ½ c. à soupe de sucre'), doc(2, '- ½ c. à soupe de sucre'));
    expect(texts(state)).toEqual(['1 c. à soupe de sucre']);
  });

  test('lines without a quantity are merged by name', () => {
    const lines = shoppingLines(listOf(doc(2, '- sel'), doc(2, '- sel')));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe('sel');
    expect(lines[0]?.entryIds).toHaveLength(2);
  });

  test('a merged line is checked only when all its entries are', () => {
    const state = listOf(doc(2, '- 200 g de farine'), doc(2, '- 100 g de farine'));
    const [line] = shoppingLines(state);
    const half = setChecked(state, [line!.entryIds[0]!], true);
    expect(shoppingLines(half)[0]?.checked).toBe(false);
    expect(remainingCount(half)).toBe(1);
  });

  test('the remaining count of no list is 0', () => {
    expect(remainingCount(null)).toBe(0);
    expect(remainingCount(EMPTY_LIST)).toBe(0);
  });
});

describe('hostile or oversized recipe lines', () => {
  test('a line longer than the limit is cut and not added up', () => {
    const [candidate] = recipeCandidates(doc(2, `- 2 g de ${'a'.repeat(300)}`), 2, 'fr');
    expect(Array.from(candidate!.text).length).toBeLessThanOrEqual(200);
    expect(candidate?.quantity).toBeNull();
  });

  test('a huge amount is kept as text, not added up', () => {
    expect(recipeCandidates(doc(2, '- 99999999 g de farine'), 2, 'fr')[0]?.quantity).toBeNull();
  });

  test('scaling can push an amount over the limit', () => {
    const big = doc(1, '- 900000 g de farine');
    expect(recipeCandidates(big, 1, 'fr')[0]?.quantity).not.toBeNull();
    expect(recipeCandidates(big, 2, 'fr')[0]?.quantity).toBeNull();
  });

  test('control characters of a title or a free item are replaced', () => {
    const state = addRecipe(
      EMPTY_LIST,
      { recipeId: A, title: 'A\u0000B‮C', servings: 2, lang: 'fr' },
      [{ text: 'lait', name: 'lait', quantity: null }],
      newId,
    );
    expect(state.recipes[0]?.title).toBe('A B C');
    const item = addItem(EMPTY_LIST, 'pain\nde mie\u0007', newId());
    expect(item.entries[0]?.text).toBe('pain de mie');
    expect(shoppingStateSchema.safeParse(item).success).toBe(true);
  });

  test('a free item is cut to the limit', () => {
    const item = addItem(EMPTY_LIST, 'x'.repeat(500), newId());
    expect(item.entries[0]?.text).toHaveLength(200);
    expect(shoppingStateSchema.safeParse(item).success).toBe(true);
  });

  test('an ingredient with a control character still gives a valid list', () => {
    const state = listOf(doc(2, '- 2 g de fa\u0007rine'), doc(2, '- 1 oeuf'));
    expect(shoppingStateSchema.safeParse(state).success).toBe(true);
  });
});

describe('more changes', () => {
  test('adding a recipe with nothing chosen removes it', () => {
    const base = listOf(doc(2, '- 1 oeuf'), doc(2, '- 2 pommes'));
    const state = addRecipe(base, { recipeId: A, title: 'A', servings: 2, lang: 'fr' }, [], newId);
    expect(state.recipes.map((recipe) => recipe.recipeId)).toEqual([B]);
    expect(state.entries.every((entry) => entry.recipeId === B)).toBe(true);
  });

  test('a new recipe does not fit once the recipe limit is reached', () => {
    const recipes = Array.from({ length: 50 }, (_, i) => ({
      recipeId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      title: 'R',
      servings: 1,
      lang: 'fr' as const,
    }));
    const state = { recipes, entries: [] };
    expect(canAdd(state, 1, 'ffffffff-ffff-4fff-8fff-ffffffffffff')).toBe(false);
    expect(canAdd(state, 1, recipes[0]!.recipeId)).toBe(true);
    expect(canAdd(state, 1)).toBe(true);
  });

  test('clearing with nothing checked changes nothing; a checked free item leaves', () => {
    const state = addItem(listOf(doc(2, '- 1 oeuf'), doc(2, '- 2 pommes')), 'pain', newId());
    expect(clearChecked(state)).toEqual(state);
    const pain = state.entries.at(-1)!;
    const cleared = clearChecked(setChecked(state, [pain.id], true));
    expect(cleared.entries.some((entry) => entry.id === pain.id)).toBe(false);
    expect(cleared.recipes).toHaveLength(2);
  });

  test('removing an unknown recipe changes nothing', () => {
    const state = listOf(doc(2, '- 1 oeuf'), doc(2, '- 2 pommes'));
    expect(removeRecipe(state, '33333333-3333-4333-8333-333333333333')).toEqual(state);
  });
});
