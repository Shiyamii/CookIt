import { describe, expect, test } from 'bun:test';
import { isLocale } from './index';

describe('isLocale', () => {
  test('accepts supported locales', () => {
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('en')).toBe(true);
  });

  test('rejects unsupported values', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale('FR')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  test('rejects padded strings, regional variants and non-string values', () => {
    for (const value of [' fr', 'en ', 'fr-FR', 'en_US', '', null, 1, ['fr'], { fr: true }]) {
      expect(isLocale(value)).toBe(false);
    }
  });
});
