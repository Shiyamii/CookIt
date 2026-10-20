import { describe, expect, test } from 'bun:test';
import { fold } from './text';

describe('fold', () => {
  test('lowercases and removes Latin accents', () => {
    expect(fold('ÉTIQUETTES')).toBe('etiquettes');
    expect(fold('Crème Brûlée à la Noël')).toBe('creme brulee a la noel');
    expect(fold('Ñandú Ça Ångström')).toBe('nandu ca angstrom');
  });

  test('gives the same result for composed (NFC) and decomposed (NFD) input', () => {
    expect(fold('é')).toBe('e');
    expect(fold('é')).toBe('e');
    expect(fold('Durée'.normalize('NFD'))).toBe(fold('Durée'.normalize('NFC')));
  });

  test('handles Greek and Cyrillic', () => {
    expect(fold('ΆΛΑΣ')).toBe('αλας');
    expect(fold('Йогурт')).toBe('иогурт');
    expect(fold('Ёлка')).toBe('елка');
  });

  test('keeps letters that have no canonical decomposition', () => {
    expect(fold('Straße')).toBe('straße');
    expect(fold('Œuf')).toBe('œuf');
    expect(fold('Øre')).toBe('øre');
    expect(fold('Łódź')).toBe('łodz');
  });

  test('leaves caseless scripts without combining marks unchanged', () => {
    expect(fold('塩')).toBe('塩');
    expect(fold('ملح')).toBe('ملح');
  });

  test('keeps digits, punctuation and whitespace', () => {
    expect(fold('Temps-total_2 : 1 h')).toBe('temps-total_2 : 1 h');
  });

  test('returns an empty string for an empty string', () => {
    expect(fold('')).toBe('');
  });
});
