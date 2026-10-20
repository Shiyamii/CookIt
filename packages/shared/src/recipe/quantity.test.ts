import { describe, expect, test } from 'bun:test';
import { unitIndex } from '../units/index-units';
import { parseIngredientLine } from './ingredient';
import { numberValue, parseQuantity } from './quantity';

describe('parseQuantity', () => {
  test.each([
    ['2 œufs', 2, '2'],
    ['1.5 kg', 1.5, '1.5'],
    ['1,5 kg', 1.5, '1,5'],
    ['1/2 citron', 0.5, '1/2'],
    ['½ citron', 0.5, '½'],
    ['1 ½ c. à café', 1.5, '1 ½'],
    ['1½ tasse', 1.5, '1½'],
    ['1 1/2 tasse', 1.5, '1 1/2'],
    ['250g de farine', 250, '250'],
    ['3', 3, '3'],
  ])('%p reads %p', (text, value, written) => {
    const quantity = parseQuantity(text);
    expect(quantity?.amount).toEqual({ value });
    expect(text.slice(quantity?.start, quantity?.end)).toBe(written);
  });

  test.each([
    ['2-3 gousses', '-'],
    ['2 - 3 gousses', ' - '],
    ['2–3 gousses', '–'],
    ['2 à 3 gousses', ' à '],
    ['2 to 3 cloves', ' to '],
  ])('reads the range %p and keeps its separator', (text, separator) => {
    expect(parseQuantity(text)).toMatchObject({ amount: { value: 2, max: 3 }, separator });
  });

  test('an inverted range is not a quantity (the line is never half-scaled)', () => {
    expect(parseQuantity('3-2 œufs')).toBeUndefined();
  });

  test.each(['sel, poivre', 'une pincée', '0 g', '2. Cuire', '2)', '1/0 g', '', '-1 œuf'])(
    'no quantity in %p',
    (text) => {
      expect(parseQuantity(text)).toBeUndefined();
    },
  );

  test('numberValue reads mixed numbers', () => {
    expect(numberValue('2 ¾')).toBe(2.75);
    expect(numberValue('3/4')).toBe(0.75);
  });

  test('stays fast on long digit runs', () => {
    const started = performance.now();
    parseQuantity(`${'1'.repeat(100_000)} g`);
    parseQuantity(`1 ${' '.repeat(100_000)}x`);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('parseIngredientLine', () => {
  const units = unitIndex();

  test.each([
    ['250 g de farine', 'g', 'farine'],
    ['2 c. à soupe d’huile', 'cuillere-a-soupe', 'huile'],
    ["2 CaS d'huile", 'cuillere-a-soupe', 'huile'],
    ['1 c.à.s de sucre', 'cuillere-a-soupe', 'sucre'],
    ['2 cuillères à soupe de miel', 'cuillere-a-soupe', 'miel'],
    ['3 gousses d’ail', 'gousse', 'ail'],
    ['1 cup of flour', 'tasse', 'flour'],
    ['2 tbsp olive oil', 'cuillere-a-soupe', 'olive oil'],
    ['50 cl de lait', 'cl', 'lait'],
    ['1 l d’eau', 'l', 'eau'],
  ])('%p: unit %p, name %p', (raw, slug, name) => {
    const line = parseIngredientLine(raw, units);
    expect(line.unit?.slug).toBe(slug);
    expect(line.name).toBe(name);
    expect(raw.slice(line.unit?.start, line.unit?.end).trim()).not.toBe('');
  });

  test('an unknown word is part of the name', () => {
    expect(parseIngredientLine('4 œufs', units)).toEqual({
      quantity: { start: 0, end: 1, amount: { value: 4 } },
      name: 'œufs',
    });
    expect(parseIngredientLine('2 lardons', units).unit).toBeUndefined();
  });

  test('a unit word with nothing after is also the name, and keeps its unit (rounding)', () => {
    expect(parseIngredientLine('3 gousses', units)).toMatchObject({
      name: 'gousses',
      unit: { slug: 'gousse' },
    });
  });

  test('a line without number is all name', () => {
    expect(parseIngredientLine('sel, poivre', units)).toEqual({ name: 'sel, poivre' });
    expect(parseIngredientLine('une pincée de sel', units)).toEqual({ name: 'une pincée de sel' });
  });
});

describe('parseQuantity edge cases', () => {
  test.each([
    ['0,5 l de lait', 0.5, '0,5'],
    ['00,5 l', 0.5, '00,5'],
    ['999999 g', 999999, '999999'],
    ['1 ½ ½ tasse', 1.5, '1 ½'],
    ['2x plus', 2, '2'],
  ])('%p reads %p from %p', (text, value, written) => {
    const quantity = parseQuantity(text);
    expect(quantity?.amount).toEqual({ value });
    expect(text.slice(quantity?.start, quantity?.end)).toBe(written);
  });

  test.each([
    ['1 ½-2 tasses', { value: 1.5, max: 2 }, '1 ½-2'],
    ['2-3,5 kg', { value: 2, max: 3.5 }, '2-3,5'],
    ['1 1/2-2 1/2 tasses', { value: 1.5, max: 2.5 }, '1 1/2-2 1/2'],
    ['½ - ¾ tasse', { value: 0.5, max: 0.75 }, '½ - ¾'],
    ['1/2-3/4 tasse', { value: 0.5, max: 0.75 }, '1/2-3/4'],
  ])('reads the range %p', (text, amount, written) => {
    const quantity = parseQuantity(text);
    expect(quantity?.amount).toEqual(amount);
    expect(text.slice(quantity?.start, quantity?.end)).toBe(written);
  });

  test('a range with equal bounds is not a quantity', () => {
    expect(parseQuantity('2-2 œufs')).toBeUndefined();
  });

  test('`a` without accent and an em dash are range separators too', () => {
    expect(parseQuantity('2 a 3 œufs')).toMatchObject({
      amount: { value: 2, max: 3 },
      separator: ' a ',
    });
    expect(parseQuantity('2—3 œufs')).toMatchObject({
      amount: { value: 2, max: 3 },
      separator: '—',
    });
    expect(parseQuantity('2 abricots')).toEqual({ start: 0, end: 1, amount: { value: 2 } });
  });

  test.each([
    '.5 l',
    '1/2/3 tasse',
    '½½ tasse',
    '1,5,6 g',
    '1234567 g',
    '٣ œufs',
    '３ g',
    '0,0 g',
    '2.',
    '2,',
  ])('no quantity in %p', (text) => {
    expect(parseQuantity(text)).toBeUndefined();
  });

  test('numberValue rejects malformed numbers', () => {
    expect(numberValue('½½')).toBeUndefined();
    expect(numberValue('1,5,6')).toBeUndefined();
  });
});

describe('parseIngredientLine edge cases', () => {
  const units = unitIndex();

  test.each(['250 g', '2 c. à soupe', '1 cup'])(
    'a unit at the end of the line is the name and still the unit (%p)',
    (raw) => {
      const line = parseIngredientLine(raw, units);
      expect(line.unit).toBeDefined();
      expect(line.name).toBe(raw.slice(line.quantity?.end).trim());
    },
  );

  test('a unit glued to the number is read (`250g de farine`)', () => {
    expect(parseIngredientLine('250g de farine', units)).toMatchObject({
      unit: { start: 3, end: 4, slug: 'g' },
      name: 'farine',
    });
  });

  test('a unit followed by a dot is read (`2 g. de sel`)', () => {
    expect(parseIngredientLine('2 g. de sel', units)).toMatchObject({
      unit: { slug: 'g' },
      name: 'sel',
    });
  });

  test('a comma glued to the unit hides it; the text stays in the name', () => {
    const line = parseIngredientLine('2 g, de sel', units);
    expect(line.unit).toBeUndefined();
    expect(line.name).toBe('g, de sel');
  });

  test('a unit is matched whatever its case', () => {
    expect(parseIngredientLine('2 G de sel', units).unit?.slug).toBe('g');
  });

  test('a multi-word alias can span a continuation line', () => {
    const raw = '2 c. à\nsoupe de sel';
    const line = parseIngredientLine(raw, units);
    expect(line.unit).toEqual({ start: 2, end: 12, slug: 'cuillere-a-soupe' });
    expect(line.name).toBe('sel');
  });

  test('the connector is stripped when the name starts on a continuation line', () => {
    expect(parseIngredientLine('2 tasses\nde lait', units).name).toBe('lait');
  });

  test('the connector is stripped when the name continues on the next line', () => {
    expect(parseIngredientLine('2 g de\nsel', units).name).toBe('sel');
    expect(parseIngredientLine('1 cup of\nmilk', units).name).toBe('milk');
  });

  test('a connector alone after the unit is the name', () => {
    expect(parseIngredientLine('2 g de', units)).toMatchObject({ unit: { slug: 'g' }, name: 'de' });
  });

  test('a connector without unit is kept in the name', () => {
    expect(parseIngredientLine('2 de sel', units).name).toBe('de sel');
  });
});
