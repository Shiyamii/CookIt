import { describe, expect, test } from 'bun:test';
import { detectDurations } from './import/durations';
import { splitSteps } from './import/paste';
import { checkTranslationStructure } from './recipe/translation';
import { parseRecipe } from './recipe/parse';
import { scaleIngredient } from './recipe/scale';
import { serializeRecipe } from './recipe/serialize';
import type { IngredientItem } from './recipe/model';
import { EXAMPLE_RECIPES } from './prompts/examples';
import { importPrompt } from './prompts/prompts';
import { DEFAULT_TAG_CATEGORIES } from './tags';
import { DEFAULT_UNITS } from './units/catalog';
import { findAliasConflicts } from './units/index-units';

const RECIPE = `# Lecsó

adag: 4
forrás: nagymama

---

- 50 dkg paprika
- 2 fej vöröshagyma
- 3 gerezd fokhagyma
- 2 ek olaj
- 1 tk só
- 1 csipet cukor
- 1,5 dl paradicsomlé

---

1. Pirítsd a hagymát [10 percig](timer:10m "hagyma").
`;

const parse = (markdown: string) => parseRecipe(markdown, { units: DEFAULT_UNITS });

function ingredients(markdown: string): IngredientItem[] {
  const result = parse(markdown);
  if (!result.ok) throw new Error('does not parse');
  return result.document.ingredientGroups
    .flatMap((group) => group.items)
    .filter((item): item is IngredientItem => item.kind === 'ingredient');
}

describe('Hungarian recipes', () => {
  test('Hungarian keys and units are read', () => {
    const result = parse(RECIPE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.servings).toBe(4);
    expect(result.document.source).toBe('nagymama');
    expect(result.document.extraMeta).toEqual({});
    expect(ingredients(RECIPE).map((item) => [item.unit?.slug, item.name])).toEqual([
      ['dkg', 'paprika'],
      ['tete', 'vöröshagyma'],
      ['gousse', 'fokhagyma'],
      ['cuillere-a-soupe', 'olaj'],
      ['cuillere-a-cafe', 'só'],
      ['pincee', 'cukor'],
      ['dl', 'paradicsomlé'],
    ]);
  });

  test('scaling writes Hungarian decimals (comma) and keeps the text', () => {
    const items = ingredients(RECIPE);
    const scaled = items.map((item) => scaleIngredient(item, 1.5, { locale: 'hu' }));
    expect(scaled).toEqual([
      '75 dkg paprika',
      '3 fej vöröshagyma',
      '4 ½ gerezd fokhagyma',
      '3 ek olaj',
      '1 ½ tk só',
      '1 ½ csipet cukor',
      '2,5 dl paradicsomlé',
    ]);
  });

  test('the canonical form uses `adag:` and stays stable', () => {
    const result = parse(RECIPE);
    if (!result.ok) throw new Error('does not parse');
    const canonical = serializeRecipe(result.document, { locale: 'hu' });
    expect(canonical).toContain('\nadag: 4\n');
    expect(canonical).toContain('\nsource: nagymama\n');
    const again = parse(canonical);
    if (!again.ok) throw new Error('does not parse again');
    expect(serializeRecipe(again.document, { locale: 'hu' })).toBe(canonical);
  });

  test('the Hungarian example has the structure of the French one', () => {
    const fr = parse(EXAMPLE_RECIPES.fr);
    const hu = parse(EXAMPLE_RECIPES.hu);
    if (!fr.ok || !hu.ok) throw new Error('does not parse');
    expect(hu.diagnostics).toEqual([]);
    expect(checkTranslationStructure(fr.document, hu.document)).toEqual([]);
  });

  test('the import prompt in Hungarian asks for the Hungarian key and units', () => {
    const prompt = importPrompt({ locale: 'hu', lang: 'hu' });
    expect(prompt).toContain('`adag: N`');
    expect(prompt).toContain('magyar nyelven');
    expect(prompt).toContain('dkg, kg');
    expect(prompt).toContain('\nadag: 4\n');
  });
});

describe('Hungarian durations', () => {
  const found = (text: string) =>
    detectDurations(text).map((d) => [d.text, d.seconds, d.lowSeconds]);

  test.each([
    ['Süsd 20 percig.', [['20 percig', 1200, undefined]]],
    ['Pihentesd 1 órát.', [['1 órát', 3600, undefined]]],
    ['Főzd 1 óra 30 percig', [['1 óra 30 percig', 5400, undefined]]],
    ['30 másodpercen át', [['30 másodpercen', 30, undefined]]],
    ['45 mp', [['45 mp', 45, undefined]]],
    ['1,5 óra', [['1,5 óra', 5400, undefined]]],
    ['2-3 percig', [['2-3 percig', 180, 120]]],
    ['2 vagy 3 perc', [['2 vagy 3 perc', 180, 120]]],
    ['Melegítsd 5 percen keresztül', [['5 percen', 300, undefined]]],
  ] as const)('%s', (text, expected) => {
    expect(found(text)).toEqual(expected.map((row) => [...row]));
  });

  test('words that only look like a duration are left alone', () => {
    expect(found('tedd a 10 o-s lángra')).toEqual([]);
    expect(found('egy 4 órás sütés')).toEqual([]);
    expect(found('180 fokon')).toEqual([]);
  });
});

