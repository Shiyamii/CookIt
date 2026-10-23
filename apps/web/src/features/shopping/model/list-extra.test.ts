import { describe, expect, test } from 'bun:test';
import {
  MAX_LINE_KEYS,
  MAX_SHOPPING_ENTRIES,
  MAX_SHOPPING_KEYS,
  MAX_SHOPPING_RECIPES,
  MAX_SHOPPING_TEXT_LENGTH,
  parseRecipe,
  shoppingStateSchema,
  type RecipeDocument,
  type ShoppingEntry,
  type ShoppingLine,
  type ShoppingQuantity,
  type ShoppingRecipe,
  type ShoppingState,
} from '@cookit/shared';
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

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const RECIPE_A = uuid(9001);
const RECIPE_B = uuid(9002);

let counter = 100;
const newId = () => uuid(++counter);

const qty = (value: number, over: Partial<ShoppingQuantity> = {}): ShoppingQuantity => ({
  value,
  unit: 'g',
  unitText: 'g',
  rounding: 'decimal',
  ...over,
});

function entry(
  name: string,
  quantity: ShoppingQuantity | null = null,
  recipeId: string | null = RECIPE_A,
): ShoppingEntry {
  return { id: newId(), recipeId, name, quantity };
}

function line(
  name: string,
  entries: ShoppingEntry[] = [entry(name)],
  over: Partial<ShoppingLine> = {},
): ShoppingLine {
  return { id: newId(), name, keys: [nameKey(name)], checked: false, entries, ...over };
}

const recipeA: ShoppingRecipe = { recipeId: RECIPE_A, title: 'A', servings: 2, lang: 'fr' };
const recipeB: ShoppingRecipe = { recipeId: RECIPE_B, title: 'B', servings: 2, lang: 'en' };

const stateOf = (
  lines: ShoppingLine[],
  recipes: ShoppingRecipe[] = [recipeA, recipeB],
): ShoppingState => ({
  recipes,
  lines,
});
const names = (state: ShoppingState) => state.lines.map((l) => l.name);
const valid = (state: ShoppingState) => shoppingStateSchema.safeParse(state).success;

function doc(ingredients: string, servings = 2): RecipeDocument {
  const result = parseRecipe(
    `# R\n\nportions: ${servings}\n\n---\n\n${ingredients}\n\n---\n\n1. Mélanger.\n`,
  );
  if (!result.ok) throw new Error('unparsable');
  return result.document;
}

function firstIngredient(document: RecipeDocument) {
  const item = document.ingredientGroups[0]!.items[0]!;
  if (item.kind !== 'ingredient') throw new Error('not an ingredient');
  return item;
}

