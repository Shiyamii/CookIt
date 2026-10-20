import { createDiagnostics, type Diagnostic } from './diagnostics';
import { BLANK_LINE, headingText, scanFences } from './lines';
import { CURRENT_FORMAT, metaFieldOf } from './meta-keys';
import type { Presentation } from './model';
import type { DocumentPart } from './split';

export const MAX_SERVINGS = 1000;

// Regexes stay anchored and free of lazy groups before a `$`: they run on untrusted input, where a
// pattern like `(.*?)[ \t]*$` backtracks quadratically on long runs of spaces. Trimming is done
// in code.
const QUOTE_MARKER = /^ {0,3}> ?/;
// `key:` — the key starts with a letter and has no spaces (`\p{M}`: accents in non-Latin scripts).
const META_KEY = /^(\p{L}[\p{L}\p{M}\p{N}_-]*)[\t\p{Zs}]*:/u;
const WHOLE_NUMBER = /^\d+$/;

type Line = { text: string; line: number; fenced: boolean };

/**
 * Parses part 1: the first `# Title`, then the description (quotes or paragraphs) and the
 * `key: value` blocks. A block (lines between blank lines) is metadata only if all its lines
 * are `key: value` lines outside code blocks; anything else is description, so no text is lost.
 */
export function parsePresentation(part: DocumentPart): {
  presentation?: Presentation;
  diagnostics: Diagnostic[];
} {
  const diagnostics = createDiagnostics();
  const { inFence } = scanFences(part.lines);
  const lines: Line[] = part.lines.map((text, i) => ({
    text,
    line: part.startLine + i,
    fenced: inFence[i] ?? false,
  }));

  const titleIndex = lines.findIndex((l) => !l.fenced && headingText(l.text, 1) !== undefined);
  const title = titleIndex === -1 ? '' : (headingText(lines[titleIndex]?.text ?? '', 1) ?? '');
  if (!title) diagnostics.error({ code: 'missing_title', line: lines[titleIndex]?.line });

  // A leading `## Presentation`-like heading is tolerated and ignored; other text before the title
  // is kept at the start of the description.
  let before = titleIndex === -1 ? [] : lines.slice(0, titleIndex);
  const firstBefore = before.findIndex((l) => !BLANK_LINE.test(l.text));
  if (firstBefore !== -1 && headingText(before[firstBefore]?.text ?? '', 2) !== undefined) {
    before = before.slice(firstBefore + 1);
  }
  const textBefore = before.find((l) => !BLANK_LINE.test(l.text));
  if (textBefore) diagnostics.warning({ code: 'text_before_title', line: textBefore.line });

  const description: Line[][] = toBlocks(before);
  const meta: { key: string; value: string; line: number }[] = [];
  for (const block of toBlocks(lines.slice(titleIndex + 1))) {
    const entries = block.map((l) => (l.fenced ? undefined : parseMetaLine(l.text)));
    if (entries.every((entry) => entry !== undefined)) {
      entries.forEach((entry, i) => meta.push({ ...entry, line: block[i]?.line ?? 0 }));
    } else {
      description.push(block);
    }
  }

  const presentation: Presentation = {
    title,
    description: description
      .map((block) =>
        block.map((l) => (l.fenced ? l.text : l.text.replace(QUOTE_MARKER, ''))).join('\n'),
      )
      .join('\n\n'),
    servings: 0,
    tags: [],
    // No prototype: a `toString:` or `constructor:` key must not shadow or expose Object methods.
    extraMeta: Object.create(null) as Record<string, string>,
  };

  const seen = new Set<string>();
  let servingsFound = false;
  for (const { key, value, line } of meta) {
    const field = metaFieldOf(key);
    const id = field ?? `extra:${key.toLowerCase()}`;
    if (seen.has(id)) {
      diagnostics.error({ code: 'duplicate_meta_key', line, params: { key } });
      continue;
    }
    seen.add(id);

    switch (field) {
      case 'servings': {
        servingsFound = true;
        const servings = Number(value);
        if (WHOLE_NUMBER.test(value) && servings >= 1 && servings <= MAX_SERVINGS) {
          presentation.servings = servings;
        } else {
          diagnostics.error({ code: 'invalid_servings', line, params: { value } });
        }
        break;
      }
      case 'format': {
        const format = Number(value);
        if (!WHOLE_NUMBER.test(value) || format < 1) {
          diagnostics.error({ code: 'invalid_format', line, params: { value } });
        } else if (format > CURRENT_FORMAT) {
          diagnostics.error({
            code: 'unsupported_format',
            line,
            params: { value, max: CURRENT_FORMAT },
          });
        } else {
          presentation.format = format;
        }
        break;
      }
      case 'source':
        if (value) presentation.source = value;
        break;
      case 'tags':
        presentation.tags = [
          ...new Set(
            value
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ];
        break;
      case undefined:
        presentation.extraMeta[key] = value;
    }
  }
  if (!servingsFound) diagnostics.error({ code: 'missing_servings' });

  return diagnostics.hasErrors()
    ? { diagnostics: diagnostics.result() }
    : { presentation, diagnostics: diagnostics.result() };
}

/** `key: value` line; `key://…` is a URL, not a key. Spaces (non-breaking too) are trimmed. */
function parseMetaLine(text: string): { key: string; value: string } | undefined {
  const match = META_KEY.exec(text);
  if (!match) return undefined;
  const rest = text.slice(match[0].length);
  if (rest.startsWith('//')) return undefined;
  return { key: match[1] ?? '', value: rest.trim() };
}

/** Groups lines into blocks separated by blank lines (blank lines inside code blocks are kept). */
function toBlocks(lines: Line[]): Line[][] {
  const blocks: Line[][] = [];
  let current: Line[] = [];
  for (const line of lines) {
    if (!line.fenced && BLANK_LINE.test(line.text)) {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}
