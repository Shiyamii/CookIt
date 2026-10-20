import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CURRENT_FORMAT } from './meta-keys';
import type { Presentation, RecipeDocument } from './model';
import { parseRecipe } from './parse';
import { serializeBody, serializePresentation, serializeRecipe } from './serialize';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function parseOk(markdown: string): RecipeDocument {
  const result = parseRecipe(markdown);
  if (!result.ok) throw new Error(`${markdown}\n${JSON.stringify(result.diagnostics)}`);
  return result.document;
}

/** The document without source line numbers, which legitimately move. */
function withoutLines(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutLines);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'line')
        .map(([key, child]) => [key, withoutLines(child)]),
    );
  }
  return value;
}

/** parse → serialize → parse gives the same recipe, and serializing again gives the same text. */
function expectStable(markdown: string) {
  const document = parseOk(markdown);
  const canonical = serializeRecipe(document, { locale: 'fr', includeTags: true });
  const reparsed = parseOk(canonical);
  try {
    // The canonical form always declares the format version.
    expect(withoutLines(reparsed)).toEqual(
      withoutLines({ ...document, format: document.format ?? CURRENT_FORMAT }),
    );
  } catch (error) {
    throw new Error(
      `Unstable document.\n--- source ---\n${markdown}\n--- canonical ---\n${canonical}\n${String(error)}`,
      { cause: error },
    );
  }
  expect(serializeRecipe(reparsed, { locale: 'fr', includeTags: true })).toBe(canonical);
}

