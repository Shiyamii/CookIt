import { describe, expect, test } from 'bun:test';
import type { RecipeDocument } from './model';
import { parseRecipe } from './parse';
import { checkTranslationStructure } from './translation';

function parseOk(markdown: string): RecipeDocument {
  const result = parseRecipe(markdown);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.document;
}

const recipe = (servings: number, ingredients: string, steps: string) =>
  parseOk(`# T\n\nportions: ${servings}\n\n---\n\n${ingredients}\n\n---\n\n${steps}\n`);

const base = recipe(
  4,
  '### Pâte\n- 250 g farine\n- 2 œufs\n\n### Garniture\n- sucre',
  '1. Mélanger.\n2. Reposer [1 h](timer:1h).\n3. Cuire [1 min](timer:1m) puis [30 s](timer:30s).',
);

describe('checkTranslationStructure', () => {
  test('accepts a translation with the same structure and other texts', () => {
    const english = recipe(
      4,
      '### Batter\n- 250 g flour\n- 2 eggs\n\nNote: any flour works.\n\n### Topping\n- sugar',
      '1. Mix.\n2. Rest [1 hour](timer:1h "rest").\n3. Cook [1 min](timer:1m) then [30 s](timer:30s).',
    );
    expect(checkTranslationStructure(base, english)).toEqual([]);
  });

  test('reports servings, group and item count differences', () => {
    const other = recipe(2, '### Batter\n- flour', '1. Mix.\n2. Rest [1 h](timer:1h).');
    expect(checkTranslationStructure(base, other)).toEqual([
      { code: 'translation_servings', severity: 'warning', params: { expected: 4, found: 2 } },
      {
        code: 'translation_group_count',
        severity: 'warning',
        params: { part: 'ingredients', expected: 2, found: 1 },
      },
      {
        code: 'translation_item_count',
        severity: 'warning',
        params: { part: 'steps', group: 1, expected: 3, found: 2 },
      },
    ]);
  });

  test('reports a step whose timer durations differ', () => {
    const other = recipe(
      4,
      '### Batter\n- flour\n- eggs\n\n### Topping\n- sugar',
      '1. Mix.\n2. Rest [1 h](timer:1h).\n3. Cook [2 min](timer:2m).',
    );
    expect(checkTranslationStructure(base, other)).toEqual([
      {
        code: 'translation_timers',
        severity: 'warning',
        params: { step: 3, expected: '60, 30', found: '120' },
      },
    ]);
  });
});

describe('checkTranslationStructure edge cases', () => {
  const ingredients = '### Batter\n- flour\n- eggs\n\n### Topping\n- sugar';

  test('text items are ignored, even with a timer in them', () => {
    const english = recipe(
      4,
      '### Batter\nTip: weigh everything.\n\n- flour\n- eggs\n\n### Topping\n- sugar',
      '1. Mix.\n2. Rest [1 h](timer:1h).\n\nNote: or [2 h](timer:2h).\n\n3. Cook [1 min](timer:1m) then [30 s](timer:30s).',
    );
    expect(english.stepGroups[0]?.items.some((item) => item.kind === 'text')).toBe(true);
    expect(checkTranslationStructure(base, english)).toEqual([]);
  });

  test('a different number of step groups is reported; timers are still compared', () => {
    const english = recipe(
      4,
      ingredients,
      '### Prep\n1. Mix.\n2. Rest [1 h](timer:1h).\n\n### Cook\n3. Cook [1 min](timer:1m) then [30 s](timer:30s).',
    );
    expect(checkTranslationStructure(base, english)).toEqual([
      {
        code: 'translation_group_count',
        severity: 'warning',
        params: { part: 'steps', expected: 1, found: 2 },
      },
    ]);
  });

  test('a missing last step is an item count difference, not a timer one', () => {
    const english = recipe(4, ingredients, '1. Mix.\n2. Rest [1 h](timer:1h).');
    expect(checkTranslationStructure(base, english)).toEqual([
      {
        code: 'translation_item_count',
        severity: 'warning',
        params: { part: 'steps', group: 1, expected: 3, found: 2 },
      },
    ]);
  });

  test('an extra step is reported', () => {
    const english = recipe(
      4,
      ingredients,
      '1. Mix.\n2. Rest [1 h](timer:1h).\n3. Cook [1 min](timer:1m) then [30 s](timer:30s).\n4. Serve.',
    );
    expect(checkTranslationStructure(base, english)).toEqual([
      {
        code: 'translation_item_count',
        severity: 'warning',
        params: { part: 'steps', group: 1, expected: 3, found: 4 },
      },
    ]);
  });

  test('the same total of ingredients split differently across groups is reported per group', () => {
    const english = recipe(
      4,
      '### Batter\n- flour\n\n### Topping\n- eggs\n- sugar',
      '1. Mix.\n2. Rest [1 h](timer:1h).\n3. Cook [1 min](timer:1m) then [30 s](timer:30s).',
    );
    expect(checkTranslationStructure(base, english)).toEqual([
      {
        code: 'translation_item_count',
        severity: 'warning',
        params: { part: 'ingredients', group: 1, expected: 2, found: 1 },
      },
      {
        code: 'translation_item_count',
        severity: 'warning',
        params: { part: 'ingredients', group: 2, expected: 1, found: 2 },
      },
    ]);
  });

  test('timers in a different order are reported', () => {
    const english = recipe(
      4,
      ingredients,
      '1. Mix.\n2. Rest [1 h](timer:1h).\n3. Cook [30 s](timer:30s) then [1 min](timer:1m).',
    );
    expect(checkTranslationStructure(base, english)).toEqual([
      {
        code: 'translation_timers',
        severity: 'warning',
        params: { step: 3, expected: '60, 30', found: '30, 60' },
      },
    ]);
  });

  test('the same duration written differently is the same timer', () => {
    const english = recipe(
      4,
      ingredients,
      '1. Mix.\n2. Rest [60 min](timer:60m).\n3. Cook [60 s](timer:60s) then [30 s](timer:30s).',
    );
    expect(checkTranslationStructure(base, english)).toEqual([]);
  });

  test('a recipe compared with itself has no diagnostic', () => {
    expect(checkTranslationStructure(base, base)).toEqual([]);
  });
});
