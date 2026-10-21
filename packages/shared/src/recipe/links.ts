import type { InlineSegment } from './model';

/**
 * Writing the special links of steps (format §4), for editors and generators: the parser reads
 * them back to the same timer or quantity.
 */

/** `5400` → `1h30m`, `45` → `45s`: the duration syntax of `timer:` links. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return (
    `${hours ? `${hours}h` : ''}${minutes ? `${minutes}m` : ''}${rest ? `${rest}s` : ''}` || '0s'
  );
}

/** Link text: brackets and backslashes escaped, one line. */
function linkText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/[\\[\]]/g, '\\$&');
}

/** `[10 min](timer:10m "Pasta")`: the label is only written when it differs from the text. */
export function timerLink(text: string, seconds: number, label?: string): string {
  const shown = text.trim() || formatDuration(seconds);
  const title = label?.trim().replace(/[\r\n]+/g, ' ');
  const quoted = title && title !== shown ? ` "${title.replace(/[\\"]/g, '\\$&')}"` : '';
  return `[${linkText(shown)}](timer:${formatDuration(seconds)}${quoted})`;
}

/** `[2 tbsp](q:)`: a quantity in a step that follows the servings. */
export function quantityLink(text: string): string {
  return `[${linkText(text.trim())}](q:)`;
}

/** A step's text from its segments (after a timer or a quantity was edited). */
export function stepFromSegments(segments: readonly InlineSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      if (segment.kind === 'timer') return timerLink(segment.text, segment.seconds, segment.label);
      return quantityLink(segment.text);
    })
    .join('');
}