describe('serializeRecipe', () => {
  test('writes the canonical form', () => {
    const document = parseOk(
      [
        '## Présentation',
        '# Crêpes',
        'Une pâte simple.',
        '',
        'Servings: 4',
        'tags: dessert',
        'auteur: Mamie',
      ].join('\n') +
        '\n\n---\n\n* 250 g farine\n4 œufs\n\n---\n\n### Cuisson\n3. Cuire [1 min](timer:1m).\n',
    );
    expect(serializeRecipe(document, { locale: 'fr', includeTags: true })).toBe(
      [
        '# Crêpes',
        '',
        '> Une pâte simple.',
        '',
        'portions: 4',
        'tags: dessert',
        'auteur: Mamie',
        'format: 1',
        '',
        '---',
        '',
        '- 250 g farine',
        '    4 œufs',
        '',
        '---',
        '',
        '### Cuisson',
        '',
        '1. Cuire [1 min](timer:1m).',
        '',
      ].join('\n'),
    );
  });

  test('uses English keys for an English recipe and omits tags unless asked', () => {
    const document = parseOk('# T\n\nportions: 2\ntags: a\n\n---\n\n---\n');
    expect(serializeRecipe(document, { locale: 'en' })).toBe(
      '# T\n\nservings: 2\nformat: 1\n\n---\n\n---\n',
    );
  });

  test('serializeBody gives parts 2 and 3 only (body_markdown)', () => {
    const document = parseOk('# T\n\nportions: 2\n\n---\n\n- a\n\n---\n\n1. b\n');
    expect(serializeBody(document, { locale: 'fr' })).toBe('- a\n\n---\n\n1. b');
  });

  test.each(['crepes.md', 'boeuf-bourguignon.md'])('%p is stable', (name) => {
    expectStable(fixture(name));
  });

  test.each([
    ['title ending with #', '# Le C#\n\nportions: 1\n\n---\n\n---\n'],
    ['title ending with closing-like hash', '# Recette n° #\n\nportions: 1\n\n---\n\n---\n'],
    ['group name ending with #', '# T\n\nportions: 1\n\n---\n\n### Pour C #\n- a\n\n---\n'],
    ['empty ### heading', '# T\n\nportions: 1\n\n---\n\n- a\n###\n- b\n\n---\n'],
    ['text then item', '# T\n\nportions: 1\n\n---\n\nAstuce\n- a\n\n---\n'],
    ['text after an item', '# T\n\nportions: 1\n\n---\n\n- a\n\nAstuce\n\n---\n'],
    ['dash text after an item', '# T\n\nportions: 1\n\n---\n\n- a\n\n---\nb\n\n---\n'],
    ['dash text before a heading', '# T\n\nportions: 1\n\n---\n\n- a\n\n---\n### G\n\n---\n'],
    ['dash text after a heading', '# T\n\nportions: 1\n\n---\n\n### G\n\n---\nb\n\n---\n'],
    ['dash text after text', '# T\n\nportions: 1\n\n---\n\nt\n\n---\nb\n\n---\n'],
    ['part starting with a ## text', '# T\n\nportions: 1\n\n---\n\n- a\n## Note\n\n---\n'],
    ['fence with blank lines', '# T\n\nportions: 1\n\n---\n\n```\na\n\n---\n```\n\n---\n'],
    [
      'continuation looking like markup',
      '# T\n\nportions: 1\n\n---\n\n- a\n    - b\n    ### c\n\n---\n',
    ],
    ['description with markup', '# T\n\n> a\n> > b\n>\n> ---\n\nportions: 1\n\n---\n\n---\n'],
    ['description in a code block', '# T\n\n```\nk: v\n\n> x\n```\n\nportions: 1\n\n---\n\n---\n'],
    ['meta with empty value', '# T\n\nportions: 1\nnote:\n\n---\n\n---\n'],
    ['empty parts', '# T\n\nportions: 1\n\n---\n\n---\n'],
    [
      'title with markup and special characters',
      '# Crème *brûlée* [x](y) <b> & `c` > d\n\nportions: 1\n\n---\n\n---\n',
    ],
    ['title ending with an escaped #', '# Le C\\#\n\nportions: 1\n\n---\n\n---\n'],
    [
      'description with a code fence holding blank lines and meta-like lines',
      '# T\n\n```js\nconst a = 1;\n\nportions: 3\n```\n\nportions: 1\n\n---\n\n---\n',
    ],
    [
      'description with a heading, a list and a hard break',
      '# T\n\n> # pas un titre\n> - item\n> fin  \n> suite\n\nportions: 1\n\n---\n\n---\n',
    ],
    [
      'description with a meta-like quoted line',
      '# T\n\n> auteur: Mamie\n\nportions: 1\n\n---\n\n---\n',
    ],
    [
      'extra meta with special characters',
      '# T\n\nportions: 1\nclé_spéciale-2: a: b https://x.y/?a=b#c\nurl: //x\nnote: > *x* `y`\n\n---\n\n---\n',
    ],
    [
      'source with a URL',
      '# T\n\nportions: 1\nsource: https://exemple.com/a?b=c#d\n\n---\n\n---\n',
    ],
    ['English keys', '# T\n\nServes: 3\nauthor: x\n\n---\n\n---\n'],
  ])('%s is stable', (_, markdown) => {
    expectStable(markdown);
  });
});

describe('serializePresentation', () => {
  const presentation = (overrides: Partial<Presentation> = {}): Presentation => ({
    title: 'T',
    description: '',
    servings: 2,
    tags: [],
    extraMeta: {},
    ...overrides,
  });

  test('an empty description writes no quote block', () => {
    expect(serializePresentation(presentation(), { locale: 'fr' })).toBe(
      '# T\n\nportions: 2\nformat: 1',
    );
  });

  test.each([
    ['fr', 'portions: 2'],
    ['en', 'servings: 2'],
  ] as const)('the servings key follows the recipe language (%s)', (locale, line) => {
    expect(serializePresentation(presentation(), { locale }).split('\n')).toContain(line);
  });

  test('tags are written only when asked, and only if there are some', () => {
    const tagged = presentation({ tags: ['dessert', 'rapide'] });
    expect(serializePresentation(tagged, { locale: 'fr' })).not.toContain('tags');
    expect(serializePresentation(tagged, { locale: 'fr', includeTags: false })).not.toContain(
      'tags',
    );
    expect(serializePresentation(tagged, { locale: 'fr', includeTags: true })).toContain(
      '\ntags: dessert, rapide\n',
    );
    expect(
      serializePresentation(presentation(), { locale: 'fr', includeTags: true }),
    ).not.toContain('tags');
  });

  test('extra meta keeps its order and empty values', () => {
    const text = serializePresentation(
      presentation({ extraMeta: { zeta: '1', alpha: '', 'clé-2': 'a: b' } }),
      { locale: 'fr' },
    );
    expect(text).toBe('# T\n\nportions: 2\nzeta: 1\nalpha:\nclé-2: a: b\nformat: 1');
  });

  test.each(['#', 'C ##', 'Le C\\#', 'a > b'])('the title %p reads back the same', (title) => {
    const text = `${serializePresentation(presentation({ title }), { locale: 'fr' })}\n\n---\n\n---\n`;
    expect(parseOk(text).title).toBe(title);
  });

  test('a description with code fences and blank lines reads back the same', () => {
    const description = '```\nportions: 9\n\n# x\n```\n\nfin';
    const text = `${serializePresentation(presentation({ description }), { locale: 'en' })}\n\n---\n\n---\n`;
    expect(parseOk(text)).toMatchObject({ description, servings: 2 });
  });

  test('the source and an older format are kept', () => {
    expect(
      serializePresentation(presentation({ source: 'https://x.y', format: 1 }), { locale: 'en' }),
    ).toBe('# T\n\nservings: 2\nsource: https://x.y\nformat: 1');
  });
});

