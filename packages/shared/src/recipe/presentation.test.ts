import { describe, expect, test } from 'bun:test';
import { fold } from '../text';
import { CURRENT_FORMAT, META_FIELDS, META_KEYS, metaFieldOf } from './meta-keys';
import { parseRecipe } from './parse';
import { parsePresentation } from './presentation';
import { splitParts } from './split';

const part = (...lines: string[]) => ({ lines, startLine: 1 });
const codes = (result: ReturnType<typeof parsePresentation>) =>
  result.diagnostics.map((d) => d.code);

describe('parsePresentation', () => {
  test('reads title, quoted description and metadata', () => {
    const result = parsePresentation(
      part(
        '# Pâtes carbonara',
        '',
        '> La vraie, sans crème.',
        '> Le secret : mélanger hors du feu.',
        '',
        'portions: 4',
        'tags: plat-principal, italien',
        'source: https://exemple.com/recette',
        'format: 1',
        '',
      ),
    );
    expect(result).toEqual({
      presentation: {
        title: 'Pâtes carbonara',
        description: 'La vraie, sans crème.\nLe secret : mélanger hors du feu.',
        servings: 4,
        source: 'https://exemple.com/recette',
        format: 1,
        tags: ['plat-principal', 'italien'],
        extraMeta: {},
      },
      diagnostics: [],
    });
  });

  test('accepts English keys and keys in any case or accents', () => {
    const result = parsePresentation(part('# T', 'Servings: 2', 'ÉTIQUETTES: a'));
    expect(result.presentation).toMatchObject({ servings: 2, tags: ['a'] });
  });

  test('keeps unknown keys as written in extraMeta', () => {
    const result = parsePresentation(part('# T', '', 'portions: 4', 'Temps-total: 1 h', 'note:'));
    expect(result.presentation?.extraMeta).toEqual({ 'Temps-total': '1 h', note: '' });
  });

  test('keeps paragraphs and multiple quote blocks as description', () => {
    const result = parsePresentation(
      part('# T', 'Un paragraphe', 'sur deux lignes.', '', '> a', '>', '> b', '', 'portions: 1'),
    );
    expect(result.presentation?.description).toBe('Un paragraphe\nsur deux lignes.\n\na\n\nb');
  });

  test('a block mixing text and key: value lines stays description', () => {
    const result = parsePresentation(
      part('# T', 'Astuce: du sel', 'et du poivre', '', 'portions: 1'),
    );
    expect(result.presentation).toMatchObject({
      description: 'Astuce: du sel\net du poivre',
      extraMeta: {},
    });
  });

  test('a URL line is not a key', () => {
    const result = parsePresentation(part('# T', 'https://exemple.com', '', 'portions: 1'));
    expect(result.presentation?.description).toBe('https://exemple.com');
  });

  test('strips the optional closing hashes of the title', () => {
    expect(parsePresentation(part('# Titre ##', 'portions: 1')).presentation?.title).toBe('Titre');
    expect(parsePresentation(part('# C# facile', 'portions: 1')).presentation?.title).toBe(
      'C# facile',
    );
  });

  test('keeps text before the title in the description, with a warning', () => {
    const result = parsePresentation(part('Voici la recette :', '', '# T', '', 'portions: 1'));
    expect(result.presentation?.description).toBe('Voici la recette :');
    expect(result.diagnostics).toEqual([
      { code: 'text_before_title', severity: 'warning', line: 1 },
    ]);
  });

  test('requires a title', () => {
    expect(codes(parsePresentation(part('portions: 1')))).toEqual(['missing_title']);
    expect(codes(parsePresentation(part('#', 'portions: 1')))).toEqual(['missing_title']);
    expect(codes(parsePresentation(part('#Titre', '', 'portions: 1')))).toEqual(['missing_title']);
  });

  test('requires a whole number of servings between 1 and 1000', () => {
    expect(codes(parsePresentation(part('# T')))).toEqual(['missing_servings']);
    for (const value of ['0', '1001', '2.5', '4 personnes', '', 'quatre', '-1']) {
      const result = parsePresentation(part('# T', `portions: ${value}`));
      expect(result.diagnostics).toContainEqual({
        code: 'invalid_servings',
        severity: 'error',
        line: 2,
        params: { value },
      });
      expect(result.presentation).toBeUndefined();
    }
  });

  test('rejects an invalid or future format version', () => {
    expect(codes(parsePresentation(part('# T', 'portions: 1', 'format: v1')))).toEqual([
      'invalid_format',
    ]);
    expect(parsePresentation(part('# T', 'portions: 1', 'format: 2')).diagnostics).toEqual([
      { code: 'unsupported_format', severity: 'error', line: 3, params: { value: '2', max: 1 } },
    ]);
  });

  test('rejects a key given twice, including in two languages', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'servings: 2'));
    expect(result.diagnostics).toEqual([
      { code: 'duplicate_meta_key', severity: 'error', line: 3, params: { key: 'servings' } },
    ]);
  });

  test('reports lines relative to the document', () => {
    const result = parsePresentation({ lines: ['# T', 'portions: x'], startLine: 7 });
    expect(result.diagnostics[0]?.line).toBe(8);
  });
});

