import { describe, expect, test } from 'bun:test';
import type { Diagnostic } from './diagnostics';
import { MAX_RECIPE_MARKDOWN_LENGTH, type SplitResult, splitParts, toLines } from './split';

const doc = (...lines: string[]) => lines.join('\n');

describe('splitParts', () => {
  test('splits a document into three parts with their start lines', () => {
    const result = splitParts(
      doc('# Title', '', 'servings: 4', '', '---', '', '- 1 egg', '', '---', '', '1. Cook.'),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.parts.map((part) => part.startLine)).toEqual([1, 6, 10]);
    expect(result.parts[0].lines).toEqual(['# Title', '', 'servings: 4', '']);
    expect(result.parts[1].lines).toEqual(['', '- 1 egg', '']);
    expect(result.parts[2].lines).toEqual(['', '1. Cook.']);
    expect(result.diagnostics).toEqual([]);
  });

  test('accepts separators of any length (3+ dashes) and trailing spaces', () => {
    const result = splitParts(doc('# T', '', '-------------', '', 'a', '', '---  ', '', 'b'));
    expect(result.ok).toBe(true);
  });

  test('accepts empty parts 2 and 3, and a separator on the last line', () => {
    const result = splitParts(doc('# T', '', '---', '', '---'));
    if (!result.ok) throw new Error('expected ok');
    expect(result.parts[1].lines).toEqual(['']);
    expect(result.parts[2].lines).toEqual([]);
  });

  test('normalizes CRLF line endings and a leading BOM', () => {
    const result = splitParts('\uFEFF# T\r\n\r\n---\r\n\r\na\r\n\r\n---\r\n\r\nb');
    if (!result.ok) throw new Error('expected ok');
    expect(result.parts[0].lines[0]).toBe('# T');
    expect(result.parts[2].lines).toEqual(['', 'b']);
  });

  test('reports a missing separator with the number of parts found', () => {
    const result = splitParts(doc('# T', '', '---', '', 'a'));
    expect(result).toEqual({
      ok: false,
      diagnostics: [{ code: 'missing_separator', severity: 'error', params: { found: 2 } }],
    });
  });

  test('reports too many parts at the first extra separator', () => {
    const result = splitParts(
      doc('# T', '', '---', '', 'a', '', '---', '', 'b', '', '---', '', 'c'),
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      { code: 'too_many_parts', severity: 'error', line: 11, params: { found: 4 } },
    ]);
  });

  test('a dash line glued to text is not a separator and is reported', () => {
    const result = splitParts(doc('# T', 'text', '---', '', 'a', '', '---', '', 'b'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: 'ambiguous_separator',
      severity: 'warning',
      line: 3,
    });
  });

  test('ignores dash lines inside fenced code blocks', () => {
    for (const fence of ['```', '~~~', '````md']) {
      const close = fence.replace(/[a-z]/g, '');
      const result = splitParts(
        doc('# T', '', '---', '', fence, '', '---', '', close, '', '---', '', 'b'),
      );
      if (!result.ok) throw new Error(`expected ok with ${fence}`);
      expect(result.parts[1].lines).toContain('---');
    }
  });

  test('warns about an unclosed code block', () => {
    const result = splitParts(doc('# T', '', '---', '', '```', '', '---', '', 'b'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: 'unclosed_code_block',
      severity: 'warning',
      line: 5,
    });
  });

  test('rejects a YAML frontmatter', () => {
    const result = splitParts(doc('---', 'title: T', '---', '', '# T', '', '---', '', 'a'));
    expect(result).toEqual({
      ok: false,
      diagnostics: [{ code: 'frontmatter_not_supported', severity: 'error', line: 1 }],
    });
  });

  test('never loses a line: parts + separators rebuild the source', () => {
    const source = doc(
      '# T',
      '> desc',
      '',
      'k: v',
      '',
      '---',
      '',
      '### G',
      '- a',
      '',
      '----',
      '',
      'x',
    );
    const result = splitParts(source);
    if (!result.ok) throw new Error('expected ok');
    const [p1, p2, p3] = result.parts;
    expect([...p1.lines, '---', ...p2.lines, '----', ...p3.lines].join('\n')).toBe(source);
  });
});

