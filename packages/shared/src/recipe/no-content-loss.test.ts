import { describe, expect, test } from 'bun:test';
import { parseIngredients, parseSteps } from './body';
import { headingText, toLines } from './lines';
import type { IngredientGroup, IngredientItem, StepGroup, StepItem, TextItem } from './model';
import { parseRecipe } from './parse';
import type { DocumentPart } from './split';

/**
 * "Never lose content" for parts 2 and 3: walking the source lines in order, every line must be
 * found, in the same order, as a text item (as written), the first line of an item (without its
 * marker), a continuation line of an item (trimmed) or a group name. The only lines allowed to
 * leave no trace are blank lines, the leading `## …` heading and empty `###` headings.
 */

type Fragment = { kind: 'text' | 'first' | 'continuation' | 'group'; value: string };

const MARKER = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)/;
const BLANK = /^[ \t]*$/;

function fragments(groups: (IngredientGroup | StepGroup)[]): Fragment[] {
  return groups.flatMap((group): Fragment[] => [
    ...(group.name === undefined ? [] : [{ kind: 'group' as const, value: group.name }]),
    ...group.items.flatMap((item): Fragment[] => {
      if (item.kind === 'text') return [{ kind: 'text', value: item.raw }];
      const [first = '', ...rest] = item.raw.split('\n');
      return [
        { kind: 'first', value: first },
        ...rest.map((value) => ({ kind: 'continuation' as const, value })),
      ];
    }),
  ]);
}

function matches(line: string, fragment: Fragment | undefined): boolean {
  switch (fragment?.kind) {
    case 'text':
      return line === fragment.value;
    case 'group':
      return headingText(line, 3) === fragment.value;
    case 'first':
      return line.replace(MARKER, '').trim() === fragment.value;
    case 'continuation':
      return line.trim() === fragment.value;
    default:
      return false;
  }
}

/** Returns the source lines (1-based) that were lost, empty when nothing was. */
function lostLines(part: DocumentPart, groups: (IngredientGroup | StepGroup)[]): string[] {
  const expected = fragments(groups);
  const lost: string[] = [];
  let next = 0;
  const firstContent = part.lines.findIndex((line) => !BLANK.test(line));
  part.lines.forEach((line, i) => {
    if (matches(line, expected[next])) {
      next++;
      return;
    }
    const ignoredHeading = i === firstContent && headingText(line, 2) !== undefined;
    if (BLANK.test(line) || ignoredHeading || headingText(line, 3) === '') return;
    lost.push(`${part.startLine + i}: ${JSON.stringify(line)}`);
  });
  for (const fragment of expected.slice(next)) lost.push(`unmatched ${JSON.stringify(fragment)}`);
  return lost;
}

/** Deterministic pseudo-random generator (LCG), so failures are reproducible. */
function random(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % max;
  };
}

const POOL = [
  '- 200 g farine',
  '* sel',
  '+ poivre',
  '1. Mélanger.',
  '10) Cuire.',
  '-',
  '1.',
  '-   ',
  '-\ttab',
  '   - indenté 3',
  '  - sous-item',
  '    - indenté 4',
  '\t- tab avant',
  '### Groupe',
  '###',
  '### Sauce ###',
  '###Collé',
  '## Titre',
  '##',
  '#### Sous-titre',
  '# Titre',
  '####### sept',
  '> note',
  'texte libre',
  '  suite indentée',
  '1.5 g de beurre',
  '-1 œuf',
  '1234567890. trop long',
  '* [10 min](timer:10m "pâtes")',
  '- [2 c. à s.](q:) huile',
  '',
  '',
  '   ',
  '\t',
];
const FENCES = ['```', '~~~', '````'];

function randomLines(next: (max: number) => number, withFences: boolean): string[] {
  const pool = withFences ? [...POOL, ...FENCES] : POOL;
  return Array.from({ length: next(16) }, () => pool[next(pool.length)] ?? '');
}

describe('no content is ever lost in parts 2 and 3', () => {
  test('the checker reports dropped, unknown and reordered lines', () => {
    const part = { lines: ['- a', 'b'], startLine: 1 };
    expect(lostLines(part, [{ items: [{ kind: 'text', line: 1, raw: 'x' }] }])).toEqual([
      '1: "- a"',
      '2: "b"',
      'unmatched {"kind":"text","value":"x"}',
    ]);
    const reordered: IngredientGroup[] = [
      {
        items: [
          { kind: 'text', line: 2, raw: 'b' },
          { kind: 'text', line: 1, raw: 'a' },
        ],
      },
    ];
    expect(lostLines({ lines: ['a', 'b'], startLine: 1 }, reordered)).not.toEqual([]);
  });

  test('parseIngredients keeps every line of generated parts', () => {
    const next = random(42);
    for (let run = 0; run < 500; run++) {
      const part = { lines: randomLines(next, true), startLine: 1 + next(20) };
      expect({ lines: part.lines, lost: lostLines(part, parseIngredients(part).groups) }).toEqual({
        lines: part.lines,
        lost: [],
      });
    }
  });

  test('parseSteps keeps every line of generated parts and numbers steps 0..n-1', () => {
    const next = random(7);
    for (let run = 0; run < 500; run++) {
      const part = { lines: randomLines(next, true), startLine: 1 };
      const { groups } = parseSteps(part);
      expect({ lines: part.lines, lost: lostLines(part, groups) }).toEqual({
        lines: part.lines,
        lost: [],
      });
      const indexes = groups.flatMap((group) =>
        group.items.flatMap((item) => (item.kind === 'step' ? [item.index] : [])),
      );
      expect(indexes).toEqual(indexes.map((_, i) => i));
    }
  });

  test('parseRecipe keeps every line of parts 2 and 3 and points items to their source line', () => {
    const next = random(2026);
    for (let run = 0; run < 300; run++) {
      const ingredients = randomLines(next, false);
      const steps = randomLines(next, false);
      const head = ['# T', '', 'portions: 2', '', '---', ''];
      const markdown = [...head, ...ingredients, '', '---', '', ...steps].join('\n');
      const result = parseRecipe(markdown);
      if (!result.ok) throw new Error(`${markdown}\n${JSON.stringify(result.diagnostics)}`);

      const ingredientsPart = { lines: ingredients, startLine: head.length + 1 };
      const stepsPart = { lines: steps, startLine: head.length + ingredients.length + 4 };
      const { ingredientGroups, stepGroups } = result.document;
      expect({
        markdown,
        lost: [
          ...lostLines(ingredientsPart, ingredientGroups),
          ...lostLines(stepsPart, stepGroups),
        ],
      }).toEqual({ markdown, lost: [] });

      const source = toLines(markdown);
      const groups: (IngredientGroup | StepGroup)[] = [...ingredientGroups, ...stepGroups];
      for (const item of groups.flatMap((group): (IngredientItem | StepItem | TextItem)[] => [
        ...group.items,
      ])) {
        const line = source[item.line - 1] ?? '';
        const firstRawLine = item.raw.split('\n')[0];
        if (item.kind === 'text') expect(line).toBe(item.raw);
        else expect(line.replace(MARKER, '').trim()).toBe(firstRawLine ?? '');
      }
    }
  });
});
