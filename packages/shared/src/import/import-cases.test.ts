import { describe, expect, test } from 'bun:test';
import { MAX_TIMER_SECONDS } from '../recipe/inline';
import { parseRecipe } from '../recipe/parse';
import { detectDurations } from './durations';
import { extractJsonLd, findRecipe, plainText, recipeFromJsonLd, yieldServings } from './jsonld';
import { splitIngredients, splitSteps } from './paste';

const seconds = (text: string) => detectDurations(text).map((d) => d.seconds);

describe('detectDurations: more forms', () => {
  test.each([
    ['Cuire 1 h', [3600]],
    ['Cuire 2 heures', [7200]],
    ['Cuire 1 heure', [3600]],
    ['Cook 2 hours', [7200]],
    ['Cook 2 hrs', [7200]],
    ['Cuire 90 secondes', [90]],
    ['Wait 90 seconds', [90]],
    ['Wait 1 second', [1]],
    ['Wait 10 sec', [10]],
    ['Cuire 10 MIN', [600]],
    ['Cuire 1h30min', [5400]],
    ['Bake 1 hour 30 minutes', [5400]],
    ['Cuire 0,5 h', [1800]],
    ['Cuire 1.5 hours', [5400]],
  ])('%j gives %j', (text, expected) => {
    expect(seconds(text)).toEqual(expected);
  });

  test.each([
    ['Cuire 2 to 3 minutes', 180, 120],
    ['Cuire 2 à 3 minutes', 180, 120],
    ['Cuire 2 - 3 min', 180, 120],
    ['Cuire 2–3 min', 180, 120],
    ['Cook 1 or 2 hours', 7200, 3600],
    ['Cuire 30 à 40 secondes', 40, 30],
  ])('range %j', (text, high, low) => {
    expect(detectDurations(text)).toMatchObject([{ seconds: high, lowSeconds: low }]);
  });

  test('a range whose low value is not lower has no low alternative', () => {
    const [found] = detectDurations('Cuire 3-3 min');
    expect(found?.seconds).toBe(180);
    expect(found?.lowSeconds).toBeUndefined();
  });

  test('a duration above the timer maximum or null is refused', () => {
    expect(seconds(`Attendre ${Math.floor(MAX_TIMER_SECONDS / 3600) + 1} h`)).toEqual([]);
    expect(seconds('Attendre 0 min')).toEqual([]);
  });

  test.each([
    'Chauffer à 180 °C',
    '200 g de farine',
    'Un four à 10 mmm',
    'Il y a 3 sacs',
    'Cuire 10 minutieusement',
    '12 heureux',
    '',
  ])('false positive %j', (text) => {
    expect(seconds(text)).toEqual([]);
  });

  test('several durations in one text keep their order and do not overlap', () => {
    const found = detectDurations('Cuire 10 min, reposer 1h30, puis 2 à 3 min et 45 s.');
    expect(found.map((d) => d.seconds)).toEqual([600, 5400, 180, 45]);
    for (let i = 1; i < found.length; i++) {
      expect(found[i]?.start).toBeGreaterThanOrEqual(found[i - 1]?.end ?? 0);
    }
  });

  test('is deterministic across calls (global regex state)', () => {
    expect(seconds('10 min')).toEqual([600]);
    expect(seconds('10 min')).toEqual([600]);
  });
});

