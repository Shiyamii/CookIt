import { describe, expect, test } from 'bun:test';
import { type Unit, unitSchema } from './unit';

const tbsp: Unit = {
  slug: 'cuillere-a-soupe',
  rounding: 'fraction',
  labels: { fr: 'cuillère à soupe', en: 'tablespoon' },
  aliases: { fr: ['c. à soupe', 'CaS', 'c.à.s'], en: ['tbsp', 'tablespoon'] },
};

const withSlug = (slug: unknown) => unitSchema.safeParse({ ...tbsp, slug });
const withAliases = (aliases: unknown) => unitSchema.safeParse({ ...tbsp, aliases });

describe('unitSchema', () => {
  test('accepts a complete unit', () => {
    expect(unitSchema.parse(tbsp)).toEqual(tbsp);
  });

  test('accepts both rounding modes and rejects others', () => {
    expect(unitSchema.safeParse({ ...tbsp, rounding: 'decimal' }).success).toBe(true);
    expect(unitSchema.safeParse({ ...tbsp, rounding: 'integer' }).success).toBe(false);
  });

  test('accepts valid slugs', () => {
    for (const slug of ['g', 'ml', 'cuillere-a-soupe', 'a1-b2', '10', 'a'.repeat(50)]) {
      expect(withSlug(slug).success).toBe(true);
    }
  });

  test('rejects invalid slugs', () => {
    for (const slug of [
      '',
      'a'.repeat(51),
      'Tbsp',
      'cuillère',
      'c_a_s',
      'c a s',
      '-g',
      'g-',
      'a--b',
      'c.a.s',
      ' g',
      1,
    ]) {
      expect(withSlug(slug).success).toBe(false);
    }
  });

  test('requires at least one label', () => {
    expect(unitSchema.safeParse({ ...tbsp, labels: {} }).success).toBe(false);
  });

  test('rejects missing fields', () => {
    for (const key of ['slug', 'rounding', 'labels', 'aliases'] as const) {
      const partial: Record<string, unknown> = { ...tbsp };
      delete partial[key];
      expect(unitSchema.safeParse(partial).success).toBe(false);
    }
  });

  test('accepts no aliases, or an empty list for a locale', () => {
    expect(withAliases({}).success).toBe(true);
    expect(withAliases({ fr: [] }).success).toBe(true);
  });

  test('rejects aliases for an unknown locale', () => {
    expect(withAliases({ de: ['EL'] }).success).toBe(false);
  });

  test('trims aliases', () => {
    const result = unitSchema.parse({ ...tbsp, aliases: { en: ['  tbsp ', '\ttablespoon'] } });
    expect(result.aliases).toEqual({ en: ['tbsp', 'tablespoon'] });
  });

  test('rejects an empty or whitespace-only alias', () => {
    expect(withAliases({ en: [''] }).success).toBe(false);
    expect(withAliases({ en: ['  '] }).success).toBe(false);
  });

  test('accepts aliases up to 50 characters and rejects 51', () => {
    expect(withAliases({ en: ['a'.repeat(50)] }).success).toBe(true);
    expect(withAliases({ en: [` ${'a'.repeat(50)} `] }).success).toBe(true);
    expect(withAliases({ en: ['a'.repeat(51)] }).success).toBe(false);
  });

  test('accepts up to 50 aliases per locale and rejects 51', () => {
    const aliases = (count: number) => Array.from({ length: count }, (_, i) => `alias${i}`);
    expect(withAliases({ en: aliases(50) }).success).toBe(true);
    expect(withAliases({ en: aliases(51) }).success).toBe(false);
  });

  test('rejects aliases given as a string instead of a list', () => {
    expect(withAliases({ en: 'tbsp' }).success).toBe(false);
  });
});
