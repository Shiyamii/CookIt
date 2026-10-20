import type { Link, Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { UnitIndex } from '../units/index-units';
import type { InlineSegment } from './model';
import { parseQuantity } from './quantity';

/** Longest accepted timer: anything beyond is most likely a typo. */
export const MAX_TIMER_SECONDS = 7 * 24 * 3600;

const DURATION = /^(?:(\d{1,4})h)?(?:(\d{1,5})m)?(?:(\d{1,6})s)?$/;

/** Seconds of a timer duration (`10m`, `1h30m`, `45s`), or undefined if invalid. */
export function parseDuration(value: string): number | undefined {
  const match = DURATION.exec(value.trim());
  if (!match || value.trim() === '') return undefined;
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return total > 0 && total <= MAX_TIMER_SECONDS ? total : undefined;
}

/**
 * Longest step whose links are parsed. Real steps are a few hundred characters; markdown parsing
 * has superlinear corners (nested brackets), so a longer step stays plain text with a warning.
 */
export const MAX_INLINE_LENGTH = 5000;

export type InlineIssue = {
  code: 'invalid_timer' | 'invalid_quantity' | 'step_too_long';
  value: string;
};

// Only links matter here. Every other construct is turned off: emphasis resolution is quadratic
// on hostile input (`a* a* …` took 45 s on 200 KB), containers nest without bound, and autolinks
// (`<timer:10m>`) must not count as timers.
const LINKS_ONLY = {
  extensions: [
    {
      disable: {
        null: [
          'attention',
          'autolink',
          'blockQuote',
          'codeIndented',
          'definition',
          'headingAtx',
          'htmlFlow',
          'htmlText',
          // Images are never timers, and nested `![` labels are quadratic too.
          'labelStartImage',
          'list',
          'setextUnderline',
          'thematicBreak',
        ],
      },
    },
  ],
};

/**
 * Splits a step into text, timers and scalable quantities. Links are found with remark, so code
 * spans and escaped brackets are respected; text segments are slices of `raw`, unchanged.
 */
export function parseInline(
  raw: string,
  units: UnitIndex,
): { segments: InlineSegment[]; issues: InlineIssue[] } {
  const plain = { segments: [{ kind: 'text' as const, text: raw }], issues: [] };
  // An inline link always contains `](`: most steps skip the parser entirely.
  if (!raw.includes('](')) return plain;
  if (raw.length > MAX_INLINE_LENGTH) {
    return { ...plain, issues: [{ code: 'step_too_long', value: raw.slice(0, 80) }] };
  }

  const segments: InlineSegment[] = [];
  const issues: InlineIssue[] = [];
  let cursor = 0;

  const text = (end: number) => {
    if (end > cursor) segments.push({ kind: 'text', text: raw.slice(cursor, end) });
  };

  for (const link of specialLinks(fromMarkdown(raw, LINKS_ONLY))) {
    const start = link.position?.start.offset;
    const end = link.position?.end.offset;
    if (start === undefined || end === undefined || start < cursor) continue;
    // `![…](timer:…)` is an image (not parsed as such, see LINKS_ONLY): it stays text.
    if (raw.charAt(start - 1) === '!') continue;
    const label = plainText(link);
    const segment = toSegment(link, label, units);
    if (!segment) {
      issues.push({
        code: linkKind(link.url) === 'timer' ? 'invalid_timer' : 'invalid_quantity',
        value: raw.slice(start, end),
      });
      continue;
    }
    text(start);
    segments.push(segment);
    cursor = end;
  }
  text(raw.length);
  return { segments, issues };
}

/** `timer:…` or `q:` (any case); `q:abc` is a mistyped quantity. */
function linkKind(url: string): 'timer' | 'quantity' | undefined {
  const scheme = url.toLowerCase();
  if (scheme.startsWith('timer:')) return 'timer';
  if (scheme.startsWith('q:')) return 'quantity';
  return undefined;
}

function toSegment(link: Link, label: string, units: UnitIndex): InlineSegment | undefined {
  if (linkKind(link.url) === 'timer') {
    const seconds = parseDuration(link.url.slice('timer:'.length));
    if (seconds === undefined) return undefined;
    return { kind: 'timer', text: label, seconds, label: link.title?.trim() || label };
  }
  if (link.url.length > 2) return undefined;
  const quantity = parseQuantity(label);
  if (!quantity) return undefined;
  const unit = units.match(label, quantity.end);
  return { kind: 'quantity', text: label, quantity, ...(unit && { unit }) };
}

// Tree walks are iterative: a hostile line like `>>>>>…` nests deeply enough to overflow the
// call stack with recursion.

/** `timer:` and `q:` links in document order (a link never contains another link). */
function specialLinks(root: Nodes): Link[] {
  const links: Link[] = [];
  const stack: Nodes[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    if (node.type === 'link') {
      if (linkKind(node.url)) links.push(node);
    } else if ('children' in node) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i] as Nodes);
    }
  }
  return links;
}

function plainText(root: Nodes): string {
  let text = '';
  const stack: Nodes[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    if ('value' in node && typeof node.value === 'string') text += node.value;
    else if ('children' in node) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i] as Nodes);
    }
  }
  return text;
}