const keysOf = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('groupLines edge cases', () => {
  test('too many keys on one line: only the keys of the ingredients it holds are kept', () => {
    const a = line('farine', [entry('farine')], { keys: keysOf('a', 15) });
    const b = line('farine t55', [entry('farine T55')], { keys: keysOf('b', 15) });
    const grouped = groupLines(stateOf([a, b]), [a.id, b.id], 'farine');
    expect(grouped.lines).toHaveLength(1);
    expect(grouped.lines[0]!.keys).toEqual(['farine', 'farine t55']);
    expect(valid(grouped)).toBe(true);
  });

  test('keys within the per-line cap are all kept, without duplicates', () => {
    const a = line('farine', [entry('farine')], { keys: ['farine', 'flour'] });
    const b = line('farine t55', [entry('farine T55')], { keys: ['farine t55', 'farine'] });
    const grouped = groupLines(stateOf([a, b]), [a.id, b.id], 'farine');
    expect(grouped.lines[0]!.keys).toEqual(['farine', 'flour', 'farine t55']);
  });

  const others = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      line(`autre${i}`, [entry(`autre${i}`)], { keys: keysOf(`k${i}-`, MAX_LINE_KEYS) }),
    );

  test('too many keys over the whole list: falls back to the own keys of the ingredients', () => {
    const a = line('farine', [entry('farine')], { keys: keysOf('a', 10) });
    const b = line('semoule', [entry('semoule')], { keys: keysOf('b', 10) });
    const extra = line('x', [entry('x')], { keys: ['solo'] });
    const lines = [...others(29), extra, a, b];
    expect(lines.reduce((n, l) => n + l.keys.length, 0)).toBe(MAX_SHOPPING_KEYS + 1);
    const grouped = groupLines(stateOf(lines), [a.id, b.id], 'farine');
    expect(grouped.lines.at(-1)!.keys).toEqual(['farine', 'semoule']);
  });

  test('exactly at the overall cap keeps every key', () => {
    const a = line('farine', [entry('farine')], { keys: ['farine', ...keysOf('a', 9)] });
    const b = line('semoule', [entry('semoule')], { keys: ['semoule', ...keysOf('b', 9)] });
    const grouped = groupLines(stateOf([...others(29), a, b]), [a.id, b.id], 'farine');
    expect(grouped.lines.at(-1)!.keys).toHaveLength(20);
  });

  test('a checked line and an unchecked one give an unchecked group', () => {
    const a = line('farine', undefined, { checked: true });
    const b = line('sucre');
    expect(groupLines(stateOf([a, b]), [a.id, b.id], 'x').lines[0]!.checked).toBe(false);
  });

  test('two checked lines give a checked group', () => {
    const a = line('farine', undefined, { checked: true });
    const b = line('sucre', undefined, { checked: true });
    expect(groupLines(stateOf([a, b]), [a.id, b.id], 'x').lines[0]!.checked).toBe(true);
  });

  test('grouping a free item adds no key for it and keeps its entry', () => {
    const free = line('papier', [entry('papier', null, null)], { keys: [] });
    const flour = line('farine');
    const grouped = groupLines(stateOf([free, flour]), [free.id, flour.id], 'courses');
    expect(grouped.lines).toHaveLength(1);
    expect(grouped.lines[0]!.keys).toEqual(['farine']);
    expect(grouped.lines[0]!.entries.map((e) => e.recipeId)).toEqual([null, RECIPE_A]);
    expect(valid(grouped)).toBe(true);
  });

  test('the group name is trimmed', () => {
    const a = line('farine');
    const b = line('sucre');
    expect(groupLines(stateOf([a, b]), [a.id, b.id], '  Base  ').lines[0]!.name).toBe('Base');
  });

  test.each(['', '   ', '\u0007\u0007'])('an empty name %j falls back to the first line', (n) => {
    const a = line('farine');
    const b = line('sucre');
    expect(groupLines(stateOf([a, b]), [a.id, b.id], n).lines[0]!.name).toBe('farine');
  });

  test('the group takes the place and id of the first line in the list, not in the ids', () => {
    const a = line('a');
    const b = line('b');
    const c = line('c');
    const d = line('d');
    const grouped = groupLines(stateOf([a, b, c, d]), [d.id, b.id], 'bd');
    expect(names(grouped)).toEqual(['a', 'bd', 'c']);
    expect(grouped.lines[1]!.id).toBe(b.id);
    expect(grouped.lines[1]!.entries.map((e) => e.name)).toEqual(['b', 'd']);
  });

  test('fewer than two known lines changes nothing', () => {
    const a = line('a');
    const state = stateOf([a, line('b')]);
    expect(groupLines(state, [a.id], 'x')).toBe(state);
    expect(groupLines(state, [a.id, uuid(1)], 'x')).toBe(state);
    expect(groupLines(state, [], 'x')).toBe(state);
  });

  test('a long name is cut to the text limit', () => {
    const a = line('a');
    const b = line('b');
    const grouped = groupLines(stateOf([a, b]), [a.id, b.id], 'é'.repeat(500));
    expect(grouped.lines[0]!.name).toHaveLength(MAX_SHOPPING_TEXT_LENGTH);
    expect(valid(grouped)).toBe(true);
  });
});

describe('groupName', () => {
  test('is the shortest name', () => {
    const a = line('farine T55');
    const b = line('farine');
    expect(groupName(stateOf([a, b]), [a.id, b.id])).toBe('farine');
  });

  test('is empty without known line', () => {
    expect(groupName(stateOf([line('a')]), [uuid(1)])).toBe('');
  });
});

describe('splitLine edge cases', () => {
  test('free entries get no key, recipe ones get theirs', () => {
    const grouped = line('courses', [entry('papier', null, null), entry('Œufs')], {
      keys: ['oeuf'],
    });
    const split = splitLine(stateOf([grouped]), grouped.id, newId);
    expect(split.lines.map((l) => l.keys)).toEqual([[], ['oeuf']]);
    expect(valid(split)).toBe(true);
  });

  test('keeps the checked state on every part and the first id, in place', () => {
    const before = line('x');
    const grouped = line('g', [entry('farine'), entry('sucre'), entry('sel')], { checked: true });
    const after = line('y');
    const split = splitLine(stateOf([before, grouped, after]), grouped.id, newId);
    expect(names(split)).toEqual(['x', 'farine', 'sucre', 'sel', 'y']);
    expect(split.lines[1]!.id).toBe(grouped.id);
    expect(split.lines.slice(1, 4).every((l) => l.checked)).toBe(true);
    expect(new Set(split.lines.map((l) => l.id)).size).toBe(5);
  });

  test('a single-entry line or an unknown id is left as it is', () => {
    const single = line('a');
    const state = stateOf([single]);
    expect(splitLine(state, single.id, newId).lines).toEqual(state.lines);
    expect(splitLine(state, uuid(1), newId).lines).toEqual(state.lines);
  });
});