describe('parsePresentation: title', () => {
  test('trims trailing spaces and tabs of the title', () => {
    expect(parsePresentation(part('# Titre  \t', 'portions: 1')).presentation?.title).toBe('Titre');
    expect(parsePresentation(part('# Titre #  ', 'portions: 1')).presentation?.title).toBe('Titre');
  });

  test('accepts a tab after the hash and up to 3 spaces of indent', () => {
    expect(parsePresentation(part('#\tTitre', 'portions: 1')).presentation?.title).toBe('Titre');
    expect(parsePresentation(part('   # Titre', 'portions: 1')).presentation?.title).toBe('Titre');
  });

  test('a title indented by 4 spaces or a tab is not a heading', () => {
    expect(codes(parsePresentation(part('    # Titre', '', 'portions: 1')))).toEqual([
      'missing_title',
    ]);
    expect(codes(parsePresentation(part('\t# Titre', '', 'portions: 1')))).toEqual([
      'missing_title',
    ]);
  });

  test('a heading made only of closing hashes is an empty title', () => {
    expect(codes(parsePresentation(part('#   ', 'portions: 1')))).toEqual(['missing_title']);
    expect(codes(parsePresentation(part('# #', 'portions: 1')))).toEqual(['missing_title']);
  });

  test('h2 and deeper headings are not the title', () => {
    expect(codes(parsePresentation(part('## T', '', 'portions: 1')))).toEqual(['missing_title']);
  });

  test('missing_title points at the empty heading line', () => {
    const result = parsePresentation({ lines: ['', '#', 'portions: 1'], startLine: 3 });
    expect(result.diagnostics).toEqual([{ code: 'missing_title', severity: 'error', line: 4 }]);
  });

  test('takes a title that is not on the first line, without warning after blank lines', () => {
    const result = parsePresentation(part('', '  ', '# Titre', 'portions: 1'));
    expect(result).toEqual({
      presentation: { title: 'Titre', description: '', servings: 1, tags: [], extraMeta: {} },
      diagnostics: [],
    });
  });

  test('keeps a second h1 heading in the description', () => {
    const result = parsePresentation(part('# Titre', '', '# Autre', '', 'portions: 1'));
    expect(result.presentation).toMatchObject({ title: 'Titre', description: '# Autre' });
  });

  test('puts text before the title ahead of the description', () => {
    const result = parsePresentation(
      part('avant 1', 'avant 2', '', '', '# T', '', 'après', '', 'portions: 1'),
    );
    expect(result.presentation?.description).toBe('avant 1\navant 2\n\naprès');
    expect(result.diagnostics).toEqual([
      { code: 'text_before_title', severity: 'warning', line: 1 },
    ]);
  });

  test('text_before_title points at the first non-blank line', () => {
    const result = parsePresentation({ lines: ['', 'avant', '# T', 'portions: 1'], startLine: 5 });
    expect(result.diagnostics).toEqual([
      { code: 'text_before_title', severity: 'warning', line: 6 },
    ]);
  });

  test('reports both missing title and missing servings', () => {
    expect(codes(parsePresentation(part()))).toEqual(['missing_title', 'missing_servings']);
    expect(codes(parsePresentation(part('du texte')))).toEqual([
      'missing_title',
      'missing_servings',
    ]);
  });
});

