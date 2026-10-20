import { describe, expect, test } from 'bun:test';
import { parseIngredients, parseSteps } from './body';
import { parseRecipe } from './parse';

const part = (...lines: string[]) => ({ lines, startLine: 1 });

describe('parseIngredients', () => {
  test('reads groups and items, with source lines', () => {
    const result = parseIngredients(
      part(
        '',
        '### Pour les pâtes',
        '',
        '- 400 g spaghetti',
        '* 1 pincée de sel',
        '',
        '### Sauce',
        '+ 4 œufs',
      ),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.groups).toEqual([
      {
        name: 'Pour les pâtes',
        items: [
          {
            kind: 'ingredient',
            line: 4,
            raw: '400 g spaghetti',
            quantity: { start: 0, end: 3, amount: { value: 400 } },
            unit: { start: 4, end: 5, slug: 'g' },
            name: 'spaghetti',
          },
          {
            kind: 'ingredient',
            line: 5,
            raw: '1 pincée de sel',
            quantity: { start: 0, end: 1, amount: { value: 1 } },
            unit: { start: 2, end: 8, slug: 'pincee' },
            name: 'sel',
          },
        ],
      },
      {
        name: 'Sauce',
        items: [
          {
            kind: 'ingredient',
            line: 8,
            raw: '4 œufs',
            quantity: { start: 0, end: 1, amount: { value: 4 } },
            name: 'œufs',
          },
        ],
      },
    ]);
  });

  test('items before the first heading form an unnamed group', () => {
    const result = parseIngredients(part('- a', '', '### G', '- b'));
    expect(result.groups.map((group) => group.name)).toEqual([undefined, 'G']);
  });

  test('ignores a leading level-2 heading, keeps a later one as text', () => {
    const result = parseIngredients(part('## Ingrédients', '- a', '## Autre'));
    expect(result.groups).toEqual([
      {
        name: undefined,
        items: [
          { kind: 'ingredient', line: 2, raw: 'a', name: 'a' },
          { kind: 'text', line: 3, raw: '## Autre' },
        ],
      },
    ]);
  });

  test('keeps unparsable lines and code blocks as text', () => {
    const result = parseIngredients(part('Un paragraphe', '', '```', '- pas un item', '```'));
    expect(result.groups[0]?.items.map((item) => item.kind)).toEqual([
      'text',
      'text',
      'text',
      'text',
    ]);
  });

  test('a line right under an item continues it', () => {
    const result = parseIngredients(part('- 1 citron', '  bio de préférence', '', 'texte'));
    expect(result.groups[0]?.items).toEqual([
      {
        kind: 'ingredient',
        line: 1,
        raw: '1 citron\nbio de préférence',
        quantity: { start: 0, end: 1, amount: { value: 1 } },
        name: 'citron\nbio de préférence',
      },
      { kind: 'text', line: 4, raw: 'texte' },
    ]);
  });

  test('warns about an empty part and empty groups', () => {
    expect(parseIngredients(part('', '')).diagnostics).toEqual([
      { code: 'empty_ingredients', severity: 'warning' },
    ]);
    expect(parseIngredients(part('### Vide', '### G', '- a')).diagnostics).toEqual([
      { code: 'empty_group', severity: 'warning', line: 1, params: { name: 'Vide' } },
    ]);
  });

  test('an empty list marker is kept as text', () => {
    const result = parseIngredients(part('-', '- a'));
    expect(result.groups[0]?.items[0]).toEqual({ kind: 'text', line: 1, raw: '-' });
  });
});

