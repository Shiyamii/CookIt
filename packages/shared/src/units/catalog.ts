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
    labels: { fr: 'milligramme', en: 'milligram', hu: 'milligramm' },
    aliases: { fr: ['mg', 'milligramme'], en: ['milligram'], hu: ['mg', 'milligramm'] },
  },
  {
    slug: 'g',
    rounding: 'decimal',
    labels: { fr: 'gramme', en: 'gram', hu: 'gramm' },
    aliases: { fr: ['g', 'gr', 'gramme'], en: ['gram'], hu: ['g', 'gramm'] },
  },
  {
    slug: 'dkg',
    rounding: 'decimal',
    labels: { fr: 'décagramme', en: 'decagram', hu: 'dekagramm' },
    aliases: { fr: ['dag', 'décagramme'], en: ['decagram'], hu: ['dkg', 'deka', 'dekagramm'] },
  },
  {
    slug: 'kg',
    rounding: 'decimal',
    labels: { fr: 'kilogramme', en: 'kilogram', hu: 'kilogramm' },
    aliases: {
      fr: ['kg', 'kilo', 'kilogramme'],
      en: ['kilogram'],
      hu: ['kg', 'kiló', 'kilogramm'],
    },
  },
  {
    slug: 'ml',
    rounding: 'decimal',
    labels: { fr: 'millilitre', en: 'milliliter', hu: 'milliliter' },
    aliases: { fr: ['ml', 'millilitre'], en: ['milliliter'], hu: ['ml', 'milliliter'] },
  },
  {
    slug: 'cl',
    rounding: 'decimal',
    labels: { fr: 'centilitre', en: 'centiliter', hu: 'centiliter' },
    aliases: { fr: ['cl', 'centilitre'], en: ['centiliter'], hu: ['cl', 'centiliter'] },
  },
  {
    slug: 'dl',
    rounding: 'decimal',
    labels: { fr: 'décilitre', en: 'deciliter', hu: 'deciliter' },
    aliases: { fr: ['dl', 'décilitre'], en: ['deciliter'], hu: ['dl', 'deciliter'] },
  },
  {
    slug: 'l',
    rounding: 'decimal',
    labels: { fr: 'litre', en: 'liter', hu: 'liter' },
    aliases: { fr: ['l', 'litre'], en: ['liter'], hu: ['l', 'liter'] },
  },
  {
    slug: 'oz',
    rounding: 'decimal',
    labels: { fr: 'once', en: 'ounce', hu: 'uncia' },
    aliases: { fr: ['once'], en: ['oz', 'ounce'], hu: ['uncia'] },
  },
  // Cooking and count units: rounded in fractions.
  {
    slug: 'lb',
    rounding: 'fraction',
    labels: { fr: 'livre', en: 'pound', hu: 'font' },
    aliases: { en: ['lb', 'lbs', 'pound'], hu: ['font'] },
  },
  {
    slug: 'cuillere-a-soupe',
    rounding: 'fraction',
    labels: { fr: 'cuillère à soupe', en: 'tablespoon', hu: 'evőkanál' },
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
      hu: ['ek', 'evőkanál', 'evőkanálnyi'],
    },
  },
  {
    slug: 'cuillere-a-cafe',
    rounding: 'fraction',
    labels: { fr: 'cuillère à café', en: 'teaspoon', hu: 'teáskanál' },
    aliases: {
      fr: ['c. à café', 'cuillère à café', 'cuillères à café', 'cuiller à café', 'c. à c.', 'cc'],
      en: ['tsp', 'teaspoon'],
      hu: ['tk', 'teáskanál', 'teáskanálnyi', 'kk', 'kávéskanál', 'kávéskanálnyi'],
    },
  },
  {
    slug: 'tasse',
    rounding: 'fraction',
    labels: { fr: 'tasse', en: 'cup', hu: 'bögre' },
    aliases: { fr: ['tasse'], en: ['cup'], hu: ['bögre', 'csésze'] },
  },
  {
    slug: 'verre',
    rounding: 'fraction',
    labels: { fr: 'verre', en: 'glass', hu: 'pohár' },
    aliases: { fr: ['verre'], en: ['glass', 'glasses'], hu: ['pohár'] },
  },
  {
    slug: 'pincee',
    rounding: 'fraction',
    labels: { fr: 'pincée', en: 'pinch', hu: 'csipet' },
    aliases: { fr: ['pincée'], en: ['pinch', 'pinches'], hu: ['csipet', 'csipetnyi'] },
  },
  {
    slug: 'gousse',
    rounding: 'fraction',
    labels: { fr: 'gousse', en: 'clove', hu: 'gerezd' },
    aliases: { fr: ['gousse'], en: ['clove'], hu: ['gerezd'] },
  },
  {
    slug: 'tete',
    rounding: 'fraction',
    labels: { fr: 'tête', en: 'head', hu: 'fej' },
    aliases: { fr: ['tête'], en: ['head'], hu: ['fej'] },
  },
  {
    slug: 'tranche',
    rounding: 'fraction',
    labels: { fr: 'tranche', en: 'slice', hu: 'szelet' },
    aliases: { fr: ['tranche'], en: ['slice'], hu: ['szelet'] },
  },
  {
    slug: 'botte',
    rounding: 'fraction',
    labels: { fr: 'botte', en: 'bunch', hu: 'csokor' },
    aliases: { fr: ['botte'], en: ['bunch', 'bunches'], hu: ['csokor', 'köteg'] },
  },
  {
    slug: 'brin',
    rounding: 'fraction',
    labels: { fr: 'brin', en: 'sprig', hu: 'szál' },
    aliases: { fr: ['brin'], en: ['sprig'], hu: ['szál', 'ág', 'ágacska'] },
  },
  {
    slug: 'feuille',
    rounding: 'fraction',
    labels: { fr: 'feuille', en: 'leaf', hu: 'levél' },
    aliases: { fr: ['feuille'], en: ['leaf', 'leaves'], hu: ['levél'] },
  },
  {
    slug: 'sachet',
    rounding: 'fraction',
    labels: { fr: 'sachet', en: 'packet', hu: 'csomag' },
    aliases: { fr: ['sachet'], en: ['packet'], hu: ['csomag', 'tasak'] },
  },
  {
    slug: 'boite',
    rounding: 'fraction',
    labels: { fr: 'boîte', en: 'can', hu: 'doboz' },
    aliases: { fr: ['boîte'], en: ['can', 'tin'], hu: ['doboz', 'konzerv'] },
  },
  {
    slug: 'pot',
    rounding: 'fraction',
    labels: { fr: 'pot', en: 'jar', hu: 'üveg' },
    aliases: { fr: ['pot'], en: ['jar'], hu: ['üveg'] },
  },
];
