/**
 * Text pasted in the creation wizard (plan §5.2), split into lines without AI: a list of
 * ingredients (one per line) or the text of the steps. Bullets and numbers are removed; a line
 * ending with `:` (or a markdown heading) starts a group.
 */

export type PastedGroup = { name?: string; items: string[] };

const BULLET = /^\s*(?:[-*•·▪◦‣–—+]|\d{1,3}\s*[.)]|\(\d{1,3}\))\s+/u;
// `Étape 3`, `Step 3`, `3. lépés` (Hungarian puts the number first).
const STEP_WORD =
  /^\s*(?:(?:étape|etape|step|lépés|lepes)\s*\d{1,3}|\d{1,3}\.\s*(?:lépés|lepes))\s*[:.)-]?\s*/iu;
/** Longest pasted text read (beyond: ignored), so every pass stays cheap on hostile input. */
const MAX_PASTE = 200_000;
const MAX_GROUP_NAME = 60;
const NUMBERED =
  /^\s*(?:\d{1,3}\s*[.)]|\(\d{1,3}\)|(?:étape|etape|step|lépés|lepes)\s*\d{1,3}[:.)-]?)(?:\s|$)/iu;

/**
 * A group heading: `## Pour la sauce` (markdown heading) or a short line ending with `:`
 * (`Pour la sauce :`). Plain string checks, no regex: these lines can come from a web page
 * (import by URL), where backtracking patterns could block the server.
 */
function groupName(line: string): string | undefined {
  const text = line.trim();
  if (text.startsWith('#')) {
    let level = 0;
    while (text[level] === '#') level++;
    if (level > 6 || !/\s/.test(text.charAt(level))) return undefined;
    let end = text.length;
    while (end > level && (text[end - 1] === '#' || /\s/.test(text.charAt(end - 1)))) end--;
    const name = text.slice(level, end).trim();
    return name || undefined;
  }
  if (text.endsWith(':')) {
    const name = text.slice(0, -1).trim();
    if (name && name.length <= MAX_GROUP_NAME && !name.includes(':')) return name;
  }
  return undefined;
}

function clean(line: string): string {
  return line.replace(STEP_WORD, '').replace(BULLET, '').replace(/\s+/g, ' ').trim();
}

function pushTo(groups: PastedGroup[], item: string) {
  let last = groups[groups.length - 1];
  if (!last) {
    last = { items: [] };
    groups.push(last);
  }
  last.items.push(item);
}

function startGroup(groups: PastedGroup[], name: string) {
  const last = groups[groups.length - 1];
  // A first heading before any item names the first group instead of adding an empty one.
  if (last && last.items.length === 0) last.name = name;
  else groups.push({ name, items: [] });
}

/** One ingredient per non-empty line. */
export function splitIngredients(text: string): PastedGroup[] {
  const groups: PastedGroup[] = [];
  for (const line of text.slice(0, MAX_PASTE).split(/\r\n|\n|\r/)) {
    if (!line.trim()) continue;
    const name = groupName(line);
    if (name !== undefined) startGroup(groups, name);
    else pushTo(groups, clean(line));
  }
  return groups.filter((group) => group.items.length > 0 || group.name);
}

/**
 * Steps: when the text is numbered (`1.`, `2)`, `Étape 3`, `3. lépés`), each number starts a step and the
 * following lines continue it; otherwise each paragraph (or each line, when there is no blank
 * line) is a step.
 */
export function splitSteps(text: string): PastedGroup[] {
  const lines = text.slice(0, MAX_PASTE).split(/\r\n|\n|\r/);
  const numbered = lines.filter((line) => NUMBERED.test(line)).length >= 2;
  const paragraphs = !numbered && lines.some((line) => !line.trim());
  const groups: PastedGroup[] = [];
  let current: string[] = [];
  const flush = () => {
    const step = current.join(' ').replace(/\s+/g, ' ').trim();
    if (step) pushTo(groups, step);
    current = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      if (paragraphs) flush();
      continue;
    }
    const name = groupName(line);
    if (name !== undefined) {
      flush();
      startGroup(groups, name);
      continue;
    }
    if (numbered) {
      if (NUMBERED.test(line)) flush();
      current.push(clean(line));
    } else if (paragraphs) {
      current.push(clean(line));
    } else {
      current.push(clean(line));
      flush();
    }
  }
  flush();
  return groups.filter((group) => group.items.length > 0 || group.name);
}