describe('parseSteps', () => {
  test('numbers steps globally across groups, ignoring the numbers written', () => {
    const result = parseSteps(
      part(
        '### Les pâtes',
        '1. Porter à ébullition.',
        '2. Cuire.',
        '',
        '### La sauce',
        '1) Dorer.',
        '5. Mélanger.',
      ),
    );
    const steps = result.groups.flatMap((group) => group.items);
    expect(steps.map((step) => (step.kind === 'step' ? [step.index, step.raw] : step.raw))).toEqual(
      [
        [0, 'Porter à ébullition.'],
        [1, 'Cuire.'],
        [2, 'Dorer.'],
        [3, 'Mélanger.'],
      ],
    );
  });

  test('accepts bullet steps and multi-line steps', () => {
    const result = parseSteps(part('- Couper.', 'Puis émincer.', '- Servir.'));
    expect(result.groups[0]?.items.map((step) => step.raw)).toEqual([
      'Couper.\nPuis émincer.',
      'Servir.',
    ]);
  });

  test('warns when there is no step', () => {
    expect(parseSteps(part('Juste du texte')).diagnostics).toEqual([
      { code: 'empty_steps', severity: 'warning' },
    ]);
  });
});

describe('parseIngredients: list markers', () => {
  const items = (...lines: string[]) => parseIngredients(part(...lines)).groups[0]?.items;

  test('a marker indented by 4 spaces right under an item continues it', () => {
    expect(items('- a', '    - b')).toEqual([
      { kind: 'ingredient', line: 1, raw: 'a\n- b', name: 'a\n- b' },
    ]);
  });

  test('a marker indented by 4 spaces after a blank line is text kept as written', () => {
    expect(items('- a', '', '    - b')?.[1]).toEqual({ kind: 'text', line: 3, raw: '    - b' });
  });

  test('a marker indented by up to 3 spaces is an item', () => {
    expect(items('   - a', '   2. b')).toEqual([
      { kind: 'ingredient', line: 1, raw: 'a', name: 'a' },
      { kind: 'ingredient', line: 2, raw: 'b', name: 'b' },
    ]);
  });

  test('a marker indented by a tab is not an item', () => {
    expect(items('\t- a')).toEqual([{ kind: 'text', line: 1, raw: '\t- a' }]);
  });

  test('a 2-space nested list item is a separate item, not a continuation', () => {
    expect(items('- pâte', '  - farine')).toEqual([
      { kind: 'ingredient', line: 1, raw: 'pâte', name: 'pâte' },
      { kind: 'ingredient', line: 2, raw: 'farine', name: 'farine' },
    ]);
  });

  test('ordered markers accept 1 to 9 digits, including 0', () => {
    expect(items('10. a', '', '123456789) b', '', '0. c')?.map((item) => item.kind)).toEqual([
      'ingredient',
      'ingredient',
      'ingredient',
    ]);
  });

  test('an ordered marker with 10 digits is not a marker', () => {
    expect(items('1234567890. a')).toEqual([{ kind: 'text', line: 1, raw: '1234567890. a' }]);
  });

  test('a 10-digit "marker" right under an item continues it', () => {
    expect(items('- a', '1234567890. b')?.[0]?.raw).toBe('a\n1234567890. b');
  });

  test('a decimal at the start of a line is not an ordered marker', () => {
    expect(items('1.5 g de sel')).toEqual([{ kind: 'text', line: 1, raw: '1.5 g de sel' }]);
  });

  test('a dash, star or plus glued to the text is not a marker', () => {
    expect(items('-1 œuf', '', '*gras*', '', '+sel')).toEqual([
      { kind: 'text', line: 1, raw: '-1 œuf' },
      { kind: 'text', line: 3, raw: '*gras*' },
      { kind: 'text', line: 5, raw: '+sel' },
    ]);
  });

  test('a marker followed only by spaces is kept as text with the original line', () => {
    expect(items('-   ', '', '1.', '', '2)\t')).toEqual([
      { kind: 'text', line: 1, raw: '-   ' },
      { kind: 'text', line: 3, raw: '1.' },
      { kind: 'text', line: 5, raw: '2)\t' },
    ]);
  });

  test('a line under an empty marker is not a continuation', () => {
    expect(items('-', 'suite')).toEqual([
      { kind: 'text', line: 1, raw: '-' },
      { kind: 'text', line: 2, raw: 'suite' },
    ]);
  });

  test('a tab after the marker is accepted and the item text is trimmed', () => {
    expect(items('-\tsel', '1.\tpoivre  ', '-   huile   ')?.map((item) => item.raw)).toEqual([
      'sel',
      'poivre',
      'huile',
    ]);
  });
});

