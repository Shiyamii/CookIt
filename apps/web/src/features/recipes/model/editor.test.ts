import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseRecipe, serializeRecipe, type RecipeDocument } from '@cookit/shared';
import {
  emptyRecipe,
  fromMarkdown,
  ingredientParts,
  joinIngredient,
  newRow,
  toBody,
  toFields,
  toMarkdown,
  type EditorRecipe,
} from './editor';

const fixture = (name: string) =>
  readFileSync(
    new URL(`../../../../../../packages/shared/src/recipe/fixtures/${name}`, import.meta.url),
    'utf8',
  );

function editorOf(markdown: string): EditorRecipe {
  const parsed = fromMarkdown(markdown);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.recipe;
}

/** The canonical document of a markdown text, without tags (never in the editor). */
function canonical(markdown: string): string {
  const result = parseRecipe(markdown);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  const document: RecipeDocument = { ...result.document, tags: [], format: undefined };
  return serializeRecipe(document, { locale: 'fr' });
}

describe('switching between the markdown and the visual editor loses nothing', () => {
  for (const name of ['crepes.md', 'boeuf-bourguignon.md']) {
    test(name, () => {
      const markdown = fixture(name);
      const visual = editorOf(markdown);
      const back = toMarkdown(visual, 'fr');
      expect(back).toBe(canonical(markdown));
      // And again: stable after one more round.
      expect(toMarkdown(editorOf(back), 'fr')).toBe(back);
    });
  }

  test('free text lines, continuation lines and unnamed first groups survive', () => {
    const markdown = [
      '# Test',
      '',
      'portions: 2',
      '',
      '---',
      '',
      '- 2 œufs',
      '    battus',
      '',
      'Une remarque libre.',
      '',
      '### Sauce',
      '',
      '- sel',
      '',
      '---',
      '',
      '1. Mélanger [10 min](timer:10m "Repos").',
      '',
    ].join('\n');
    const visual = editorOf(markdown);
    expect(visual.ingredientGroups[0]?.name).toBeUndefined();
    expect(visual.ingredientGroups[0]?.rows.map((row) => row.kind)).toEqual(['item', 'text']);
    expect(toMarkdown(editorOf(toMarkdown(visual, 'fr')), 'fr')).toBe(toMarkdown(visual, 'fr'));
    expect(toMarkdown(visual, 'fr')).toContain('    battus');
  });
});

describe('toBody', () => {
  test('drops empty rows and gives later unnamed groups an empty heading', () => {
    const recipe = emptyRecipe();
    recipe.ingredientGroups = [
      { id: 'a', name: undefined, rows: [newRow('2 œufs'), newRow('  ')] },
      { id: 'b', name: undefined, rows: [newRow('sel')] },
    ];
    recipe.stepGroups = [{ id: 'c', name: '', rows: [newRow('Cuire.')] }];
    expect(toBody(recipe, 'fr')).toBe('- 2 œufs\n\n###\n\n- sel\n\n---\n\n1. Cuire.');
  });
});

describe('toFields', () => {
  test('requires a title and whole servings from 1 to 1000', () => {
    const recipe = { ...emptyRecipe(), title: ' ', servings: '2.5' };
    expect(toFields(recipe)).toEqual({ ok: false, invalid: ['title', 'servings'] });
    expect(toFields({ ...recipe, title: 'Soupe', servings: '1001' })).toEqual({
      ok: false,
      invalid: ['servings'],
    });
  });

  test('trims fields and drops metadata without key', () => {
    const recipe: EditorRecipe = {
      ...emptyRecipe(),
      title: ' Soupe ',
      servings: ' 4 ',
      source: '  ',
      extraMeta: [
        { id: '1', key: ' temps ', value: ' 10 min ' },
        { id: '2', key: '', value: 'ignored' },
      ],
    };
    expect(toFields(recipe)).toEqual({
      ok: true,
      fields: {
        title: 'Soupe',
        description: '',
        servings: 4,
        source: undefined,
        extraMeta: { temps: '10 min' },
      },
    });
  });
});

describe('ingredient rows', () => {
  test('split into quantity, unit and the rest of the text', () => {
    expect(ingredientParts('250 g de farine')).toEqual({
      quantity: '250',
      unit: 'g',
      rest: 'de farine',
    });
    expect(ingredientParts('2 c. à soupe d’huile')).toMatchObject({ quantity: '2' });
    expect(ingredientParts('sel, poivre')).toEqual({ quantity: '', unit: '', rest: 'sel, poivre' });
  });

  test('join back to the same text', () => {
    for (const raw of ['250 g de farine', '1 ½ cup sugar', 'sel', '3 œufs']) {
      expect(joinIngredient(ingredientParts(raw))).toBe(raw);
    }
  });
});
