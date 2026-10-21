import { describe, expect, test } from 'bun:test';
import { parseRecipe } from './recipe/parse';
import { serializeBody } from './recipe/serialize';
import {
  composeRecipeMarkdown,
  extraMetaSchema,
  recipeCopyInputSchema,
  recipeCreateInputSchema,
  recipeFieldsSchema,
  recipeMarkdownInputSchema,
  recipeSaveInputSchema,
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
    expect(recipeSearchSchema.parse({})).toEqual({ page: 1, tags: [] });
    expect(recipeSearchSchema.parse({ page: '3', q: '  tarte ' })).toEqual({
      page: 3,
      q: 'tarte',
      tags: [],
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
