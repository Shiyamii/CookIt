import { describe, expect, test } from 'bun:test';
import { unitIndex } from '../units/index-units';
import { parseIngredientLine } from './ingredient';
import { parseInline } from './inline';
import type { IngredientItem } from './model';
import { formatAmount, scaleFactor, scaleIngredient, scaleSegment } from './scale';

const units = unitIndex();
const ingredient = (raw: string): IngredientItem => ({
  kind: 'ingredient',
  line: 1,
  raw,
  ...parseIngredientLine(raw, units),
});
const fr = { locale: 'fr' as const };

describe('formatAmount', () => {
  test.each([
    [0.04, '0,1'],
    [0.33, '0,3'],
    [2.3, '2,5'],
    [7.74, '7,5'],
    [33.4, '33'],
    [133.3, '135'],
    [1001, '1000'],
  ])('decimal %p → %p', (value, text) => {
    expect(formatAmount(value, 'decimal', 'fr')).toBe(text);
  });

  test.each([
    [0.5, '½'],
    [1 / 3, '⅓'],
    [2 / 3, '⅔'],
    [1.25, '1 ¼'],
    [2.75, '2 ¾'],
    [0.125, '⅛'],
    [3, '3'],
    [2.98, '3'],
    [1.4, '1,4'],
    [0.02, '0,1'],
    [22.4, '22 ½'],
  ])('fraction %p → %p', (value, text) => {
    expect(formatAmount(value, 'fraction', 'fr')).toBe(text);
  });

  test('uses the decimal separator of the recipe language', () => {
    expect(formatAmount(1.5, 'decimal', 'en')).toBe('1.5');
    expect(formatAmount(1.5, 'decimal', 'fr')).toBe('1,5');
  });
});

describe('scaleIngredient', () => {
  test('only the number changes, the text is kept as written', () => {
    expect(scaleIngredient(ingredient('250 g de farine'), 2, fr)).toBe('500 g de farine');
    expect(scaleIngredient(ingredient('2 CaS d’huile'), 0.5, fr)).toBe('1 CaS d’huile');
    expect(scaleIngredient(ingredient('1 ½ c. à café de sel'), 1 / 3, fr)).toBe(
      '½ c. à café de sel',
    );
  });

  test('metric units round in decimals, others in fractions', () => {
    expect(scaleIngredient(ingredient('100 g de beurre'), 1 / 3, fr)).toBe('33 g de beurre');
    expect(scaleIngredient(ingredient('1 oignon'), 1 / 3, fr)).toBe('⅓ oignon');
  });

  test('scales both bounds of a range and keeps the separator', () => {
    expect(scaleIngredient(ingredient('2 à 3 gousses d’ail'), 2, fr)).toBe('4 à 6 gousses d’ail');
    expect(scaleIngredient(ingredient('2-3 œufs'), 2, fr)).toBe('4-6 œufs');
  });

  test('lines without a number and a factor of 1 are unchanged', () => {
    expect(scaleIngredient(ingredient('sel, poivre'), 3, fr)).toBe('sel, poivre');
    expect(scaleIngredient(ingredient('1,5 kg de bœuf'), 1, fr)).toBe('1,5 kg de bœuf');
  });

  test('scaleFactor goes from the recipe servings to the wanted ones', () => {
    expect(scaleFactor(4, 6)).toBe(1.5);
  });
});

describe('scaleSegment', () => {
  test('scales q: quantities, never timers', () => {
    const { segments } = parseInline(
      'Ajouter [30 g](q:) de beurre, cuire [10 min](timer:10m).',
      units,
    );
    expect(segments.map((segment) => scaleSegment(segment, 2, fr)).join('|')).toBe(
      'Ajouter |60 g| de beurre, cuire |10 min|.',
    );
  });
});