describe('parseIngredients: continuations', () => {
  const items = (...lines: string[]) => parseIngredients(part(...lines)).groups[0]?.items;

  test('several lines under an item all continue it, each trimmed', () => {
    expect(items('- a', '   b   ', '\tc')?.[0]?.raw).toBe('a\nb\nc');
  });

  test('a whitespace-only line ends the item', () => {
    expect(items('- a', ' \t ', 'b')).toEqual([
      { kind: 'ingredient', line: 1, raw: 'a', name: 'a' },
      { kind: 'text', line: 3, raw: 'b' },
    ]);
  });

  test('a line under a text line is a separate text item', () => {
    expect(items('texte', '  suite')).toEqual([
      { kind: 'text', line: 1, raw: 'texte' },
      { kind: 'text', line: 2, raw: '  suite' },
    ]);
  });

  test('a quote line right under an item continues it', () => {
    expect(items('- a', '> note')?.[0]?.raw).toBe('a\n> note');
  });

  test('a fence right under an item is text, and the line after the fence is not a continuation', () => {
    expect(items('- a', '```', 'x', '```', 'y')).toEqual([
      { kind: 'ingredient', line: 1, raw: 'a', name: 'a' },
      { kind: 'text', line: 2, raw: '```' },
      { kind: 'text', line: 3, raw: 'x' },
      { kind: 'text', line: 4, raw: '```' },
      { kind: 'text', line: 5, raw: 'y' },
    ]);
  });

  test('a fence indented by 4 spaces right under an item is a continuation, not a fence', () => {
    expect(items('- a', '    ```', '- b')).toEqual([
      { kind: 'ingredient', line: 1, raw: 'a\n```', name: 'a\n```' },
      { kind: 'ingredient', line: 3, raw: 'b', name: 'b' },
    ]);
  });

  test('a group heading right under an item ends it', () => {
    const result = parseIngredients(part('- a', '### G', '- b'));
    expect(result.groups).toEqual([
      { name: undefined, items: [{ kind: 'ingredient', line: 1, raw: 'a', name: 'a' }] },
      { name: 'G', items: [{ kind: 'ingredient', line: 3, raw: 'b', name: 'b' }] },
    ]);
  });
});

