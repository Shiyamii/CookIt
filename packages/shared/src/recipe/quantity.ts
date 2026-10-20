import type { Amount, Quantity } from './model';

const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

const VULGAR = `[${Object.keys(VULGAR_FRACTIONS).join('')}]`;
// `1 ½`, `1½`, `1 1/2`, `1/2`, `1.5`, `1,5`, `12`, `½`. Digit runs are bounded: no backtracking blowup.
const NUMBER = `(?:\\d{1,6}(?:[ \\t]*${VULGAR}|[ \\t]+\\d{1,6}\\/\\d{1,6})|\\d{1,6}\\/\\d{1,6}|\\d{1,6}(?:[.,]\\d{1,6})?|${VULGAR})`;
// A quantity at the start of the text, optionally a range (`2-3`, `2 à 3`, `2 a 3`, `2 to 3`),
// followed by a space, a letter (`250g`) or the end.
const QUANTITY = new RegExp(
  `^(${NUMBER})(?:([ \\t]*(?:-|–|—|à|a|to)[ \\t]*)(${NUMBER}))?(?=[\\s\\p{L}]|$)`,
  'u',
);

/** Value of one written number (`1 ½`, `1/2`, `1,5`…), or undefined if it is not one. */
export function numberValue(text: string): number | undefined {
  const parts = text.trim().split(/[ \t]+/);
  let total = 0;
  for (const part of parts) {
    const vulgar = VULGAR_FRACTIONS[part.slice(-1)];
    const integer = vulgar === undefined ? part : part.slice(0, -1);
    if (vulgar !== undefined) total += vulgar;
    if (!integer) continue;
    const [numerator, denominator] = integer.split('/');
    if (denominator !== undefined) {
      const value = Number(numerator) / Number(denominator);
      if (!Number.isFinite(value)) return undefined;
      total += value;
    } else {
      total += Number(integer.replace(',', '.'));
    }
  }
  return Number.isFinite(total) ? total : undefined;
}

/** The quantity written at the start of `text`, if any (positions relative to `text`). */
export function parseQuantity(text: string): Quantity | undefined {
  const match = QUANTITY.exec(text);
  if (!match) return undefined;
  const [all, min = '', separator, max] = match;
  const value = numberValue(min);
  if (value === undefined || value <= 0) return undefined;
  const amount: Amount = { value };
  if (max !== undefined && separator !== undefined) {
    const maxValue = numberValue(max);
    // `3-2` or `2-2` is not a usable range: scaling only one bound would print nonsense (`6-2`),
    // so the line is left as written.
    if (maxValue === undefined || maxValue <= value) return undefined;
    amount.max = maxValue;
    return { start: 0, end: all.length, amount, separator };
  }
  return { start: 0, end: min.length, amount };
}
