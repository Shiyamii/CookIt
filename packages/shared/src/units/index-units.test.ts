import { describe, expect, test } from 'bun:test';
import { DEFAULT_UNITS } from './catalog';
import { findAliasConflicts, unitIndex } from './index-units';
import { normalizeAlias } from './normalize';
import { unitSchema, type Unit } from './unit';

describe('normalizeAlias', () => {
  test('ignores case, accents, dots and spaces', () => {
    for (const alias of ['c. à s.', 'C.À.S', 'càs', 'CaS', 'c à s']) {
      expect(normalizeAlias(alias)).toBe('cas');
    }
  });
});

describe('default catalog', () => {
  test('every unit is valid and no alias belongs to two units', () => {
    for (const unit of DEFAULT_UNITS) expect(unitSchema.safeParse(unit).success).toBe(true);
    expect(findAliasConflicts(DEFAULT_UNITS)).toEqual([]);
  });
});

describe('unitIndex', () => {
  test('prefers the longest alias and matches whole words only', () => {
    const index = unitIndex();
    const text = '2 c. à soupe rase';
    expect(index.match(text, 1)).toEqual({ start: 2, end: 12, slug: 'cuillere-a-soupe' });
    expect(index.match('2 gr', 1)?.slug).toBe('g');
    expect(index.match('2 grosses', 1)).toBeUndefined();
  });

  test('accepts regular plurals', () => {
    expect(unitIndex().match('3 tasses', 1)?.slug).toBe('tasse');
    expect(unitIndex().match('3 cups', 1)?.slug).toBe('tasse');
  });

  test('uses the catalog it is given (admin edits)', () => {
    const units: Unit[] = [
      {
        slug: 'poignee',
        rounding: 'fraction',
        labels: { fr: 'poignée' },
        aliases: { fr: ['poignée'] },
      },
    ];
    expect(unitIndex(units).match('1 poignée de noix', 1)?.slug).toBe('poignee');
    expect(unitIndex(units).match('2 g', 1)).toBeUndefined();
    expect(unitIndex(units).rounding('poignee')).toBe('fraction');
    expect(unitIndex(units).rounding(undefined)).toBe('fraction');
  });

  test('reports aliases shared by two units', () => {
    const units: Unit[] = [
      { slug: 'a', rounding: 'decimal', labels: { fr: 'a' }, aliases: { fr: ['C. à S.'] } },
      { slug: 'b', rounding: 'decimal', labels: { fr: 'b' }, aliases: { en: ['cas'] } },
    ];
    expect(findAliasConflicts(units)).toEqual([{ alias: 'cas', slugs: ['a', 'b'] }]);
  });

  test('the schema rejects an alias that normalizes to nothing', () => {
    const unit = { slug: 'x', rounding: 'decimal', labels: { fr: 'x' }, aliases: { fr: ['. .'] } };
    expect(unitSchema.safeParse(unit).success).toBe(false);
  });
});

describe('default catalog aliases', () => {
  const entries = DEFAULT_UNITS.flatMap((unit) =>
    [unit.slug, ...Object.values(unit.aliases).flat()].map((alias) => ({ alias, slug: unit.slug })),
  );

  test('every alias is matched whole and gives its own unit', () => {
    const index = unitIndex();
    for (const { alias, slug } of entries) {
      expect({ alias, match: index.match(`1 ${alias} x`, 1) }).toEqual({
        alias,
        match: { start: 2, end: 2 + alias.length, slug },
      });
    }
  });

  test('no alias is the regular plural of another unit’s alias', () => {
    const slugByKey = new Map(entries.map(({ alias, slug }) => [normalizeAlias(alias), slug]));
    const clashes = [...slugByKey].filter(([key, slug]) => {
      const singular = key.endsWith('s') ? slugByKey.get(key.slice(0, -1)) : undefined;
      return singular !== undefined && singular !== slug;
    });
    expect(clashes).toEqual([]);
  });
});

describe('unitIndex details', () => {
  test('is cached per catalog array', () => {
    expect(unitIndex(DEFAULT_UNITS)).toBe(unitIndex());
    expect(unitIndex([...DEFAULT_UNITS])).not.toBe(unitIndex());
  });

  test('skips whitespace, newlines included, after `from`', () => {
    expect(unitIndex().match('2 \n  tasses de lait', 1)).toEqual({
      start: 5,
      end: 11,
      slug: 'tasse',
    });
  });

  test('nothing to match at the end of the text', () => {
    expect(unitIndex().match('2', 1)).toBeUndefined();
    expect(unitIndex().match('2   ', 1)).toBeUndefined();
  });

  test('a comma glued to the unit prevents the match', () => {
    expect(unitIndex().match('2 g, sel', 1)).toBeUndefined();
  });

  test('irregular plurals listed in the catalog are matched', () => {
    for (const [text, slug] of [
      ['2 leaves', 'feuille'],
      ['2 bunches', 'botte'],
      ['2 lbs', 'lb'],
    ] as const) {
      expect(unitIndex().match(text, 1)?.slug).toBe(slug);
    }
  });

  test('an alias of up to five words is matched; longer ones are never', () => {
    const catalog = (alias: string): Unit[] => [
      { slug: 'u', rounding: 'fraction', labels: { fr: 'u' }, aliases: { fr: [alias] } },
    ];
    expect(unitIndex(catalog('a b c d e')).match('1 a b c d e x', 1)?.slug).toBe('u');
    expect(unitIndex(catalog('a b c d e f')).match('1 a b c d e f x', 1)).toBeUndefined();
  });

  test('the first unit wins when two units share an alias', () => {
    const units: Unit[] = [
      { slug: 'a', rounding: 'decimal', labels: { fr: 'a' }, aliases: { fr: ['pot'] } },
      { slug: 'b', rounding: 'fraction', labels: { fr: 'b' }, aliases: { fr: ['Pot'] } },
    ];
    expect(unitIndex(units).match('1 pot', 1)?.slug).toBe('a');
  });

  test('reports a conflict between a slug and another unit’s alias', () => {
    const units: Unit[] = [
      { slug: 'g', rounding: 'decimal', labels: { fr: 'g' }, aliases: {} },
      { slug: 'x', rounding: 'decimal', labels: { fr: 'x' }, aliases: { en: ['G.'] } },
    ];
    expect(findAliasConflicts(units)).toEqual([{ alias: 'g', slugs: ['g', 'x'] }]);
  });

  test('unknown slugs round in fractions', () => {
    expect(unitIndex().rounding('inconnu')).toBe('fraction');
    expect(unitIndex().rounding('g')).toBe('decimal');
  });
});

describe('normalizeAlias details', () => {
  test('removes tabs, newlines and non-breaking spaces too', () => {
    expect(normalizeAlias('c.\tà\nsoupe')).toBe('casoupe');
    expect(normalizeAlias('c.\u00a0à\u00a0s.')).toBe('cas');
  });

  test('keeps other punctuation', () => {
    expect(normalizeAlias('g,')).toBe('g,');
  });
});