describe('parseIngredients: headings', () => {
  test('headings of level 1, 2 (not leading) and 4 to 6 are text, never continuations', () => {
    const result = parseIngredients(
      part('- a', '# Un', '- b', '## Deux', '- c', '#### Quatre', '- d', '###### Six'),
    );
    expect(result.groups[0]?.items).toEqual([
      { kind: 'ingredient', line: 1, raw: 'a', name: 'a' },
      { kind: 'text', line: 2, raw: '# Un' },
      { kind: 'ingredient', line: 3, raw: 'b', name: 'b' },
      { kind: 'text', line: 4, raw: '## Deux' },
      { kind: 'ingredient', line: 5, raw: 'c', name: 'c' },
      { kind: 'text', line: 6, raw: '#### Quatre' },
      { kind: 'ingredient', line: 7, raw: 'd', name: 'd' },
      { kind: 'text', line: 8, raw: '###### Six' },
    ]);
  });

  test('a heading under an item ends it: the next line does not continue the earlier item', () => {
    // Regression: the heading became a text item but the item stayed open, so `b` (line 3) was
    // appended to the item of line 1, after the heading of line 2: source order was lost.
    expect(parseIngredients(part('- a', '#### h', 'b')).groups[0]?.items).toEqual([
      { kind: 'ingredient', line: 1, raw: 'a', name: 'a' },
      { kind: 'text', line: 2, raw: '#### h' },
      { kind: 'text', line: 3, raw: 'b' },
    ]);
  });

  test('seven hashes are not a heading: right under an item, the line continues it', () => {
    expect(parseIngredients(part('- a', '####### x')).groups[0]?.items[0]?.raw).toBe(
      'a\n####### x',
    );
  });

  test('a ### without a space is not a group heading', () => {
    expect(parseIngredients(part('###Sauce')).groups).toEqual([
      { name: undefined, items: [{ kind: 'text', line: 1, raw: '###Sauce' }] },
    ]);
    expect(parseIngredients(part('- a', '###Sauce')).groups[0]?.items[0]?.raw).toBe('a\n###Sauce');
  });

  test('a ### heading inside a code block is text, not a group', () => {
    const result = parseIngredients(part('- a', '```', '### G', '- b', '```'));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.items.slice(1)).toEqual([
      { kind: 'text', line: 2, raw: '```' },
      { kind: 'text', line: 3, raw: '### G' },
      { kind: 'text', line: 4, raw: '- b' },
      { kind: 'text', line: 5, raw: '```' },
    ]);
  });

  test('group names drop a closing hash sequence but keep a hash glued to the text', () => {
    const result = parseIngredients(part('### Sauce ###', '- a', '### C#', '- b'));
    expect(result.groups.map((group) => group.name)).toEqual(['Sauce', 'C#']);
  });

  test('an empty ### heading starts a group named "" (distinct from the leading group)', () => {
    const result = parseIngredients(part('- a', '###', '- b'));
    expect(result.groups.map((group) => group.name)).toEqual([undefined, '']);
    expect(result.groups[1]?.items).toEqual([{ kind: 'ingredient', line: 3, raw: 'b', name: 'b' }]);
  });

  test('a leading empty ### heading is kept, unlike no heading', () => {
    expect(parseIngredients(part('###', '- a')).groups.map((group) => group.name)).toEqual(['']);
    expect(parseIngredients(part('', '- a')).groups.map((group) => group.name)).toEqual([
      undefined,
    ]);
  });

  test('an empty unnamed group warns with an empty name', () => {
    expect(parseIngredients(part('- a', '###')).diagnostics).toEqual([
      { code: 'empty_group', severity: 'warning', line: 2, params: { name: '' } },
    ]);
  });

  test('the leading ## heading is ignored after blank lines, indented, or empty', () => {
    for (const heading of ['## Ingrédients', '   ## Ingrédients', '##']) {
      expect(parseIngredients(part('', '  ', heading, '- a')).groups).toEqual([
        { name: undefined, items: [{ kind: 'ingredient', line: 4, raw: 'a', name: 'a' }] },
      ]);
    }
  });

  test('a ## heading inside a leading code block is not ignored', () => {
    const result = parseIngredients(part('```', '## x', '```'));
    expect(result.groups[0]?.items.map((item) => item.raw)).toEqual(['```', '## x', '```']);
  });

  test('a ## heading after a leading group heading is text', () => {
    expect(parseIngredients(part('### G', '## X')).groups).toEqual([
      { name: 'G', items: [{ kind: 'text', line: 2, raw: '## X' }] },
    ]);
  });

  test('a part with only the leading ## heading has no group and warns', () => {
    expect(parseIngredients(part('## Ingrédients'))).toEqual({
      groups: [],
      diagnostics: [{ code: 'empty_ingredients', severity: 'warning' }],
    });
  });
});

