import { describe, expect, test } from 'bun:test';
import { reviewTags, splitTagValues, type TagCategory } from './tags';

const tag = (id: string, slug: string, labels: Record<string, string>, categoryId = 'c1') => ({
  id,
  slug,
  categoryId,
  position: 0,
  labels,
});

const categories: TagCategory[] = [
  {
    id: 'c1',
    slug: 'dish',
    position: 0,
    multiple: false,
    labels: { en: 'Dish' },
    tags: [
      tag('t1', 'dessert', { fr: 'Dessert', en: 'Dessert' }),
      tag('t2', 'entree', { fr: 'Entrée', en: 'Starter' }),
    ],
  },
  {
    id: 'c2',
    slug: 'cuisine',
    position: 1,
    multiple: true,
    labels: { en: 'Cuisine' },
    tags: [
      tag('t3', 'francaise', { fr: 'Française', en: 'French' }, 'c2'),
      tag('t4', 'fusion-a', { en: 'Fusion' }, 'c2'),
      tag('t5', 'fusion-b', { en: 'Fusion' }, 'c2'),
    ],
  },
];

describe('reviewTags', () => {
  test('by slug, then by label in any language, ignoring case and accents', () => {
    const review = reviewTags(categories, ['DESSERT', 'entrée', 'starter', 'francaise', 'FRENCH']);
    expect(review.recognized.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(review.ambiguous).toEqual([]);
    expect(review.ignored).toEqual([]);
  });
  test('duplicates (also differing by case) are reviewed once', () => {
    const review = reviewTags(categories, ['dessert', 'Dessert', ' DESSERT ', 'nope', 'NOPE']);
    expect(review.recognized.map((t) => t.id)).toEqual(['t1']);
    expect(review.ignored).toEqual(['nope']);
  });
  test('two spellings of the same tag give it once', () => {
    expect(reviewTags(categories, ['entree', 'Starter']).recognized.map((t) => t.id)).toEqual([
      't2',
    ]);
  });
  test('a label shared by several tags is ambiguous', () => {
    const review = reviewTags(categories, ['fusion']);
    expect(review.recognized).toEqual([]);
    expect(review.ambiguous.map((a) => [a.value, a.candidates.map((t) => t.id)])).toEqual([
      ['fusion', ['t4', 't5']],
    ]);
  });
  test('a slug match wins over label matches', () => {
    expect(reviewTags(categories, ['fusion-a']).recognized.map((t) => t.id)).toEqual(['t4']);
  });
  test('unknown, empty and blank values: unknown ones are only listed as ignored', () => {
    expect(reviewTags(categories, ['', '   ', 'pizza'])).toEqual({
      recognized: [],
      ambiguous: [],
      ignored: ['pizza'],
    });
  });
  test('no categories: everything is ignored', () => {
    expect(reviewTags([], ['a', 'b']).ignored).toEqual(['a', 'b']);
  });
});

describe('splitTagValues', () => {
  test('commas and semicolons, trimmed, empty values dropped', () => {
    expect(splitTagValues(' a, b;c ,, ; d ')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitTagValues('')).toEqual([]);
    expect(splitTagValues(' , ; ')).toEqual([]);
  });
  test('a single value with inner spaces stays whole', () => {
    expect(splitTagValues('plat principal')).toEqual(['plat principal']);
  });
});
