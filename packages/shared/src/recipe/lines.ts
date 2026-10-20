export const BLANK_LINE = /^[ \t]*$/;

const BOM = String.fromCharCode(0xfeff);
// CommonMark fence: up to 3 spaces of indent, then 3+ backticks or tildes.
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Splits a document into lines: line endings normalized, leading BOM dropped, text in Unicode NFC
 * (so `é` typed as `e` + combining accent, common when pasting from macOS, matches like `é`).
 */
export function toLines(markdown: string): string[] {
  const text = markdown.startsWith(BOM) ? markdown.slice(1) : markdown;
  const lines = text.normalize('NFC').split(/\r\n|\r|\n/);
  // A final newline ends the last line; it does not start an empty one.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const HEADINGS = [/^ {0,3}#(?=[ \t]|$)/, /^ {0,3}##(?=[ \t]|$)/, /^ {0,3}###(?=[ \t]|$)/];

/**
 * Text of an ATX heading of the given level (1 to 3), trimmed, without its optional closing `#`
 * sequence; undefined when the line is not such a heading. Trimming is done in code: a regex like
 * `(.*?)[ \t]*$` backtracks quadratically on long runs of spaces.
 */
export function headingText(line: string, level: 1 | 2 | 3): string | undefined {
  const match = HEADINGS[level - 1]?.exec(line);
  if (!match) return undefined;
  const text = line.slice(match[0].length).trim();
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  if (end === 0) return '';
  const beforeHashes = text[end - 1];
  return end < text.length && (beforeHashes === ' ' || beforeHashes === '\t')
    ? text.slice(0, end).trim()
    : text;
}

/**
 * Marks the lines that belong to a fenced code block (``` or ~~~, fence lines included), following
 * CommonMark: the closing fence uses the same character, is at least as long and has nothing after.
 * `unclosedAt` is the index of an opening fence that is never closed.
 */
export function scanFences(lines: readonly string[]): {
  inFence: boolean[];
  unclosedAt?: number;
} {
  let fence: { char: string; length: number; index: number } | undefined;
  const inFence = lines.map((line, i) => {
    const match = FENCE.exec(line);
    const marker = match?.[1] ?? '';
    const rest = match ? line.slice(match[0].length) : '';
    if (fence) {
      const closes =
        marker.startsWith(fence.char) && marker.length >= fence.length && BLANK_LINE.test(rest);
      if (closes) fence = undefined;
      return true;
    }
    // A backtick fence cannot have a backtick in its info string.
    if (match && !(marker.startsWith('`') && rest.includes('`'))) {
      fence = { char: marker.charAt(0), length: marker.length, index: i };
      return true;
    }
    return false;
  });
  return { inFence, unclosedAt: fence?.index };
}