describe('parsePresentation: description', () => {
  test('strips quote markers with or without a space and with up to 3 spaces of indent', () => {
    const result = parsePresentation(part('# T', '>a', '> b', '   > c', '', 'portions: 1'));
    expect(result.presentation?.description).toBe('a\nb\nc');
  });

  test('strips only one quote level from nested quotes', () => {
    const result = parsePresentation(part('# T', '>> a', '> > b', '', 'portions: 1'));
    expect(result.presentation?.description).toBe('> a\n> b');
  });

  test('strips a single space after the quote marker and keeps the rest of the indent', () => {
    const result = parsePresentation(part('# T', '>   code', '', 'portions: 1'));
    expect(result.presentation?.description).toBe('  code');
  });

  test('keeps the indentation and inner spacing of plain description lines', () => {
    const result = parsePresentation(part('# T', '  - un  point', '\tsuite', '', 'portions: 1'));
    expect(result.presentation?.description).toBe('  - un  point\n\tsuite');
  });

  test('collapses several blank and whitespace-only lines into one block separator', () => {
    const result = parsePresentation(part('# T', 'a', '', ' \t', '', 'b', '', 'portions: 1'));
    expect(result.presentation?.description).toBe('a\n\nb');
  });

  test('reads a description written after the metadata', () => {
    const result = parsePresentation(part('# T', '', 'portions: 2', '', 'Description.'));
    expect(result.presentation).toMatchObject({ description: 'Description.', servings: 2 });
  });

  test('reads metadata split over several blocks around the description', () => {
    const result = parsePresentation(
      part('# T', 'source: s', '', 'Texte.', '', 'portions: 3', '', 'tags: a'),
    );
    expect(result.presentation).toMatchObject({
      description: 'Texte.',
      servings: 3,
      source: 's',
      tags: ['a'],
    });
  });

  test('a metadata block directly under the title (no blank line) is metadata', () => {
    const result = parsePresentation(part('# T', 'portions: 2', 'auteur: Ana'));
    expect(result.presentation).toMatchObject({ servings: 2, extraMeta: { auteur: 'Ana' } });
  });

  test('a key: value line inside a quote is description', () => {
    const result = parsePresentation(part('# T', '> portions: 8', '', 'portions: 2'));
    expect(result.presentation).toMatchObject({ description: 'portions: 8', servings: 2 });
  });

  test('a block mixing metadata and a quote is description as a whole', () => {
    const result = parsePresentation(part('# T', 'portions: 2', '> citation'));
    expect(codes(result)).toEqual(['missing_servings']);
  });

  test('a URL with another scheme is not a key', () => {
    const result = parsePresentation(part('# T', 'ftp://exemple.com', '', 'portions: 1'));
    expect(result.presentation).toMatchObject({ description: 'ftp://exemple.com', extraMeta: {} });
  });
});

