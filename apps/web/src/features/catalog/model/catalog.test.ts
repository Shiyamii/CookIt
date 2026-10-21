import { describe, expect, test } from 'bun:test';
import { moved, parseAliases, slugFromLabel } from './catalog';

describe('parseAliases', () => {
  test('splits on newlines and commas, trims, drops empties', () => {
    expect(parseAliases('tbsp, tablespoon\n  T  ,, \n')).toEqual(['tbsp', 'tablespoon', 'T']);
  });
  test('removes exact duplicates but keeps different cases', () => {
    expect(parseAliases('a, a, A')).toEqual(['a', 'A']);
  });
  test('empty text gives no alias', () => {
    expect(parseAliases('')).toEqual([]);
    expect(parseAliases(' , \n ')).toEqual([]);
  });
  test('keeps dots and spaces inside an alias', () => {
    expect(parseAliases('c. à soupe')).toEqual(['c. à soupe']);
  });
});

describe('moved', () => {
  const ids = ['a', 'b', 'c'];
  test('moves up and down', () => {
    expect(moved(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moved(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
  });
  test('is unchanged at the ends and for an unknown id', () => {
    expect(moved(ids, 'a', -1)).toEqual(ids);
    expect(moved(ids, 'c', 1)).toEqual(ids);
    expect(moved(ids, 'z', 1)).toEqual(ids);
  });
  test('does not mutate its input and always returns a new array', () => {
    expect(moved(ids, 'a', 1)).not.toBe(ids);
    expect(moved(ids, 'a', -1)).not.toBe(ids);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('slugFromLabel', () => {
  test('lowercases, strips accents and dashes words', () => {
    expect(slugFromLabel('Plat principal')).toBe('plat-principal');
    expect(slugFromLabel('Petit-déjeuner')).toBe('petit-dejeuner');
  });
  test('collapses punctuation and trims dashes', () => {
    expect(slugFromLabel('  --Hello,   World!! ')).toBe('hello-world');
  });
  test('gives an empty slug when nothing usable remains', () => {
    expect(slugFromLabel('!!!')).toBe('');
    expect(slugFromLabel('')).toBe('');
  });
  test('is at most 50 characters and never ends with a dash', () => {
    const slug = slugFromLabel(`${'a'.repeat(49)} bbb`);
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toBe('a'.repeat(49));
  });
});