describe('moveLine edge cases', () => {
  const a = line('a');
  const b = line('b');
  const c = line('c');
  const state = stateOf([a, b, c]);

  test('unknown ids change nothing', () => {
    expect(moveLine(state, uuid(1), a.id, 'before')).toBe(state);
    expect(moveLine(state, a.id, uuid(1), 'after')).toBe(state);
  });

  test('onto itself changes nothing', () => {
    expect(moveLine(state, a.id, a.id, 'after')).toBe(state);
  });

  test('before the first and after the last', () => {
    expect(names(moveLine(state, c.id, a.id, 'before'))).toEqual(['c', 'a', 'b']);
    expect(names(moveLine(state, a.id, c.id, 'after'))).toEqual(['b', 'c', 'a']);
  });

  test('after the previous or before the next keeps the order', () => {
    expect(names(moveLine(state, b.id, a.id, 'after'))).toEqual(['a', 'b', 'c']);
    expect(names(moveLine(state, b.id, c.id, 'before'))).toEqual(['a', 'b', 'c']);
  });

  test('keeps every line once', () => {
    const moved = moveLine(state, a.id, b.id, 'after');
    expect(names(moved)).toEqual(['b', 'a', 'c']);
    expect(valid(moved)).toBe(true);
  });
});

describe('quantities text', () => {
  const view = (lines: ShoppingLine[], recipes: ShoppingRecipe[] = [recipeA, recipeB]) =>
    shoppingLines(stateOf(lines, recipes)).toBuy[0]!;

  test('a range is shown with both bounds, a degenerate one as a single value', () => {
    const l = line('sucre', [
      entry('sucre', qty(2, { max: 3, unit: 'cas', unitText: 'c. à soupe' })),
    ]);
    expect(view([l]).quantities).toBe('2-3 c. à soupe');
    const same = line('sucre', [entry('sucre', qty(2, { max: 2 }))]);
    expect(view([same]).quantities).toBe('2 g');
  });

  test('ranges are added bound by bound in the total', () => {
    const l = line('sucre', [
      entry('sucre', qty(1, { max: 2 })),
      entry('sucre', qty(3, { max: 4 }), RECIPE_B),
    ]);
    expect(view([l]).quantities).toBe('1-2 g · 3-4 g = 4-6 g');
  });

  test('a total mixes a range with a plain amount', () => {
    const l = line('sucre', [entry('sucre', qty(1, { max: 2 })), entry('sucre', qty(3), RECIPE_B)]);
    expect(view([l]).quantities).toBe('1-2 g · 3 g = 4-5 g');
  });

  test('with and without quantity mixed: no total, only the amounts', () => {
    const l = line('sel', [entry('sel', qty(2)), entry('sel', null)]);
    expect(view([l]).quantities).toBe('2 g');
  });

  test('without any quantity the text is empty', () => {
    expect(view([line('sel', [entry('sel'), entry('sel')])]).quantities).toBe('');
  });

  test('different units: no total', () => {
    const l = line('farine', [
      entry('farine', qty(250)),
      entry('farine', qty(1, { unit: 'tasse', unitText: 'tasse', rounding: 'fraction' })),
    ]);
    expect(view([l]).quantities).toBe('250 g · 1 tasse');
  });

  test('a single entry has no total', () => {
    expect(view([line('a', [entry('a', qty(5))])]).quantities).toBe('5 g');
  });

  test('empty unitText shows the bare amount and a total', () => {
    const none = { unit: null, unitText: '', rounding: 'fraction' as const };
    const l = line('oeufs', [entry('oeufs', qty(3, none)), entry('oeufs', qty(2, none))]);
    expect(view([l]).quantities).toBe('3 · 2 = 5');
  });

  test('the decimal separator follows the recipe language', () => {
    const half = qty(1.5, { unit: 'kg', unitText: 'kg' });
    const hu = { ...recipeB, lang: 'hu' as const };
    expect(view([line('liszt', [entry('liszt', half, RECIPE_B)])], [recipeA, hu]).quantities).toBe(
      '1,5 kg',
    );
    expect(view([line('flour', [entry('flour', half, RECIPE_B)])]).quantities).toBe('1.5 kg');
    expect(view([line('farine', [entry('farine', half, RECIPE_A)])]).quantities).toBe('1,5 kg');
  });

  test('a free entry falls back to french', () => {
    expect(view([line('x', [entry('x', qty(1.5), null)])]).quantities).toBe('1,5 g');
  });

  test('titles are unique and the name is capitalized', () => {
    const l = line('farine', [entry('farine'), entry('farine'), entry('farine', null, RECIPE_B)]);
    const v = view([l]);
    expect(v.recipes).toEqual(['A', 'B']);
    expect(v.name).toBe('Farine');
    expect(v.merged).toBe(true);
  });
});