describe('formatAmount boundaries', () => {
  test.each([
    [0.05, '0,1'],
    [0.149, '0,1'],
    [0.94, '0,9'],
    [0.95, '1'],
    [9.74, '9,5'],
    [9.75, '10'],
    [99.4, '99'],
    [99.5, '100'],
    [999.9, '1000'],
    [1002.5, '1005'],
  ])('decimal %p → %p', (value, text) => {
    expect(formatAmount(value, 'decimal', 'fr')).toBe(text);
  });

  test.each([
    [0.04, '0,1'],
    [0.05, '0,1'],
    [0.95, '1'],
    [0.96, '1'],
    [1.04, '1'],
    [1.96, '2'],
    [0.29, '¼'],
    [0.375, '0,4'],
    [9.75, '9 ¾'],
    [10.24, '10'],
    [10.26, '10 ½'],
    [99.5, '99 ½'],
  ])('fraction %p → %p', (value, text) => {
    expect(formatAmount(value, 'fraction', 'fr')).toBe(text);
  });

  test('English uses a dot and no digit grouping', () => {
    expect(formatAmount(0.94, 'decimal', 'en')).toBe('0.9');
    expect(formatAmount(0.375, 'fraction', 'en')).toBe('0.4');
    expect(formatAmount(12_345, 'decimal', 'en')).toBe('12345');
    expect(formatAmount(12_345, 'decimal', 'fr')).toBe('12345');
  });
});

describe('scaling edge cases', () => {
  const en = { locale: 'en' as const };

  test('a range whose bounds round to the same value is written once', () => {
    expect(scaleIngredient(ingredient('2-2,4 g de sel'), 0.1, fr)).toBe('0,2 g de sel');
  });

  test('a range still scales both bounds when they stay different', () => {
    expect(scaleIngredient(ingredient('2-2,4 g de sel'), 2, fr)).toBe('4-5 g de sel');
  });

  test('the output separator follows the recipe language, not the source text', () => {
    expect(scaleIngredient(ingredient('1,5 kg de bœuf'), 3, en)).toBe('4.5 kg de bœuf');
    expect(scaleIngredient(ingredient('1 ½ cups flour'), 3, en)).toBe('4 ½ cups flour');
  });

  test('a metric unit at the end of the line still rounds in decimals', () => {
    expect(scaleIngredient(ingredient('250 g'), 1 / 3, fr)).toBe('83 g');
  });

  test('continuation lines are kept as written', () => {
    expect(scaleIngredient(ingredient('2 c. à\nsoupe de sel'), 2, fr)).toBe('4 c. à\nsoupe de sel');
  });

  test('a factor of 1 leaves ranges unchanged', () => {
    expect(scaleIngredient(ingredient('2 à 3 gousses d’ail'), 1, fr)).toBe('2 à 3 gousses d’ail');
  });

  test('q: ranges with a unit scale both bounds and keep the separator', () => {
    const [range] = parseInline('[2-3 tbsp](q:)', units).segments;
    const [french] = parseInline('[2 à 3 c. à soupe](q:)', units).segments;
    if (!range || !french) throw new Error('no segment');
    expect(scaleSegment(range, 2, en)).toBe('4-6 tbsp');
    expect(scaleSegment(french, 0.5, fr)).toBe('1 à 1 ½ c. à soupe');
  });

  test('timers are never scaled, whatever the factor', () => {
    const [timer] = parseInline('[1 h 30](timer:1h30m)', units).segments;
    if (!timer) throw new Error('no segment');
    for (const factor of [0.25, 3, 10]) expect(scaleSegment(timer, factor, fr)).toBe('1 h 30');
  });

  test('rounding comes from the catalog given in the options', () => {
    const catalog = [
      { slug: 'g', rounding: 'fraction' as const, labels: { fr: 'g' }, aliases: { fr: ['g'] } },
    ];
    expect(scaleIngredient(ingredient('100 g de beurre'), 1 / 3, { ...fr, units: catalog })).toBe(
      '33 ½ g de beurre',
    );
  });
});