describe('parsePresentation: metadata', () => {
  test('accepts keys with digits, underscores and hyphens', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'temps_2-repos: 3 h'));
    expect(result.presentation?.extraMeta).toEqual({ 'temps_2-repos': '3 h' });
  });

  test('accepts unknown keys with accents or in other scripts', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'Durée: 1 h', 'Время: 5'));
    expect(result.presentation?.extraMeta).toEqual({ Durée: '1 h', Время: '5' });
  });

  test('recognizes a known key written with decomposed accents (NFD)', () => {
    // 'E' + U+0301 combining acute accent, as produced by some macOS copy-pastes.
    const result = parsePresentation(part('# T', 'portions: 1', 'E\u0301tiquettes: a'));
    expect(result.presentation?.tags).toEqual(['a']);
  });

  test('a line whose key starts with a digit or an underscore is description', () => {
    const result = parsePresentation(part('# T', '1er: x', '', '_a: y', '', 'portions: 1'));
    expect(result.presentation).toMatchObject({ description: '1er: x\n\n_a: y', extraMeta: {} });
  });

  test('a key containing a space is not a key', () => {
    const result = parsePresentation(part('# T', 'temps total: 1 h', '', 'portions: 1'));
    expect(result.presentation).toMatchObject({ description: 'temps total: 1 h', extraMeta: {} });
  });

  test('keeps colons in values', () => {
    const result = parsePresentation(
      part('# T', 'portions: 1', 'heure: 12:30', 'note: a: b', 'source: https://x.fr/a?b=c:d'),
    );
    expect(result.presentation).toMatchObject({
      source: 'https://x.fr/a?b=c:d',
      extraMeta: { heure: '12:30', note: 'a: b' },
    });
  });

  test('accepts spaces or tabs around the colon and trims the value', () => {
    const result = parsePresentation(part('# T', 'portions\t:\t 4 \t', 'auteur :  Ana  Lou  '));
    expect(result.presentation).toMatchObject({ servings: 4, extraMeta: { auteur: 'Ana  Lou' } });
  });

  test('accepts servings without a space after the colon and with leading zeros', () => {
    expect(parsePresentation(part('# T', 'portions:04')).presentation?.servings).toBe(4);
  });

  test('accepts servings at the bounds 1 and 1000', () => {
    expect(parsePresentation(part('# T', 'portions: 1')).presentation?.servings).toBe(1);
    expect(parsePresentation(part('# T', 'portions: 1000')).presentation?.servings).toBe(1000);
  });

  test('rejects non-ASCII digits, signs and other number notations in servings', () => {
    for (const value of ['４', '+4', '4e0', '0x4', '1 000']) {
      expect(codes(parsePresentation(part('# T', `portions: ${value}`)))).toEqual([
        'invalid_servings',
      ]);
    }
  });

  test('accepts every French and English servings key', () => {
    for (const key of ['portions', 'personnes', 'parts', 'servings', 'serves', 'yield']) {
      expect(parsePresentation(part('# T', `${key}: 3`)).presentation?.servings).toBe(3);
    }
  });

  test('does not report missing_servings when servings are present but invalid', () => {
    expect(codes(parsePresentation(part('# T', 'portions: x')))).toEqual(['invalid_servings']);
  });

  test('rejects format 0 and accepts format with leading zeros', () => {
    expect(codes(parsePresentation(part('# T', 'portions: 1', 'format: 0')))).toEqual([
      'invalid_format',
    ]);
    expect(parsePresentation(part('# T', 'portions: 1', 'format: 01')).presentation?.format).toBe(
      1,
    );
  });

  test('rejects an empty format', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'format:'));
    expect(result.diagnostics).toEqual([
      { code: 'invalid_format', severity: 'error', line: 3, params: { value: '' } },
    ]);
  });

  test('an empty source is absent', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'source:   '));
    expect(result.presentation).toBeDefined();
    expect(result.presentation && 'source' in result.presentation).toBe(false);
  });

  test('splits tags on commas, trims them and drops empty ones', () => {
    const result = parsePresentation(
      part('# T', 'portions: 1', 'tags: ,  plat principal ,,végétarien,\tété , '),
    );
    expect(result.presentation?.tags).toEqual(['plat principal', 'végétarien', 'été']);
  });

  test('an empty tags line gives no tags', () => {
    expect(parsePresentation(part('# T', 'portions: 1', 'tags:')).presentation?.tags).toEqual([]);
  });

  test('rejects an unknown key given twice in different case', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'Durée: 1', '', 'DURÉE: 2'));
    expect(result.diagnostics).toEqual([
      { code: 'duplicate_meta_key', severity: 'error', line: 5, params: { key: 'DURÉE' } },
    ]);
    expect(result.presentation).toBeUndefined();
  });

  test('unknown keys differing by accents are distinct keys', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'côte: a', 'cote: b'));
    expect({ ...result.presentation?.extraMeta }).toEqual({ côte: 'a', cote: 'b' });
  });

  test('rejects a known key given twice in separate blocks', () => {
    const result = parsePresentation(
      part('# T', 'tags: a', '', 'Texte', '', 'étiquettes: b', 'portions: 1'),
    );
    expect(result.diagnostics).toEqual([
      { code: 'duplicate_meta_key', severity: 'error', line: 6, params: { key: 'étiquettes' } },
    ]);
  });

  test('two different servings keys of the same language are duplicates', () => {
    expect(codes(parsePresentation(part('# T', 'serves: 2', 'yield: 3')))).toEqual([
      'duplicate_meta_key',
    ]);
  });

  test('reports every error, not only the first one', () => {
    const result = parsePresentation(part('#', 'portions: 0', 'format: 9', 'a: 1', 'A: 2'));
    expect(codes(result)).toEqual([
      'missing_title',
      'invalid_servings',
      'unsupported_format',
      'duplicate_meta_key',
    ]);
  });

  test('a warning alone still returns the presentation', () => {
    const result = parsePresentation(part('avant', '# T', 'portions: 1'));
    expect(result.presentation?.title).toBe('T');
    expect(codes(result)).toEqual(['text_before_title']);
  });
});