describe('recipeCandidates edge cases', () => {
  test('control characters in the name are cleaned', () => {
    const d = doc('- 2 g sel');
    const item = firstIngredient(d);
    item.name = 'sel‮fin';
    item.raw = '2 g sel‮fin';
    const [candidate] = recipeCandidates(d, 2, 'fr');
    expect(candidate!.name).toBe('se l fin');
    expect(candidate!.text).toBe('2 g se l fin');
    expect(valid(addRecipe(EMPTY_LIST, recipeA, [candidate!], newId))).toBe(true);
  });

  test('a long name is cut without splitting an emoji', () => {
    const d = doc('- sel');
    const item = firstIngredient(d);
    item.name = 'a'.repeat(MAX_SHOPPING_TEXT_LENGTH - 1) + '\u{1F600}';
    item.raw = item.name;
    const [candidate] = recipeCandidates(d, 2, 'fr');
    expect(candidate!.name).toBe('a'.repeat(MAX_SHOPPING_TEXT_LENGTH - 1));
    expect(valid(addRecipe(EMPTY_LIST, recipeA, [candidate!], newId))).toBe(true);
  });

  test('an emoji that fits is kept whole', () => {
    const d = doc('- sel');
    const item = firstIngredient(d);
    item.name = 'piment \u{1F336}';
    item.raw = item.name;
    expect(recipeCandidates(d, 2, 'fr')[0]!.name).toBe('piment \u{1F336}');
  });

  test('an amount of exactly the limit is kept, above it the quantity is dropped', () => {
    // The parser itself reads amounts below 1 000 000 only.
    expect(recipeCandidates(doc('- 999999 g farine'), 2, 'fr')[0]!.quantity).not.toBeNull();
    expect(recipeCandidates(doc('- 500000 g farine'), 4, 'fr')[0]!.quantity?.value).toBe(1_000_000);
    expect(recipeCandidates(doc('- 500001 g farine'), 4, 'fr')[0]!.quantity).toBeNull();
    expect(recipeCandidates(doc('- 1000001 g farine'), 2, 'fr')[0]!.quantity).toBeNull();
  });

  test('scaling can push an amount over the limit', () => {
    expect(recipeCandidates(doc('- 600000 g farine'), 4, 'fr')[0]!.quantity).toBeNull();
  });

  test('the upper bound of a range counts for the limit', () => {
    const [c] = recipeCandidates(doc('- 1-2000000 g farine'), 2, 'fr');
    expect(c!.quantity).toBeNull();
    expect(c!.name).toBe(c!.text);
  });

  test('candidates, huge or not, build a valid state', () => {
    const d = doc('- 1000001 g farine\n- 2-3 c. à soupe de sucre\n- sel\n- 3 œufs');
    const chosen = recipeCandidates(d, 5, 'fr');
    expect(valid(addRecipe(EMPTY_LIST, recipeA, chosen, newId))).toBe(true);
  });
});

describe('canAdd edge cases', () => {
  const full = (): ShoppingState => ({
    recipes: [recipeA],
    lines: Array.from({ length: MAX_SHOPPING_ENTRIES }, (_, i) =>
      line(`item${i}`, [entry(`item${i}`)]),
    ),
  });

  test('fits exactly up to the entry limit', () => {
    const state = stateOf([line('a')]);
    expect(canAdd(state, MAX_SHOPPING_ENTRIES - 1)).toBe(true);
    expect(canAdd(state, MAX_SHOPPING_ENTRIES)).toBe(false);
  });

  test('a full list refuses one more but accepts adding nothing', () => {
    expect(canAdd(full(), 1)).toBe(false);
    expect(canAdd(full(), 0)).toBe(true);
  });

  test('re-adding a recipe frees the places of its own entries', () => {
    const state = full();
    expect(canAdd(state, 1, RECIPE_A)).toBe(true);
    expect(canAdd(state, MAX_SHOPPING_ENTRIES, RECIPE_A)).toBe(true);
    expect(canAdd(state, MAX_SHOPPING_ENTRIES + 1, RECIPE_A)).toBe(false);
  });

  test('the recipe limit applies to a new recipe only', () => {
    const recipes = Array.from({ length: MAX_SHOPPING_RECIPES }, (_, i) => ({
      ...recipeA,
      recipeId: uuid(7000 + i),
    }));
    const state: ShoppingState = { recipes, lines: [] };
    expect(canAdd(state, 1, uuid(8000))).toBe(false);
    expect(canAdd(state, 1, uuid(7000))).toBe(true);
    expect(canAdd(state, 1)).toBe(true);
  });
});

