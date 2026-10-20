import { createDiagnostics, type Diagnostic } from './diagnostics';
import { BLANK_LINE, scanFences, toLines } from './lines';

export { toLines } from './lines';

export type DocumentPart = {
  /** Lines of the part, as written (separator lines excluded). */
  lines: string[];
  /** 1-based source line of `lines[0]`. */
  startLine: number;
};

export type SplitResult =
  | { ok: true; parts: [DocumentPart, DocumentPart, DocumentPart]; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

/**
 * Maximum length of a recipe document, in UTF-16 code units. A real recipe is a few KB. The API
 * schemas use the same limit (`z.string().max(MAX_RECIPE_MARKDOWN_LENGTH)`).
 */
export const MAX_RECIPE_MARKDOWN_LENGTH = 200_000;

const DASH_LINE = /^-{3,}[ \t]*$/;
const INDENTED_DASH_LINE = /^ {1,3}-{3,}[ \t]*$/;

/**
 * Splits a recipe document into its three parts (presentation, ingredients, steps).
 * A separator is a line of 3+ dashes with a blank line before and after (the end of the
 * document counts as blank). Dash lines inside code blocks are ignored.
 */
export function splitParts(markdown: string): SplitResult {
  const diagnostics = createDiagnostics();
  // Checked before any work (NFC normalization can grow the text): bounds parsing time and output.
  if (markdown.length > MAX_RECIPE_MARKDOWN_LENGTH) {
    diagnostics.error({ code: 'document_too_large', params: { max: MAX_RECIPE_MARKDOWN_LENGTH } });
    return { ok: false, diagnostics: diagnostics.result() };
  }
  const lines = toLines(markdown);
  const separators: number[] = [];

  const firstContent = lines.findIndex((line) => !BLANK_LINE.test(line));
  if (firstContent !== -1 && DASH_LINE.test(lines[firstContent] ?? '')) {
    diagnostics.error({ code: 'frontmatter_not_supported', line: firstContent + 1 });
    return { ok: false, diagnostics: diagnostics.result() };
  }

  const { inFence, unclosedAt } = scanFences(lines);
  lines.forEach((line, i) => {
    if (inFence[i]) return;
    // An indented dash line is a horizontal rule in markdown, never a separator: point it out.
    if (INDENTED_DASH_LINE.test(line)) {
      diagnostics.warning({ code: 'ambiguous_separator', line: i + 1 });
      return;
    }
    if (!DASH_LINE.test(line)) return;

    const blankBefore = i > 0 && BLANK_LINE.test(lines[i - 1] ?? '');
    const blankAfter = i === lines.length - 1 || BLANK_LINE.test(lines[i + 1] ?? '');
    if (blankBefore && blankAfter) separators.push(i);
    else diagnostics.warning({ code: 'ambiguous_separator', line: i + 1 });
  });

  if (unclosedAt !== undefined) {
    diagnostics.warning({ code: 'unclosed_code_block', line: unclosedAt + 1 });
  }

  const found = separators.length + 1;
  if (found < 3) {
    diagnostics.error({ code: 'missing_separator', params: { found } });
    return { ok: false, diagnostics: diagnostics.result() };
  }
  if (found > 3) {
    diagnostics.error({
      code: 'too_many_parts',
      line: (separators[2] ?? 0) + 1,
      params: { found },
    });
    return { ok: false, diagnostics: diagnostics.result() };
  }

  const [first = 0, second = 0] = separators;
  const part = (start: number, end: number): DocumentPart => ({
    lines: lines.slice(start, end),
    startLine: start + 1,
  });
  return {
    ok: true,
    parts: [part(0, first), part(first + 1, second), part(second + 1, lines.length)],
    diagnostics: diagnostics.result(),
  };
}