describe('splitIngredients: edge cases', () => {
  test('empty or blank text gives no group', () => {
    expect(splitIngredients('')).toEqual([]);
    expect(splitIngredients('  \n\n \r\n')).toEqual([]);
  });
  test('only a heading keeps an empty named group', () => {
    expect(splitIngredients('Pour la pâte :')).toEqual([{ name: 'Pour la pâte', items: [] }]);
  });
  test('### headings and CRLF', () => {
    expect(
      splitIngredients('### Pâte\r\n200 g de farine\r\n\r\n### Garniture ###\r\n3 pommes'),
    ).toEqual([
      { name: 'Pâte', items: ['200 g de farine'] },
      { name: 'Garniture', items: ['3 pommes'] },
    ]);
  });
  test('mixed bullets are removed but quantities are kept', () => {
    expect(splitIngredients('- a\n* b\n+ c\n• d\n– e\n1. f\n(2) g\n3) h\n2 oeufs')).toEqual([
      { items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', '2 oeufs'] },
    ]);
  });
  test('a line with a colon in the middle is not a group', () => {
    expect(splitIngredients('Sel : une pincée')).toEqual([{ items: ['Sel : une pincée'] }]);
  });
  test('extra spaces are collapsed', () => {
    expect(splitIngredients('  200   g    de farine ')).toEqual([{ items: ['200 g de farine'] }]);
  });
});

describe('splitSteps: edge cases', () => {
  test('empty text and only a heading', () => {
    expect(splitSteps('')).toEqual([]);
    expect(splitSteps('\n\n')).toEqual([]);
    expect(splitSteps('### Préparation')).toEqual([{ name: 'Préparation', items: [] }]);
  });
  test('CRLF numbered steps', () => {
    expect(splitSteps('1. Mélanger\r\nbien.\r\n2. Cuire.\r\n')).toEqual([
      { items: ['Mélanger bien.', 'Cuire.'] },
    ]);
  });
  test('### headings split groups of steps', () => {
    expect(splitSteps('### Pâte\n1. Mélanger.\n2. Reposer.\n### Cuisson\n3. Cuire.')).toEqual([
      { name: 'Pâte', items: ['Mélanger.', 'Reposer.'] },
      { name: 'Cuisson', items: ['Cuire.'] },
    ]);
  });
  test('a single numbered line is one step', () => {
    expect(splitSteps('1. Mélanger.')).toEqual([{ items: ['Mélanger.'] }]);
  });
  test('English "Step N"', () => {
    expect(splitSteps('Step 1: Mix the flour\nwith eggs\nStep 2: Bake')).toEqual([
      { items: ['Mix the flour with eggs', 'Bake'] },
    ]);
  });
  test('text before the first number is not lost', () => {
    const items = splitSteps('Intro text\n1. One\n2. Two').flatMap((g) => g.items);
    expect(items.join(' ')).toContain('Intro text');
  });
});

describe('extractJsonLd', () => {
  const block = (json: string, type = 'application/ld+json') =>
    `<script type="${type}">${json}</script>`;

  test('several blocks in order, invalid ones skipped', () => {
    const html = block('{"a":1}') + block('{oops') + block('[{"b":2}]');
    expect(extractJsonLd(html)).toEqual([{ a: 1 }, [{ b: 2 }]]);
  });
  test('uppercase tag and type, unquoted type, extra attributes', () => {
    expect(extractJsonLd('<SCRIPT TYPE="APPLICATION/LD+JSON">{"a":1}</SCRIPT>')).toEqual([
      { a: 1 },
    ]);
    expect(extractJsonLd('<script id=x type=application/ld+json>{"a":2}</script>')).toEqual([
      { a: 2 },
    ]);
  });
  test('other scripts are ignored', () => {
    expect(extractJsonLd(block('{"a":1}', 'text/javascript'))).toEqual([]);
    expect(extractJsonLd('<script>var a = {"a":1}</script>')).toEqual([]);
    expect(extractJsonLd('')).toEqual([]);
  });
  test('at most 20 blocks are read', () => {
    expect(extractJsonLd(block('{"a":1}').repeat(50))).toHaveLength(20);
  });
});

describe('findRecipe', () => {
  test('type array, top-level array, nested graph, none', () => {
    expect(findRecipe([{ '@type': ['Thing', 'Recipe'], name: 'x' }])).toMatchObject({ name: 'x' });
    expect(findRecipe([[{ '@type': 'Recipe', name: 'y' }]])).toMatchObject({ name: 'y' });
    expect(
      findRecipe([{ '@graph': [{ '@graph': [{ '@type': 'Recipe', name: 'z' }] }] }]),
    ).toMatchObject({ name: 'z' });
    expect(findRecipe([{ '@type': 'Article' }, 'text', null, 4])).toBeUndefined();
    expect(findRecipe([])).toBeUndefined();
  });
  test('returns the first recipe', () => {
    expect(
      findRecipe([
        { '@type': 'Recipe', name: '1' },
        { '@type': 'Recipe', name: '2' },
      ]),
    ).toMatchObject({ name: '1' });
  });
});

describe('recipeFromJsonLd: shapes', () => {
  const convert = (recipe: Record<string, unknown>) =>
    recipeFromJsonLd(
      { '@type': 'Recipe', name: 'R', recipeYield: 2, ...recipe },
      'https://e.com/r',
      'en',
    );
  const parsed = (recipe: Record<string, unknown>) => {
    const result = parseRecipe(convert(recipe).markdown);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.document;
  };
  const stepTexts = (recipe: Record<string, unknown>) =>
    parsed(recipe).stepGroups.map((g) => g.items.map((i) => i.raw));

  test('HowToStep array', () => {
    expect(
      stepTexts({
        recipeInstructions: [
          { '@type': 'HowToStep', text: 'Mix.' },
          { '@type': 'HowToStep', name: 'Bake.' },
        ],
      }),
    ).toEqual([['Mix.', 'Bake.']]);
  });
  test('string instructions with newlines become steps', () => {
    expect(stepTexts({ recipeInstructions: 'Mix.\nBake.\nServe.' })).toEqual([
      ['Mix.', 'Bake.', 'Serve.'],
    ]);
  });
  test('array of strings and a single object', () => {
    expect(stepTexts({ recipeInstructions: ['One.', 'Two.'] })).toEqual([['One.', 'Two.']]);
    expect(stepTexts({ recipeInstructions: { '@type': 'HowToStep', text: 'Only.' } })).toEqual([
      ['Only.'],
    ]);
  });
  test('a section after loose steps', () => {
    const groups = parsed({
      recipeInstructions: [
        'Prep.',
        { '@type': 'HowToSection', name: 'Cook', itemListElement: [{ text: 'Fry.' }, 'Eat.'] },
      ],
    }).stepGroups;
    expect(groups.map((g) => g.items.length)).toEqual([1, 2]);
    expect(groups[1]?.name).toBe('Cook');
  });
  test('keywords as array or string, categories, cuisine, deduplicated', () => {
    expect(
      convert({ keywords: ['a', 'b'], recipeCategory: ['b', 'c'], recipeCuisine: 'd' }).tagValues,
    ).toEqual(['a', 'b', 'c', 'd']);
    expect(convert({ keywords: 'x, y,, z' }).tagValues).toEqual(['x', 'y', 'z']);
  });
  test('missing fields give a title-only document', () => {
    const imported = recipeFromJsonLd({ '@type': 'Recipe' }, 'https://e.com/page', 'en');
    expect(imported.markdown).toContain('# https://e.com/page');
    expect(imported.tagValues).toEqual([]);
  });
  test('ingredients: strings, objects and the legacy field', () => {
    const doc = parsed({ recipeIngredient: ['1 egg', { name: '2 cups flour' }] });
    expect(doc.ingredientGroups[0]?.items.map((i) => i.raw)).toEqual(['1 egg', '2 cups flour']);
    expect(parsed({ ingredients: ['salt'] }).ingredientGroups[0]?.items[0]?.raw).toBe('salt');
  });
  test('HTML and entities are cleaned in every field', () => {
    const doc = parsed({
      name: '<b>Tarte</b> &amp; co',
      description: 'Nice &lt;3',
      recipeInstructions: ['<p>Mix &quot;well&quot;.</p>'],
    });
    expect(doc.title).toBe('Tarte & co');
    expect(doc.stepGroups[0]?.items[0]?.raw).toBe('Mix "well".');
  });
  test('bounds: items, text length, title, tag values', () => {
    const many = Array.from({ length: 500 }, (_, i) => `item ${i}`);
    const doc = parsed({ recipeIngredient: many, recipeInstructions: many });
    expect(doc.ingredientGroups[0]?.items.length).toBeLessThanOrEqual(200);
    expect(doc.stepGroups.flatMap((g) => g.items).length).toBeLessThanOrEqual(200);
    expect(plainText('x'.repeat(5000)).length).toBe(2000);
    const imported = convert({ name: 'T'.repeat(500), keywords: many });
    expect(imported.tagValues.length).toBeLessThanOrEqual(50);
    expect(imported.markdown.split('\n')[0]?.length).toBeLessThanOrEqual(202);
  });
  test('line breaks in a title never produce a second markdown line', () => {
    expect(convert({ name: 'A\nB\r\nC' }).markdown.split('\n')[0]).toBe('# A B C');
  });
  test('servings: text, absent, out of range', () => {
    expect(parsed({ recipeYield: '6 parts' }).servings).toBe(6);
    expect(yieldServings(undefined)).toBeUndefined();
    expect(yieldServings('99999 portions')).toBeUndefined();
  });
  test('plainText: invalid entities stay, control characters become spaces', () => {
    expect(plainText('&#0; &unknownentity; a\u0007b')).toBe('&#0; &unknownentity; a b');
  });
});

describe('hostile input stays fast and bounded', () => {
  const fast = (run: () => unknown) => {
    const started = performance.now();
    run();
    expect(performance.now() - started).toBeLessThan(1000);
  };

  test('100k spaces, colons and hashes in pasted text', () => {
    fast(() => splitIngredients(' '.repeat(100_000) + ':'));
    fast(() => splitSteps('#'.repeat(100_000)));
    fast(() => splitSteps(':'.repeat(100_000)));
    fast(() => splitIngredients(`${'a '.repeat(50_000)}:`));
  });

  test('pasted text is capped', () => {
    const lines = splitIngredients('item\n'.repeat(100_000)).flatMap((g) => g.items);
    expect(lines.length).toBeLessThanOrEqual(200_000 / 5);
  });

  test('a lone carriage return also separates lines', () => {
    expect(splitIngredients('a\rb\rc')).toEqual([{ items: ['a', 'b', 'c'] }]);
  });

  test('a # without a space is not a heading; more than 6 hashes neither', () => {
    expect(splitIngredients('#hashtag')).toEqual([{ items: ['#hashtag'] }]);
    expect(splitIngredients('####### seven')).toEqual([{ items: ['####### seven'] }]);
    expect(splitIngredients('###### six\nx')).toEqual([{ name: 'six', items: ['x'] }]);
  });

  test('a line ending with a colon is a group only when short and with no other colon', () => {
    expect(splitIngredients(`${'a'.repeat(61)} :\nx`)[0]?.name).toBeUndefined();
    expect(splitIngredients('a : b :\nx')[0]?.name).toBeUndefined();
    expect(splitIngredients('Sauce :\nx')[0]?.name).toBe('Sauce');
  });

  test('extractJsonLd on unclosed scripts', () => {
    fast(() => extractJsonLd('<script type="application/ld+json">'.repeat(2000)));
    fast(() => extractJsonLd('<script '.repeat(7000)));
    expect(extractJsonLd('<script type="application/ld+json">{"a":1}')).toEqual([]);
  });

  test('plainText on long tag-like input', () => {
    fast(() => plainText('<'.repeat(100_000)));
    fast(() => plainText('&'.repeat(100_000)));
    fast(() => plainText(`<${'a'.repeat(100_000)}`));
  });

  test('a huge instructions string is capped before splitting', () => {
    fast(() => {
      const imported = recipeFromJsonLd(
        { '@type': 'Recipe', name: 'R', recipeInstructions: 'step\n'.repeat(500_000) },
        'https://e.com',
        'en',
      );
      expect(imported.markdown.length).toBeLessThan(2_000_000);
    });
  });
});
