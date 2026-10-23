import type { Locale } from '../locale';
import { CURRENT_FORMAT, META_KEYS } from './meta-keys';
import type { IngredientGroup, Presentation, RecipeDocument, StepGroup, TextItem } from './model';

export type SerializeOptions = {
  /** Language of the recipe: canonical keys (`portions` / `servings`) and part headings. */
  locale: Locale;
  /** Write the `tags:` line (exports and imports only, never the markdown editor). */
  includeTags?: boolean;
};

const SEPARATOR = '---';
const DASH_LINE = /^-{3,}[ \t]*$/;
const HEADING_2 = /^ {0,3}##(?=[ \t]|$)/;
// Continuation lines are indented by 4 spaces: never read back as a list item, heading or fence.
const CONTINUATION_INDENT = '    ';
const PART_HEADINGS: Record<Locale, { ingredients: string; steps: string }> = {
  fr: { ingredients: 'Ingrédients', steps: 'Étapes' },
  en: { ingredients: 'Ingredients', steps: 'Steps' },
  hu: { ingredients: 'Hozzávalók', steps: 'Elkészítés' },
};

/**
 * Line writer that never turns a dash-only text line into a separator: such a line never gets a
 * blank line on both sides (a separator needs a blank line before and after).
 */
class Lines {
  readonly lines: string[] = [];
  private pendingBlank = false;
  private lastWasItem = false;

  /** Asks for a blank line before the next line (layout only, see `line`). */
  blank() {
    if (this.lines.length) this.pendingBlank = true;
  }

  line(text: string, isItem = false) {
    if (this.pendingBlank) {
      const last = this.lines[this.lines.length - 1] ?? '';
      // No blank line after a dash line, nor before one (unless it follows an item, which it would
      // continue otherwise): a dash line between two blank lines is a separator.
      const keep = !DASH_LINE.test(last) && (!DASH_LINE.test(text) || this.lastWasItem);
      if (keep) this.lines.push('');
      this.pendingBlank = false;
    }
    this.lines.push(text);
    this.lastWasItem = isItem;
  }

  /** A text item; right after an item it needs a blank line, or it would continue the item. */
  text(item: TextItem) {
    if (this.lastWasItem) this.blank();
    this.line(oneLine(item.raw));
  }
}

/** Part 1 from the recipe columns (the source of truth in the database). */
export function serializePresentation(
  presentation: Presentation,
  options: SerializeOptions,
): string {
  // These fields come from database columns, not only from the parser: a line break in one of
  // them must not be able to add a separator or a metadata line to the document.
  const out = new Lines();
  out.line(`# ${headingSafe(oneLine(presentation.title))}`);
  if (presentation.description) {
    out.blank();
    for (const line of presentation.description.split(LINE_BREAK)) {
      out.line(line ? `> ${line}` : '>');
    }
  }
  out.blank();
  if (presentation.summary) {
    out.line(`${META_KEYS.summary[options.locale][0]}: ${oneLine(presentation.summary)}`);
  }
  out.line(`${META_KEYS.servings[options.locale][0]}: ${presentation.servings}`);
  if (presentation.source) out.line(`source: ${oneLine(presentation.source)}`);
  if (options.includeTags && presentation.tags.length) {
    out.line(`${META_KEYS.tags[options.locale][0]}: ${oneLine(presentation.tags.join(', '))}`);
  }
  for (const [key, value] of Object.entries(presentation.extraMeta)) {
    out.line(value ? `${oneLine(key)}: ${oneLine(value)}` : `${oneLine(key)}:`);
  }
  out.line(`format: ${presentation.format ?? CURRENT_FORMAT}`);
  return out.lines.join('\n');
}

/** Parts 2 and 3 (`body_markdown` in the database), with the separator between them. */
export function serializeBody(
  document: Pick<RecipeDocument, 'ingredientGroups' | 'stepGroups'>,
  options: SerializeOptions,
): string {
  const headings = PART_HEADINGS[options.locale];
  const ingredients = writeGroups(document.ingredientGroups, headings.ingredients, (item) => [
    `- ${item.raw}`,
  ]);
  const steps = writeGroups(document.stepGroups, headings.steps, (item, number) => [
    `${number}. ${item.raw}`,
  ]);
  return [ingredients, SEPARATOR, steps].filter((part) => part !== '').join('\n\n');
}

/** The full canonical document: parse → serialize → parse gives the same recipe. */
export function serializeRecipe(document: RecipeDocument, options: SerializeOptions): string {
  return `${serializePresentation(document, options)}\n\n${SEPARATOR}\n\n${serializeBody(document, options)}\n`;
}

function writeGroups<G extends IngredientGroup | StepGroup>(
  groups: G[],
  partHeading: string,
  writeItem: (item: Exclude<G['items'][number], TextItem>, number: number) => [string],
): string {
  const out = new Lines();
  for (const group of groups) {
    out.blank();
    if (group.name !== undefined) {
      out.line(group.name ? `### ${headingSafe(oneLine(group.name))}` : '###');
      out.blank();
    }
    let number = 1;
    for (const item of group.items) {
      if (item.kind === 'text') {
        out.text(item);
        continue;
      }
      const [first = '', ...rest] = item.raw.split(LINE_BREAK);
      const [marker] = writeItem(
        { ...item, raw: first } as Exclude<G['items'][number], TextItem>,
        number++,
      );
      out.line(marker, true);
      for (const line of rest) out.line(CONTINUATION_INDENT + line, true);
    }
  }
  while (out.lines[0] === '') out.lines.shift();
  const first = out.lines[0];
  if (first !== undefined) {
    // A leading `##` line is ignored by the parser: write the (ignored) part heading before it so
    // that the text line is kept. A leading dash line would sit between the blank lines around the
    // separator and become one: glue it to the part heading.
    if (HEADING_2.test(first)) out.lines.unshift(`## ${partHeading}`, '');
    else if (DASH_LINE.test(first)) out.lines.unshift(`## ${partHeading}`);
  }
  return out.lines.join('\n');
}

const LINE_BREAK = /\r\n|\r|\n/;

function oneLine(text: string): string {
  return text.split(LINE_BREAK).join(' ');
}

/** Heading text that reads back the same: trailing `#` would be taken for closing hashes. */
function headingSafe(text: string): string {
  return text.endsWith('#') ? `${text} #` : text;
}
