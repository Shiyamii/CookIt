import { describe, expect, test } from 'bun:test';
import { localizedLabelsSchema } from './labels';

describe('localizedLabelsSchema', () => {
  test('accepts labels in every supported locale', () => {
    expect(localizedLabelsSchema.parse({ fr: 'Végétarien', en: 'Vegetarian' })).toEqual({
      fr: 'Végétarien',
      en: 'Vegetarian',
    });
  });

  test('accepts a single locale', () => {
    expect(localizedLabelsSchema.safeParse({ en: 'Dessert' }).success).toBe(true);
  });

  test('rejects an empty object', () => {
    expect(localizedLabelsSchema.safeParse({}).success).toBe(false);
  });

  test('rejects an unknown locale key, alone or next to a valid one', () => {
    expect(localizedLabelsSchema.safeParse({ de: 'Nachtisch' }).success).toBe(false);
    expect(localizedLabelsSchema.safeParse({ fr: 'Dessert', de: 'Nachtisch' }).success).toBe(false);
    expect(localizedLabelsSchema.safeParse({ FR: 'Dessert' }).success).toBe(false);
  });

  test('trims labels', () => {
    expect(localizedLabelsSchema.parse({ fr: '  Dessert \t' })).toEqual({ fr: 'Dessert' });
  });

  test('rejects an empty or whitespace-only label', () => {
    expect(localizedLabelsSchema.safeParse({ fr: '' }).success).toBe(false);
    expect(localizedLabelsSchema.safeParse({ fr: '   ' }).success).toBe(false);
  });

  test('accepts 100 characters and rejects 101, counted after trimming', () => {
    expect(localizedLabelsSchema.safeParse({ fr: 'a'.repeat(100) }).success).toBe(true);
    expect(localizedLabelsSchema.safeParse({ fr: ` ${'a'.repeat(100)} ` }).success).toBe(true);
    expect(localizedLabelsSchema.safeParse({ fr: 'a'.repeat(101) }).success).toBe(false);
  });

  test('rejects control and bidi override characters', () => {
    for (const code of [0x00, 0x07, 0x1b, 0x7f, 0x202e, 0x2066, 0x200e]) {
      const label = `Des${String.fromCharCode(code)}sert`;
      expect(localizedLabelsSchema.safeParse({ fr: label }).success).toBe(false);
    }
    expect(localizedLabelsSchema.safeParse({ fr: 'Crème brûlée 🍮' }).success).toBe(true);
  });

  test('rejects non-string labels and non-object values', () => {
    for (const value of [{ fr: 1 }, { fr: null }, ['Dessert'], 'Dessert', null, undefined]) {
      expect(localizedLabelsSchema.safeParse(value).success).toBe(false);
    }
  });
});