describe('Hungarian pasted steps', () => {
  test('`1. lépés` starts a step and is removed', () => {
    expect(splitSteps('1. lépés: Mosd meg.\nVágd fel.\n2. lépés: Süsd meg.')).toEqual([
      { items: ['Mosd meg. Vágd fel.', 'Süsd meg.'] },
    ]);
  });
});

describe('Hungarian catalog', () => {
  test('every starting unit, category and tag has a Hungarian name', () => {
    for (const unit of DEFAULT_UNITS) {
      expect(unit.labels.hu, unit.slug).toBeTruthy();
      expect(unit.aliases.hu?.length, unit.slug).toBeGreaterThan(0);
    }
    for (const category of DEFAULT_TAG_CATEGORIES) {
      expect(category.labels.hu, category.slug).toBeTruthy();
      for (const tag of category.tags) expect(tag.labels.hu, tag.slug).toBeTruthy();
    }
  });

  test('no Hungarian alias is shared by two units', () => {
    expect(findAliasConflicts(DEFAULT_UNITS)).toEqual([]);
  });
});

describe('Hungarian keys in a recipe', () => {
  const withKey = (line: string) =>
    `# Leves\n\n${line}\n\n---\n\n- 1 db hagyma\n\n---\n\n1. Főzd.\n`;

  test.each(['adag: 4', 'adagok: 4', 'személy: 4', 'fő: 4', 'servings: 4', 'portions: 4'])(
    '`%s` gives 4 servings',
    (line) => {
      const result = parse(withKey(line));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.document.servings).toBe(4);
    },
  );

  test('`forrás:` and `formátum:` are known keys, not extra meta', () => {
    const result = parse(withKey('adag: 2\nforrás: könyv\nformátum: 1'));
    if (!result.ok) throw new Error('does not parse');
    expect(result.document.source).toBe('könyv');
    expect(result.document.extraMeta).toEqual({});
  });

  test('an unknown Hungarian key is kept in extra meta', () => {
    const result = parse(withKey('adag: 2\nnehézség: könnyű'));
    if (!result.ok) throw new Error('does not parse');
    expect(result.document.extraMeta).toEqual({ nehézség: 'könnyű' });
  });
});

describe('Hungarian durations: no regression, no false positive', () => {
  const found = (text: string) => detectDurations(text).map((d) => [d.text, d.seconds]);

  test('French and English durations are unchanged', () => {
    expect(found('Cuire 2 heures 10 min')).toEqual([['2 heures 10 min', 7800]]);
    expect(found('Bake 1h30')).toEqual([['1h30', 5400]]);
    expect(found('Mix 10 s then 3 hours')).toEqual([
      ['10 s', 10],
      ['3 hours', 10800],
    ]);
    expect(found('2 ou 3 minutes')).toEqual([['2 ou 3 minutes', 180]]);
  });

  test('letters and unknown words around a number are not durations', () => {
    expect(found('10 m')).toEqual([]);
    expect(found('x10 min')).toEqual([]);
    expect(found('10 o')).toEqual([]);
    expect(found('15 oras')).toEqual([]);
    expect(found('2 órakor')).toEqual([]);
    expect(found('5 percek')).toEqual([]);
    expect(found('mp3 lejátszó')).toEqual([]);
  });

  test('uppercase Hungarian words are read', () => {
    expect(found('20 PERCIG')).toEqual([['20 PERCIG', 1200]]);
    expect(found('1 ÓRA')).toEqual([['1 ÓRA', 3600]]);
  });

  test('hostile input stays fast', () => {
    const started = performance.now();
    detectDurations('1 '.repeat(50_000) + 'ó'.repeat(50_000));
    detectDurations('9'.repeat(100_000) + ' perc' + ' vagy 1'.repeat(10_000));
    detectDurations('1 óra '.repeat(20_000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('Hungarian pasted steps: variants', () => {
  test('`lépés 2` and `2. lépés` both number steps, without regressing `Étape`', () => {
    expect(splitSteps('Lépés 1: Mosd meg.\nLépés 2: Süsd meg.')).toEqual([
      { items: ['Mosd meg.', 'Süsd meg.'] },
    ]);
    expect(splitSteps('Étape 1 Laver.\nÉtape 2 Cuire.')).toEqual([{ items: ['Laver.', 'Cuire.'] }]);
  });

  test('a plain numbered list still works', () => {
    expect(splitSteps('1. Mosd meg.\n2. Süsd meg.')).toEqual([
      { items: ['Mosd meg.', 'Süsd meg.'] },
    ]);
  });
});

describe('Hungarian catalog: new entries', () => {
  test('`hongroise` tag exists once and `dkg` / `tete` units exist', () => {
    const slugs = DEFAULT_TAG_CATEGORIES.flatMap((c) => c.tags.map((t) => t.slug));
    expect(slugs.filter((s) => s === 'hongroise')).toHaveLength(1);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(DEFAULT_UNITS.map((u) => u.slug)).toEqual(expect.arrayContaining(['dkg', 'tete']));
  });
});