describe('remainingCount and small operations', () => {
  test('remainingCount handles null, empty and checked', () => {
    expect(remainingCount(null)).toBe(0);
    expect(remainingCount(EMPTY_LIST)).toBe(0);
    expect(remainingCount(stateOf([line('a'), line('b', undefined, { checked: true })]))).toBe(1);
  });

  test('addItem: trimmed, empty ignored, full list ignored', () => {
    const ids = { line: uuid(1), entry: uuid(2) };
    expect(addItem(EMPTY_LIST, '   ', ids)).toBe(EMPTY_LIST);
    expect(addItem(EMPTY_LIST, '\u0007', ids)).toBe(EMPTY_LIST);
    const one = addItem(EMPTY_LIST, '  pain  ', ids);
    expect(one.lines[0]!.name).toBe('pain');
    expect(one.lines[0]!.keys).toEqual([]);
    const full: ShoppingState = {
      recipes: [recipeA],
      lines: Array.from({ length: MAX_SHOPPING_ENTRIES }, (_, i) => line(`i${i}`)),
    };
    expect(addItem(full, 'x', ids)).toBe(full);
  });

  test('setChecked on an unknown id changes no line', () => {
    const state = stateOf([line('a')]);
    expect(setChecked(state, uuid(1), true).lines).toEqual(state.lines);
  });

  test('an ingredient whose name has no letters gets a line without key', () => {
    const state = addRecipe(
      EMPTY_LIST,
      recipeA,
      [{ text: '!!!', name: '!!!', quantity: null }],
      newId,
    );
    expect(state.lines[0]!.keys).toEqual([]);
    expect(valid(state)).toBe(true);
  });

  test('two ingredients without key do not join the same line', () => {
    const state = addRecipe(
      EMPTY_LIST,
      recipeA,
      [
        { text: '!!!', name: '!!!', quantity: null },
        { text: '???', name: '???', quantity: null },
      ],
      newId,
    );
    expect(state.lines).toHaveLength(2);
  });

  test('adding an empty selection leaves the recipe out', () => {
    expect(addRecipe(EMPTY_LIST, recipeA, [], newId)).toEqual(EMPTY_LIST);
  });
});

describe('every operation gives a state the API schema accepts', () => {
  test('a full sequence of operations', () => {
    const check = (state: ShoppingState) => {
      expect(shoppingStateSchema.safeParse(state).success).toBe(true);
      return state;
    };
    const d1 = doc(
      '- 250 g de farine\n- 3 œufs\n- 1/2 c. à café de sel\n- 2-3 c. à soupe de sucre',
    );
    const d2 = doc('- 1 tasse de farine\n- 2 oeufs\n- sel\n- 99999999 g de truc');
    let state = check(addRecipe(EMPTY_LIST, recipeA, recipeCandidates(d1, 2, 'fr'), newId));
    state = check(addRecipe(state, recipeB, recipeCandidates(d2, 6, 'en'), newId));
    state = check(addItem(state, 'papier toilette', { line: newId(), entry: newId() }));
    state = check(setChecked(state, state.lines[0]!.id, true));
    const ids = state.lines.slice(0, 3).map((l) => l.id);
    state = check(groupLines(state, ids, groupName(state, ids)));
    state = check(moveLine(state, state.lines[0]!.id, state.lines.at(-1)!.id, 'after'));
    state = check(splitLine(state, state.lines.find((l) => l.entries.length > 1)!.id, newId));
    state = check(addRecipe(state, recipeA, recipeCandidates(d1, 4, 'fr'), newId));
    state = check(removeRecipe(state, RECIPE_B));
    state = check(clearChecked(state));
    state = check(removeRecipe(state, RECIPE_A));
    expect(state.recipes).toEqual([]);
    expect(state.lines.every((l) => l.entries.every((e) => e.recipeId === null))).toBe(true);
  });
});
