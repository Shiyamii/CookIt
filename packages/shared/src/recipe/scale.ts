import { isLocale, type Locale } from '../locale';
import { unitIndex } from '../units/index-units';
import type { Unit, UnitRounding } from '../units/unit';
import type { IngredientItem, InlineSegment, Quantity } from './model';
import { MAX_SERVINGS } from './presentation';

export type ScaleOptions = {
  /** Language of the recipe text: decimal separator (`1,5` in French). */
  locale: Locale;
  /** Unit catalog, for the rounding of each unit; defaults to the built-in catalog. */
  units?: readonly Unit[];
};

const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

/**
 * Multiplier from the recipe's servings to the wanted servings. Anything but whole numbers from 1
 * to MAX_SERVINGS gives 1 (no scaling) rather than `Infinity`, `NaN` or `0`.
 */
export function scaleFactor(recipeServings: number, wantedServings: number): number {
  const valid = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_SERVINGS;
  return valid(recipeServings) && valid(wantedServings) ? wantedServings / recipeServings : 1;
}

/**
 * A readable number: `decimal` (metric units) rounds to 0.1 below 1, 0.5 below 10, 1 below 100,
 * then 5; `fraction` (cooking units, no unit) uses ½ ⅓ ⅔ ¼ ¾ ⅛ when close, else one decimal.
 */
export function formatAmount(value: number, rounding: UnitRounding, locale: Locale): string {
  return rounding === 'decimal'
    ? formatDecimal(roundDecimal(value), locale)
    : formatFraction(value, locale);
}

function roundDecimal(value: number): number {
  if (value < 1) return Math.max(0.1, Math.round(value * 10) / 10);
  if (value < 10) return Math.round(value * 2) / 2;
  if (value < 100) return Math.round(value);
  return Math.round(value / 5) * 5;
}

const formatters = new Map<Locale, Intl.NumberFormat>();

function formatDecimal(value: number, locale: Locale): string {
  // `Locale` is only a compile-time type: an unchecked value (`?lang=…`) falls back to French
  // instead of throwing or printing digits the parser cannot read back.
  const safe = isLocale(locale) ? locale : 'fr';
  let formatter = formatters.get(safe);
  if (!formatter) {
    formatter = new Intl.NumberFormat(safe, { maximumFractionDigits: 2, useGrouping: false });
    formatters.set(safe, formatter);
  }
  return formatter.format(value);
}

function formatFraction(value: number, locale: Locale): string {
  const rounded = value >= 10 ? Math.round(value * 2) / 2 : value;
  const integer = Math.floor(rounded);
  const rest = rounded - integer;
  if (rest > 0.95) return String(integer + 1);
  if (rest < 0.05) {
    return integer > 0
      ? String(integer)
      : formatDecimal(Math.max(0.1, Math.round(value * 10) / 10), locale);
  }
  const fraction = FRACTIONS.find(([fractionValue]) => Math.abs(rest - fractionValue) <= 0.04);
  if (fraction) return integer > 0 ? `${integer} ${fraction[1]}` : fraction[1];
  return formatDecimal(Math.round(rounded * 10) / 10, locale);
}

/** `text` with its quantity multiplied by `factor`; the rest of the text is never touched. */
function scaleText(
  text: string,
  quantity: Quantity,
  rounding: UnitRounding,
  factor: number,
  locale: Locale,
): string {
  if (factor === 1) return text;
  const min = formatAmount(quantity.amount.value * factor, rounding, locale);
  const max =
    quantity.amount.max === undefined
      ? undefined
      : formatAmount(quantity.amount.max * factor, rounding, locale);
  const scaled =
    max === undefined || max === min ? min : `${min}${quantity.separator ?? '-'}${max}`;
  return text.slice(0, quantity.start) + scaled + text.slice(quantity.end);
}

/** The ingredient line for `factor` times the servings. Lines without a number are unchanged. */
export function scaleIngredient(
  item: IngredientItem,
  factor: number,
  options: ScaleOptions,
): string {
  if (!item.quantity) return item.raw;
  const rounding = unitIndex(options.units).rounding(item.unit?.slug);
  return scaleText(item.raw, item.quantity, rounding, factor, options.locale);
}

/** Text of a step segment for `factor`: only `q:` quantities change, timers never do. */
export function scaleSegment(
  segment: InlineSegment,
  factor: number,
  options: ScaleOptions,
): string {
  if (segment.kind !== 'quantity') return segment.text;
  const rounding = unitIndex(options.units).rounding(segment.unit?.slug);
  return scaleText(segment.text, segment.quantity, rounding, factor, options.locale);
}
