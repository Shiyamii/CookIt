import { describe, expect, test } from 'bun:test';
import { parseRecipe } from './parse';

const recipe = [
  '# Pâtes carbonara', // 1
  '', // 2
  '> La vraie.', // 3
  '', // 4
  'portions: 4', // 5
  '', // 6
  '---', // 7
  '', // 8
  '## Ingrédients', // 9
  '', // 10
  '- 1 pincée de sel', // 11
  '', // 12
  '### Pour les pâtes', // 13
  '', // 14
  '- 400 g spaghetti', // 15
  '  bien secs', // 16
  'Un paragraphe', // 17 (continuation of line 15)
  '', // 18
  'Note libre', // 19
  '', // 20
  '### Sauce', // 21
  '* 4 œufs', // 22
  '', // 23
  '---', // 24
  '', // 25
  '### Les pâtes', // 26
  '', // 27
  '1. Porter à ébullition.', // 28
  '2. Cuire.', // 29
  '', // 30
  '```', // 31
  '3. pas une étape', // 32
  '```', // 33
  '', // 34
  '### La sauce', // 35
  '1) Battre les œufs.', // 36
  '', // 37
].join('\n');

function okDocument(markdown: string) {
  const result = parseRecipe(markdown);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}

describe('parseRecipe: source lines', () => {
  test('every ingredient, text and step carries its line in the whole document', () => {
    const { document, diagnostics } = okDocument(recipe);
    expect(diagnostics).toEqual([]);
    expect(
      document.ingredientGroups.map((group) => [
        group.name,
        group.items.map((item) => [item.kind, item.line, item.raw]),
      ]),
    ).toEqual([
      [undefined, [['ingredient', 11, '1 pincée de sel']]],
      [
        'Pour les pâtes',
        [
          ['ingredient', 15, '400 g spaghetti\nbien secs\nUn paragraphe'],
          ['text', 19, 'Note libre'],
        ],
      ],
      ['Sauce', [['ingredient', 22, '4 œufs']]],
    ]);
    expect(
      document.stepGroups.map((group) => [
        group.name,
        group.items.map((item) => [item.kind, item.line, item.kind === 'step' ? item.index : -1]),
      ]),
    ).toEqual([
      [
        'Les pâtes',
        [
          ['step', 28, 0],
          ['step', 29, 1],
          ['text', 31, -1],
          ['text', 32, -1],
          ['text', 33, -1],
        ],
      ],
      ['La sauce', [['step', 36, 2]]],
    ]);
  });

  test('empty group warnings point to their line in the whole document', () => {
    const result = parseRecipe(
      ['# T', '', 'portions: 2', '', '---', '', '### Vide', '', '---', '', '### Aussi'].join('\n'),
    );
    expect(result.diagnostics).toEqual([
      { code: 'empty_group', severity: 'warning', line: 7, params: { name: 'Vide' } },
      { code: 'empty_ingredients', severity: 'warning' },
      { code: 'empty_group', severity: 'warning', line: 11, params: { name: 'Aussi' } },
      { code: 'empty_steps', severity: 'warning' },
    ]);
  });
});

describe('parseRecipe: line endings', () => {
  test('a CRLF document parses exactly like the LF one', () => {
    expect(parseRecipe(recipe.replaceAll('\n', '\r\n'))).toEqual(parseRecipe(recipe));
  });

  test('a CR-only document parses exactly like the LF one', () => {
    expect(parseRecipe(recipe.replaceAll('\n', '\r'))).toEqual(parseRecipe(recipe));
  });

  test('a leading BOM does not shift line numbers', () => {
    expect(parseRecipe(String.fromCharCode(0xfeff) + recipe)).toEqual(parseRecipe(recipe));
  });

  test('no carriage return is left in item or group text', () => {
    const json = JSON.stringify(parseRecipe(recipe.replaceAll('\n', '\r\n')));
    expect(json).not.toContain('\\r');
  });
});

describe('parseRecipe: diagnostics', () => {
  test('diagnostics come in order: split, presentation, ingredients, steps', () => {
    const result = parseRecipe(
      [
        'Avant le titre',
        '# T',
        '',
        'portions: 2',
        '',
        '---',
        '',
        '- a',
        '---',
        '',
        '---',
        '',
        '### Vide',
      ].join('\n'),
    );
    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((d) => [d.code, d.line])).toEqual([
      ['ambiguous_separator', 9],
      ['text_before_title', 1],
      ['empty_group', 13],
      ['empty_steps', undefined],
    ]);
  });

  test('a dash line glued to an item is not a separator and continues the item', () => {
    const result = okDocument(
      ['# T', '', 'portions: 2', '', '---', '', '- a', '---', '', '---', '', '1. b'].join('\n'),
    );
    expect(result.document.ingredientGroups[0]?.items[0]?.raw).toBe('a\n---');
  });

  test('a split error returns only the split diagnostics', () => {
    expect(parseRecipe('# T\n\nportions: 2\n\n---\n\n- a\n')).toEqual({
      ok: false,
      diagnostics: [{ code: 'missing_separator', severity: 'error', params: { found: 2 } }],
    });
  });

  test('a presentation error rejects the document even when parts 2 and 3 are fine', () => {
    const result = parseRecipe('# T\n\n---\n\n- a\n\n---\n\n1. b\n');
    expect(result).toEqual({
      ok: false,
      diagnostics: [{ code: 'missing_servings', severity: 'error' }],
    });
  });
});
