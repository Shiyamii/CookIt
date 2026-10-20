import { unitIndex, type UnitIndex } from '../units/index-units';
import { createDiagnostics, type Diagnostic } from './diagnostics';
import { parseIngredientLine } from './ingredient';
import { parseInline } from './inline';
import { BLANK_LINE, headingText, scanFences } from './lines';
import type { IngredientGroup, StepGroup, TextItem } from './model';
import type { DocumentPart } from './split';

const BULLET = /^ {0,3}[-*+](?=[ \t]|$)/;
const ORDERED = /^ {0,3}\d{1,9}[.)](?=[ \t]|$)/;
const ANY_HEADING = /^ {0,3}#{1,6}(?=[ \t]|$)/;

type ListItem = { kind: 'item'; line: number; raw: string };
type ListGroup = { name?: string; line?: number; entries: (ListItem | TextItem)[] };

/**
 * Parts 2 and 3 share one structure: optional `### Group` headings, list items (`-`, `*`, `+`,
 * `1.`, `1)`; the numbers written are ignored) and anything else kept as text. A line directly
 * under an item (no blank line in between) continues that item, as in markdown. A leading
 * `## Ingredients`-like heading is tolerated and ignored.
 */
function parseList(part: DocumentPart): ListGroup[] {
  const { inFence } = scanFences(part.lines);
  const groups: ListGroup[] = [{ entries: [] }];
  let previous: ListItem | undefined;
  let seenContent = false;

  part.lines.forEach((text, i) => {
    const line = part.startLine + i;
    const group = groups[groups.length - 1] ?? { entries: [] };
    if (inFence[i]) {
      group.entries.push({ kind: 'text', line, raw: text });
      previous = undefined;
      seenContent = true;
      return;
    }
    if (BLANK_LINE.test(text)) {
      previous = undefined;
      return;
    }
    const firstLine = !seenContent;
    seenContent = true;
    if (firstLine && headingText(text, 2) !== undefined) return;

    const groupName = headingText(text, 3);
    if (groupName !== undefined) {
      // An explicit empty `###` keeps `''`, distinct from the leading group without heading.
      groups.push({ name: groupName, line, entries: [] });
      previous = undefined;
      return;
    }

    const marker = ORDERED.exec(text) ?? BULLET.exec(text);
    if (marker) {
      const raw = text.slice(marker[0].length).trim();
      previous = raw ? { kind: 'item', line, raw } : undefined;
      group.entries.push(previous ?? { kind: 'text', line, raw: text });
      return;
    }
    if (previous && !ANY_HEADING.test(text)) {
      previous.raw += `\n${text.trim()}`;
      return;
    }
    // Only a heading reaches this point with an open item: it closes the item.
    group.entries.push({ kind: 'text', line, raw: text });
    previous = undefined;
  });

  // The group before the first heading only exists if it has content.
  if (groups[0]?.entries.length === 0) groups.shift();
  return groups;
}

function checkGroups(
  groups: ListGroup[],
  diagnostics: ReturnType<typeof createDiagnostics>,
  emptyCode: 'empty_ingredients' | 'empty_steps',
) {
  for (const group of groups) {
    if (group.entries.length === 0) {
      diagnostics.warning({
        code: 'empty_group',
        line: group.line,
        params: { name: group.name ?? '' },
      });
    }
  }
  if (!groups.some((group) => group.entries.some((entry) => entry.kind === 'item'))) {
    diagnostics.warning({ code: emptyCode });
  }
}

/** Part 2: ingredient groups, each line read as `quantity unit name`. */
export function parseIngredients(
  part: DocumentPart,
  units: UnitIndex = unitIndex(),
): { groups: IngredientGroup[]; diagnostics: Diagnostic[] } {
  const diagnostics = createDiagnostics();
  const list = parseList(part);
  checkGroups(list, diagnostics, 'empty_ingredients');
  const groups = list.map((group): IngredientGroup => ({
    name: group.name,
    items: group.entries.map((entry) =>
      entry.kind === 'text'
        ? entry
        : {
            kind: 'ingredient',
            line: entry.line,
            raw: entry.raw,
            ...parseIngredientLine(entry.raw, units),
          },
    ),
  }));
  return { groups, diagnostics: diagnostics.result() };
}

/**
 * Part 3: step groups, with timers and scalable quantities. Steps get a global index in order of
 * appearance, across groups. An invalid `timer:` / `q:` link stays text, with a warning.
 */
export function parseSteps(
  part: DocumentPart,
  units: UnitIndex = unitIndex(),
): { groups: StepGroup[]; diagnostics: Diagnostic[] } {
  const diagnostics = createDiagnostics();
  const list = parseList(part);
  checkGroups(list, diagnostics, 'empty_steps');
  let index = 0;
  const groups = list.map((group): StepGroup => ({
    name: group.name,
    items: group.entries.map((entry) => {
      if (entry.kind === 'text') return entry;
      const { segments, issues } = parseInline(entry.raw, units);
      for (const issue of issues) {
        diagnostics.warning({ code: issue.code, line: entry.line, params: { value: issue.value } });
      }
      return { kind: 'step', line: entry.line, index: index++, raw: entry.raw, segments };
    }),
  }));
  return { groups, diagnostics: diagnostics.result() };
}
