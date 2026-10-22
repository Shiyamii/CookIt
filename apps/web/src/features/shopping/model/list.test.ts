import { describe, expect, test } from 'bun:test';
import { parseRecipe, shoppingStateSchema, type RecipeDocument } from '@cookit/shared';
import {
  addItem,
  addRecipe,
  canAdd,
  clearChecked,
  EMPTY_LIST,
  ingredientKey,
  recipeCandidates,
  remainingCount,
  removeRecipe,
  setChecked,
  shoppingLines,
} from './list';

const CREPES = '11111111-1111-4111-8111-111111111111';
const GATEAU = '22222222-2222-4222-8222-222222222222';

function doc(title: string, servings: number, ingredients: string): RecipeDocument {
  const result = parseRecipe(
    `# ${title}\n\nportions: ${servings}\n\n---\n\n${ingredients}\n\n---\n\n1. Mélanger.\n`,
  );
  if (!result.ok) throw new Error('unparsable');
  return result.document;
}

let next = 0;
const newId = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;

const crepes = doc(
  'Crêpes',
  4,
  '- 250 g de farine\n- 3 œufs\n- 50 cl de lait\n- 1 pincée de sel\n\nUne ligne de texte.',
);
const gateau = doc('Gâteau', 6, '- 200 g farine\n- 2 oeufs\n- 2-3 c. à soupe de sucre\n- sel');

function withBoth() {
  let state = addRecipe(
    EMPTY_LIST,
    { recipeId: CREPES, title: 'Crêpes', servings: 4, lang: 'fr' },
    recipeCandidates(crepes, 4, 'fr'),
    newId,
  );
  state = addRecipe(
    state,
    { recipeId: GATEAU, title: 'Gâteau', servings: 6, lang: 'fr' },
    recipeCandidates(gateau, 6, 'fr'),
    newId,
  );
  return state;
}

describe('ingredients of a recipe', () => {
  test('scaled to the servings chosen, text lines left out', () => {
    const candidates = recipeCandidates(crepes, 8, 'fr');
    expect(candidates.map((candidate) => candidate.text)).toEqual([
      '500 g de farine',
      '6 œufs',
      '100 cl de lait',
      '2 pincée de sel',
    ]);
    expect(candidates[0]?.quantity).toEqual({
      value: 500,
      unit: 'g',
      rounding: 'decimal',
      before: '',
      after: ' g de farine',
    });
  });

  test('a line without a number has no quantity', () => {
    const sel = recipeCandidates(gateau, 6, 'fr')[3];
    expect(sel).toEqual({ text: 'sel', name: 'sel', quantity: null });
  });

  test('a range keeps both bounds', () => {
    expect(recipeCandidates(gateau, 12, 'fr')[2]?.quantity).toMatchObject({ value: 4, max: 6 });
  });
});

describe('merged lines', () => {
  test('the same ingredient and unit is added up, in the first text', () => {
    const lines = shoppingLines(withBoth());
    expect(lines.map((line) => line.text)).toEqual([
      '450 g de farine',
      '5 œufs',
      '50 cl de lait',
      '1 pincée de sel',
      '2-3 c. à soupe de sucre',
      'sel',
    ]);
    expect(lines[0]?.recipes).toEqual(['Crêpes', 'Gâteau']);
    expect(lines[2]?.recipes).toEqual(['Crêpes']);
  });

  test('names match without case, accents, ligatures or plural', () => {
    const key = (name: string) => ingredientKey({ name, text: name, quantity: null });
    expect(key('Œufs')).toBe(key('oeuf'));
    expect(key('Pommes de terre')).toBe(key('pomme de terre'));
    expect(key('farine')).not.toBe(key('sucre'));
  });

  test('a free item is never merged', () => {
    let state = addItem(EMPTY_LIST, ' lait ', newId());
    state = addItem(state, 'lait', newId());
    expect(shoppingLines(state).map((line) => line.text)).toEqual(['lait', 'lait']);
    expect(addItem(state, '   ', newId())).toBe(state);
  });

  test('a merged line is checked when all its entries are; checked lines go last', () => {
    let state = withBoth();
    const farine = shoppingLines(state)[0]!;
    state = setChecked(state, farine.entryIds, true);
    const lines = shoppingLines(state);
    expect(lines.at(-1)?.text).toBe('450 g de farine');
    expect(lines.at(-1)?.checked).toBe(true);
    expect(remainingCount(state)).toBe(5);
    // Adding the recipe again brings back what is needed, unchecked.
    state = addRecipe(
      state,
      { recipeId: GATEAU, title: 'Gâteau', servings: 6, lang: 'fr' },
      recipeCandidates(gateau, 6, 'fr'),
      newId,
    );
    expect(shoppingLines(state).find((line) => line.text.includes('farine'))?.checked).toBe(false);
  });
});

describe('changes', () => {
  test('adding a recipe again replaces it', () => {
    let state = withBoth();
    state = addRecipe(
      state,
      { recipeId: CREPES, title: 'Crêpes', servings: 2, lang: 'fr' },
      recipeCandidates(crepes, 2, 'fr').slice(0, 1),
      newId,
    );
    expect(state.recipes.map((recipe) => [recipe.title, recipe.servings])).toEqual([
      ['Gâteau', 6],
      ['Crêpes', 2],
    ]);
    // 200 g (gâteau) + 125 g (crêpes for 2), in the text of the one now first in the list.
    expect(shoppingLines(state)[0]?.text).toBe('325 g farine');
    expect(shoppingLines(state).map((line) => line.text)).not.toContain('6 œufs');
  });

  test('removing a recipe removes its items', () => {
    const state = removeRecipe(withBoth(), CREPES);
    expect(state.recipes.map((recipe) => recipe.title)).toEqual(['Gâteau']);
    expect(shoppingLines(state).map((line) => line.text)).toEqual([
      '200 g farine',
      '2 oeufs',
      '2-3 c. à soupe de sucre',
      'sel',
    ]);
  });

  test('clearing what was bought drops the recipes nothing is left of', () => {
    let state = withBoth();
    const gateauIds = state.entries
      .filter((entry) => entry.recipeId === GATEAU)
      .map((entry) => entry.id);
    state = setChecked(state, gateauIds, true);
    state = clearChecked(state);
    expect(state.recipes.map((recipe) => recipe.title)).toEqual(['Crêpes']);
    expect(state.entries).toHaveLength(4);
  });

  test('every state built is accepted by the API schema', () => {
    const state = addItem(withBoth(), 'papier toilette', newId());
    expect(shoppingStateSchema.safeParse(state).success).toBe(true);
    expect(shoppingStateSchema.safeParse(clearChecked(state)).success).toBe(true);
  });

  test('the list has room limits', () => {
    expect(canAdd(EMPTY_LIST, 300)).toBe(true);
    expect(canAdd(EMPTY_LIST, 301)).toBe(false);
    const state = withBoth();
    // Replacing a recipe frees its own items first.
    expect(canAdd(state, 300 - 4, GATEAU)).toBe(true);
    expect(canAdd(state, 300 - 4)).toBe(false);
  });
});
