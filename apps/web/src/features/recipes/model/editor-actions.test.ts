import { describe, expect, test } from 'bun:test';
import {
  arrayMove,
  editorReducer,
  insertTimer,
  markQuantity,
  stepChips,
  timerSeconds,
  unlinkSegment,
  updateTimer,
} from './editor-actions';
import { emptyRecipe, type EditorGroup, type EditorRecipe } from './editor';

const group = (id: string, raws: string[], name?: string): EditorGroup => ({
  id,
  name,
  rows: raws.map((raw, i) => ({ id: `${id}${i}`, kind: 'item', raw })),
});
const recipeOf = (groups: EditorGroup[]): EditorRecipe => ({
  ...emptyRecipe(),
  ingredientGroups: groups,
});
const raws = (r: EditorRecipe) => r.ingredientGroups.map((g) => g.rows.map((row) => row.raw));

describe('arrayMove', () => {
  test('moves and clamps', () => {
    expect(arrayMove([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(arrayMove([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(arrayMove([1, 2, 3], 0, 99)).toEqual([2, 3, 1]);
    expect(arrayMove([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
  test('does not mutate', () => {
    const a = [1, 2];
    arrayMove(a, 0, 1);
    expect(a).toEqual([1, 2]);
  });
});

describe('shiftRow', () => {
  const base = () => recipeOf([group('a', ['a0', 'a1']), group('b', ['b0', 'b1'])]);
  const shift = (r: EditorRecipe, rowId: string, direction: -1 | 1) =>
    editorReducer(r, { type: 'shiftRow', part: 'ingredients', rowId, direction });

  test('moves inside a group', () => {
    expect(raws(shift(base(), 'a0', 1))).toEqual([
      ['a1', 'a0'],
      ['b0', 'b1'],
    ]);
  });
  test('crosses into the next group at its start when going down', () => {
    expect(raws(shift(base(), 'a1', 1))).toEqual([['a0'], ['a1', 'b0', 'b1']]);
  });
  test('crosses into the previous group at its end when going up', () => {
    expect(raws(shift(base(), 'b0', -1))).toEqual([['a0', 'a1', 'b0'], ['b1']]);
  });
  test('does nothing past the ends or for an unknown row', () => {
    const r = base();
    expect(shift(r, 'a0', -1)).toBe(r);
    expect(shift(r, 'b1', 1)).toBe(r);
    expect(shift(r, 'zz', 1)).toBe(r);
  });
  test('a row can leave a group and empty it', () => {
    const r = recipeOf([group('a', ['a0']), group('b', ['b0'])]);
    expect(raws(shift(r, 'a0', 1))).toEqual([[], ['a0', 'b0']]);
  });
});

describe('shiftGroup / moveGroup', () => {
  const base = () => recipeOf([group('a', ['x']), group('b', ['y']), group('c', ['z'])]);
  const shift = (r: EditorRecipe, groupId: string, direction: -1 | 1) =>
    editorReducer(r, { type: 'shiftGroup', part: 'ingredients', groupId, direction });
  test('shifts a group, stops at the ends', () => {
    const r = base();
    expect(shift(r, 'a', 1).ingredientGroups.map((g) => g.id)).toEqual(['b', 'a', 'c']);
    expect(shift(r, 'a', -1)).toBe(r);
    expect(shift(r, 'c', 1)).toBe(r);
  });
  test('moveGroup to an index', () => {
    const r = editorReducer(base(), {
      type: 'moveGroup',
      part: 'ingredients',
      groupId: 'c',
      toIndex: 0,
    });
    expect(r.ingredientGroups.map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('moveRow', () => {
  const base = () => recipeOf([group('a', ['a0', 'a1']), group('b', ['b0'])]);
  const move = (rowId: string, toGroupId: string, toIndex: number) =>
    editorReducer(base(), { type: 'moveRow', part: 'ingredients', rowId, toGroupId, toIndex });
  test('moves across groups at an index, clamped', () => {
    expect(raws(move('a0', 'b', 99))).toEqual([['a1'], ['b0', 'a0']]);
  });
  test('an unknown row changes nothing', () => {
    expect(raws(move('x', 'b', 0))).toEqual([['a0', 'a1'], ['b0']]);
  });
});

describe('rows, groups and fields', () => {
  test('addRow inserts after a row or at the end', () => {
    const r = recipeOf([group('a', ['a0', 'a1'])]);
    const mid = editorReducer(r, {
      type: 'addRow',
      part: 'ingredients',
      groupId: 'a',
      afterRowId: 'a0',
    });
    expect(raws(mid)[0]).toEqual(['a0', '', 'a1']);
    const end = editorReducer(r, { type: 'addRow', part: 'ingredients', groupId: 'a' });
    expect(raws(end)[0]).toEqual(['a0', 'a1', '']);
  });
  test('setRow and removeRow', () => {
    const r = recipeOf([group('a', ['a0', 'a1'])]);
    const set = editorReducer(r, {
      type: 'setRow',
      part: 'ingredients',
      rowId: 'a1',
      raw: '2 oeufs',
    });
    expect(raws(set)[0]).toEqual(['a0', '2 oeufs']);
    const removed = editorReducer(set, { type: 'removeRow', part: 'ingredients', rowId: 'a0' });
    expect(raws(removed)[0]).toEqual(['2 oeufs']);
  });
  test('removing the last group leaves an empty one to type into', () => {
    const r = editorReducer(recipeOf([group('a', ['x'])]), {
      type: 'removeGroup',
      part: 'ingredients',
      groupId: 'a',
    });
    expect(r.ingredientGroups).toHaveLength(1);
    expect(r.ingredientGroups[0]!.rows.map((row) => row.raw)).toEqual(['']);
  });
  test('addGroup and renameGroup only touch the given part', () => {
    const r = editorReducer(emptyRecipe(), { type: 'addGroup', part: 'steps' });
    expect(r.stepGroups).toHaveLength(2);
    expect(r.ingredientGroups).toHaveLength(1);
    const renamed = editorReducer(r, {
      type: 'renameGroup',
      part: 'steps',
      groupId: r.stepGroups[1]!.id,
      name: 'Sauce',
    });
    expect(renamed.stepGroups[1]!.name).toBe('Sauce');
  });
  test('meta add, set and remove', () => {
    let r = editorReducer(emptyRecipe(), { type: 'addMeta' });
    const id = r.extraMeta[0]!.id;
    r = editorReducer(r, { type: 'setMeta', id, key: 'temps', value: '10 min' });
    expect(r.extraMeta[0]).toMatchObject({ key: 'temps', value: '10 min' });
    r = editorReducer(r, { type: 'removeMeta', id });
    expect(r.extraMeta).toEqual([]);
  });
  test('setField and replace', () => {
    const r = editorReducer(emptyRecipe(), { type: 'setField', field: 'title', value: 'T' });
    expect(r.title).toBe('T');
    const other = emptyRecipe();
    expect(editorReducer(r, { type: 'replace', recipe: other })).toBe(other);
  });
  test('the reducer does not mutate its input', () => {
    const r = recipeOf([group('a', ['a0', 'a1'])]);
    const snapshot = JSON.stringify(r);
    editorReducer(r, { type: 'shiftRow', part: 'ingredients', rowId: 'a0', direction: 1 });
    expect(JSON.stringify(r)).toBe(snapshot);
  });
});

describe('timerSeconds', () => {
  test('converts hours and minutes', () => {
    expect(timerSeconds('1', '30')).toBe(5400);
    expect(timerSeconds('', '10')).toBe(600);
    expect(timerSeconds('2', '')).toBe(7200);
  });
  test('refuses zero, negative, fractional, non numeric and over 7 days', () => {
    const bad: [string, string][] = [
      ['', ''],
      ['0', '0'],
      ['-1', '10'],
      ['1.5', '0'],
      ['a', '1'],
      ['0', '-5'],
      ['169', '0'],
    ];
    for (const [h, m] of bad) expect(timerSeconds(h, m)).toBeUndefined();
    expect(timerSeconds('168', '0')).toBe(168 * 3600);
  });
});

describe('insertTimer', () => {
  test('inserts at the cursor with spaces around and returns the cursor after it', () => {
    const r = insertTimer('Cuire puis servir', 5, 600, 'cuisson');
    expect(r.raw).toBe('Cuire [10 min](timer:10m "cuisson") puis servir');
    expect(r.raw.slice(0, r.cursor).endsWith('"cuisson")')).toBe(true);
  });
  test('no extra space at the start or next to whitespace', () => {
    expect(insertTimer('', 0, 3600, '').raw).toBe('[1 h](timer:1h)');
    expect(insertTimer('Cuire ', 6, 90 * 60, '').raw).toBe('Cuire [1 h 30](timer:1h30m)');
  });
  test('clamps the position', () => {
    expect(insertTimer('a', 99, 600, '').raw).toBe('a [10 min](timer:10m)');
    expect(insertTimer('a', -4, 600, '').raw).toBe('[10 min](timer:10m) a');
  });
  test('a label with quotes survives a parse', () => {
    const { raw } = insertTimer('x', 1, 600, 'le "bon" four');
    const chips = stepChips(raw);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ kind: 'timer', seconds: 600, label: 'le "bon" four' });
  });
});

describe('markQuantity', () => {
  test('wraps the selection', () => {
    expect(markQuantity('Ajouter 2 c. à soupe de sucre', 8, 20)).toBe(
      'Ajouter [2 c. à soupe](q:) de sucre',
    );
  });
  test('refuses an empty selection or one that holds link syntax', () => {
    expect(markQuantity('abc', 1, 1)).toBeUndefined();
    expect(markQuantity('a  b', 1, 3)).toBeUndefined();
    expect(markQuantity('[2 g](q:)', 0, 9)).toBeUndefined();
    expect(markQuantity('a (b) c', 2, 5)).toBeUndefined();
  });
});

describe('chips', () => {
  const step = 'Mélanger [2 c. à soupe](q:) puis cuire [10 min](timer:10m "four").';
  test('lists timers and quantities with their segment index', () => {
    const chips = stepChips(step);
    expect(chips.map((c) => c.kind)).toEqual(['quantity', 'timer']);
    expect(chips[1]).toMatchObject({ seconds: 600, label: 'four' });
  });
  test('plain text has no chips', () => {
    expect(stepChips('Juste du texte.')).toEqual([]);
  });
  test('updateTimer changes duration and label, keeps the rest', () => {
    const chips = stepChips(step);
    expect(updateTimer(step, chips[1]!.segment, 1800, 'longue')).toBe(
      'Mélanger [2 c. à soupe](q:) puis cuire [30 min](timer:30m "longue").',
    );
  });
  test('updateTimer on a non-timer segment leaves the step as it was', () => {
    const chips = stepChips(step);
    expect(updateTimer(step, chips[0]!.segment, 1800, 'x')).toBe(step);
  });
  test('unlinkSegment turns a timer or a quantity back into text', () => {
    const chips = stepChips(step);
    expect(unlinkSegment(step, chips[1]!.segment)).toBe(
      'Mélanger [2 c. à soupe](q:) puis cuire 10 min.',
    );
    expect(unlinkSegment(step, chips[0]!.segment)).toBe(
      'Mélanger 2 c. à soupe puis cuire [10 min](timer:10m "four").',
    );
  });
});