/** Asserts a successful split and returns it. */
function splitOk(source: string) {
  const result = splitParts(source);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.diagnostics)}`);
  return result;
}

/** Rebuilds the source from the parts and the separator lines that follow parts 1 and 2. */
function rebuild(source: string) {
  const lines = toLines(source);
  const { parts } = splitOk(source);
  const separatorAfter = (part: { lines: string[]; startLine: number }) =>
    lines[part.startLine - 1 + part.lines.length] ?? '';
  return [
    ...parts[0].lines,
    separatorAfter(parts[0]),
    ...parts[1].lines,
    separatorAfter(parts[1]),
    ...parts[2].lines,
  ].join('\n');
}

const BOM = String.fromCharCode(0xfeff);
const FENCE3 = '```';

describe('toLines', () => {
  test('returns a single empty line for an empty string', () => {
    expect(toLines('')).toEqual(['']);
  });

  test('normalizes LF, CRLF and lone CR in the same document', () => {
    expect(toLines('a\nb\r\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });

  test('treats LF followed by CR as two line breaks', () => {
    expect(toLines('a\n\rb')).toEqual(['a', '', 'b']);
  });

  test('a final newline ends the last line instead of adding an empty one', () => {
    expect(toLines('a\n')).toEqual(['a']);
    expect(toLines('a\n\n')).toEqual(['a', '']);
    expect(toLines('\n')).toEqual(['']);
  });

  test('drops only a leading BOM, not one in the middle of the text', () => {
    expect(toLines(BOM + 'a\n' + BOM + 'b')).toEqual(['a', BOM + 'b']);
  });

  test('keeps tabs and trailing spaces as written', () => {
    expect(toLines('\ta  \n  ')).toEqual(['\ta  ', '  ']);
  });
});

describe('splitParts: empty and blank documents', () => {
  const onePart: SplitResult = {
    ok: false,
    diagnostics: [{ code: 'missing_separator', severity: 'error', params: { found: 1 } }],
  };

  test('an empty string has one part and is missing separators', () => {
    expect(splitParts('')).toEqual(onePart);
  });

  test('a document of blank lines only has one part and is missing separators', () => {
    expect(splitParts(doc('', '  ', '\t', ''))).toEqual(onePart);
  });

  test('a document with text but no dash line reports one part found', () => {
    expect(splitParts(doc('# T', '', 'servings: 4'))).toEqual(onePart);
  });
});

describe('splitParts: frontmatter', () => {
  test('rejects a dash line as the first non-blank line after blank lines, at its line', () => {
    expect(splitParts(doc('', '  ', '---', '', 'a', '', '---', '', 'b'))).toEqual({
      ok: false,
      diagnostics: [{ code: 'frontmatter_not_supported', severity: 'error', line: 3 }],
    });
  });

  test('rejects a long dash line with trailing whitespace as the first line', () => {
    expect(splitParts(doc('------ \t', '', '# T', '', '---', '', 'a', '', '---', '', 'b'))).toEqual(
      {
        ok: false,
        diagnostics: [{ code: 'frontmatter_not_supported', severity: 'error', line: 1 }],
      },
    );
  });

  test('rejects a dash line first even after a BOM', () => {
    expect(splitParts(BOM + '---\n\n# T\n\n---\n\na').diagnostics).toEqual([
      { code: 'frontmatter_not_supported', severity: 'error', line: 1 },
    ]);
  });

  test('the start of the document does not count as a blank line before a separator', () => {
    expect(splitParts('---')).toEqual({
      ok: false,
      diagnostics: [{ code: 'frontmatter_not_supported', severity: 'error', line: 1 }],
    });
  });
});

describe('splitParts: separator detection', () => {
  test('accepts trailing tabs after the dashes', () => {
    const { parts } = splitOk(doc('# T', '', '---\t', '', 'a', '', '--- \t ', '', 'b'));
    expect(parts[2].lines).toEqual(['', 'b']);
  });

  test('accepts whitespace-only lines (spaces, tabs) as the blank lines around a separator', () => {
    const result = splitOk(doc('# T', '   ', '---', '\t', 'a', ' \t ', '---', '  ', 'b'));
    expect(result.parts.map((part) => part.startLine)).toEqual([1, 4, 8]);
    expect(result.parts[0].lines).toEqual(['# T', '   ']);
    expect(result.parts[1].lines).toEqual(['\t', 'a', ' \t ']);
    expect(result.parts[2].lines).toEqual(['  ', 'b']);
    expect(result.diagnostics).toEqual([]);
  });

  test('a dash line with leading spaces is not a separator and is reported', () => {
    expect(splitParts(doc('# T', '', '  ---', '', 'a', '', '---', '', 'b'))).toEqual({
      ok: false,
      diagnostics: [
        { code: 'ambiguous_separator', severity: 'warning', line: 3 },
        { code: 'missing_separator', severity: 'error', params: { found: 2 } },
      ],
    });
  });

  test('a dash line indented by 4 spaces (code) is not reported', () => {
    const result = splitParts(doc('# T', '', '    ---', '', 'a', '', '---', '', 'b'));
    expect(result.diagnostics.map((d) => d.code)).toEqual(['missing_separator']);
  });

  test('caps ambiguous separator warnings and counts the omitted ones', () => {
    const glued = Array.from({ length: 60 }, () => ['x', '---']).flat();
    const result = splitOk(doc('# T', ...glued, '', '---', '', 'a', '', '---', '', 'b'));
    const ambiguous = result.diagnostics.filter((d) => d.code === 'ambiguous_separator');
    expect(ambiguous).toHaveLength(50);
    expect(result.diagnostics).toContainEqual({
      code: 'diagnostics_truncated',
      severity: 'warning',
      params: { code: 'ambiguous_separator', omitted: 10 },
    });
  });

  test('lines that only look like separators are not separators', () => {
    for (const line of ['--', '- - -', '———', '***', '___', '---a', '--- a']) {
      expect(splitParts(doc('# T', '', line, '', 'a', '', '---', '', 'b'))).toEqual({
        ok: false,
        diagnostics: [{ code: 'missing_separator', severity: 'error', params: { found: 2 } }],
      });
    }
  });

  test('two separators with a single blank line between them give an empty part 2', () => {
    const result = splitOk(doc('# T', '', '---', '', '---', '', 'b'));
    expect(result.parts.map((part) => part.startLine)).toEqual([1, 4, 6]);
    expect(result.parts[1].lines).toEqual(['']);
    expect(result.parts[2].lines).toEqual(['', 'b']);
    expect(result.diagnostics).toEqual([]);
  });

  test('two directly adjacent dash lines are both ambiguous, not separators', () => {
    expect(splitParts(doc('# T', '', '---', '---', '', 'a'))).toEqual({
      ok: false,
      diagnostics: [
        { code: 'ambiguous_separator', severity: 'warning', line: 3 },
        { code: 'ambiguous_separator', severity: 'warning', line: 4 },
        { code: 'missing_separator', severity: 'error', params: { found: 1 } },
      ],
    });
  });

  test('a dash line followed by text (no blank after) is ambiguous at its line', () => {
    expect(
      splitParts(doc('# T', '', '---', 'text', '', 'a', '', '---', '', 'b')).diagnostics,
    ).toEqual([
      { code: 'ambiguous_separator', severity: 'warning', line: 3 },
      { code: 'missing_separator', severity: 'error', params: { found: 2 } },
    ]);
  });

  test('a dash line on the last line counts as having a blank line after', () => {
    const result = splitOk(doc('# T', '', '---', '', 'a', '', '-----'));
    expect(result.parts[2]).toEqual({ lines: [], startLine: 8 });
  });

  test('a dash line on the last line glued to text is ambiguous', () => {
    expect(splitParts(doc('# T', '', '---', '', 'a', 'b', '---')).diagnostics).toEqual([
      { code: 'ambiguous_separator', severity: 'warning', line: 7 },
      { code: 'missing_separator', severity: 'error', params: { found: 2 } },
    ]);
  });

  test('keeps ambiguous_separator warnings on a successful split, and the line in its part', () => {
    const result = splitOk(
      doc('# T', '', '---', '', 'Heading', '---', '', 'a', '', '---', '', 'b'),
    );
    expect(result.diagnostics).toEqual([
      { code: 'ambiguous_separator', severity: 'warning', line: 6 },
    ]);
    expect(result.parts[1].lines).toEqual(['', 'Heading', '---', '', 'a', '']);
  });

  test('reports five parts at the first extra separator', () => {
    expect(
      splitParts(
        doc('# T', '', '---', '', 'a', '', '---', '', 'b', '', '---', '', 'c', '', '---', '', 'd'),
      ),
    ).toEqual({
      ok: false,
      diagnostics: [{ code: 'too_many_parts', severity: 'error', line: 11, params: { found: 5 } }],
    });
  });

  test('ambiguous warnings come before the too_many_parts error, with source line numbers', () => {
    expect(
      splitParts(doc('# T', '', '---', '', 'a', 'x', '---', '', '---', '', 'b', '', '---', ''))
        .diagnostics,
    ).toEqual([
      { code: 'ambiguous_separator', severity: 'warning', line: 7 },
      { code: 'too_many_parts', severity: 'error', line: 13, params: { found: 4 } },
    ]);
  });
});

describe('splitParts: line endings', () => {
  test('splits a document with mixed LF, CRLF and CR endings with correct start lines', () => {
    const result = splitOk('# T\r\n\n---\r\r\na\n\r---\r\n\nb');
    expect(result.parts.map((part) => part.startLine)).toEqual([1, 4, 8]);
    expect(result.parts[0].lines).toEqual(['# T', '']);
    expect(result.parts[1].lines).toEqual(['', 'a', '']);
    expect(result.parts[2].lines).toEqual(['', 'b']);
  });

  test('counts diagnostic line numbers after CR-only normalization', () => {
    expect(splitParts('# T\r\r---\r\ra\rb\r---\r\rc').diagnostics).toContainEqual({
      code: 'ambiguous_separator',
      severity: 'warning',
      line: 7,
    });
  });
});

describe('splitParts: fenced code blocks', () => {
  /** Part 1, separator, the given lines in part 2, separator, part 3. Fence starts on line 5. */
  const withFence = (...fenceLines: string[]) =>
    doc('# T', '', '---', '', ...fenceLines, '', '---', '', 'b');
  const unclosedAt5: Diagnostic[] = [
    { code: 'unclosed_code_block', severity: 'warning', line: 5 },
    { code: 'missing_separator', severity: 'error', params: { found: 2 } },
  ];

  test('a fence indented by up to 3 spaces hides dash lines', () => {
    for (const indent of [' ', '  ', '   ']) {
      const result = splitOk(withFence(indent + FENCE3, '', '---', '', indent + FENCE3));
      expect(result.parts[1].lines).toContain('---');
      expect(result.diagnostics).toEqual([]);
    }
  });

  test('a fence indented by 4 spaces is not a fence, so dash lines inside still count', () => {
    expect(splitParts(withFence(`    ${FENCE3}`, '', '---', '', `    ${FENCE3}`))).toEqual({
      ok: false,
      diagnostics: [{ code: 'too_many_parts', severity: 'error', line: 11, params: { found: 4 } }],
    });
  });

  test('a fence indented by a tab is not a fence', () => {
    expect(splitParts(withFence(`\t${FENCE3}`, '', '---', '', `\t${FENCE3}`)).diagnostics).toEqual([
      { code: 'too_many_parts', severity: 'error', line: 11, params: { found: 4 } },
    ]);
  });

  test('a closing fence may be indented up to 3 spaces even if the opening is not', () => {
    expect(splitOk(withFence(FENCE3, '', '---', '', `   ${FENCE3}`)).diagnostics).toEqual([]);
  });

  test('a closing fence indented by 4 spaces does not close the block', () => {
    expect(splitParts(withFence(FENCE3, '', '---', '', `    ${FENCE3}`)).diagnostics).toEqual(
      unclosedAt5,
    );
  });

  test('a longer closing fence closes the block', () => {
    expect(splitOk(withFence(FENCE3, '', '---', '', '``````')).diagnostics).toEqual([]);
    expect(splitOk(withFence('~~~', '', '---', '', '~~~~~')).diagnostics).toEqual([]);
  });

  test('a shorter closing fence does not close the block', () => {
    expect(splitParts(withFence('````', '', '---', '', FENCE3)).diagnostics).toEqual(unclosedAt5);
    expect(splitParts(withFence('~~~~', '', '---', '', '~~~')).diagnostics).toEqual(unclosedAt5);
  });

  test('a fence of the other character does not close the block', () => {
    expect(splitParts(withFence(FENCE3, '', '---', '', '~~~')).diagnostics).toEqual(unclosedAt5);
    expect(splitParts(withFence('~~~', '', '---', '', FENCE3)).diagnostics).toEqual(unclosedAt5);
  });

  test('a closing fence followed by text does not close the block', () => {
    expect(splitParts(withFence(FENCE3, '', '---', '', `${FENCE3} js`)).diagnostics).toEqual(
      unclosedAt5,
    );
  });

  test('a closing fence followed by trailing whitespace closes the block', () => {
    expect(splitOk(withFence('~~~', '', '---', '', '~~~ \t')).diagnostics).toEqual([]);
  });

  test('a backtick fence whose info string contains a backtick is not a fence', () => {
    // The ``` a`b line is plain text, so the dash line on line 7 is a separator and the later
    // ``` opens an unclosed block that hides the dash line on line 11.
    const result = splitOk(withFence('``` a`b', '', '---', '', FENCE3));
    expect(result.parts.map((part) => part.startLine)).toEqual([1, 4, 8]);
    expect(result.diagnostics).toEqual([
      { code: 'unclosed_code_block', severity: 'warning', line: 9 },
    ]);
  });

  test('a tilde fence may have backticks in its info string', () => {
    const result = splitOk(withFence('~~~ a`b`', '', '---', '', '~~~'));
    expect(result.parts[1].lines).toContain('~~~ a`b`');
    expect(result.diagnostics).toEqual([]);
  });

  test('a backtick fence inside a tilde block does not close or reopen it', () => {
    expect(splitOk(withFence('~~~', FENCE3, '', '---', '', FENCE3, '~~~')).diagnostics).toEqual([]);
  });

  test('several code blocks in a row are each closed independently', () => {
    const result = splitOk(
      doc(
        '# T',
        '',
        FENCE3,
        '---',
        FENCE3,
        '',
        '---',
        '',
        '~~~',
        '',
        '---',
        '',
        '~~~',
        '',
        '---',
        '',
        'b',
      ),
    );
    expect(result.parts.map((part) => part.startLine)).toEqual([1, 8, 16]);
    expect(result.diagnostics).toEqual([]);
  });

  test('reports the line of the unclosed opening fence, and still splits before it', () => {
    const result = splitOk(doc('# T', '', '---', '', 'a', '', '---', '', '1. Step', '~~~', 'x'));
    expect(result.diagnostics).toEqual([
      { code: 'unclosed_code_block', severity: 'warning', line: 10 },
    ]);
    expect(result.parts[2].lines).toEqual(['', '1. Step', '~~~', 'x']);
  });

  test('a dash line right after a closing fence is ambiguous (the fence line is not blank)', () => {
    expect(splitParts(withFence(FENCE3, 'x', FENCE3, '---', '')).diagnostics).toContainEqual({
      code: 'ambiguous_separator',
      severity: 'warning',
      line: 8,
    });
  });
});

describe('splitParts: no content is ever lost', () => {
  const sources = [
    doc('# T', '', '---', '', '---'),
    doc('# T', '', '---', '', '---', ''),
    doc('', '', '# T', '  ', '---', '\t', '- a', '', '---------', '', '1. x', '', ''),
    doc('# T', '', '---', '', FENCE3, '', '---', '', FENCE3, '', '---', '', 'b'),
    doc('# T', 'Heading', '---', '', '---', '', 'a', '', '---  ', '', 'b'),
    doc('# T', '', '---', '', 'a', '', '---', '', '~~~', '---', ''),
  ];

  for (const [index, source] of sources.entries()) {
    test(`parts plus separator lines rebuild the source exactly (#${index + 1})`, () => {
      // A final newline ends the last line: it is the only thing not kept as a line.
      expect(rebuild(source)).toBe(source.endsWith('\n') ? source.slice(0, -1) : source);
    });
  }

  test('part start lines point at the first line of each part in the source', () => {
    const source = doc('# T', 'desc', '', '---', '', '- a', '- b', '', '---', '', '1. x', '2. y');
    const lines = toLines(source);
    const { parts } = splitOk(source);
    for (const part of parts) {
      expect(lines.slice(part.startLine - 1, part.startLine - 1 + part.lines.length)).toEqual(
        part.lines,
      );
    }
    expect(parts.map((part) => part.startLine)).toEqual([1, 5, 10]);
  });

  test('a leading BOM is the only character dropped from the source', () => {
    const source = doc('# T', '', '---', '', 'a', '', '---', '', 'b');
    expect(rebuild(BOM + source)).toBe(source);
  });
});

describe('splitParts: size limit', () => {
  test('rejects a document over MAX_RECIPE_MARKDOWN_LENGTH before parsing it', () => {
    const result = splitParts('a'.repeat(MAX_RECIPE_MARKDOWN_LENGTH + 1));
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: 'document_too_large',
          severity: 'error',
          params: { max: MAX_RECIPE_MARKDOWN_LENGTH },
        },
      ],
    });
  });

  test('accepts a document of exactly the maximum length', () => {
    const head = '# T\n\n---\n\n---\n\n';
    const result = splitParts(head + 'a'.repeat(MAX_RECIPE_MARKDOWN_LENGTH - head.length));
    expect(result.ok).toBe(true);
  });
});