describe('serializeBody with serializePresentation', () => {
  const markdown = fixture('crepes.md');

  test.each(['fr', 'en'] as const)(
    'recomposing parts 1 and 2-3 gives the full document (%s)',
    (locale) => {
      const document = parseOk(markdown);
      const recomposed = `${serializePresentation(document, { locale, includeTags: true })}\n\n---\n\n${serializeBody(document, { locale })}\n`;
      expect(recomposed).toBe(serializeRecipe(document, { locale, includeTags: true }));
      expect(withoutLines(parseOk(recomposed))).toEqual(
        withoutLines({ ...document, format: document.format ?? CURRENT_FORMAT }),
      );
    },
  );

  test('empty parts give a lone separator', () => {
    expect(serializeBody({ ingredientGroups: [], stepGroups: [] }, { locale: 'fr' })).toBe('---');
  });

  test('a part starting with a ## text gets the part heading of the recipe language', () => {
    const document = parseOk('# T\n\nportions: 1\n\n---\n\n## Ignoré\n## Note\n- a\n\n---\n');
    expect(document.ingredientGroups[0]?.items[0]).toMatchObject({ kind: 'text', raw: '## Note' });
    expect(serializeBody(document, { locale: 'en' })).toMatch(/^## Ingredients\n\n## Note/);
    expect(serializeBody(document, { locale: 'fr' })).toMatch(/^## Ingrédients\n\n## Note/);
  });
});

describe('parse → serialize → parse on generated documents', () => {
  const POOL = [
    '- 200 g farine',
    '* 2 à 3 gousses d’ail',
    '+ sel',
    '1. Mélanger [10 min](timer:10m "pâte").',
    '10) Cuire avec [2 CaS](q:) d’huile.',
    '-',
    '  - sous-item',
    '    - indenté 4',
    '    ### indenté',
    '### Groupe',
    '###',
    '### Sauce ###',
    '## Titre',
    '#### Sous-titre',
    '# Titre',
    '> note',
    'texte libre',
    '  suite indentée',
    '---',
    '  ---',
    '***',
    '```',
    '~~~',
    '',
    '',
  ];

  function random(seed: number) {
    let state = seed;
    return (max: number) => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % max;
    };
  }

  test('500 random documents are stable', () => {
    const next = random(99);
    const lines = () => Array.from({ length: next(14) }, () => POOL[next(POOL.length)] ?? '');
    let checked = 0;
    for (let run = 0; run < 500; run++) {
      const markdown = [
        '# T',
        '',
        'portions: 2',
        '',
        '---',
        '',
        ...lines(),
        '',
        '---',
        '',
        ...lines(),
      ].join('\n');
      // Random dash lines can create extra parts or open fences: only valid documents count.
      if (!parseRecipe(markdown).ok) continue;
      expectStable(markdown);
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });
});