describe('parsePresentation: no content is lost', () => {
  test('every non-blank line ends up in the title, the description or the metadata', () => {
    const lines = [
      'Intro',
      '# Titre',
      '> citation',
      '',
      'Paragraphe: avec deux-points',
      'suite',
      '',
      'portions: 2',
      'auteur: Ana',
      '',
      '# Second titre',
      'https://exemple.com',
    ];
    const p = parsePresentation(part(...lines)).presentation;
    expect(p).toBeDefined();
    const kept = [
      p?.title,
      p?.description,
      `portions: ${p?.servings}`,
      ...Object.entries(p?.extraMeta ?? {}).map(([k, v]) => `${k}: ${v}`),
    ].join('\n');
    for (const line of lines.filter((l) => l.trim())) {
      expect(kept).toContain(line.replace(/^# (?=Titre$)/, '').replace(/^> /, ''));
    }
  });
});

describe('parsePresentation with splitParts', () => {
  test('parses part 1 of a CRLF document', () => {
    const split = splitParts('# T\r\n\r\n> Desc\r\n\r\nportions: 2\r\n\r\n---\r\n\r\n---\r\n');
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(parsePresentation(split.parts[0])).toEqual({
      presentation: { title: 'T', description: 'Desc', servings: 2, tags: [], extraMeta: {} },
      diagnostics: [],
    });
  });
});

describe('metaFieldOf', () => {
  test('maps French and English keys to the same field', () => {
    expect(metaFieldOf('portions')).toBe('servings');
    expect(metaFieldOf(' Servings ')).toBe('servings');
    expect(metaFieldOf('etiquettes')).toBe('tags');
    expect(metaFieldOf('auteur')).toBeUndefined();
  });

  test('matches every key of META_KEYS ignoring case and accents', () => {
    for (const field of META_FIELDS) {
      for (const keys of Object.values(META_KEYS[field])) {
        for (const key of keys) {
          expect(metaFieldOf(key)).toBe(field);
          expect(metaFieldOf(key.toUpperCase())).toBe(field);
          expect(metaFieldOf(fold(key))).toBe(field);
        }
      }
    }
  });

  test('does not match a key that only contains a known key', () => {
    expect(metaFieldOf('portions2')).toBeUndefined();
    expect(metaFieldOf('sources')).toBeUndefined();
    expect(metaFieldOf('')).toBeUndefined();
  });

  test('the current format version is a whole number >= 1', () => {
    expect(Number.isInteger(CURRENT_FORMAT) && CURRENT_FORMAT >= 1).toBe(true);
  });
});

describe('parsePresentation: hardening', () => {
  const NBSP = String.fromCharCode(0xa0);
  const COMBINING_ACUTE = String.fromCharCode(0x301);

  test('stays linear on long runs of spaces (no regex backtracking)', () => {
    const spaces = ' '.repeat(200_000);
    const started = performance.now();
    parsePresentation(part(`# a${spaces}b`, '', `note: a${spaces}b`, 'portions: 1'));
    parsePresentation(part(`# a${spaces}#`, '', `k:${spaces}`, 'portions: 1'));
    expect(performance.now() - started).toBeLessThan(500);
  });

  test('recognizes keys written with a decomposed accent once normalized (splitParts)', () => {
    const result = splitParts(
      ['# T', '', 'portions: 1', `E${COMBINING_ACUTE}tiquettes: a`, '', '---', '', '---'].join(
        '\n',
      ),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(parsePresentation(result.parts[0]).presentation?.tags).toEqual(['a']);
  });

  test('accepts a key with combining marks (non-Latin scripts)', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'चीनी: 1'));
    expect({ ...result.presentation?.extraMeta }).toEqual({ चीनी: '1' });
  });

  test('accepts non-breaking spaces around the colon (French typing)', () => {
    const result = parsePresentation(part('# T', `portions${NBSP}:${NBSP}4`));
    expect(result.presentation?.servings).toBe(4);
  });

  test('ignores a leading level-2 heading before the title', () => {
    const result = parsePresentation(part('## Présentation', '', '# T', '', 'portions: 1'));
    expect(result.diagnostics).toEqual([]);
    expect(result.presentation?.description).toBe('');
  });

  test('keeps code blocks of the description as written', () => {
    const result = parsePresentation(
      part('# T', '', '```', 'a: b', '', '> c', '```', '', 'portions: 1'),
    );
    expect(result.presentation).toMatchObject({
      description: '```\na: b\n\n> c\n```',
      extraMeta: {},
    });
  });

  test('keys named like Object methods are plain entries, without prototype', () => {
    const result = parsePresentation(
      part('# T', 'portions: 1', 'toString: a', 'constructor: b', 'hasOwnProperty: c'),
    );
    const extraMeta = result.presentation?.extraMeta ?? {};
    expect(Object.getPrototypeOf(extraMeta)).toBeNull();
    expect(Object.entries(extraMeta)).toEqual([
      ['toString', 'a'],
      ['constructor', 'b'],
      ['hasOwnProperty', 'c'],
    ]);
    const other = parsePresentation(part('# T', 'portions: 1')).presentation?.extraMeta ?? {};
    expect(other['constructor']).toBeUndefined();
  });

  test('removes duplicate tags', () => {
    const result = parsePresentation(part('# T', 'portions: 1', 'tags: a, b, a'));
    expect(result.presentation?.tags).toEqual(['a', 'b']);
  });

  test('caps repeated diagnostics and truncates echoed values', () => {
    const lines = Array.from({ length: 80 }, () => 'note: x');
    const result = parsePresentation(part('# T', 'portions: 1', ...lines));
    expect(result.diagnostics.filter((d) => d.code === 'duplicate_meta_key')).toHaveLength(50);
    expect(result.diagnostics).toContainEqual({
      code: 'diagnostics_truncated',
      severity: 'warning',
      params: { code: 'duplicate_meta_key', omitted: 29 },
    });

    const long = parsePresentation(part('# T', `portions: ${'9'.repeat(500)}`));
    expect(String(long.diagnostics[0]?.params?.value).length).toBeLessThanOrEqual(81);
  });
});