describe('parseIngredients: lines and diagnostics', () => {
  test('item and group lines are offset by the part start line', () => {
    const result = parseIngredients({ lines: ['', '- a', 'texte', '', '### Vide'], startLine: 10 });
    expect(result.groups[0]?.items).toEqual([
      { kind: 'ingredient', line: 11, raw: 'a\ntexte', name: 'a\ntexte' },
    ]);
    expect(result.diagnostics).toEqual([
      { code: 'empty_group', severity: 'warning', line: 14, params: { name: 'Vide' } },
    ]);
  });

  test('a group with only text is not empty, but the part has no ingredient', () => {
    expect(parseIngredients(part('### G', 'texte')).diagnostics).toEqual([
      { code: 'empty_ingredients', severity: 'warning' },
    ]);
  });

  test('empty group warnings are capped at 50, the rest counted', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `### G${i}`);
    const diagnostics = parseIngredients(part(...lines)).diagnostics;
    expect(diagnostics.filter((d) => d.code === 'empty_group')).toHaveLength(50);
    expect(diagnostics.slice(50)).toEqual([
      { code: 'empty_ingredients', severity: 'warning' },
      {
        code: 'diagnostics_truncated',
        severity: 'warning',
        params: { code: 'empty_group', omitted: 10 },
      },
    ]);
  });

  test('a long group name is truncated in the diagnostic but kept whole in the group', () => {
    const name = 'n'.repeat(100);
    const result = parseIngredients(part(`### ${name}`));
    expect(result.groups[0]?.name).toBe(name);
    expect(result.diagnostics[0]?.params).toEqual({ name: `${'n'.repeat(80)}…` });
  });
});

describe('parseSteps: edge cases', () => {
  test('text items between steps do not take a step index', () => {
    const result = parseSteps(part('1. a', '', 'note', '', '2. b'));
    expect(result.groups[0]?.items).toEqual([
      { kind: 'step', line: 1, index: 0, raw: 'a', segments: [{ kind: 'text', text: 'a' }] },
      { kind: 'text', line: 3, raw: 'note' },
      { kind: 'step', line: 5, index: 1, raw: 'b', segments: [{ kind: 'text', text: 'b' }] },
    ]);
  });

  test('a multi-line step has one text segment with the whole raw text', () => {
    const step = parseSteps(part('1. Couper.', '   Puis émincer.')).groups[0]?.items[0];
    expect(step).toMatchObject({
      raw: 'Couper.\nPuis émincer.',
      segments: [{ kind: 'text', text: 'Couper.\nPuis émincer.' }],
    });
  });

  test('step indexes start at 0 on every call', () => {
    parseSteps(part('1. a', '2. b'));
    expect(parseSteps(part('1. c')).groups[0]?.items[0]).toMatchObject({ index: 0 });
  });

  test('an empty step group warns with its line', () => {
    expect(parseSteps(part('1. a', '', '### Vide')).diagnostics).toEqual([
      { code: 'empty_group', severity: 'warning', line: 3, params: { name: 'Vide' } },
    ]);
  });
});

describe('parseRecipe', () => {
  const carbonara = [
    '# Pâtes carbonara',
    '',
    '> La vraie, sans crème.',
    '',
    'portions: 4',
    '',
    '---',
    '',
    '### Pour les pâtes',
    '',
    '- 400 g spaghetti',
    '',
    '---',
    '',
    '### Les pâtes',
    '',
    "1. Cuire les pâtes [10 min](timer:10m 'pâtes').",
  ].join('\n');

  test('parses the three parts together', () => {
    const result = parseRecipe(carbonara);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.document).toMatchObject({
      title: 'Pâtes carbonara',
      servings: 4,
      ingredientGroups: [{ name: 'Pour les pâtes', items: [{ raw: '400 g spaghetti', line: 11 }] }],
      stepGroups: [{ name: 'Les pâtes', items: [{ index: 0, line: 17 }] }],
    });
  });

  test('returns all diagnostics and no document on error', () => {
    const result = parseRecipe('# T\n\n---\n\n---\n');
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        { code: 'missing_servings', severity: 'error' },
        { code: 'empty_ingredients', severity: 'warning' },
        { code: 'empty_steps', severity: 'warning' },
      ],
    });
  });

  test('accepts a recipe with empty parts 2 and 3, with warnings', () => {
    const result = parseRecipe('# T\n\nportions: 2\n\n---\n\n---\n');
    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['empty_ingredients', 'empty_steps']);
  });
});
