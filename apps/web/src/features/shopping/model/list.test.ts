import { describe, expect, test } from 'bun:test';
import { parseRecipe, shoppingStateSchema, type RecipeDocument } from '@cookit/shared';
import {
  addItem,
  addRecipe,
  canAdd,
  clearChecked,
  EMPTY_LIST,
  groupLines,
  groupName,
  moveLine,
  nameKey,
  recipeCandidates,
  remainingCount,
  removeRecipe,
  setChecked,
  shoppingLines,
  splitLine,
} from './list';

const CREPES = '11111111-1111-4111-8111-111111111111';
const GATEAU = '22222222-2222-4222-8222-222222222222';
const COOKIES = '33333333-3333-4333-8333-333333333333';

function doc(servings: number, ingredients: string): RecipeDocument {
  const result = parseRecipe(
    `# Recette\n\nportions: ${servings}\n\n---\n\n${ingredients}\n\n---\n\n1. Mélanger.\n`,
  );
  if (!result.ok) throw new Error('unparsable');
  return result.document;
}

let next = 0;
const newId = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;

const crepes = doc(
  4,
  '- 250 g de farine\n- 3 œufs\n- 50 cl de lait\n- 1 pincée de sel\n\nUne ligne de texte.',
);
const gateau = doc(6, '- 200 g farine\n- 2 oeufs\n- 2-3 c. à soupe de sucre\n- sel');
const cookies = doc(4, '- 1 tasse de farine T55\n- 1 tasse de farine');

const add = (
  state = EMPTY_LIST,
  id: string,
  title: string,
  document: RecipeDocument,
  servings = document.servings,
) =>
  addRecipe(
    state,
    { recipeId: id, title, servings, lang: 'fr' },
    recipeCandidates(document, servings, 'fr'),
    newId,
  );

const both = () => add(add(EMPTY_LIST, CREPES, 'Crêpes', crepes), GATEAU, 'Gâteau', gateau);
const texts = (state: typeof EMPTY_LIST) =>
  shoppingLines(state).toBuy.map((line) =>
    line.quantities ? `${line.name} (${line.quantities})` : line.name,
  );

describe('ingredients of a recipe', () => {
  test('scaled to the servings chosen, text lines left out', () => {
    const candidates = recipeCandidates(crepes, 8, 'fr');
    expect(candidates.map((candidate) => candidate.text)).toEqual([
      '500 g de farine',
      '6 œufs',
      '100 cl de lait',
      '2 pincée de sel',
    ]);
    expect(candidates[0]).toEqual({
      text: '500 g de farine',
      name: 'farine',
      quantity: { value: 500, unit: 'g', unitText: 'g', rounding: 'decimal' },
    });
    expect(candidates[1]?.quantity).toEqual({
      value: 6,
      unit: null,
      unitText: '',
      rounding: 'fraction',
    });
  });

  test('a line without a number has no quantity; a range keeps both bounds', () => {
    const candidates = recipeCandidates(gateau, 12, 'fr');
    expect(candidates[3]).toEqual({ text: 'sel', name: 'sel', quantity: null });
    expect(candidates[2]?.quantity).toMatchObject({ value: 4, max: 6, unitText: 'c. à soupe' });
  });

  test('a huge amount stays in the name', () => {
    const [huge] = recipeCandidates(doc(1, '- 999999 g de sel'), 1000, 'fr');
    expect(huge?.quantity).toBeNull();
    expect(huge?.name).toContain('sel');
  });
});

describe('lines', () => {
  test('one line per ingredient name, whatever the unit, with each recipe’s quantity', () => {
    const state = add(both(), COOKIES, 'Cookies', cookies);
    expect(texts(state)).toEqual([
      'Farine (250 g · 200 g · 1 tasse)',
      'Œufs (3 · 2 = 5)',
      'Lait (50 cl)',
      'Sel (1 pincée)',
      'Sucre (2-3 c. à soupe)',
      'Farine T55 (1 tasse)',
    ]);
    expect(shoppingLines(state).toBuy[0]?.recipes).toEqual(['Crêpes', 'Gâteau', 'Cookies']);
  });

  test('the same unit everywhere gives a total', () => {
    const state = add(
      add(EMPTY_LIST, CREPES, 'A', doc(4, '- 250 g farine')),
      GATEAU,
      'B',
      doc(4, '- 100 g farine'),
    );
    expect(texts(state)).toEqual(['Farine (250 g · 100 g = 350 g)']);
  });

  test('names match without case, accents, ligatures or plural', () => {
    expect(nameKey('Œufs')).toBe(nameKey('oeuf'));
    expect(nameKey('Pommes de terre')).toBe(nameKey('pomme de terre'));
    expect(nameKey('farine')).not.toBe(nameKey('farine T55'));
  });

  test('a free item is its own line, never joined by an ingredient', () => {
    let state = addItem(EMPTY_LIST, ' farine ', { line: newId(), entry: newId() });
    state = add(state, CREPES, 'Crêpes', crepes);
    expect(texts(state).slice(0, 2)).toEqual(['Farine', 'Farine (250 g)']);
    expect(addItem(state, '   ', { line: newId(), entry: newId() })).toBe(state);
  });

  test('checked lines go to the basket; more of an ingredient unchecks its line', () => {
    let state = both();
    const farine = shoppingLines(state).toBuy[0]!;
    state = setChecked(state, farine.id, true);
    expect(shoppingLines(state).inBasket.map((line) => line.id)).toEqual([farine.id]);
    expect(remainingCount(state)).toBe(4);
    state = add(state, COOKIES, 'Cookies', cookies);
    expect(shoppingLines(state).toBuy[0]?.id).toBe(farine.id);
  });
});