describe('summary', () => {
  const summaryOf = (...lines: string[]) =>
    parsePresentation(part('# T', '', ...lines, '')).presentation?.summary;

  test.each([
    ['résumé: Rapide et bon.', 'Rapide et bon.'],
    ['resume: Sans accent.', 'Sans accent.'],
    ['summary: Quick and good.', 'Quick and good.'],
    ['összefoglaló: Gyors és finom.', 'Gyors és finom.'],
    ['összegzés: Másik kulcs.', 'Másik kulcs.'],
    ['RÉSUMÉ: Casse ignorée.', 'Casse ignorée.'],
  ])('%s is read as the summary', (line, expected) => {
    const result = parsePresentation(part('# T', '', line, 'portions: 2', ''));
    expect(result.diagnostics).toEqual([]);
    expect(result.presentation?.summary).toBe(expected);
    expect(result.presentation?.extraMeta).toEqual({});
  });

  test('an empty value is ignored without diagnostic', () => {
    const result = parsePresentation(part('# T', '', 'summary:', 'portions: 2', ''));
    expect(result.presentation?.summary).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });

  test('exactly 160 code points is accepted, 161 is an error with max and length', () => {
    expect(summaryOf(`summary: ${'a'.repeat(160)}`, 'portions: 2')).toHaveLength(160);
    const result = parsePresentation(part('# T', '', `summary: ${'a'.repeat(161)}`, 'portions: 2'));
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'summary_too_long',
        severity: 'error',
        params: { max: 160, length: 161 },
      }),
    ]);
  });

  test('an emoji counts as one code point at the boundary', () => {
    const ok = `${'a'.repeat(159)}🍰`;
    expect(ok.length).toBe(161);
    expect(summaryOf(`summary: ${ok}`, 'portions: 2')).toBe(ok);
    const tooLong = `${'a'.repeat(160)}🍰`;
    const result = parsePresentation(part('# T', '', `summary: ${tooLong}`, 'portions: 2'));
    expect(codes(result)).toContain('summary_too_long');
  });

  test('a too long summary rejects the document', () => {
    const result = parseRecipe(`# T\n\nsummary: ${'a'.repeat(161)}\nportions: 2\n\n---\n\n---\n`);
    expect(result.ok).toBe(false);
  });

  test('a duplicate summary key is an error', () => {
    const result = parsePresentation(part('# T', '', 'summary: a', 'résumé: b', 'portions: 2', ''));
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
