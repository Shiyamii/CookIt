import { describe, expect, test } from 'bun:test';
import { parseRecipe } from './recipe/parse';
import { serializeBody } from './recipe/serialize';
import {
  composeRecipeMarkdown,
  extraMetaSchema,
  recipeCopyInputSchema,
  recipeCreateInputSchema,
  recipeFieldsSchema,
  recipeIdeaQuerySchema,
  recipeMarkdownInputSchema,
  RECIPE_SCOPES,
  recipeSaveInputSchema,
  recipeSaveLinkInputSchema,
  recipeSearchSchema,
  shareTokenSchema,
} from './recipes';

const FIELDS = { title: 'Tarte', description: '', servings: 4 };

describe('recipeFieldsSchema', () => {
  test('accepts a minimal recipe and defaults extraMeta', () => {
    const r = recipeFieldsSchema.parse(FIELDS);
    expect(r.extraMeta).toEqual({});
  });
  test('refuses line breaks in single-line fields', () => {
    expect(recipeFieldsSchema.safeParse({ ...FIELDS, title: 'a\nb' }).success).toBe(false);
    expect(recipeFieldsSchema.safeParse({ ...FIELDS, source: 'http://a\nb' }).success).toBe(false);
  });
  test('allows line breaks in the description but not other control characters', () => {
    expect(recipeFieldsSchema.safeParse({ ...FIELDS, description: 'a\n\nb' }).success).toBe(true);
    expect(recipeFieldsSchema.safeParse({ ...FIELDS, description: 'a\u0000b' }).success).toBe(
      false,
    );
    expect(recipeFieldsSchema.safeParse({ ...FIELDS, description: 'a‮b' }).success).toBe(false);
  });
  test('servings must be a positive integer within bounds', () => {
    for (const servings of [0, -1, 1.5, 1e9, '4']) {
      expect(recipeFieldsSchema.safeParse({ ...FIELDS, servings }).success).toBe(false);
    }
  });
  test('an empty source becomes undefined', () => {
    expect(recipeFieldsSchema.parse({ ...FIELDS, source: '   ' }).source).toBeUndefined();
  });
  test('refuses an empty title and an over-long one', () => {
    expect(recipeFieldsSchema.safeParse({ ...FIELDS, title: '' }).success).toBe(false);
    expect(recipeFieldsSchema.safeParse({ ...FIELDS, title: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('extraMetaSchema', () => {
  test('accepts unknown keys', () => {
    expect(extraMetaSchema.safeParse({ temps: '10 min', 'Prép-aration': 'x' }).success).toBe(true);
  });
  test('refuses reserved keys in French and English, any case', () => {
    for (const key of ['portions', 'Servings', 'tags', 'format', 'source']) {
      expect(extraMetaSchema.safeParse({ [key]: 'x' }).success).toBe(false);
    }
  });
  test('refuses keys with spaces, colons or line breaks and values with line breaks', () => {
    for (const key of ['a b', 'a:b', 'a\nb', '', '1a']) {
      expect(extraMetaSchema.safeParse({ [key]: 'x' }).success).toBe(false);
    }
    expect(extraMetaSchema.safeParse({ a: 'x\ny' }).success).toBe(false);
  });
  test('bounds the number of entries', () => {
    const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 'v']));
    expect(extraMetaSchema.safeParse(many).success).toBe(false);
  });
});

describe('input schemas', () => {
  test('save and create are strict', () => {
    const save = { ...FIELDS, body: '' };
    expect(recipeSaveInputSchema.safeParse(save).success).toBe(true);
    expect(recipeSaveInputSchema.safeParse({ ...save, ownerId: 'x' }).success).toBe(false);
    expect(recipeCreateInputSchema.safeParse({ ...save, lang: 'fr' }).success).toBe(true);
    expect(recipeCreateInputSchema.safeParse({ ...save, lang: 'de' }).success).toBe(false);
    expect(recipeCreateInputSchema.safeParse(save).success).toBe(false);
  });
  test('baseVersion must be an ISO date', () => {
    const save = { ...FIELDS, body: '' };
    expect(
      recipeSaveInputSchema.safeParse({ ...save, baseVersion: '2026-03-10T12:00:00.000Z' }).success,
    ).toBe(true);
    expect(recipeSaveInputSchema.safeParse({ ...save, baseVersion: 'yesterday' }).success).toBe(
      false,
    );
  });
  test('markdown input needs a non-empty bounded document', () => {
    expect(recipeMarkdownInputSchema.safeParse({ markdown: '' }).success).toBe(false);
    expect(recipeMarkdownInputSchema.safeParse({ markdown: 'x'.repeat(2_000_000) }).success).toBe(
      false,
    );
  });
  test('share tokens are 43 base64url characters', () => {
    expect(shareTokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    for (const bad of [
      'A'.repeat(42),
      'A'.repeat(44),
      `${'A'.repeat(42)}=`,
      `${'A'.repeat(42)}/`,
    ]) {
      expect(shareTokenSchema.safeParse(bad).success).toBe(false);
    }
    expect(recipeCopyInputSchema.safeParse({}).success).toBe(true);
    expect(recipeCopyInputSchema.safeParse({ token: 'short' }).success).toBe(false);
  });
  test('search coerces and bounds the page', () => {
    expect(recipeSearchSchema.parse({})).toEqual({ page: 1, tags: [], scope: 'all' });
    expect(recipeSearchSchema.parse({ page: '3', q: '  tarte ' })).toEqual({
      page: 3,
      q: 'tarte',
      tags: [],
      scope: 'all',
    });
    expect(recipeSearchSchema.parse({ tags: 'dessert, ,vegetarien' }).tags).toEqual([
      'dessert',
      'vegetarien',
    ]);
    for (const page of ['0', '-1', '1.5', '1001', 'abc']) {
      expect(recipeSearchSchema.safeParse({ page }).success).toBe(false);
    }
    expect(recipeSearchSchema.safeParse({ q: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('composeRecipeMarkdown', () => {
  const body = '### Pâte\n\n- 200 g farine\n\n---\n\n1. Cuire [10 min](timer:10m).';
  test('composes a document that parses back to the same fields and body', () => {
    const md = composeRecipeMarkdown(
      { title: 'Tarte', description: 'Une tarte', servings: 4, extraMeta: { temps: '1 h' } },
      body,
      { locale: 'fr' },
    );
    const r = parseRecipe(md);
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    expect(r.document.title).toBe('Tarte');
    expect(r.document.description).toBe('Une tarte');
    expect(r.document.servings).toBe(4);
    expect(r.document.extraMeta).toEqual({ temps: '1 h' });
    expect(serializeBody(r.document, { locale: 'fr' })).toBe(body);
  });
  test('writes no tags line', () => {
    const md = composeRecipeMarkdown(
      { title: 'T', description: '', servings: 2, extraMeta: {}, tags: ['dessert'] },
      body,
      { locale: 'en' },
    );
    expect(md).not.toMatch(/^tags:/im);
  });
  test('the empty body (serializeBody of an empty recipe) still gives a parseable document', () => {
    const md = composeRecipeMarkdown(
      { title: 'T', description: '', servings: 2, extraMeta: {} },
      '---',
      { locale: 'fr' },
    );
    expect(parseRecipe(md).ok).toBe(true);
  });
  test('a hostile title cannot add a field or a part', () => {
    const md = composeRecipeMarkdown(
      { title: 'T # x', description: '', servings: 2, extraMeta: {} },
      body,
      { locale: 'fr' },
    );
    const r = parseRecipe(md);
    if (!r.ok) throw new Error('parse');
    expect(r.document.servings).toBe(2);
    expect(r.document.ingredientGroups.length).toBeGreaterThan(0);
  });
});

describe('recipeIdeaQuerySchema', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const parse = (query: Record<string, unknown>) => recipeIdeaQuerySchema.safeParse(query);

  test('n defaults to 0 and exclude is optional', () => {
    expect(recipeIdeaQuerySchema.parse({ day: '2026-10-22' })).toEqual({ day: '2026-10-22', n: 0 });
  });
  test('n comes as a string from the query string', () => {
    expect(recipeIdeaQuerySchema.parse({ day: '2026-10-22', n: '7' }).n).toBe(7);
  });
  test('n stays within 0 and 1000 and is an integer', () => {
    expect(parse({ day: '2026-10-22', n: '0' }).success).toBe(true);
    expect(parse({ day: '2026-10-22', n: '1000' }).success).toBe(true);
    expect(parse({ day: '2026-10-22', n: '1001' }).success).toBe(false);
    expect(parse({ day: '2026-10-22', n: '-1' }).success).toBe(false);
    expect(parse({ day: '2026-10-22', n: '1.5' }).success).toBe(false);
    expect(parse({ day: '2026-10-22', n: 'abc' }).success).toBe(false);
  });
  test('day must be a real ISO date', () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ day: '' }).success).toBe(false);
    expect(parse({ day: '2026-13-01' }).success).toBe(false);
    expect(parse({ day: '2026-02-30' }).success).toBe(false);
    expect(parse({ day: '22/10/2026' }).success).toBe(false);
    expect(parse({ day: '2026-10-22T10:00:00Z' }).success).toBe(false);
    expect(parse({ day: '2024-02-29' }).success).toBe(true);
    expect(parse({ day: '2026-02-29' }).success).toBe(false);
  });
  test('exclude must be a uuid', () => {
    expect(parse({ day: '2026-10-22', exclude: ID }).success).toBe(true);
    expect(parse({ day: '2026-10-22', exclude: 'not-a-uuid' }).success).toBe(false);
    expect(parse({ day: '2026-10-22', exclude: '' }).success).toBe(false);
  });
});

describe('summary', () => {
  test('a blank summary becomes undefined, a text is kept trimmed', () => {
    expect(recipeFieldsSchema.parse({ ...FIELDS, summary: '   ' }).summary).toBeUndefined();
    expect(recipeFieldsSchema.parse({ ...FIELDS, summary: ' Rapide ' }).summary).toBe('Rapide');
    expect(recipeFieldsSchema.parse(FIELDS).summary).toBeUndefined();
  });
  test('refuses more than 160 characters, accepts exactly 160', () => {
    const ok = recipeFieldsSchema.safeParse({ ...FIELDS, summary: 'a'.repeat(160) });
    expect(ok.success).toBe(true);
    const tooLong = recipeFieldsSchema.safeParse({ ...FIELDS, summary: 'a'.repeat(161) });
    expect(tooLong.success).toBe(false);
  });
  test('refuses line breaks', () => {
    expect(recipeFieldsSchema.safeParse({ ...FIELDS, summary: 'a\nb' }).success).toBe(false);
  });
  test('the summary keys are reserved in extraMeta', () => {
    for (const key of ['summary', 'résumé', 'resume', 'összefoglaló', 'Summary']) {
      expect(extraMetaSchema.safeParse({ [key]: 'x' }).success).toBe(false);
    }
  });
  test('composeRecipeMarkdown writes the summary and it parses back', () => {
    const md = composeRecipeMarkdown(
      { title: 'T', description: '', summary: 'Court.', servings: 2, extraMeta: {} },
      '- a\n\n---\n\n1. b',
      { locale: 'en' },
    );
    expect(md).toContain('summary: Court.');
    const result = parseRecipe(md);
    expect(result.ok && result.document.summary).toBe('Court.');
  });
});

describe('added by link schemas', () => {
  test('the save-link body takes an optional well-formed token and nothing else', () => {
    expect(recipeSaveLinkInputSchema.safeParse({}).success).toBe(true);
    expect(recipeSaveLinkInputSchema.safeParse({ token: 'A'.repeat(43) }).success).toBe(true);
    expect(recipeSaveLinkInputSchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(recipeSaveLinkInputSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
  test('search scope is limited to all, mine and saved and defaults to all', () => {
    expect([...RECIPE_SCOPES]).toEqual(['all', 'mine', 'saved']);
    expect(recipeSearchSchema.parse({ scope: 'saved' }).scope).toBe('saved');
    expect(recipeSearchSchema.safeParse({ scope: 'other' }).success).toBe(false);
  });
});
