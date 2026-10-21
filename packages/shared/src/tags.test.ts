import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_TAG_CATEGORIES,
  MAX_RECIPE_TAGS,
  labelFor,
  matchTags,
  recipeTagIdsSchema,
  reorderInputSchema,
  slugSchema,
  tagCategoryInputSchema,
  tagDeleteInputSchema,
  tagInputSchema,
  type TagCategory,
} from './tags';
import { DEFAULT_UNITS } from './units/catalog';
import { unitInputSchema } from './units/unit';

const UUID = '0b8f3c1e-5d2a-4f6b-8a7c-1234567890ab';

describe('slugSchema', () => {
  test.each(['dessert', 'plat-principal', 'a1', 'x'])('accepts %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });
  test.each(['', 'Dessert', 'a--b', '-a', 'a-', 'a b', 'é', 'a\nb', 'a'.repeat(51)])(
    'refuses %j',
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe('tag input schemas', () => {
  test('a category needs a slug, a label and the multiple flag, and refuses extra keys', () => {
    const ok = { slug: 'diet', labels: { fr: 'Régime' }, multiple: true };
    expect(tagCategoryInputSchema.safeParse(ok).success).toBe(true);
    expect(tagCategoryInputSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(tagCategoryInputSchema.safeParse({ ...ok, labels: {} }).success).toBe(false);
    expect(tagCategoryInputSchema.safeParse({ ...ok, multiple: undefined }).success).toBe(false);
  });

  test('a tag needs a uuid category and refuses unknown languages and control characters', () => {
    const ok = { slug: 'vegan', categoryId: UUID, labels: { en: 'Vegan' } };
    expect(tagInputSchema.safeParse(ok).success).toBe(true);
    expect(tagInputSchema.safeParse({ ...ok, categoryId: 'x' }).success).toBe(false);
    expect(tagInputSchema.safeParse({ ...ok, labels: { de: 'Vegan' } }).success).toBe(false);
    expect(tagInputSchema.safeParse({ ...ok, labels: { en: 'a\nb' } }).success).toBe(false);
    for (const sep of [' ', ' ']) {
      expect(tagInputSchema.safeParse({ ...ok, labels: { en: `a${sep}b` } }).success).toBe(false);
    }
    expect(tagInputSchema.safeParse({ ...ok, labels: { en: 'x'.repeat(101) } }).success).toBe(
      false,
    );
  });

  test('reorder needs 1 to 500 uuids', () => {
    expect(reorderInputSchema.safeParse({ ids: [UUID] }).success).toBe(true);
    expect(reorderInputSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(reorderInputSchema.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(reorderInputSchema.safeParse({ ids: Array(501).fill(UUID) }).success).toBe(false);
  });

  test('tag deletion accepts confirm or mergeInto only', () => {
    expect(tagDeleteInputSchema.safeParse({}).success).toBe(true);
    expect(tagDeleteInputSchema.safeParse({ confirm: true }).success).toBe(true);
    expect(tagDeleteInputSchema.safeParse({ mergeInto: UUID }).success).toBe(true);
    expect(tagDeleteInputSchema.safeParse({ mergeInto: 'x' }).success).toBe(false);
    expect(tagDeleteInputSchema.safeParse({ confirm: 'yes' }).success).toBe(false);
    expect(tagDeleteInputSchema.safeParse({ other: 1 }).success).toBe(false);
  });

  test('a recipe has at most MAX_RECIPE_TAGS tag ids', () => {
    expect(recipeTagIdsSchema.safeParse(Array(MAX_RECIPE_TAGS).fill(UUID)).success).toBe(true);
    expect(recipeTagIdsSchema.safeParse(Array(MAX_RECIPE_TAGS + 1).fill(UUID)).success).toBe(false);
  });
});

describe('unitInputSchema', () => {
  const ok = {
    slug: 'tbsp',
    rounding: 'fraction',
    labels: { en: 'tablespoon' },
    aliases: { en: ['tbsp'] },
  };
  test('accepts a unit and every default unit', () => {
    expect(unitInputSchema.safeParse(ok).success).toBe(true);
    for (const unit of DEFAULT_UNITS) {
      expect(unitInputSchema.safeParse(unit).success, unit.slug).toBe(true);
    }
  });
  test('refuses extra keys, bad rounding, bad slug, missing labels', () => {
    expect(unitInputSchema.safeParse({ ...ok, id: 'x' }).success).toBe(false);
    expect(unitInputSchema.safeParse({ ...ok, rounding: 'round' }).success).toBe(false);
    expect(unitInputSchema.safeParse({ ...ok, slug: 'Tbsp' }).success).toBe(false);
    expect(unitInputSchema.safeParse({ ...ok, labels: {} }).success).toBe(false);
  });
  test('refuses aliases without letter or digit, too long, too many, or with control characters', () => {
    expect(unitInputSchema.safeParse({ ...ok, aliases: { en: ['. .'] } }).success).toBe(false);
    expect(unitInputSchema.safeParse({ ...ok, aliases: { en: ['x'.repeat(51)] } }).success).toBe(
      false,
    );
    expect(unitInputSchema.safeParse({ ...ok, aliases: { en: Array(51).fill('a') } }).success).toBe(
      false,
    );
    expect(unitInputSchema.safeParse({ ...ok, aliases: { en: ['a\u0000'] } }).success).toBe(false);
  });
  test('accepts no aliases at all', () => {
    expect(unitInputSchema.safeParse({ ...ok, aliases: {} }).success).toBe(true);
  });
});

describe('labelFor', () => {
  test('uses the interface language first', () => {
    expect(labelFor({ fr: 'Dessert', en: 'Sweet' }, 'en', 'dessert')).toBe('Sweet');
    expect(labelFor({ fr: 'Dessert', en: 'Sweet' }, 'fr', 'dessert')).toBe('Dessert');
  });
  test('falls back to the other language, then to the slug', () => {
    expect(labelFor({ fr: 'Dessert' }, 'en', 'dessert')).toBe('Dessert');
    expect(labelFor({ en: 'Sweet' }, 'fr', 'dessert')).toBe('Sweet');
    expect(labelFor({}, 'fr', 'dessert')).toBe('dessert');
  });
  test('an empty label is skipped', () => {
    expect(labelFor({ en: '', fr: 'Dessert' }, 'en', 'x')).toBe('Dessert');
  });
});

describe('matchTags', () => {
  const categories: TagCategory[] = [
    {
      id: 'c1',
      slug: 'diet',
      position: 0,
      multiple: true,
      labels: { en: 'Diet' },
      tags: [
        {
          id: 't1',
          slug: 'vegetarien',
          categoryId: 'c1',
          position: 0,
          labels: { fr: 'Végétarien', en: 'Vegetarian' },
        },
        { id: 't2', slug: 'vegan', categoryId: 'c1', position: 1, labels: { en: 'Vegan' } },
      ],
    },
  ];
  test('matches a slug exactly', () => {
    expect(matchTags(categories, 'vegan').map((t) => t.id)).toEqual(['t2']);
  });
  test('matches a label in any language, ignoring case and accents', () => {
    expect(matchTags(categories, 'VÉGÉTARIEN').map((t) => t.id)).toEqual(['t1']);
    expect(matchTags(categories, '  vegetarian ').map((t) => t.id)).toEqual(['t1']);
  });
  test('does not match partial words, empty or unknown values', () => {
    expect(matchTags(categories, 'veg')).toEqual([]);
    expect(matchTags(categories, '   ')).toEqual([]);
    expect(matchTags(categories, 'dessert')).toEqual([]);
  });
});

describe('DEFAULT_TAG_CATEGORIES', () => {
  test('are valid inputs with unique slugs', () => {
    const slugs = new Set<string>();
    for (const c of DEFAULT_TAG_CATEGORIES) {
      const category = { slug: c.slug, labels: c.labels, multiple: c.multiple };
      expect(tagCategoryInputSchema.safeParse(category).success, c.slug).toBe(true);
      for (const t of c.tags) {
        const input = { slug: t.slug, categoryId: UUID, labels: t.labels };
        expect(tagInputSchema.safeParse(input).success, t.slug).toBe(true);
        expect(slugs.has(t.slug), t.slug).toBe(false);
        slugs.add(t.slug);
      }
    }
  });
});
