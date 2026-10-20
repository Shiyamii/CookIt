import type { Unit } from './unit';

/**
 * Default unit catalog: seeds the `units` table and is used when no catalog is given (tests,
 * tooling). The admin edits the real catalog in the app. Plurals ending in `s` are matched
 * automatically; irregular plurals are listed.
 */
export const DEFAULT_UNITS: Unit[] = [
  // Metric: rounded in decimals.
  {
    slug: 'mg',
    rounding: 'decimal',
    labels: { fr: 'milligramme', en: 'milligram' },
    aliases: { fr: ['mg', 'milligramme'], en: ['milligram'] },
  },
  {
    slug: 'g',
    rounding: 'decimal',
    labels: { fr: 'gramme', en: 'gram' },
    aliases: { fr: ['g', 'gr', 'gramme'], en: ['gram'] },
  },
  {
    slug: 'kg',
    rounding: 'decimal',
    labels: { fr: 'kilogramme', en: 'kilogram' },
    aliases: { fr: ['kg', 'kilo', 'kilogramme'], en: ['kilogram'] },
  },
  {
    slug: 'ml',
    rounding: 'decimal',
    labels: { fr: 'millilitre', en: 'milliliter' },
    aliases: { fr: ['ml', 'millilitre'], en: ['milliliter'] },
  },
  {
    slug: 'cl',
    rounding: 'decimal',
    labels: { fr: 'centilitre', en: 'centiliter' },
    aliases: { fr: ['cl', 'centilitre'], en: ['centiliter'] },
  },
  {
    slug: 'dl',
    rounding: 'decimal',
    labels: { fr: 'décilitre', en: 'deciliter' },
    aliases: { fr: ['dl', 'décilitre'], en: ['deciliter'] },
  },
  {
    slug: 'l',
    rounding: 'decimal',
    labels: { fr: 'litre', en: 'liter' },
    aliases: { fr: ['l', 'litre'], en: ['liter'] },
  },
  {
    slug: 'oz',
    rounding: 'decimal',
    labels: { fr: 'once', en: 'ounce' },
    aliases: { fr: ['once'], en: ['oz', 'ounce'] },
  },
  // Cooking and count units: rounded in fractions.
  {
    slug: 'lb',
    rounding: 'fraction',
    labels: { fr: 'livre', en: 'pound' },
    aliases: { en: ['lb', 'lbs', 'pound'] },
  },
  {
    slug: 'cuillere-a-soupe',
    rounding: 'fraction',
    labels: { fr: 'cuillère à soupe', en: 'tablespoon' },
    aliases: {
      fr: [
        'c. à soupe',
        'cuillère à soupe',
        'cuillères à soupe',
        'cuiller à soupe',
        'c. à s.',
        'cs',
      ],
      en: ['tbsp', 'tbs', 'tablespoon'],
    },
  },
  {
    slug: 'cuillere-a-cafe',
    rounding: 'fraction',
    labels: { fr: 'cuillère à café', en: 'teaspoon' },
    aliases: {
      fr: ['c. à café', 'cuillère à café', 'cuillères à café', 'cuiller à café', 'c. à c.', 'cc'],
      en: ['tsp', 'teaspoon'],
    },
  },
  {
    slug: 'tasse',
    rounding: 'fraction',
    labels: { fr: 'tasse', en: 'cup' },
    aliases: { fr: ['tasse'], en: ['cup'] },
  },
  {
    slug: 'verre',
    rounding: 'fraction',
    labels: { fr: 'verre', en: 'glass' },
    aliases: { fr: ['verre'], en: ['glass', 'glasses'] },
  },
  {
    slug: 'pincee',
    rounding: 'fraction',
    labels: { fr: 'pincée', en: 'pinch' },
    aliases: { fr: ['pincée'], en: ['pinch', 'pinches'] },
  },
  {
    slug: 'gousse',
    rounding: 'fraction',
    labels: { fr: 'gousse', en: 'clove' },
    aliases: { fr: ['gousse'], en: ['clove'] },
  },
  {
    slug: 'tranche',
    rounding: 'fraction',
    labels: { fr: 'tranche', en: 'slice' },
    aliases: { fr: ['tranche'], en: ['slice'] },
  },
  {
    slug: 'botte',
    rounding: 'fraction',
    labels: { fr: 'botte', en: 'bunch' },
    aliases: { fr: ['botte'], en: ['bunch', 'bunches'] },
  },
  {
    slug: 'brin',
    rounding: 'fraction',
    labels: { fr: 'brin', en: 'sprig' },
    aliases: { fr: ['brin'], en: ['sprig'] },
  },
  {
    slug: 'feuille',
    rounding: 'fraction',
    labels: { fr: 'feuille', en: 'leaf' },
    aliases: { fr: ['feuille'], en: ['leaf', 'leaves'] },
  },
  {
    slug: 'sachet',
    rounding: 'fraction',
    labels: { fr: 'sachet', en: 'packet' },
    aliases: { fr: ['sachet'], en: ['packet'] },
  },
  {
    slug: 'boite',
    rounding: 'fraction',
    labels: { fr: 'boîte', en: 'can' },
    aliases: { fr: ['boîte'], en: ['can', 'tin'] },
  },
  {
    slug: 'pot',
    rounding: 'fraction',
    labels: { fr: 'pot', en: 'jar' },
    aliases: { fr: ['pot'], en: ['jar'] },
  },
];