describe('changes', () => {
  test('adding a recipe again replaces its ingredients, in their lines', () => {
    const state = add(both(), CREPES, 'Crêpes', crepes, 8);
    expect(texts(state).slice(0, 2)).toEqual([
      'Farine (200 g · 500 g = 700 g)',
      'Œufs (2 · 6 = 8)',
    ]);
    expect(state.recipes.map((recipe) => [recipe.title, recipe.servings])).toEqual([
      ['Gâteau', 6],
      ['Crêpes', 8],
    ]);
  });

  test('removing a recipe removes its ingredients and the lines left empty', () => {
    const state = removeRecipe(both(), CREPES);
    expect(texts(state)).toEqual(['Farine (200 g)', 'Œufs (2)', 'Sel', 'Sucre (2-3 c. à soupe)']);
    expect(state.recipes.map((recipe) => recipe.title)).toEqual(['Gâteau']);
  });

  test('clearing the basket drops the recipes nothing is left of', () => {
    let state = add(EMPTY_LIST, COOKIES, 'Cookies', cookies);
    for (const line of shoppingLines(state).toBuy) state = setChecked(state, line.id, true);
    state = clearChecked(state);
    expect(state).toEqual(EMPTY_LIST);
  });

  test('moving a line before or after another', () => {
    const state = both();
    const [farine, oeufs, lait] = shoppingLines(state).toBuy;
    const moved = moveLine(state, lait!.id, farine!.id, 'before');
    expect(
      shoppingLines(moved)
        .toBuy.slice(0, 3)
        .map((line) => line.id),
    ).toEqual([lait!.id, farine!.id, oeufs!.id]);
    const back = moveLine(moved, lait!.id, oeufs!.id, 'after');
    expect(back.lines.map((line) => line.id)).toEqual(state.lines.map((line) => line.id));
    expect(moveLine(state, farine!.id, farine!.id, 'after')).toBe(state);
  });

  test('a checked line keeps its place when unchecked', () => {
    let state = both();
    const oeufs = shoppingLines(state).toBuy[1]!;
    state = setChecked(state, oeufs.id, true);
    state = setChecked(state, oeufs.id, false);
    expect(shoppingLines(state).toBuy[1]?.id).toBe(oeufs.id);
  });

  test('grouping lines: one line where the first was, and the names stay grouped', () => {
    let state = add(EMPTY_LIST, COOKIES, 'Cookies', cookies);
    const [t55, farine] = shoppingLines(state).toBuy;
    expect(groupName(state, [t55!.id, farine!.id])).toBe('farine');
    state = groupLines(state, [t55!.id, farine!.id], 'farine');
    expect(texts(state)).toEqual(['Farine (1 tasse · 1 tasse = 2 tasse)']);
    // A recipe added later with `farine T55` joins it.
    state = add(state, CREPES, 'Crêpes', doc(4, '- 100 g de farine T55'));
    expect(texts(state)).toEqual(['Farine (1 tasse · 1 tasse · 100 g)']);
    expect(shoppingStateSchema.safeParse(state).success).toBe(true);
  });

  test('splitting a line: one line per ingredient, where it was', () => {
    let state = add(both(), COOKIES, 'Cookies', cookies);
    const farine = shoppingLines(state).toBuy[0]!;
    state = splitLine(state, farine.id, newId);
    expect(texts(state).slice(0, 3)).toEqual([
      'Farine (250 g)',
      'Farine (200 g)',
      'Farine (1 tasse)',
    ]);
    expect(shoppingLines(state).toBuy[0]?.id).toBe(farine.id);
    expect(shoppingStateSchema.safeParse(state).success).toBe(true);
  });

  test('every state built is accepted by the API schema', () => {
    let state = addItem(both(), 'papier toilette', { line: newId(), entry: newId() });
    const ids = shoppingLines(state).toBuy.map((line) => line.id);
    state = groupLines(state, [ids[0]!, ids.at(-1)!], 'Farine et papier');
    expect(shoppingStateSchema.safeParse(state).success).toBe(true);
    expect(shoppingStateSchema.safeParse(clearChecked(state)).success).toBe(true);
  });

  test('the list has room limits', () => {
    expect(canAdd(EMPTY_LIST, 300)).toBe(true);
    expect(canAdd(EMPTY_LIST, 301)).toBe(false);
    const state = both();
    // Replacing a recipe frees its own ingredients first.
    expect(canAdd(state, 300 - 4, GATEAU)).toBe(true);
    expect(canAdd(state, 300 - 4)).toBe(false);
  });
});
